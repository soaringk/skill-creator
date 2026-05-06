# Skill Creator Project Instructions

This project is actively developing. Backward compatibility is not required yet; prefer the smallest clean design that makes the workflow usable and secure.

## Architecture

- Keep this repository focused on service code, UI code, runtime job state, and OpenCode agent configuration.
- Use TypeScript for frontend work when practical. Use Python for backend work when it materially reduces integration risk, especially for DashScope ASR and local file workflows.
- Browser code must not write files directly, receive filesystem credentials, or call OpenCode directly. Route privileged actions through the backend API.

## Safety

- Treat candidate slugs and uploaded filenames as untrusted input.
- Restrict writes to the configured skill-candidate root, the configured rules skill root during explicit promotion, and repo-local runtime state.
- Do not expose the service beyond localhost without adding a real auth/session model.
- Promotion is a privileged action: require an approved proposal before writing to `rules/skills`.

## OpenCode

- Follow the local `.opencode/agents/*.md` pattern for agent-specific tool permissions.
- Read-only skill use should use the `skill-use` agent or an equivalent request-level tool restriction.
- Drafting and proposal generation are backend-controlled jobs; the UI may request them but must not provide arbitrary shell commands or unrestricted agent instructions.

## Documentation Workflow

This repository uses a two-layer documentation system managed by the `doc-flow` skill.

1. Read `docs/index.yaml` at session start to discover durable docs.
2. Load the `doc-flow` skill for the documentation workflow.
3. Keep durable docs under `docs/` and task chronology under `docs/worklog/`.

**Layers** — Durable docs: `docs/architecture/`, `docs/constraints/`, `docs/decisions/`, `docs/lessons/`, `docs/risks/`. Ephemeral worklogs: `docs/worklog/active/`. Do not create a third layer.
