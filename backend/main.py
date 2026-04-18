import os
import uuid
import math
import json
import time
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import praw
from groq import Groq

app = FastAPI(title="Voxr API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", os.getenv("FRONTEND_URL", "")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store ──────────────────────────────────────────────────
sessions: dict = {}

# ── PRAW client ──────────────────────────────────────────────────────────────
reddit = praw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT", "voxr/1.0"),
    username=os.getenv("REDDIT_USERNAME", ""),
    password=os.getenv("REDDIT_PASSWORD", ""),
)

# ── Groq client ──────────────────────────────────────────────────────────────
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ────────────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str

class LoadRequest(BaseModel):
    session_id: str
    thread_url: str

class ChatRequest(BaseModel):
    session_id: str
    message: str

class SearchThreadsRequest(BaseModel):
    query: str
    limit: Optional[int] = None  # None = smart mode

# ────────────────────────────────────────────────────────────────────────────
# Intelligence helpers
# ────────────────────────────────────────────────────────────────────────────

CONTRADICTION_SIGNALS = [
    "actually", "that's wrong", "that is wrong", "this is false",
    "not true", "incorrect", "source?", "citation needed",
    "misinformation", "misleading", "wrong about", "that's not",
    "you're wrong", "you are wrong", "clarification", "to be clear",
    "edit:", "[edit]", "correction", "update:"
]

def score_credibility(comment_karma: int, account_age_days: int) -> float:
    """log(age) × log(karma) normalised to 0–1"""
    if comment_karma <= 0 or account_age_days <= 0:
        return 0.0
    raw = math.log1p(account_age_days) * math.log1p(comment_karma)
    max_possible = math.log1p(3650) * math.log1p(500000)
    return round(min(raw / max_possible, 1.0), 3)

def temporal_era(created_utc: float, post_created_utc: float) -> str:
    delta_h = (created_utc - post_created_utc) / 3600
    if delta_h <= 6:
        return "hot_take"
    elif delta_h <= 24:
        return "considered"
    else:
        return "settled"

def is_correction(body: str, parent_score: int, reply_score: int) -> bool:
    body_lower = body.lower()
    has_signal = any(sig in body_lower for sig in CONTRADICTION_SIGNALS)
    score_beats_parent = reply_score > parent_score * 0.5
    return has_signal and score_beats_parent

def consensus_skew(comments: list) -> float:
    """top comment score / total score mass"""
    total = sum(max(c["score"], 0) for c in comments)
    if total == 0:
        return 0.0
    top = max((c["score"] for c in comments), default=0)
    return round(top / total, 3)

def smart_thread_limit(query: str) -> int:
    """Estimate breadth from query length and complexity"""
    words = len(query.split())
    if words <= 4:
        return 3
    elif words <= 8:
        return 5
    else:
        return 8

def fetch_comment_node(comment, depth: int, post_created_utc: float, parent_score: int = 0) -> Optional[dict]:
    if isinstance(comment, praw.models.MoreComments):
        return None
    try:
        author = comment.author
        karma = getattr(author, "comment_karma", 0) if author else 0
        age_days = 0
        if author:
            created = getattr(author, "created_utc", None)
            if created:
                age_days = int((time.time() - created) / 86400)
        flair = getattr(comment, "author_flair_text", None)
    except Exception:
        karma, age_days, flair = 0, 0, None

    body = comment.body if comment.body != "[deleted]" else None
    if not body:
        return None

    node = {
        "id": comment.id,
        "body": body,
        "score": comment.score,
        "created_utc": comment.created_utc,
        "depth": depth,
        "parent_id": comment.parent_id,
        "era": temporal_era(comment.created_utc, post_created_utc),
        "author": {
            "name": str(author) if author else "[deleted]",
            "comment_karma": karma,
            "account_age_days": age_days,
            "flair": flair,
        },
        "credibility_score": score_credibility(karma, age_days),
        "is_correction": is_correction(body, parent_score, comment.score),
    }
    return node

