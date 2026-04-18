import os
import uuid
import math
import json
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import praw
import prawcore
from groq import Groq

# ── Optional Redis ─────────────────────────────────────────────────────────
try:
    import redis as redis_lib
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("voxr")


# ──────────────────────────────────────────────────────────────────────────
# Session store — Redis if REDIS_URL is set, otherwise in-memory
# ──────────────────────────────────────────────────────────────────────────

class MemorySessionStore:
    def __init__(self):
        self._data: dict = {}

    def get(self, key: str):
        return self._data.get(key)

    def set(self, key: str, value: dict, ttl: int = 7200):
        self._data[key] = value

    def delete(self, key: str):
        self._data.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self._data


class RedisSessionStore:
    def __init__(self, url: str):
        self._r = redis_lib.from_url(url, decode_responses=False)
        log.info("Redis session store connected.")

    def _k(self, key: str) -> str:
        return f"voxr:session:{key}"

    def get(self, key: str):
        raw = self._r.get(self._k(key))
        return json.loads(raw) if raw else None

    def set(self, key: str, value: dict, ttl: int = 7200):
        self._r.setex(self._k(key), ttl, json.dumps(value, default=str))

    def delete(self, key: str):
        self._r.delete(self._k(key))

    def exists(self, key: str) -> bool:
        return bool(self._r.exists(self._k(key)))


def build_store():
    url = os.getenv("REDIS_URL")
    if url and REDIS_AVAILABLE:
        try:
            return RedisSessionStore(url)
        except Exception as e:
            log.warning(f"Redis failed ({e}), using in-memory fallback.")
    log.info("Using in-memory session store.")
    return MemorySessionStore()


# ──────────────────────────────────────────────────────────────────────────
# App & lifespan
# ──────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.sessions = build_store()
    yield

app = FastAPI(title="Voxr API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exc(request: Request, exc: Exception):
    log.exception(f"Unhandled on {request.url}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Server error. Please try again."})


# ──────────────────────────────────────────────────────────────────────────
# Clients
# ──────────────────────────────────────────────────────────────────────────

reddit = praw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT", "voxr/1.1"),
    username=os.getenv("REDDIT_USERNAME", ""),
    password=os.getenv("REDDIT_PASSWORD", ""),
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


# ──────────────────────────────────────────────────────────────────────────
# Token-bucket rate limiter (per-process, Reddit: ~60 req/min script apps)
# ──────────────────────────────────────────────────────────────────────────

