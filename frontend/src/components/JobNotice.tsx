import { latestDraftJob } from "../draft";
import type { JobRecord } from "../types";

export function JobNotice({ jobs, slug }: { jobs: JobRecord[]; slug: string }) {
  const job = latestDraftJob(slug, jobs);
  if (!job || job.status === "completed") return null;

  if (job.status === "failed") {
    return (
      <div className="job-banner failed">
        <span className="job-dot" />
        <div className="job-copy">
          <div className="job-title">草稿生成失败</div>
          <div className="job-message">{job.message || "Unknown error"}</div>
        </div>
      </div>
    );
  }

  const title = job.status === "queued" ? "排队中" : "正在生成草稿";
  return (
    <div className="job-banner">
      <span className="job-dot" />
      <div className="job-copy">
        <div className="job-title">{title}</div>
        <div className="job-message">完成后会自动刷新。</div>
      </div>
    </div>
  );
}
