# VOXR
### Vox Populi. Distilled.

Voxr is a purpose-built epistemic instrument for Reddit. It finds discussions across communities, distills them into a sourced editorial brief, surfaces buried dissent, weights claims by account credibility, tracks when opinions shifted — and lets you audit every verdict against the exact comment that earned it.

---

## What it does that nothing else does

| Feature | Every other tool | Voxr |
|---|---|---|
| Multi-thread topic search | ✗ (URL required) | ✓ |
| Dissent & correction chain detection | ✗ | ✓ |
| Account credibility scoring (age × karma) | ✗ | ✓ |
| Temporal shift detection | ✗ | ✓ |
| Community bias flags | ✗ | ✓ |
| Inspectable citations (click → raw comment drawer) | ✗ | ✓ |
| Structural hallucination prevention | ✗ | ✓ |
| Error classification (private / deleted / empty threads) | ✗ | ✓ |

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI |
| Reddit data | PRAW + prawcore (full comment tree + metadata) |
| LLM | Groq — Llama 3.3 70B (128K context) |
| Session store | Redis (auto-fallback to in-memory) |
| Hosting | Render (API) + Vercel (frontend) |

---

## Quick start — local dev

### 1. Clone and configure

```bash
git clone <your-repo>
cd voxr
cp .env.example .env
# Fill in your Reddit API and Groq credentials
```

You need:
- **Reddit API app** (script type) → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- **Groq API key** → [console.groq.com](https://console.groq.com)

### 2. Run

```bash
chmod +x start.sh

./start.sh           # local dev — in-memory sessions
./start.sh docker    # full stack with Redis (requires Docker)
```

Frontend → `http://localhost:5173`  
Backend → `http://localhost:8000`

---

## Project structure

```
voxr/
├── backend/
│   ├── main.py              # FastAPI app — full intelligence pipeline
│   └── requirements.txt     # fastapi, praw, prawcore, groq, redis
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json          # Vercel deploy config
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── main.jsx
│       ├── styles/globals.css
│       ├── pages/
│       │   ├── SearchScreen.jsx
│       │   └── ChatScreen.jsx   # includes ThreadErrorPane
│       └── components/
│           ├── ChatMessage.jsx
│           ├── CitationDrawer.jsx
│           └── StatsSidebar.jsx
├── Dockerfile
├── docker-compose.yml       # API + Redis + frontend
├── render.yaml              # Render deploy config (API + Redis)
├── .env.example
├── start.sh
└── README.md
```

---

## Session store

Sessions are stored in Redis when `REDIS_URL` is set. If it's unset or unavailable, the app silently falls back to an in-memory dict — no code change needed.

| Mode | How to use |
|---|---|
| In-memory (local) | Leave `REDIS_URL` blank |
| Redis (docker) | `./start.sh docker` |
| Redis (production) | Set `REDIS_URL` env var on Render — handled automatically by `render.yaml` |

Sessions have a 2-hour TTL. History is trimmed to the last 40 turns to stay within context limits.

---

## Error handling

The backend classifies PRAW failures before they surface to the UI:

| Code | Cause | Frontend display |
|---|---|---|
| `private` | Subreddit/post is private or quarantined | ⊘ Private or Quarantined |
| `not_found` | Thread deleted or URL wrong | ⌀ Thread Not Found |
| `deleted` | Post removed by author or mods | ⌀ Thread Deleted |
| `empty` | Thread has no readable comments | ∅ No Comments Yet |
| `rate_limited` | Reddit 429 — too many requests | ⏳ Rate Limited |
| `unknown` | Anything else | ⚠ Load Failed |

The UI renders a full-pane error state with a back button — no crashing, no empty loading spinners.

---

## Grounding contract

Every claim Voxr makes is structurally required to cite a comment from the PRAW payload. The system prompt enforces one rule:

> *If you cannot cite it, you cannot say it.*

The `[1]` `[2]` `[3]` markers are the enforcement mechanism. Clicking any of them opens a side drawer with the raw comment, author credibility score, temporal era, and a direct Reddit link. Every verdict is fully auditable.

---

## Intelligence pipeline (runs on every thread load)

1. **PRAW fetch** — full comment forest with `replace_more(limit=20)`
2. **Correction chain detection** — contradiction signals in replies to high-scoring parents
3. **Credibility scoring** — `log(account_age_days) × log(comment_karma)`, normalised 0–1
4. **Temporal binning** — hot take (0–6h) / considered (6–24h) / settled (24h+)
5. **Consensus skew** — top comment score ÷ total score mass; > 0.6 = bias flag
6. **Temporal shift detection** — score delta > 50 between hot take and settled eras
7. **Brief generation** — Front Page + conditional Debate Transcript via Groq

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/search` | Search Reddit by topic |
| `POST` | `/load` | Fetch thread, run pipeline, generate brief |
| `POST` | `/chat` | Multi-turn conversation |
| `POST` | `/session/new` | Create session |
| `GET` | `/session/{id}/stats` | Intelligence stats |
| `DELETE` | `/session/{id}` | Clear session |
| `GET` | `/health` | Health + session store type |

---

## Deployment

### Render (backend + Redis)

```bash
# Push to GitHub, then in Render dashboard:
# New → Blueprint → connect repo → render.yaml is picked up automatically
```

Set env vars in Render dashboard: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, `GROQ_API_KEY`, `FRONTEND_URL`.  
`REDIS_URL` is wired automatically from `render.yaml`.

### Vercel (frontend)

```bash
cd frontend
npx vercel
```

Update `vercel.json` → replace `your-voxr-api.onrender.com` with your actual Render URL. Then set `FRONTEND_URL` in Render to your Vercel URL.

### Docker (self-host)

```bash
cp .env.example .env   # fill credentials
docker compose up --build
```

---

## Rate limiting

The backend uses a token-bucket limiter (0.8 tokens/sec, burst of 8) to stay within Reddit's ~60 req/min limit for script apps. Searches consume 1 token; thread loads consume 2. Requests block and retry for up to 30 seconds before returning a 429.

---

*Voxr — Reddit has always contained truth. This is the first tool that treats it like a primary source.*