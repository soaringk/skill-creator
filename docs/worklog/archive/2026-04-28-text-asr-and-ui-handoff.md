# Text ASR And UI Handoff

- Status: completed
- Opened: 2026-04-28
- Repo: `skill-creator`

## Request

- User request: Clarify that Text Material should support direct text input or realtime-ASR transcription into the text box before saving; document project context for another agent to improve UI/UX.
- Desired outcome: Add a text-draft transcription interaction and durable docs that explain system behavior, architecture, constraints, risks, and UX direction.
- Constraints: Keep privileged actions backend-owned; keep the configured context root as canonical candidate state; do not expose DashScope credentials to browser code.

## Initial Context

- Relevant files: `backend/skill_creator_service/main.py`, `backend/skill_creator_service/asr.py`, `frontend/src/main.ts`, `frontend/src/styles.css`, `AGENTS.md`, `README.md`, `docs/`.
- Existing behavior: Text material is direct paste only; audio upload creates raw audio material and starts ASR as saved material.
- Risks or unknowns: Realtime ASR may be too slow for synchronous UI use on long files; current frontend is functional but not normal-user friendly.

## Plan

1. Add backend endpoint that accepts an uploaded audio file, runs DashScope realtime ASR, and returns transcript text without saving a material.
2. Add frontend controls inside Text Material to upload audio, transcribe it into the text area, then let the user save explicitly.
3. Replace starter doc-flow docs with concrete project context for UI/UX handoff.
4. Re-run backend tests, import check, and frontend build.

## Event Log

- Started: Bootstrapped doc-flow structure because this repo had no `docs/`.
- Implemented: Added `POST /api/asr/text-draft` for temporary ASR transcription that returns text without saving candidate state.
- Implemented: Added frontend Text Material controls to choose an audio file, transcribe it into the textarea, edit it, then save normally.
- Documented: Filled durable architecture, constraints, decisions, lessons, and risks for UI/UX handoff.
- Investigated: Public deployment at `/tools/skill-creator/` returned `Unexpected token '<'` because the latest frontend change made API requests use root `/api/...`, while nginx only proxies `/tools/skill-creator/api/...`; root `/api/...` returns the main blog HTML.
- Implemented: Restored subpath-aware API URLs and Vite dev/preview proxy rewriting for the configured `VITE_BASE_PATH`.
- Implemented: Updated public deploy to restart managed frontend/backend processes so rebuilt assets and Vite config changes take effect instead of exiting early on existing PID files.
- Validated: `npm run build`; fresh Vite preview on port 5174 proxied `/tools/skill-creator/api/skills` to the backend; live root `/api/skills` returned HTML while live subpath API returned JSON.

## Outcome / Handoff

- Result: Text ASR draft flow is implemented and documented; public subpath deployment now uses base-path-aware API URLs and deploy restarts managed processes so rebuilt frontend assets take effect.
- Validation: Backend/frontend checks were run for the text ASR work; public deployment fix was validated with `npm run build`, shell syntax checks, Vite preview subpath API proxy check, and live URL checks showing root `/api/...` returns HTML while `/tools/skill-creator/api/...` returns JSON.
- Follow-up: UI/UX redesign should treat the existing frontend as a functional prototype, not a design baseline.

## Promotion Candidates

### Architecture

- Candidate data is canonical in the configured context root (defaulting to local `data/`); this repo owns service/UI/runtime job state and local OpenCode agent config.
- Text Material has two entry modes: direct paste and ASR-to-draft. ASR-to-draft must not save candidate state until the user explicitly submits the text material.

### Constraints

- DashScope credentials and OpenCode calls stay in the backend; browser code must not call those providers directly.
- The frontend is a control surface for backend state transitions, not the authority for promotion or filesystem writes.

### Decisions

- Use synchronous transcription for the first ASR-to-text-draft UI because it is the smallest clear change; revisit background streaming if user experience suffers on long recordings.

### Lessons

- A technically complete dashboard can still be poor UX if it exposes pipeline mechanics as primary actions instead of guiding normal user intent.
- When `VITE_BASE_PATH` is `/tools/skill-creator/`, frontend API requests must target `/tools/skill-creator/api/...`; root `/api/...` belongs to the main site and can return HTML.

### Risks

- Long audio transcribe-to-text requests can time out or feel frozen without progress UI.
