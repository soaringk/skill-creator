# Decision Log

## Decisions

- Canonical skill-candidate state remains in context-infrastructure. This avoids migration/sync work and lets the web service act as a local control plane rather than a second source of truth.
- FastAPI is the backend despite a TypeScript frontend preference because DashScope realtime ASR and existing local automation are Python-friendly. OpenCode is accessed over HTTP, so the TypeScript SDK is not required for V1.
- Text Material has two entry paths: direct paste and ASR-to-draft. The ASR-to-draft endpoint returns transcript text to the UI but does not create candidate material until the user explicitly saves the text.
- Raw audio material upload remains separate from Text Material. It saves the uploaded audio and starts background ASR as part of the candidate material pipeline.
- OpenCode use is constrained by local agents: `skill-use` is read-only for conversational use, while `skill-builder` is backend-controlled for draft/proposal jobs.
