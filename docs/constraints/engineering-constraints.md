# Engineering Constraints

## Stable Constraints

- Keep privileged actions in the backend: filesystem writes, DashScope API calls, OpenCode HTTP calls, approval, and promotion.
- Treat candidate slugs and filenames as untrusted input; reject path traversal and keep writes inside configured roots.
- Require an admin token for mutating API routes. Do not silently allow write operations when the token is unset.
- Maintain the configured candidate folder model, allowing for a standalone deployment defaulting to local `data/`.

## Compatibility

- This is a developing project with no backward-compatibility guarantee yet.
- Do preserve compatibility with the refined candidate file model: `index.md`, `draft.md`, `published.md`, and a flat `materials/` directory.
- OpenCode agent customization follows the local `opencode.json` plus `.opencode/agents/*.md` pattern with per-agent tool permissions.

## Working Rules

- Prefer TypeScript for frontend implementation and Python for backend integrations where it reduces ASR/runtime risk.
- For normal user UX, hide pipeline internals behind clear flows: collect material, review draft, publish, use skill.
- Add tests around file-state transitions and promotion safety before broadening automation.
