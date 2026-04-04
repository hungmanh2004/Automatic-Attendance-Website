# Docker Local Development Setup — Design

**Date:** 2026-04-04
**Scope:** Local development only (not production)
**Goal:** `docker-compose up` starts the full stack with one command

---

## Architecture

Two containers connected over a private Docker network (`app-net`):

| Service | Base Image | Internal Port | Host Port | Reload |
|---|---|---|---|---|
| `backend` | `python:3.12-slim` | 5000 | — (internal only) | Flask `--reload` |
| `frontend` | `node:20-alpine` | 5173 | 5173 | Vite HMR |

The browser opens `http://localhost:5173`. Vite proxies `/api/*` to `http://backend:5000`.

---

## Networking

- Both services join a user-defined bridge network `app-net`
- `frontend` resolves `backend` by container name via Docker DNS
- `vite.config.js` proxy target changes from `http://127.0.0.1:5000` → `http://backend:5000`

---

## Volumes & Data Persistence

| Volume | Type | Container path | Purpose |
|---|---|---|---|
| `backend-data` | Named | `/app/backend/data` | SQLite DB, checkin photos, face images |
| `deepface-cache` | Named | `/root/.deepface` | DeepFace auto-downloaded model weights |
| `ultralytics-cache` | Named | `/root/.config/Ultralytics` | YOLOv12 weights cache |
| `./` (project root) | Bind mount | `/app` | Live source code for backend |
| `./frontend` | Bind mount | `/app` | Live source code for frontend |
| `frontend_node_modules` | Anonymous | `/app/node_modules` | Prevents host Windows node_modules conflicting with Linux container |
| `./yolov12n-face.pt` | Bind mount | `/app/yolov12n-face.pt` | Local YOLO model file |

Named volumes persist across `docker-compose down`. Use `docker-compose down -v` to wipe them.

---

## Backend Dockerfile (`backend/Dockerfile`)

- Base: `python:3.12-slim`
- System deps: `libgl1`, `libglib2.0-0` (required by OpenCV)
- `pip install -r requirements.txt`
- Working dir: `/app`
- Env vars: `FLASK_APP=backend/run.py`, `FLASK_DEBUG=1`
- Command: `flask run --host=0.0.0.0 --port=5000 --reload`

First build is slow (~5-10 min) due to heavy ML deps. Subsequent starts are fast.

---

## Frontend Dockerfile (`frontend/Dockerfile`)

- Base: `node:20-alpine`
- Copy `package.json` + `package-lock.json` first, then `npm install` (layer cache)
- Working dir: `/app`
- Source code bind-mounted at runtime
- `node_modules` kept inside container via anonymous volume (avoids Windows/Linux path conflicts)
- Command: `npm run dev -- --host` (`--host` required for Vite to listen on `0.0.0.0`)

---

## Environment Variables

| Variable | Service | Value | Purpose |
|---|---|---|---|
| `FLASK_APP` | backend | `backend/run.py` | Flask entry point |
| `FLASK_DEBUG` | backend | `1` | Enable debug/reload mode |
| `SECRET_KEY` | backend | set in `.env` | Flask session secret |

A `.env` file at project root provides `SECRET_KEY`. It is gitignored.

---

## Usage

```bash
# Start everything
docker-compose up

# Stop (keeps volumes)
docker-compose down

# Stop and wipe all data/model caches
docker-compose down -v

# Rebuild after changing requirements.txt or package.json
docker-compose up --build
```

---

## Constraints & Notes

- CPU-only (no NVIDIA GPU)
- Camera access works because browser connects to `localhost` (not a remote host), satisfying browser WebRTC security requirements
- Not suitable for production deployment
