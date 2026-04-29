from __future__ import annotations

import json
import threading
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .models import JobRecord


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class JobStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def _append(self, record: JobRecord) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(record.model_dump_json() + "\n")

    def list(self) -> list[JobRecord]:
        if not self.path.exists():
            return []
        latest: dict[str, JobRecord] = {}
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = JobRecord.model_validate(json.loads(line))
                except Exception:
                    continue
                latest[record.id] = record
        return sorted(latest.values(), key=lambda item: item.created_at, reverse=True)

    def get(self, job_id: str) -> JobRecord | None:
        return next((job for job in self.list() if job.id == job_id), None)

    def create(self, kind: str, slug: str | None, message: str = "") -> JobRecord:
        timestamp = now_iso()
        record = JobRecord(
            id=uuid4().hex,
            kind=kind,
            slug=slug,
            status="queued",
            created_at=timestamp,
            updated_at=timestamp,
            message=message,
            result={},
        )
        with self._lock:
            self._append(record)
        return record

    def update(
        self,
        job_id: str,
        *,
        status: str | None = None,
        message: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> JobRecord:
        with self._lock:
            current = self.get(job_id)
            if current is None:
                raise KeyError(f"Unknown job: {job_id}")
            updated = current.model_copy(
                update={
                    "status": status or current.status,
                    "message": current.message if message is None else message,
                    "result": current.result if result is None else result,
                    "updated_at": now_iso(),
                }
            )
            self._append(updated)
            return updated


class JobRunner:
    def __init__(self, store: JobStore):
        self.store = store

    def enqueue(
        self,
        *,
        kind: str,
        slug: str | None,
        message: str,
        task: Callable[[str], dict[str, Any] | None],
    ) -> JobRecord:
        record = self.store.create(kind=kind, slug=slug, message=message)

        def run() -> None:
            try:
                self.store.update(record.id, status="running")
                result = task(record.id) or {}
                self.store.update(record.id, status="completed", message="completed", result=result)
            except Exception as exc:  # noqa: BLE001 - persist background failure for the UI
                self.store.update(record.id, status="failed", message=str(exc), result={})

        thread = threading.Thread(target=run, name=f"skill-creator-{record.kind}", daemon=True)
        thread.start()
        return record
