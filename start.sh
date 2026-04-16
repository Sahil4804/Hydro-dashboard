#!/bin/bash
# Start both backend and frontend for the Himayat Sagar Dashboard

echo "=== Himayat Sagar Hydroclimatic Dashboard ==="
echo ""

# Start backend
echo "Starting backend (FastAPI) on port 8000..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 3

# Start frontend
echo "Starting frontend (Next.js) on port 3000..."
cd frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Dashboard running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT
wait
