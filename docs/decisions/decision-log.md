# Decision Log

## Decisions

- Canonical skill-candidate state remains in the configured context root (defaulting to local `data/`). This avoids external dependencies for the core workflow and allows the service to operate as a standalone tool.
- FastAPI is the backend despite a TypeScript frontend preference because DashScope realtime ASR and existing local automation are Python-friendly. OpenCode is accessed over HTTP, so the TypeScript SDK is not required for V1.
- Text Material has two entry paths: direct paste and ASR-to-draft. The ASR-to-draft endpoint returns transcript text to the UI but does not create candidate material until the user explicitly saves the text.
- Audio upload and recording are transcript-entry paths, not persisted raw material types. Both produce editable text in the material text box; only saved text becomes candidate material.
- OpenCode use is constrained by local agents: `skill-use` is read-only for conversational use, while `skill-builder` is backend-controlled for draft generation.
- Drafts contain a `Publishable Skill` section plus `Draft Review` metadata. Promotion and normal skill use operate on publishable content so review notes can remain visible without leaking into runtime behavior.

## Draft Contract

- Context: Drafts need to be readable by users, useful for future refinement, and safely parsable for promotion.
- Rejected option: Nesting `## Publishable Skill` under `# Draft Skill: <title>` and then repeating the runtime title as another `#` heading. This duplicates candidate identity, increases markdown parsing ambiguity, and creates maintenance churn.
- Decision: `index.md` owns candidate identity. `draft.md` starts with `# Publishable Skill`, followed by runtime `##` sections, then `# Draft Review`.
- Decision: `# Publishable Skill` and `# Draft Review` are the stable wrapper boundaries. `## Material Coverage` and `## Refinement Notes` are visible review metadata.
- Consequence: Published skill files start directly with runtime sections such as `## When to Use`. They do not carry candidate-title wrappers from the draft.
- Transition detail: Parsers can tolerate legacy H2 wrappers to avoid breaking existing drafts, but prompts and templates should produce the H1 contract.

## Privilege Model

- Context: The backend can write local files, run ASR, call OpenCode, and publish to a rules skill directory. The user wants normal creation and testing to be low-friction.
- Decision: Only promotion requires `SKILL_CREATOR_ADMIN_TOKEN`.
- Decision: The publish UI has a password field and sends the token only as `X-Admin-Token` on the promote request.
- Consequence: Creating candidates, saving text material, transcribing audio, drafting, checking jobs, and read-only skill use remain usable without admin privilege.
- Consequence: If `SKILL_CREATOR_ADMIN_TOKEN` is unset, publishing is disabled rather than silently allowed.

## ASR Transport

- Context: DashScope file-based ASR did not accept local `file://` paths in this workflow, and OSS upload would add storage credentials and lifecycle complexity.
- Decision: Use DashScope realtime ASR for both microphone recording and uploaded audio files.
- Recording path: Browser microphone audio is converted to 16 kHz PCM and sent over `WS /api/asr/realtime`; ASR text updates while the user speaks.
- Upload path: The browser uploads an audio file to `POST /api/asr/text-draft/stream`; the backend validates the file, decodes it, streams PCM to DashScope realtime ASR, and streams transcript events back to the UI.
- Consequence: Both recording and upload can update the text draft incrementally before the user saves the material.
- Safety detail: The backend must reject malformed, non-audio, or mixed-stream files before processing and remove temporary files on rejection.

## Background Refresh and UI State

- Context: Draft jobs run in the background and the UI polls job state. Full re-rendering originally reset scroll position and collapsed expanded material/status sections.
- Decision: Keep polling for now, but preserve local UI state across renders.
- Implementation shape: Scroll position and `<details>` open states are frontend-owned interaction state. Details use stable keys such as `material:<slug>:<id>` and `status:<slug>:review`.
- Consequence: Server data can refresh without disrupting what the user is reading.
- Future note: A more incremental state store or SSE channel may eventually replace polling, but the current approach resolves the main UX bug with low complexity.

## Frontend Visual Direction

- Context: The project should feel like a focused creation tool, not a raw admin panel.
- Decision: Use one consistent glassmorphism language: translucent panels, backdrop blur, visible white borders, restrained shadows, and stable spacing.
- Decision: Mobile list view uses a single page heading, `Skill 创作列表`, with no separate `Skill Creator` header. Mobile detail view keeps only the useful glass back control.
- Decision: Controls should show clear affordances. Selects keep a visible arrow; the material weight selector uses a styled glass row rather than inline transparent styling.
- Consequence: New UI work should avoid flat opaque bars, duplicated headings, and controls whose behavior is not visually obvious.

## Public Deployment Access Model

- Context: The app is deployed at `https://kefan.life/tools/skill-creator/` for the owner and friends. The server has no account system, and the user does not want third-party access infrastructure or app-level user management.
- Rejected option: Splitting frontend and backend or introducing Cloudflare Access/Tailscale. Those approaches can work, but they add operational machinery the user is not otherwise using.
- Rejected option: nginx Basic Auth. It blocks anonymous direct API calls, but the username/password prompt is visible friction for a toy app and conflicts with the desired friend-sharing UX.
- Rejected option: Silent browser-side guards such as frontend-embedded tokens, Referer checks, CORS, or hidden shared secrets. They do not meaningfully protect the API because clients can copy them and call backend routes directly.
- Rejected option: Relying on users to access only the frontend. The frontend is not a boundary; direct API calls with curl/devtools remain possible.
- Decision: Keep the public Skill Creator frontend and its app-specific API unauthenticated for low-friction toy usage, while keeping frontend/backend processes bound to `127.0.0.1` and exposing only the intended `/tools/skill-creator/` nginx routes.
- Decision: Treat real server safety as a runtime isolation and capability-boundary problem: OpenCode itself, shell-capable routes, arbitrary prompt endpoints such as `/prompt` and `/prompt_async`, provider credentials, and filesystem credentials must not be reachable from public nginx.
- Consequence: Anonymous clients can call Skill Creator API routes directly. This is accepted for the current toy-app threat model, which prioritizes avoiding shell/server compromise over preventing app-state mutation or resource use.
- Consequence: If the app is used by untrusted users or receives meaningful abuse, this decision should be revisited before adding more backend capabilities.
- Nginx API detail: The API proxy must include `proxy_http_version 1.1`, `Upgrade`, and `Connection` forwarding so `WS /api/asr/realtime` works through the public path.