def fetch_thread_data(url: str) -> dict:
    submission = reddit.submission(url=url)
    submission.comments.replace_more(limit=20)

    post_utc = submission.created_utc
    sub = submission.subreddit

    try:
        sub_desc = sub.public_description[:500]
        sub_subs = sub.subscribers
        sub_name = sub.display_name
    except Exception:
        sub_desc, sub_subs, sub_name = "", 0, "unknown"

    comments = []

    def walk(comment_list, depth=0, parent_score=0):
        for c in comment_list:
            if isinstance(c, praw.models.MoreComments):
                continue
            node = fetch_comment_node(c, depth, post_utc, parent_score)
            if node:
                comments.append(node)
                if hasattr(c, "replies"):
                    walk(c.replies, depth + 1, c.score)

    walk(submission.comments)

    # Correction chains: find (parent_id, reply_id) pairs
    comment_map = {c["id"]: c for c in comments}
    correction_chains = []
    for c in comments:
        if c["is_correction"]:
            parent_id = c["parent_id"].split("_")[-1]
            if parent_id in comment_map:
                correction_chains.append({
                    "parent_id": parent_id,
                    "reply_id": c["id"],
                    "parent_body": comment_map[parent_id]["body"][:200],
                    "reply_body": c["body"][:200],
                })

    skew = consensus_skew(comments)
    bias_flag = skew > 0.6

    # Temporal shift: check if settled consensus differs from hot take era
    hot_take_avg = 0.0
    settled_avg = 0.0
    hot = [c["score"] for c in comments if c["era"] == "hot_take"]
    settled = [c["score"] for c in comments if c["era"] == "settled"]
    if hot:
        hot_take_avg = sum(hot) / len(hot)
    if settled:
        settled_avg = sum(settled) / len(settled)
    temporal_shift = abs(hot_take_avg - settled_avg) > 50

    return {
        "post": {
            "id": submission.id,
            "title": submission.title,
            "url": url,
            "score": submission.score,
            "created_utc": post_utc,
            "num_comments": submission.num_comments,
        },
        "subreddit": {
            "name": sub_name,
            "description": sub_desc,
            "subscribers": sub_subs,
        },
        "comments": comments,
        "stats": {
            "total_comments": len(comments),
            "consensus_skew": skew,
            "bias_flag": bias_flag,
            "correction_chains": correction_chains,
            "temporal_shift": temporal_shift,
            "credibility_distribution": {
                "high": len([c for c in comments if c["credibility_score"] > 0.6]),
                "medium": len([c for c in comments if 0.3 <= c["credibility_score"] <= 0.6]),
                "low": len([c for c in comments if c["credibility_score"] < 0.3]),
            }
        }
    }

# ────────────────────────────────────────────────────────────────────────────
# System prompt builder
# ────────────────────────────────────────────────────────────────────────────

def build_system_prompt(threads_payload: list) -> str:
    payload_json = json.dumps(threads_payload, indent=None, ensure_ascii=False)

    return f"""You are Voxr — a Reddit research analyst with an editorial voice and an unwavering commitment to source integrity.

## IDENTITY
You are not a summariser. You are an analyst that prosecutes a case. Your job is to help users understand what communities genuinely think about a topic — including disagreements, corrections, minority views, and community bias. You have opinions about what the evidence shows. You express them clearly.

## THE GROUNDING CONTRACT — THIS IS ABSOLUTE
Every factual claim you make about what people think MUST be traceable to a specific comment in the thread data below. You will cite it with a number like [1], [2], [3]. These numbers correspond to comment IDs in the payload.

You MAY NOT:
- Assert facts about the topic itself from your own knowledge
- Infer opinions that are not in the data
- Fill gaps from training data
- Make claims without a citation number

You MAY:
- Have editorial opinions about what the cited evidence means
- Interpret tone, sarcasm, and consensus from the data
- Flag when the data is insufficient to answer a question
- Suggest where better data might exist if threads don't cover a topic

If you cannot cite it, you cannot say it. If you say it without a citation, you have broken the contract.

## CITATION FORMAT
When making a claim, append [n] where n is a sequential number. At the end of your response, include a CITATIONS block in this exact JSON format:
CITATIONS_JSON:[{{"n":1,"comment_id":"abc123","author":"u/someone","score":847,"body":"first 150 chars of comment..."}},{{"n":2,...}}]

## EDITORIAL VOICE
Be opinionated about interpretation. Not: "Users report mixed opinions on battery life."
Instead: "Battery life is the thread's open wound — 14 high-karma comments call it a dealbreaker [3][7][12], and the one reply defending it has 40 downvotes and a 3-day-old account [8]."

Be direct. Be confident when evidence is clear. Flag your own uncertainty when it isn't.

## WHEN THREADS DON'T ANSWER
If the user asks about something the thread data doesn't contain, say so clearly and specifically: "The fetched threads don't address X. This topic would likely be better covered in [specific subreddit suggestion]."

## WHEN THERE IS CONTRADICTION WITHOUT OBJECTIVE TRUTH
Present both sides with evidence. Then ask the user one focused question that would resolve the contradiction for their specific situation. Example: "r/SteamDeck users value portability and Linux [4][5] while r/ROGAlly users prioritise raw performance [11][14]. Whether that tradeoff matters depends entirely on your use case — are you planning to use this primarily docked or handheld?"

## PROACTIVE SURFACING
After answering the user's question, proactively flag (if relevant and not already mentioned):
- Any significant correction chain where a reply contradicts its highly-upvoted parent
- Any temporal shift where early consensus was later reversed
- Any community bias that may colour the findings
- Your confidence level in the answer

## THREAD DATA
The following is the complete payload of fetched Reddit threads with all comment metadata. This is your only source of truth.

{payload_json}

## BRIEF GENERATION
When asked to generate a brief (on initial thread load), produce TWO sections:

**SECTION 1 — FRONT PAGE**
- Headline verdict (one punchy sentence)
- 3–4 key findings with citations
- Minority report: the most significant buried dissent with citations
- Bias warning if consensus_skew > 0.6

**SECTION 2 — DEBATE TRANSCRIPT** (only if genuine disagreement exists)
- Strongest argument for each major position, attributed and cited
- A credibility-weighted tally
- One contradiction flag with a suggested resolving question for the user

Format both sections in clear markdown. Keep editorial voice throughout.
"""

