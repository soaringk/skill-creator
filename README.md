# Skill Creator

Local web service for collecting text/audio material, drafting candidate skills, and publishing them to a configured rules repository.

## Architecture

Skill Creator has three parts:

- FastAPI backend in `backend/skill_creator_service/`: filesystem writes, DashScope ASR, OpenCode calls, and publishing.
- Vite/TypeScript frontend in `frontend/`: collect material, review drafts, test skills, and publish.
- Candidate data in `data/skill_creator/` by default. Each candidate has `index.md`, `draft.md`, `published.md`, and a flat `materials/` directory.

Drafts have two layers:

- `Publishable Skill`: clean runtime skill content.
- `Draft Review`: user-visible QA metadata such as material coverage and refinement notes.

The draft file uses `# Publishable Skill` and `# Draft Review` as stable parsing boundaries. Candidate identity stays in `index.md`; drafts should not repeat the title as another heading.

Publishing writes only `Publishable Skill` content to `SKILL_CREATOR_RULES_ROOT`, updates `rules/skills/INDEX.md` when present, and saves the same snapshot in `published.md`.

Draft generation runs as a background job. The UI polls `/api/jobs` and shows draft failures, including OpenCode connection failures.

## Privilege Model

Only publishing requires the admin token.

- No token required: create candidate, list/read candidates, add text material, transcribe text drafts, generate drafts, test/use a skill.
- Token required: `POST /api/skills/{slug}/promote`.

The frontend has a password field in the publish section. It sends the value only as `X-Admin-Token` for the publish request. Publishing is disabled when `SKILL_CREATOR_ADMIN_TOKEN` is unset.

## Development

Install dependencies:

```bash
cd /home/cody/skill-creator
UV_CACHE_DIR=/tmp/uv-cache uv sync --extra dev
cd frontend
npm_config_cache=/tmp/npm-cache npm install
```

Start the backend from the repo root:

```bash
cd /home/cody/skill-creator
PYTHONPATH=backend UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn skill_creator_service.main:app --host 127.0.0.1 --port 8010
```

Start the frontend in a second terminal:

```bash
cd /home/cody/skill-creator/frontend
npm_config_cache=/tmp/npm-cache npm run dev
```

Open:

```text
http://127.0.0.1:5173/tools/skill-creator/
```

For normal development after dependencies are installed, the shorter commands are:

```bash
cd /home/cody/skill-creator
PYTHONPATH=backend uv run uvicorn skill_creator_service.main:app --host 127.0.0.1 --port 8010
```

```bash
cd frontend
npm run dev
```

Useful environment variables:

- `SKILL_CREATOR_ADMIN_TOKEN`: publish-only admin token. Required only by `POST /api/skills/{slug}/promote`; leave unset only if publishing should be disabled.
- `SKILL_CREATOR_CONTEXT_ROOT`: candidate data root. Defaults to `data/skill_creator` in this repo.
- `SKILL_CREATOR_RULES_ROOT`: target rules skill directory for publishing. Defaults to `rules/skills` in this repo.
- `SKILL_CREATOR_JOB_STORE`: JSONL runtime job log path. Defaults to `data/jobs.jsonl` in this repo.
- `DASHSCOPE_API_KEY`: DashScope API key for ASR endpoints.
- `DASHSCOPE_ASR_MODEL`: realtime ASR model. Defaults to `fun-asr-realtime`.
- `DASHSCOPE_WEBSOCKET_URL`: realtime DashScope websocket endpoint. Defaults to `wss://dashscope.aliyuncs.com/api-ws/v1/inference`.
- `OPENCODE_BASE_URL`: OpenCode server URL. Defaults to `http://127.0.0.1:4096`.
- `OPENCODE_SERVER_USERNAME`: OpenCode Basic Auth username. Defaults to `opencode`.
- `OPENCODE_SERVER_PASSWORD`: OpenCode Basic Auth password. Leave empty when the OpenCode server does not require Basic Auth.
- `OPENCODE_DIRECTORY`: working directory passed to OpenCode. Defaults to this repo root.
- `OPENCODE_MODEL`: model ID sent to OpenCode. Defaults to `glm-5`.
- `OPENCODE_PROVIDER`: provider ID sent to OpenCode. Defaults to `alibaba-coding-plan-cn`.
- `VITE_BASE_PATH`: frontend public path and API proxy prefix. Use `/tools/skill-creator/` for the `kefan.life/tools/skill-creator` deployment.

The backend and Vite config both load these from `.env` in the repo root. Process environment values take precedence over `.env`.

## Public Deployment

The public page is served by nginx at:

```text
https://kefan.life/tools/skill-creator/
```

This repo handles the local frontend/backend processes and nginx proxy routes. Run:

```bash
cd /home/cody/skill-creator
./scripts/deploy-public.sh
```

The deploy script:

- generates a fresh shared nginx Basic Auth password and writes `/etc/nginx/.htpasswd-skill-creator`
- adds a Basic Auth protected nginx API proxy for `/tools/skill-creator/api/*`
- adds a Basic Auth protected nginx frontend proxy for `/tools/skill-creator/*`
- starts the backend manually on `127.0.0.1:8010`
- builds and starts the frontend static server manually on `127.0.0.1:5173`

The Basic Auth username is `skill-creator`. The password is printed by the deploy
script and changes on every deployment, so share the latest printed password with
the people using the toy app.

Backend process controls:

```bash
./scripts/start-backend.sh
./scripts/stop-backend.sh
./scripts/start-frontend.sh
./scripts/stop-frontend.sh
```

Nginx shape:

```nginx
location ^~ /tools/skill-creator/api/ {
    auth_basic "Skill Creator";
    auth_basic_user_file /etc/nginx/.htpasswd-skill-creator;

    proxy_pass http://127.0.0.1:8010/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location ^~ /tools/skill-creator/ {
    auth_basic "Skill Creator";
    auth_basic_user_file /etc/nginx/.htpasswd-skill-creator;

    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

For local testing with the same subpath, run the normal frontend dev command and open:

```text
http://127.0.0.1:5173/tools/skill-creator/
```
