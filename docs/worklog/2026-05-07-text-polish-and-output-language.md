# Text Polish and Output Language

- Status: active
- Opened: 2026-05-07
- Repo: `skill-creator`

## Request

- User request: Add a `润色` button next to text recording, rename `保存文本` to `记录`, use DashScope LLM on the backend for polishing, and allow specifying the draft/final skill language. Update OpenCode agents so final output defaults to Chinese.
- Desired outcome: Text can be polished before it is recorded as material, and generated drafts/publishable skill content follow the configured output language.
- Constraints: Browser must not receive provider credentials or write files directly; polish output is only a text draft until the user records it.

## Initial Context

- Relevant files: `frontend/src/components/AddMaterial.tsx`, `frontend/src/App.tsx`, `backend/skill_creator_service/main.py`, `backend/skill_creator_service/store.py`, `.opencode/agents/skill-builder.md`.
- Existing behavior: Saving text immediately created material and triggered a draft job. Draft language was inferred from materials/user language.
- Risks or unknowns: DashScope LLM endpoint shape needed to stay backend-owned and configurable by environment.

## Plan

1. Add a backend text-polish endpoint using DashScope OpenAI-compatible chat completions.
2. Wire a frontend `润色` action that updates the text box without saving material.
3. Store candidate `output_language` and have draft generation honor it.
4. Update tests and durable docs.

## Event Log

- Implementation: Added `DashScopeLLMClient`, `/api/text/polish`, frontend polish state, a `记录` save button, and candidate output language selection.
- Agent config: Updated `skill-builder` to use `output_language`; updated `skill-use` to respond in Chinese by default.
- Documentation: Promoted the provider-boundary and language-setting behavior into architecture, constraints, and decision docs.
- Developer UX: Split frontend dev and production-style startup so `scripts/start-frontend-dev.sh` runs Vite dev/HMR, `scripts/start-frontend.sh` serves built assets for deployment, and `scripts/dev.sh` / `scripts/stop-dev.sh` manage the local development stack.

## Outcome / Handoff

- Result: Added backend-owned text polishing, frontend polish/record controls, candidate output-language configuration, agent language instructions, and easier local dev startup with Vite HMR.
- Validation: `uv run pytest` passed; `npm run build` passed.
- Follow-up: None identified yet.

## Promotion Candidates

### Architecture

- Text polishing is a backend-owned DashScope LLM call and remains a pre-save text-draft operation.

### Constraints

- Provider-generated polish output must not become candidate material until the user explicitly records it.

### Decisions

- Candidate-level `output_language` controls generated draft and publishable skill language.
