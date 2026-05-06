# Document Latest Design

- Status: completed
- Opened: 2026-05-06
- Repo: `skill-creator`

## Request

- User request: Move decision-making and current design rationale into `docs/`, then simplify `README.md` to purpose, entrypoints, install, and use.
- Desired outcome: Future contributors can understand the draft contract, privilege model, ASR transport, UI refresh behavior, glassmorphism direction, and public deployment tradeoffs without reading old chat context.

## Context

- Relevant durable docs: `docs/architecture/system-overview.md`, `docs/constraints/engineering-constraints.md`, `docs/decisions/decision-log.md`, `docs/lessons/lessons-learned.md`, `docs/risks/tech-debt-and-risks.md`.
- Existing README had accumulated architecture, deployment rationale, nginx snippets, and env details. The user wanted it to become an operational entrypoint instead.

## Outcome

- Architecture docs now describe the candidate data model, draft/publish model, frontend interaction model, and backend/frontend boundaries.
- Constraints now cover publish-only admin privilege, minimal material metadata, draft heading boundaries, audio validation, realtime ASR, OpenCode failure surfacing, and glassmorphism UI expectations.
- Decision log now records the draft contract, privilege model, ASR transport, background refresh/UI state, frontend visual direction, and unauthenticated public toy-app access model.
- Lessons and risks now capture reusable pitfalls around frontend/backend access boundaries, shell-capable endpoint exposure, markdown contracts, polling refresh state, stale errors, select affordances, and remaining debt.
- README is reduced to purpose, entrypoints, install, local use, public deployment, process controls, and essential configuration.

## Validation

- Documentation/content review only. No runtime code was changed for this documentation task.
