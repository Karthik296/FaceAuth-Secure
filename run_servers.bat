@echo off
title FaceAuth Secure Startup
echo ===================================================
echo   Starting FaceAuth Secure Development Environment
echo ===================================================
echo.

echo Starting backend server on port 8000...
start "FaceAuth Backend" cmd /k "cd /d %~dp0backend && ..\.venv\Scripts\python.exe -m uvicorn main:app --port 8000"

echo Starting frontend development server...
start "FaceAuth Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are launching in separate windows!
echo - Backend: http://localhost:8000
echo - Frontend: Check terminal for port (usually http://localhost:5173)
echo.
pause