class RateLimiter:
    def __init__(self, rate: float = 0.8, capacity: int = 8):
        self.rate = rate
        self.capacity = capacity
        self._tokens = float(capacity)
        self._last = time.monotonic()

    def _refill(self):
        now = time.monotonic()
        self._tokens = min(self.capacity, self._tokens + (now - self._last) * self.rate)
        self._last = now

    def acquire(self, cost: int = 1) -> bool:
        self._refill()
        if self._tokens >= cost:
            self._tokens -= cost
            return True
        return False

    def wait(self, cost: int = 1, timeout: float = 30.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.acquire(cost):
                return
            time.sleep(0.25)
        raise HTTPException(429, "Rate limit — please wait and retry.")


_limiter = RateLimiter()


# ──────────────────────────────────────────────────────────────────────────
# Thread fetch error classifier
# ──────────────────────────────────────────────────────────────────────────

class ThreadFetchError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def classify_praw_error(e: Exception) -> ThreadFetchError:
    if isinstance(e, prawcore.exceptions.Forbidden):
        return ThreadFetchError("This subreddit is private or quarantined.", "private")
    if isinstance(e, prawcore.exceptions.NotFound):
        return ThreadFetchError("Thread not found — it may have been deleted.", "not_found")
    if isinstance(e, prawcore.exceptions.TooManyRequests):
        return ThreadFetchError("Reddit rate limit hit. Wait 60s and retry.", "rate_limited")
    msg = str(e).lower()
    if "403" in msg:
        return ThreadFetchError("Access denied — subreddit may be private.", "private")
    if "404" in msg:
        return ThreadFetchError("Thread not found — likely deleted.", "not_found")
    return ThreadFetchError(f"Failed to fetch thread: {e}", "unknown")


# ──────────────────────────────────────────────────────────────────────────
# Intelligence helpers
# ──────────────────────────────────────────────────────────────────────────

CONTRADICTION_SIGNALS = [
    "actually", "that's wrong", "that is wrong", "this is false", "not true",
    "incorrect", "source?", "citation needed", "misinformation", "misleading",
    "wrong about", "that's not", "you're wrong", "you are wrong",
    "clarification", "to be clear", "edit:", "[edit]", "correction", "update:",
]


def score_credibility(karma: int, age_days: int) -> float:
    if karma <= 0 or age_days <= 0:
        return 0.0
    raw = math.log1p(age_days) * math.log1p(karma)
    return round(min(raw / (math.log1p(3650) * math.log1p(500_000)), 1.0), 3)


def temporal_era(created: float, post_created: float) -> str:
    h = (created - post_created) / 3600
    return "hot_take" if h <= 6 else "considered" if h <= 24 else "settled"


def is_correction(body: str, parent_score: int, reply_score: int) -> bool:
    return (
        any(s in body.lower() for s in CONTRADICTION_SIGNALS)
        and reply_score > parent_score * 0.5
    )


def consensus_skew(comments: list) -> float:
    total = sum(max(c["score"], 0) for c in comments)
    if not total:
        return 0.0
    top = max((c["score"] for c in comments), default=0)
    return round(top / total, 3)


def smart_limit(query: str) -> int:
    w = len(query.split())
    return 3 if w <= 4 else 5 if w <= 8 else 8


def _comment_node(comment, depth: int, post_utc: float, parent_score: int = 0):
    if isinstance(comment, praw.models.MoreComments):
        return None
    body = getattr(comment, "body", None)
    if not body or body in ("[deleted]", "[removed]"):
        return None
    try:
        author = comment.author
        karma = getattr(author, "comment_karma", 0) if author else 0
        age = int((time.time() - author.created_utc) / 86400) if author and getattr(author, "created_utc", None) else 0
        flair = getattr(comment, "author_flair_text", None)
    except Exception:
        karma = age = 0
        flair = None
        author = None

    return {
        "id": comment.id,
        "body": body,
        "score": comment.score,
        "created_utc": comment.created_utc,
        "depth": depth,
        "parent_id": comment.parent_id,
        "era": temporal_era(comment.created_utc, post_utc),
        "author": {
            "name": str(author) if author else "[deleted]",
            "comment_karma": karma,
            "account_age_days": age,
            "flair": flair,
        },
        "credibility_score": score_credibility(karma, age),
        "is_correction": is_correction(body, parent_score, comment.score),
    }


def fetch_thread_data(url: str) -> dict:
    _limiter.wait(cost=2)
    try:
        sub = reddit.submission(url=url)
        _ = sub.title  # trigger network call
    except Exception as e:
        raise classify_praw_error(e)

    removed = getattr(sub, "removed_by_category", None)
    if removed in ("deleted", "moderator"):
        raise ThreadFetchError("Post has been removed.", "deleted")

    try:
        sub.comments.replace_more(limit=20)
    except Exception as e:
        log.warning(f"replace_more partial: {e}")

    post_utc = sub.created_utc
    comments: list = []

    def walk(lst, depth=0, ps=0):
        for c in lst:
            if isinstance(c, praw.models.MoreComments):
                continue
            node = _comment_node(c, depth, post_utc, ps)
            if node:
                comments.append(node)
                if hasattr(c, "replies"):
                    walk(c.replies, depth + 1, c.score)

    walk(sub.comments)

    if not comments:
        raise ThreadFetchError("Thread has no readable comments yet.", "empty")

    cmap = {c["id"]: c for c in comments}
    chains = []
    for c in comments:
        if c["is_correction"]:
            pid = c["parent_id"].split("_")[-1]
            if pid in cmap:
                chains.append({
                    "parent_id": pid, "reply_id": c["id"],
                    "parent_body": cmap[pid]["body"][:200],
                    "reply_body": c["body"][:200],
                })

    skew = consensus_skew(comments)
    hot    = [c["score"] for c in comments if c["era"] == "hot_take"]
    sttld  = [c["score"] for c in comments if c["era"] == "settled"]
    t_shift = abs(
        (sum(hot) / len(hot) if hot else 0) -
        (sum(sttld) / len(sttld) if sttld else 0)
    ) > 50

    sr = sub.subreddit
    try:
        sr_desc = sr.public_description[:500]
        sr_subs = sr.subscribers
        sr_name = sr.display_name
    except Exception:
        sr_desc, sr_subs, sr_name = "", 0, "unknown"

    return {
        "post": {
            "id": sub.id, "title": sub.title, "url": url,
            "score": sub.score, "created_utc": post_utc,
            "num_comments": sub.num_comments,
        },
        "subreddit": {"name": sr_name, "description": sr_desc, "subscribers": sr_subs},
        "comments": comments,
        "stats": {
            "total_comments": len(comments),
            "consensus_skew": skew,
            "bias_flag": skew > 0.6,
            "correction_chains": chains,
            "temporal_shift": t_shift,
            "credibility_distribution": {
                "high":   sum(1 for c in comments if c["credibility_score"] > 0.6),
                "medium": sum(1 for c in comments if 0.3 <= c["credibility_score"] <= 0.6),
                "low":    sum(1 for c in comments if c["credibility_score"] < 0.3),
            },
        },
    }


# ──────────────────────────────────────────────────────────────────────────
# System prompt
# ──────────────────────────────────────────────────────────────────────────

def build_system_prompt(threads: list) -> str:
    payload = json.dumps(threads, indent=None, ensure_ascii=False)
    return f"""You are Voxr — a Reddit research analyst with an editorial voice and an unwavering commitment to source integrity.

## IDENTITY
You are not a summariser. You are an analyst that prosecutes a case. Your job is to help users understand what communities genuinely think — including disagreements, corrections, minority views, and community bias. You have opinions. Express them clearly.

## THE GROUNDING CONTRACT — ABSOLUTE
Every factual claim MUST cite a comment from the payload. Cite with [1], [2], [3]...

You MAY NOT: assert facts from your own knowledge, infer opinions not in the data, fill gaps from training, make claims without citations.
You MAY: have editorial opinions about what cited evidence means, interpret tone and sarcasm, flag data gaps, suggest where better data might exist.

If you cannot cite it, you cannot say it.

## CITATION FORMAT
Append [n] per claim. End your response with:
CITATIONS_JSON:[{{"n":1,"comment_id":"abc","author":"u/x","score":100,"body":"..."}}]

## EDITORIAL VOICE
Not: "Users report mixed opinions." Instead: "Battery life is the thread's open wound — 14 high-karma comments call it a dealbreaker [3][7][12], and the one reply defending it has 40 downvotes and a 3-day-old account [8]."

## WHEN THREADS DON'T ANSWER
Say so precisely: "The fetched threads don't address X. This would be better covered in [specific subreddit]."

## WHEN CONTRADICTION HAS NO OBJECTIVE TRUTH
Present both sides with evidence. Ask one focused question that resolves it for the user's specific situation.

## PROACTIVE FLAGS (after answering)
Surface if relevant: correction chains, temporal shifts, community bias, your confidence level.

## THREAD DATA
{payload}

## BRIEF FORMAT
**SECTION 1 — FRONT PAGE**
- Headline verdict (one punchy sentence)
- 3–4 key findings with citations
- Minority report: most significant buried dissent
- Bias warning if consensus_skew > 0.6

**SECTION 2 — DEBATE TRANSCRIPT** (only if real disagreement exists)
- Strongest argument per position, attributed + cited
- Credibility-weighted tally
- Contradiction flag + resolving question for user
"""


# ──────────────────────────────────────────────────────────────────────────
# Citation parser
# ──────────────────────────────────────────────────────────────────────────

def parse_citations(raw: str) -> tuple[str, list]:
    marker = "CITATIONS_JSON:"
    if marker in raw:
        idx = raw.index(marker)
        text = raw[:idx].strip()
        try:
            citations = json.loads(raw[idx + len(marker):].strip())
        except Exception:
            citations = []
    else:
        text, citations = raw.strip(), []
    return text, citations


# ──────────────────────────────────────────────────────────────────────────
# Session helpers
# ──────────────────────────────────────────────────────────────────────────

def _get(req: Request, sid: str) -> dict:
    s = req.app.state.sessions.get(sid)
    if s is None:
        raise HTTPException(404, "Session not found. Start a new session.")
    return s


def _save(req: Request, sid: str, session: dict):
    req.app.state.sessions.set(sid, session, ttl=7200)


# ──────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────

class SearchThreadsRequest(BaseModel):
    query: str
    limit: Optional[int] = None

class LoadRequest(BaseModel):
    session_id: str
    thread_url: str

class ChatRequest(BaseModel):
    session_id: str
    message: str


# ──────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health(request: Request):
    store_type = "redis" if isinstance(
        getattr(request.app.state, "sessions", None), RedisSessionStore
    ) else "memory"
    return {"status": "ok", "version": "1.1.0", "session_store": store_type}


@app.post("/search")
def search_threads(req: SearchThreadsRequest, request: Request):
    _limiter.wait(cost=1)
    try:
        limit = req.limit or smart_limit(req.query)
        results = []
        for s in reddit.subreddit("all").search(req.query, sort="relevance", limit=limit * 3):
            if len(results) >= limit:
                break
            try:
                results.append({
                    "title": s.title,
                    "url": f"https://www.reddit.com{s.permalink}",
                    "subreddit": s.subreddit.display_name,
                    "score": s.score,
                    "num_comments": s.num_comments,
                    "created_utc": s.created_utc,
                    "preview": s.selftext[:200] if s.selftext else "",
                })
            except Exception:
                continue
        return {"results": results, "query": req.query, "count": len(results)}
    except prawcore.exceptions.TooManyRequests:
        raise HTTPException(429, "Reddit rate limit. Please wait 60s.")
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"search error: {e}")
        raise HTTPException(500, str(e))


