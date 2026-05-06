# System Overview

## Purpose

- Repository: `skill-creator`
- Summary: Local web service for continuously collecting text/audio materials, drafting candidate skills, and promoting approved skills into a configured rules repository.

## Major Areas

- Backend API: `backend/skill_creator_service/` is a FastAPI service that owns privileged operations: file writes, DashScope ASR, OpenCode calls, approval, and promotion.
- Frontend: `frontend/` is a Vite TypeScript app. It is currently a functional operator dashboard, not a polished normal-user product experience.
- OpenCode config: `.opencode/agents/` defines constrained agents. `skill-use` is read-only; `skill-builder` is backend-controlled for draft generation.
- Documentation: `docs/` uses doc-flow durable docs plus active worklogs for handoff and future agent continuity.

## Boundaries

- Browser code is only a control surface. It must not receive provider credentials, write files, call OpenCode directly, or decide promotion safety.
- DashScope realtime ASR is backend-owned. Text Material supports direct paste and ASR-to-draft; ASR-to-draft fills the text box first and only becomes candidate material after explicit save.

## Evolution Notes

- The initial implementation intentionally optimized for a working local full pipeline over UI quality. The current UI exposes pipeline mechanics directly and needs a product/UX pass.
- The user clarified that normal Text Material should include both direct text entry and audio transcription into the text field before saving, separate from raw audio material ingestion.
