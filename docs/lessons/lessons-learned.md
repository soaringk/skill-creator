# Lessons Learned

## Public Frontend Does Not Protect Backend

- If a public frontend calls a backend path, assume users can call that backend path directly. Frontend behavior, CORS, Referer, and embedded browser tokens are not meaningful access boundaries.
- For this toy deployment, the user chose no request-level auth because Basic Auth prompts are too much friction. Document that tradeoff plainly instead of hiding it behind weak silent guards.
- Protect the server by keeping OpenCode, arbitrary prompt endpoints, shell-capable agents, provider credentials, and filesystem credentials off public nginx routes.
- Websocket API paths need the same proxy upgrade headers as frontend dev-server websocket paths; otherwise realtime ASR fails even when normal HTTP API calls work.

## Lessons

- A complete local pipeline is not the same as a usable product. For this project, the UI should guide the user's skill-creation journey and hide backend mechanics unless the user needs operational detail.
- Separate "transcribe into a text draft" from "save audio as material." Users may want to edit ASR output before committing it to the candidate skill corpus.
- Draft QA can be useful to users but harmful as runtime instructions. Keep material coverage and refinement notes visible in draft review metadata, and extract only publishable skill content for promotion/use.
- Public deployment is mounted under `/tools/skill-creator/`; frontend API requests must include that base path so nginx routes them to the backend. Root `/api/...` belongs to the main site and can return HTML, which surfaces in the app as JSON parse errors beginning with `Unexpected token '<'`.
- Markdown contracts are easier to parse when identity and content boundaries have one owner. Keep candidate identity in `index.md`; keep draft content boundaries in `draft.md`.
- Background refresh should update server data, not erase local interaction state. Preserve scroll position, expanded sections, in-progress text, and visible agent output across polling renders.
- If an error is tied to a stale job or unavailable integration, clear it after a later successful operation. Persisted stale errors are worse than no error because they contradict current state.
- For frontend controls, visual affordance matters. A select without an arrow looks like static text; use the normal select cue unless there is a strong reason not to.
