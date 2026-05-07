export type SkillSummary = {
  slug: string;
  title: string;
  status: string;
  target_category?: string | null;
  output_language?: string | null;
  updated_at?: string | null;
  rules_target?: string | null;
};

export type MaterialSummary = {
  id: string;
  type: string;
  path: string;
  uploaded_at?: string | null;
  content?: string;
};

export type SkillDetail = {
  summary: SkillSummary;
  index_body: string;
  materials: MaterialSummary[];
  draft: string;
  promoted?: string | null;
};

export type DraftSections = {
  publishable: string;
  review: string;
  raw: string;
};

export type JobRecord = {
  id: string;
  kind: string;
  slug?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  message: string;
  result?: Record<string, unknown>;
};

export type UseStreamEvent =
  | { type: "session"; session_id: string }
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AsrStreamEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string; final?: boolean; request_id?: string | null }
  | { type: "done" }
  | { type: "error"; message: string };
