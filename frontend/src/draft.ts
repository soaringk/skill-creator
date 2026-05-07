import type { DraftSections, JobRecord } from "./types";

export function parseDraftSections(draft: string): DraftSections {
  const raw = draft.trim();
  const publishableHeading = raw.match(/^#{1,2}\s+Publishable Skill\s*$/im);
  if (!publishableHeading || publishableHeading.index === undefined) {
    return { publishable: "", review: "", raw };
  }

  const publishableStart = publishableHeading.index + publishableHeading[0].length;
  const reviewMatch = raw.slice(publishableStart).match(/^#{1,2}\s+Draft Review\s*$/im);
  if (!reviewMatch || reviewMatch.index === undefined) {
    return {
      publishable: raw.slice(publishableStart).trim(),
      review: "",
      raw,
    };
  }

  const reviewStart = publishableStart + reviewMatch.index;
  const reviewBodyStart = reviewStart + reviewMatch[0].length;
  return {
    publishable: raw.slice(publishableStart, reviewStart).trim(),
    review: raw.slice(reviewBodyStart).trim(),
    raw,
  };
}

export function latestDraftJob(slug: string, jobs: JobRecord[]): JobRecord | undefined {
  return jobs
    .filter(item => item.slug === slug && item.kind === "draft")
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}
