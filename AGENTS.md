# Skill Creator Project Instructions

This project is actively developing. Backward compatibility is not required yet; prefer the smallest clean design that makes the workflow usable and secure.

## Architecture

- Keep candidate data in the configured skill-candidate context root, which defaults to repo-local `data/skill_creator` for standalone development.
- Keep this repository focused on service code, UI code, candidate data, runtime jobs, and OpenCode agent configuration.
- Use TypeScript for frontend work when practical. Use Python for backend work when it materially reduces integration risk, especially for DashScope ASR and local file workflows.
- Browser code must not write files directly, receive filesystem credentials, or call OpenCode directly. Route privileged actions through the backend API.

## Safety

- Treat candidate slugs and uploaded filenames as untrusted input.
- Restrict writes to the configured skill-candidate root, the configured rules skill root during explicit promotion, and repo-local runtime state.
- Do not expose the service beyond localhost without adding a real auth/session model.
- Promotion is a privileged action: require the admin token before writing to `rules/skills`.
- Draft review metadata is not runtime skill content. Promote only the publishable skill body.

## OpenCode

- Follow the local `.opencode/agents/*.md` pattern for agent-specific tool permissions.
- Read-only skill use should use the `skill-use` agent or an equivalent request-level tool restriction.
- Draft generation is a backend-controlled job through `skill-builder`; the UI may request it but must not provide arbitrary shell commands or unrestricted agent instructions.
- Published/runtime use goes through read-only `skill-use`.

## Candidate File Model

- Preserve the current candidate model: `index.md`, `draft.md`, `published.md`, and a flat `materials/` directory.
- `draft.md` may contain both a clean `Publishable Skill` section and user-visible `Draft Review` sections.
- `published.md` is the local promoted snapshot and should match the content written to the configured rules skill target.

## UI Copy

- Prefer concise, straightforward Chinese for user-facing UI text.
- Use English only for technical identifiers, API paths, model/provider names, or raw error messages.

## Documentation Workflow

This repository uses a two-layer documentation system managed by the `doc-flow` skill.

1. Read `docs/index.yaml` at session start to discover durable docs.
2. Load the `doc-flow` skill for the documentation workflow when it is available; if it is unavailable, follow `docs/index.yaml` manually.
3. Keep durable docs under `docs/` and task chronology under `docs/worklog/`.

**Layers** — Durable docs: `docs/architecture/`, `docs/constraints/`, `docs/decisions/`, `docs/lessons/`, `docs/risks/`. Ephemeral worklogs: `docs/worklog/active/`. Do not create a third layer.
