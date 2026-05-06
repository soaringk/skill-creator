# Tech Debt and Risks

## Open Risks

- The current frontend is an operator dashboard and is poor for normal users. A UI/UX pass should redesign the primary flow around user intent instead of exposing raw pipeline actions as the main interface.
- Synchronous ASR-to-text-draft can feel frozen or time out on long audio. If this becomes common, convert it to a background job with progress and an explicit "insert transcript into text draft" action.
- Draft/propose jobs depend on an OpenCode server and model configuration being available. The UI currently surfaces only a job status, not detailed OpenCode logs or recovery guidance.
- Promotion writes into the configured rules repository. The approved-only gate exists, but rollback/versioning UX is not implemented.
- The frontend currently has minimal accessibility and no usability validation on mobile or with real long-form materials.