# ────────────────────────────────────────────────────────────────────────────
# Routes
# ────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "voxr-api"}


@app.post("/search")
def search_threads(req: SearchThreadsRequest):
    """Search Reddit for threads matching a topic query."""
    try:
        limit = req.limit or smart_thread_limit(req.query)
        results = []

        for submission in reddit.subreddit("all").search(req.query, sort="relevance", limit=limit * 3):
            if len(results) >= limit:
                break
            try:
                results.append({
                    "title": submission.title,
                    "url": f"https://www.reddit.com{submission.permalink}",
                    "subreddit": submission.subreddit.display_name,
                    "score": submission.score,
                    "num_comments": submission.num_comments,
                    "created_utc": submission.created_utc,
                    "preview": submission.selftext[:200] if submission.selftext else "",
                })
            except Exception:
                continue

        return {"results": results, "query": req.query, "count": len(results)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load")
def load_thread(req: LoadRequest):
    """Fetch a Reddit thread, process it, generate initial brief."""
    if req.session_id not in sessions:
        sessions[req.session_id] = {"threads": [], "history": []}

    try:
        thread_data = fetch_thread_data(req.thread_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch thread: {str(e)}")

    sessions[req.session_id]["threads"].append(thread_data)

    payload = sessions[req.session_id]["threads"]
    system_prompt = build_system_prompt(payload)

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Generate the full brief for this thread. Include both the Front Page section and the Debate Transcript section (if there is genuine disagreement). Be editorial, opinionated, and cite everything."}
            ]
        )
        brief_raw = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq error: {str(e)}")

    brief_text, citations = parse_citations(brief_raw)

    sessions[req.session_id]["history"].append({
        "role": "assistant",
        "content": brief_raw
    })

    return {
        "thread_stats": thread_data["stats"],
        "post": thread_data["post"],
        "subreddit": thread_data["subreddit"],
        "brief": brief_text,
        "citations": citations,
    }


@app.post("/chat")
def chat(req: ChatRequest):
    """Multi-turn conversation with the loaded thread context."""
    if req.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Load a thread first.")

    session = sessions[req.session_id]
    threads = session["threads"]

    if not threads:
        raise HTTPException(status_code=400, detail="No threads loaded in this session.")

    system_prompt = build_system_prompt(threads)
    session["history"].append({"role": "user", "content": req.message})

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1500,
            messages=[
                {"role": "system", "content": system_prompt},
                *session["history"]
            ]
        )
        reply_raw = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq error: {str(e)}")

    reply_text, citations = parse_citations(reply_raw)
    session["history"].append({"role": "assistant", "content": reply_raw})

    return {
        "response": reply_text,
        "citations": citations,
        "history_length": len(session["history"]),
    }


@app.get("/session/{session_id}/stats")
def get_stats(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    threads = sessions[session_id]["threads"]
    if not threads:
        return {"threads": []}
    return {
        "threads": [
            {
                "post": t["post"],
                "subreddit": t["subreddit"],
                "stats": t["stats"],
            }
            for t in threads
        ]
    }


@app.post("/session/new")
def new_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"threads": [], "history": []}
    return {"session_id": session_id}


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    if session_id in sessions:
        del sessions[session_id]
    return {"cleared": True}


# ────────────────────────────────────────────────────────────────────────────
# Citation parser
# ────────────────────────────────────────────────────────────────────────────

def parse_citations(raw: str) -> tuple[str, list]:
    """Split model output into clean text and citations list."""
    marker = "CITATIONS_JSON:"
    if marker in raw:
        idx = raw.index(marker)
        text = raw[:idx].strip()
        json_str = raw[idx + len(marker):].strip()
        try:
            citations = json.loads(json_str)
        except Exception:
            citations = []
    else:
        text = raw.strip()
        citations = []
    return text, citations
