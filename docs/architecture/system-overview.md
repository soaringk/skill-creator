# System Overview

## Purpose

- Repository: `skill-creator`
- Summary: Local web service for collecting text/audio materials, drafting candidate skills, and publishing them to a configured rules repository.

## Runtime Shape

- Backend API: `backend/skill_creator_service/` is a FastAPI service that owns filesystem writes, DashScope realtime ASR, OpenCode calls, admin-token checks, background job state, and promotion.
- Frontend: `frontend/` is a Vite TypeScript app for creating candidates, collecting material, reviewing drafts, streaming skill-use output, and publishing.
- Public deployment: nginx serves `/tools/skill-creator/` and proxies `/tools/skill-creator/api/` to local processes. The public app intentionally has no account login; backend and frontend processes still bind to `127.0.0.1`.
- OpenCode config: `.opencode/agents/` defines constrained agents. `skill-use` is read-only; `skill-builder` is backend-controlled for draft generation.
- Documentation: `docs/` uses doc-flow durable docs plus active worklogs for handoff and future agent continuity.

## Candidate Data Model

- Candidate state lives under the configured context root, defaulting to `data/skill_creator/`.
- Each candidate directory contains `index.md`, `draft.md`, `published.md`, and a flat `materials/` directory.
- `index.md` is the candidate identity and status entrypoint. It owns slug, title, status, target category, and publish target metadata.
- Material files use a small frontmatter set: `id`, `type`, `uploaded_at`, and `confidence`. The frontend derives material counts from the material array rather than storing a separate count.
- Audio is not stored as raw candidate material in the current workflow. Recording and upload both run DashScope realtime ASR and place transcript text in the text draft; the user explicitly saves edited text as material.

## Draft and Publish Model

- `draft.md` has two user-visible layers: `# Publishable Skill` and `# Draft Review`.
- Candidate titles are not repeated in `draft.md`; the title already lives in `index.md`.
- Runtime skill content uses normal `##` sections inside `# Publishable Skill`, such as `When to Use`, `Workflow`, `Boundaries`, and `Failure Modes`.
- Draft review content uses `## Material Coverage` and `## Refinement Notes`. These sections help users improve the candidate but must not become runtime skill instructions.
- Promotion and skill-use parse only the publishable section. Promotion writes that body to `SKILL_CREATOR_RULES_ROOT` and stores the same snapshot in `published.md`.

## Frontend Interaction Model

- The UI follows the project glassmorphism direction: translucent surfaces, visible borders, blur, restrained shadows, and clear contrast against the mesh background.
- Mobile list view uses one primary title, `Skill 创作列表`. The `Skill Creator` product label is intentionally omitted there to avoid duplicate headings.
- Mobile detail view keeps a compact glass back control, `← Skill 创作列表`, because it is navigation rather than branding.
- Background job polling refreshes server data, but local UI interaction state such as scroll position and expanded `<details>` sections is preserved in frontend state.
- Agent use streams OpenCode output to the web UI while the agent runs; it is not a fire-and-forget notification.

## Boundaries

- Browser code is only a control surface. It must not receive provider credentials, write files, call OpenCode directly, or decide promotion safety.
- Public clients can reach the frontend and API directly through nginx. Do not rely on the frontend as an access boundary; API routes are directly callable.
- Do not expose the OpenCode server or other shell-capable control endpoints publicly. The app backend may call OpenCode, but OpenCode itself must remain bound to local/private interfaces.
- DashScope realtime ASR is backend-owned. Text Material supports direct paste and ASR-to-draft; ASR-to-draft fills the text box first and only becomes candidate material after explicit save.
- Only publishing requires `SKILL_CREATOR_ADMIN_TOKEN`. Creating candidates, adding material, transcribing audio, drafting, and read-only skill use do not require the admin token.

## Evolution Notes

- The initial implementation optimized for a working local full pipeline. Recent work has moved the UI toward a more normal user workflow with fewer exposed pipeline details.
- The user clarified that normal Text Material should include both direct text entry and audio transcription into the text field before saving.
- The public deployment is intentionally a toy-app model for the project owner and friends. It chooses low-friction access over request-level authentication.
