# VOXR
### Vox Populi. Distilled.

Voxr is a purpose-built epistemic instrument for Reddit. It finds discussions, evaluates sources, surfaces buried dissent, weights claims by the credibility of who made them, tracks when opinion shifted — and lets you audit every verdict against the exact comment that earned it.

---

## What it does that nothing else does

| Feature | Every other tool | Voxr |
|---|---|---|
| Multi-thread topic search | ✗ (URL required) | ✓ |
| Dissent & correction chain detection | ✗ | ✓ |
| Account credibility scoring | ✗ | ✓ |
| Temporal shift detection | ✗ | ✓ |
| Community bias flags | ✗ | ✓ |
| Inspectable citations (click → raw comment) | ✗ | ✓ |
| Structural hallucination prevention | ✗ | ✓ |

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI |
| Reddit data | PRAW (full comment tree + metadata) |
| LLM | Groq — Llama 3.3 70B (128K context) |
| Session store | In-memory (swap for Redis in production) |

---

## Getting started

### 1. Clone and configure

```bash
git clone <your-repo>
cd voxr
cp .env.example .env
# Fill in your credentials in .env
```

**You need:**
- A Reddit API app (script type) → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- A Groq API key → [console.groq.com](https://console.groq.com)

### 2. Run everything

```bash
chmod +x start.sh
./start.sh
```

This starts the backend on `http://localhost:8000` and frontend on `http://localhost:5173`.

### 3. Manual setup (if you prefer)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env      # fill in credentials
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Project structure

```
voxr/
├── backend/
│   ├── main.py              # FastAPI app — all routes + intelligence pipeline
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js       # proxies /api → localhost:8000
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── main.jsx
│       ├── styles/
│       │   └── globals.css
│       ├── pages/
│       │   ├── SearchScreen.jsx
│       │   └── ChatScreen.jsx
│       └── components/
│           ├── ChatMessage.jsx      # markdown renderer + citation chips
│           ├── CitationDrawer.jsx   # side drawer showing raw comment
│           └── StatsSidebar.jsx     # thread intelligence stats
├── .env.example
├── start.sh
└── README.md
```

---

## How the grounding contract works

Every claim Voxr makes is structurally required to cite a comment from the PRAW payload. The system prompt enforces one rule:

> *If you cannot cite it, you cannot say it.*

The `[1]` `[2]` `[3]` markers in the output are the enforcement mechanism — not a UI flourish. Clicking any citation opens a side drawer with the raw Reddit comment, author credibility score, era, and a direct link to the source. Every verdict is fully auditable.

---

## Intelligence pipeline (what runs on every thread load)

1. **PRAW fetch** — full comment forest with `replace_more(limit=20)`
2. **Correction chain detection** — replies that contradict high-scoring parents
3. **Credibility scoring** — `log(account_age) × log(karma)`, normalised 0–1
4. **Temporal binning** — hot take (0–6h) / considered (6–24h) / settled (24h+)
5. **Consensus skew** — top comment score / total score mass; >0.6 = bias flag
6. **Temporal shift detection** — significant score delta between eras
7. **Brief generation** — Front Page + Debate Transcript (conditional), via Groq

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/search` | Search Reddit for threads matching a topic |
| `POST` | `/load` | Fetch thread, run intelligence pipeline, generate brief |
| `POST` | `/chat` | Multi-turn conversation with loaded thread context |
| `POST` | `/session/new` | Create a new session |
| `GET` | `/session/{id}/stats` | Get intelligence stats for a session |
| `DELETE` | `/session/{id}` | Clear a session |
| `GET` | `/health` | Health check |

---

## Deployment notes

- **Backend**: Deploy to [Render](https://render.com) as a Python web service. Set environment variables in the dashboard.
- **Frontend**: Deploy to [Vercel](https://vercel.com). Set `VITE_API_URL` if your backend isn't on the same domain, and update the Vite proxy config.
- **Sessions**: The in-memory session store resets on restart. For production, swap `sessions: dict` for a Redis client (`redis-py`).

---

## Reddit API rate limits

PRAW handles OAuth automatically. The Reddit API allows 60 requests/minute for script apps. For heavy usage, add a request queue or deploy multiple instances with different credentials.

---

*Voxr — Reddit has always contained truth. This is the first tool that treats it like a primary source.*
