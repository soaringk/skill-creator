# Engineering Constraints

## Stable Constraints

- Keep privileged actions in the backend: filesystem writes, DashScope API calls, OpenCode HTTP calls, approval, and promotion.
- Treat candidate slugs and filenames as untrusted input; reject path traversal and keep writes inside configured roots.
- Keep backend and frontend processes bound to `127.0.0.1` in public deployment; expose them through nginx only.
- The public `/tools/skill-creator/` surface is intentionally unauthenticated for toy-app usability. Do not pretend the frontend protects the API.
- Never expose OpenCode `/session/*`, `/prompt`, `/prompt_async`, shell-capable agent endpoints, provider credentials, or filesystem credentials through public nginx routes.
- Promotion still requires `SKILL_CREATOR_ADMIN_TOKEN`; do not silently allow promotion when the token is unset.
- Do not require the admin token for non-promotion operations. Candidate creation, material collection, text polishing, ASR, drafting, testing, and read-only skill use must remain unprivileged.
- Maintain the configured candidate folder model, allowing for a standalone deployment defaulting to local `data/`.
- Treat `draft.md` review sections as review metadata. Runtime use and promotion should operate on the `# Publishable Skill` section when present.
- Keep `# Publishable Skill` and `# Draft Review` as stable draft parsing boundaries. Do not repeat candidate titles in `draft.md`.
- Keep material metadata minimal. Do not reintroduce derived fields such as `material_count` when the frontend can render from the material array.
- Treat text polishing like ASR-to-draft: provider output may update the editable text draft, but it must not create material files until the user explicitly records the text.
- Validate uploaded files before ASR processing. The frontend should select only `audio/*`; the backend must still check content type, extension, file signature, and `ffprobe` stream shape, then delete rejected temporary files.
- Forward websocket upgrade headers in the public API proxy because realtime ASR uses `WS /api/asr/realtime`.
- Surface OpenCode server connection failures in the UI and clear stale failure messages after a successful refresh.

## Compatibility

- This is a developing project with no backward-compatibility guarantee yet.
- Do preserve compatibility with the refined candidate file model: `index.md`, `draft.md`, `published.md`, and a flat `materials/` directory.
- During the draft-heading transition, parsers may accept legacy `## Publishable Skill` and `## Draft Review` wrappers, but new prompts and templates should emit H1 wrappers.
- OpenCode agent customization follows the local `opencode.json` plus `.opencode/agents/*.md` pattern with per-agent tool permissions.

## Working Rules

- Use Vite + React + TypeScript for frontend implementation. Do not reintroduce whole-page string-template rendering for interactive flows.
- For normal user UX, hide pipeline internals behind clear flows: collect material, review draft, publish, use skill.
- Follow the established glassmorphism visual language for frontend work: translucent panels, blur, clear borders, stable spacing, and no flat bars that cover content.
- Keep Chinese UI copy concise and useful. Avoid exposing process words such as "Draft running" when a simple Chinese status is clearer.
- Add tests around file-state transitions and promotion safety before broadening automation.
