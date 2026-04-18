#!/usr/bin/env bash
set -e

# ── Colors ────────────────────────────────────────────────────────────────────
RESET="\033[0m"
ACC="\033[38;5;154m"    # #c8ff00 approximation
DIM="\033[2m"
BOLD="\033[1m"
RED="\033[31m"

echo ""
echo -e "${ACC}${BOLD}  VOXR${RESET}${DIM}  — Vox Populi. Distilled.${RESET}"
echo -e "${DIM}  ────────────────────────────────────────${RESET}"
echo ""

# ── Check .env ────────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo -e "${RED}  ⚠  .env not found.${RESET}"
  echo -e "  Copy .env.example and fill in your credentials:"
  echo -e "${DIM}  cp .env.example .env${RESET}"
  echo ""
  exit 1
fi

# Export env vars
set -a
source .env
set +a

# ── Check required vars ───────────────────────────────────────────────────────
MISSING=0
for VAR in REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET GROQ_API_KEY; do
  if [ -z "${!VAR}" ] || [ "${!VAR}" = "your_${VAR,,}_here" ]; then
    echo -e "${RED}  ⚠  $VAR is not set in .env${RESET}"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo -e "  Fill in all required credentials in ${DIM}.env${RESET} and try again."
  echo ""
  exit 1
fi

# ── Backend setup ─────────────────────────────────────────────────────────────
echo -e "${DIM}  [1/4] Setting up Python environment…${RESET}"

cd backend

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

echo -e "${DIM}  [2/4] Starting backend on :8000…${RESET}"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

cd ..

# ── Frontend setup ────────────────────────────────────────────────────────────
echo -e "${DIM}  [3/4] Installing frontend dependencies…${RESET}"

cd frontend

if [ ! -d "node_modules" ]; then
  npm install -q
fi

echo -e "${DIM}  [4/4] Starting frontend on :5173…${RESET}"
npm run dev &
FRONTEND_PID=$!

cd ..

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${ACC}${BOLD}  Ready.${RESET}"
echo -e "  Frontend  →  ${ACC}http://localhost:5173${RESET}"
echo -e "  Backend   →  ${DIM}http://localhost:8000${RESET}"
echo ""
echo -e "${DIM}  Press Ctrl+C to stop both servers.${RESET}"
echo ""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
trap "echo ''; echo '  Stopping…'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
