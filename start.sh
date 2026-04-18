#!/usr/bin/env bash
set -e

RESET="\033[0m"
ACC="\033[38;5;154m"
DIM="\033[2m"
BOLD="\033[1m"
RED="\033[31m"

echo ""
echo -e "${ACC}${BOLD}  VOXR${RESET}${DIM}  — Vox Populi. Distilled.${RESET}"
echo -e "${DIM}  ──────────────────────────────────────────${RESET}"
echo ""

MODE="${1:-local}"   # local | docker

if [ ! -f ".env" ]; then
  echo -e "${RED}  ⚠  .env not found.${RESET}"
  echo -e "  ${DIM}cp .env.example .env${RESET}  then fill in credentials."
  echo ""
  exit 1
fi

set -a; source .env; set +a

MISSING=0
for VAR in REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET GROQ_API_KEY; do
  val="${!VAR}"
  if [ -z "$val" ] || [[ "$val" == *"your_"* ]]; then
    echo -e "${RED}  ⚠  $VAR is not set${RESET}"
    MISSING=1
  fi
done
[ "$MISSING" -eq 1 ] && echo "" && exit 1

if [ "$MODE" = "docker" ]; then
  echo -e "${DIM}  Starting via docker-compose (includes Redis)…${RESET}"
  docker compose up --build
  exit 0
fi

echo -e "${DIM}  [1/4] Python venv…${RESET}"
cd backend
[ ! -d "venv" ] && python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -q

echo -e "${DIM}  [2/4] Starting backend :8000…${RESET}"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

echo -e "${DIM}  [3/4] Frontend deps…${RESET}"
cd frontend
[ ! -d "node_modules" ] && npm install -q

echo -e "${DIM}  [4/4] Starting frontend :5173…${RESET}"
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${ACC}${BOLD}  Ready.${RESET}"
echo -e "  Frontend  →  ${ACC}http://localhost:5173${RESET}"
echo -e "  Backend   →  ${DIM}http://localhost:8000${RESET}"
echo -e "  Sessions  →  ${DIM}in-memory  (run ${RESET}${ACC}./start.sh docker${RESET}${DIM} for Redis)${RESET}"
echo ""
echo -e "${DIM}  Ctrl+C to stop.${RESET}"
echo ""

trap "echo ''; kill \$BACKEND_PID \$FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait