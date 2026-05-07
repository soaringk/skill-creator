# Tech Debt and Risks

## Open Risks

- The frontend has moved to React, but state is still local to the app shell. If workflows grow, split data fetching, ASR streaming, and agent streaming into focused hooks before the app component becomes too large.
- Uploaded audio ASR now streams through the realtime endpoint. Long files may still need better progress, cancellation, and chunk-level recovery.
- Draft jobs depend on an OpenCode server and model configuration. The UI surfaces job failure messages, but not detailed OpenCode logs or recovery guidance.
- Promotion writes into the configured rules repository after an admin-token check. Rollback/versioning UX is not implemented.
- The frontend currently has minimal accessibility validation with real long-form materials and mobile assistive technologies.
- Draft parsing accepts legacy and current wrappers during transition. This is intentionally small, but remove legacy tolerance later if it becomes confusing.
- Public deployment is intentionally unauthenticated for a toy-app audience. Anyone who can reach the URL can call the app API directly, not only through the frontend. That is acceptable for the current threat model but should be revisited before broader use or untrusted users.
- The critical server risk is accidental exposure of shell-capable or arbitrary-agent surfaces. Keep OpenCode and prompt endpoints private, keep backend/OpenCode bound to local interfaces, and keep agent tool permissions constrained.
