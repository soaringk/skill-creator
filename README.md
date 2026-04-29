# Skill Creator

Local web service for continuously collecting text/audio material, distilling candidate skills, proposing changes, and promoting approved skills into `~/context-infrastructure`.

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
- `SKILL_CREATOR_CONTEXT_ROOT`: defaults to `~/context-infrastructure/contexts/skill_creator`.
- `SKILL_CREATOR_RULES_ROOT`: defaults to `~/context-infrastructure/rules/skills`.
- `DASHSCOPE_API_KEY`: DashScope realtime ASR key.
- `OPENCODE_SERVER_PASSWORD`: OpenCode Basic Auth password, if configured.
- `VITE_BASE_PATH`: frontend public path. Use `/tools/skill-creator/` for the `kefan.life/tools/skill-creator` deployment.

The backend and Vite config both load these from `.env` in the repo root. Process environment values take precedence over `.env`.

## Deploy Under A Domain Subpath

To serve the app at:

```text
https://kefan.life/tools/skill-creator/
```

set `VITE_BASE_PATH=/tools/skill-creator/` in repo-root `.env`, then build the frontend normally:

```bash
cd /home/cody/skill-creator/frontend
npm_config_cache=/tmp/npm-cache npm run build
```

The generated files in `frontend/dist/` will reference assets and API calls below `/tools/skill-creator/`.

Run the backend privately on localhost:

```bash
cd /home/cody/skill-creator
PYTHONPATH=backend UV_CACHE_DIR=/tmp/uv-cache \
  uv run uvicorn skill_creator_service.main:app --host 127.0.0.1 --port 8010
```

Reverse proxy requirements:

- Serve `frontend/dist/` at `/tools/skill-creator/`.
- Forward `/tools/skill-creator/api/*` to `http://127.0.0.1:8010/api/*`.
- Keep the backend bound to `127.0.0.1`; do not expose port `8010` directly.

Example Nginx shape:

```nginx
location /tools/skill-creator/api/ {
    proxy_pass http://127.0.0.1:8010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /tools/skill-creator/ {
    alias /home/cody/skill-creator/frontend/dist/;
    try_files $uri $uri/ /tools/skill-creator/index.html;
}
```

For local testing with the same subpath, run the normal frontend dev command and open:

```text
http://127.0.0.1:5173/tools/skill-creator/
```
