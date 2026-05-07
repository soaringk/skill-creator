# Skill Creator

Local-first web app for collecting text/audio material, drafting candidate Codex skills, trying them locally, and publishing the publishable skill body to a configured rules repository.

## Entry Points

- Backend API: `backend/skill_creator_service/main.py`
- Frontend app: `frontend/src/main.tsx`
- Public deployment script: `scripts/deploy-public.sh`
- Durable design notes: `docs/`

## Install

```bash
cd /home/cody/skill-creator
UV_CACHE_DIR=/tmp/uv-cache uv sync --extra dev
cd frontend
npm_config_cache=/tmp/npm-cache npm install
```

Create local configuration from the example when needed:

```bash
cd /home/cody/skill-creator
cp .env.example .env
```

## Local Use

Start the local development stack from the repo root:

```bash
./scripts/dev.sh
```

This starts the backend on `127.0.0.1:8010` and the Vite dev server on `127.0.0.1:5173`. Frontend source changes use Vite HMR automatically.

Stop both development processes with:

```bash
./scripts/stop-dev.sh
```

Open:

```text
http://127.0.0.1:5173/
```

You can still start either side separately with `./scripts/start-backend.sh` and `./scripts/start-frontend-dev.sh`; the frontend dev script starts Vite HMR mode.

## Public Deployment

```bash
cd /home/cody/skill-creator
./scripts/deploy-public.sh
```

The script builds the frontend, starts the local backend and production-style frontend preview processes, and writes nginx routes for:

- `https://kefan.life/tools/skill-creator/`
- `https://kefan.life/tools/skill-creator/api/*`

The public route is intentionally low-friction and does not require account login.

Useful process controls:

```bash
./scripts/dev.sh
./scripts/stop-dev.sh
./scripts/start-backend.sh
./scripts/stop-backend.sh
./scripts/start-frontend-dev.sh
./scripts/start-frontend.sh
./scripts/stop-frontend.sh
```

## Configuration

The backend and Vite config load `.env` from the repo root. Process environment values take precedence. See `.env.example` for the full set of supported variables.

- `SKILL_CREATOR_ADMIN_TOKEN`: publish-only admin token for `POST /api/skills/{slug}/promote`.
- `SKILL_CREATOR_CONTEXT_ROOT`: candidate data root. Defaults to `data/skill_creator`.
- `SKILL_CREATOR_RULES_ROOT`: target rules skill directory for publishing. Defaults to `rules/skills`.
- `SKILL_CREATOR_JOB_STORE`: JSONL runtime job log path. Defaults to `data/jobs.jsonl`.
- `DASHSCOPE_API_KEY`: DashScope API key for ASR and text-polish endpoints.
- `DASHSCOPE_LLM_MODEL`: DashScope LLM model for text polishing. Defaults to `qwen-plus`.
- `DASHSCOPE_LLM_BASE_URL`: DashScope OpenAI-compatible base URL. Defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`.
- `OPENCODE_BASE_URL`: OpenCode server URL. Defaults to `http://127.0.0.1:4096`.
- `OPENCODE_SERVER_USERNAME`: OpenCode Basic Auth username. Defaults to `opencode`.
- `OPENCODE_SERVER_PASSWORD`: OpenCode Basic Auth password, when required.
- `OPENCODE_DIRECTORY`: working directory passed to OpenCode. Defaults to this repo root.
- `OPENCODE_MODEL`: model ID sent to OpenCode. Defaults to `glm-5`.
- `OPENCODE_PROVIDER`: provider ID sent to OpenCode. Defaults to `alibaba-coding-plan-cn`.
- `VITE_BASE_PATH`: frontend public path and API proxy prefix. Use `/tools/skill-creator/` for the public deployment.
