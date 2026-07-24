@echo off
set "ROOT=%~dp0"
set "BACKEND_PYTHON=%ROOT%backend\.venv\Scripts\python.exe"
set "BACKEND_PORT_FILE=%ROOT%backend\backend-port.txt"
set "FRONTEND_ENV_FILE=%ROOT%frontend\.env.local"

echo =======================================
echo        Starting LoopBack Workspace
echo =======================================
echo.

echo [1/2] Starting Backend (FastAPI)...
if exist "%BACKEND_PORT_FILE%" del "%BACKEND_PORT_FILE%"
if exist "%FRONTEND_ENV_FILE%" del "%FRONTEND_ENV_FILE%"
start "LoopBack Backend (FastAPI)" cmd /k pushd "%ROOT%backend" ^&^& "%BACKEND_PYTHON%" run_dev.py

echo [2/2] Starting Frontend (Next.js)...
echo Waiting for backend port...
set "BACKEND_PORT="
for /L %%i in (1,1,60) do (
    if exist "%BACKEND_PORT_FILE%" (
        set /p BACKEND_PORT=<"%BACKEND_PORT_FILE%"
        goto :backend_ready
    )
    ping 127.0.0.1 -n 2 >nul
)

:backend_ready
if "%BACKEND_PORT%"=="" (
    echo Backend did not publish a port. Frontend was not started.
    goto :done
) else (
    echo Backend API running at: http://localhost:%BACKEND_PORT%
)
echo NEXT_PUBLIC_API_URL=http://localhost:%BACKEND_PORT%/api>"%FRONTEND_ENV_FILE%"
echo Wrote frontend API config to: %FRONTEND_ENV_FILE%
start "LoopBack Frontend (Next.js)" cmd /k pushd "%ROOT%frontend" ^&^& npm run dev

echo.
echo =======================================
echo LoopBack is now starting up!
echo.
echo - Frontend running at: http://localhost:3000
if not "%BACKEND_PORT%"=="" echo - Backend API running at: http://localhost:%BACKEND_PORT%
echo.
echo (Two new terminal windows have been opened for the logs)
echo =======================================
echo.
echo Opening browser to http://localhost:3000...
start http://localhost:3000
:done
pause
