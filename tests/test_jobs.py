from __future__ import annotations

import time
from pathlib import Path

from skill_creator_service.jobs import JobRunner, JobStore


def test_job_runner_persists_background_failures(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.jsonl")
    runner = JobRunner(store)

    record = runner.enqueue(
        kind="draft",
        slug="demo",
        message="Draft requested",
        task=lambda _job_id: (_ for _ in ()).throw(RuntimeError("OpenCode server unavailable")),
    )

    deadline = time.monotonic() + 2
    job = store.get(record.id)
    while time.monotonic() < deadline:
        job = store.get(record.id)
        if job and job.status == "failed":
            break
        time.sleep(0.01)

    assert job is not None
    assert job.status == "failed"
    assert job.message == "OpenCode server unavailable"
