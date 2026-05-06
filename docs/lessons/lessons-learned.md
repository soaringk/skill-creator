# Lessons Learned

## Lessons

- A complete local pipeline is not the same as a usable product. For this project, the UI should guide the user's skill-creation journey and hide backend mechanics unless the user needs operational detail.
- Separate "transcribe into a text draft" from "save audio as material." Users may want to edit ASR output before committing it to the candidate skill corpus.
- Public deployment is mounted under `/tools/skill-creator/`; frontend API requests must include that base path so nginx routes them to the backend. Root `/api/...` belongs to the main site and can return HTML, which surfaces in the app as JSON parse errors beginning with `Unexpected token '<'`.