@app.post("/load")
def load_thread(req: LoadRequest, request: Request):
    session = request.app.state.sessions.get(req.session_id) or {"threads": [], "history": []}

    try:
        thread_data = fetch_thread_data(req.thread_url)
    except ThreadFetchError as e:
        raise HTTPException(422, {"message": str(e), "code": e.code})
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"load_thread error: {e}")
        raise HTTPException(500, f"Unexpected error: {e}")

    session["threads"].append(thread_data)

    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {"role": "system", "content": build_system_prompt(session["threads"])},
                {"role": "user", "content": (
                    "Generate the full brief. Include Front Page and Debate Transcript "
                    "(if genuine disagreement exists). Be editorial, opinionated, cite everything."
                )},
            ],
        )
        brief_raw = resp.choices[0].message.content
    except Exception as e:
        log.exception(f"Groq error: {e}")
        raise HTTPException(502, f"LLM error: {e}")

    brief_text, citations = parse_citations(brief_raw)
    session["history"].append({"role": "assistant", "content": brief_raw})
    _save(request, req.session_id, session)

    return {
        "thread_stats": thread_data["stats"],
        "post": thread_data["post"],
        "subreddit": thread_data["subreddit"],
        "brief": brief_text,
        "citations": citations,
    }


@app.post("/chat")
def chat(req: ChatRequest, request: Request):
    session = _get(request, req.session_id)
    if not session.get("threads"):
        raise HTTPException(400, "No threads loaded.")

    session["history"].append({"role": "user", "content": req.message})
    if len(session["history"]) > 40:
        session["history"] = session["history"][-40:]

    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1500,
            messages=[
                {"role": "system", "content": build_system_prompt(session["threads"])},
                *session["history"],
            ],
        )
        reply_raw = resp.choices[0].message.content
    except Exception as e:
        log.exception(f"Groq chat error: {e}")
        raise HTTPException(502, f"LLM error: {e}")

    reply_text, citations = parse_citations(reply_raw)
    session["history"].append({"role": "assistant", "content": reply_raw})
    _save(request, req.session_id, session)

    return {
        "response": reply_text,
        "citations": citations,
        "history_length": len(session["history"]),
    }


@app.get("/session/{session_id}/stats")
def get_stats(session_id: str, request: Request):
    session = _get(request, session_id)
    return {
        "threads": [
            {"post": t["post"], "subreddit": t["subreddit"], "stats": t["stats"]}
            for t in session.get("threads", [])
        ]
    }


@app.post("/session/new")
def new_session(request: Request):
    sid = str(uuid.uuid4())
    request.app.state.sessions.set(sid, {"threads": [], "history": []}, ttl=7200)
    return {"session_id": sid}


@app.delete("/session/{session_id}")
def clear_session(session_id: str, request: Request):
    request.app.state.sessions.delete(session_id)
    return {"cleared": True}