# Skill Creator

Local web service for continuously collecting text/audio material, distilling candidate skills, proposing changes, and promoting approved skills into this repo. Copy promoted skills to `context-infrastructure` manually when needed.

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

Enter the token from `.env` in the Admin token field.

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

- `SKILL_CREATOR_ADMIN_TOKEN`: required token for mutating API calls. The service rejects mutating requests when this is unset.
- `SKILL_CREATOR_CONTEXT_ROOT`: defaults to `data/skill_creator` in this repo.
- `SKILL_CREATOR_RULES_ROOT`: defaults to `rules/skills` in this repo.
- `SKILL_CREATOR_JOB_STORE`: defaults to `data/jobs.jsonl` in this repo.
- `DASHSCOPE_API_KEY`: DashScope realtime ASR key.
- `OPENCODE_SERVER_PASSWORD`: OpenCode Basic Auth password, if configured.
- `VITE_BASE_PATH`: frontend public path. Use `/tools/skill-creator/` for the `kefan.life/tools/skill-creator` deployment.

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

- adds the nginx API proxy for `/tools/skill-creator/api/*`
- adds the nginx frontend proxy for `/tools/skill-creator/*`
- starts the backend manually on `127.0.0.1:8010`
- builds and starts the frontend static server manually on `127.0.0.1:5173`

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
    proxy_pass http://127.0.0.1:8010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location ^~ /tools/skill-creator/ {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

For local testing with the same subpath, run the normal frontend dev command and open:

```text
http://127.0.0.1:5173/tools/skill-creator/
```
