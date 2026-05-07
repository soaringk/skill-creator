import { AddMaterial } from "./AddMaterial";
import { JobNotice } from "./JobNotice";
import { MaterialsList } from "./MaterialsList";
import { SkillStatus } from "./SkillStatus";
import { TestPublish } from "./TestPublish";
import type { JobRecord, SkillDetail as SkillDetailType } from "../types";

type SkillDetailProps = {
  detail: SkillDetailType;
  isRecording: boolean;
  jobs: JobRecord[];
  onAddText: (form: FormData) => Promise<void>;
  onFile: (file: File) => void;
  onPublish: () => void;
  onPublishTokenChange: (value: string) => void;
  onPolishText: () => void;
  onTextDraftChange: (value: string) => void;
  onToggleRecording: () => void;
  onUse: (form: FormData) => Promise<void>;
  polishing: boolean;
  publishToken: string;
  textDraft: string;
  transcribing: boolean;
  useOutput: string;
  useRunning: boolean;
  useSession: string;
  useStatus: string;
};

export function SkillDetail({
  detail,
  isRecording,
  jobs,
  onAddText,
  onFile,
  onPublish,
  onPublishTokenChange,
  onPolishText,
  onTextDraftChange,
  onToggleRecording,
  onUse,
  polishing,
  publishToken,
  textDraft,
  transcribing,
  useOutput,
  useRunning,
  useSession,
  useStatus,
}: SkillDetailProps) {
  const statusClass = detail.summary.status.toLowerCase();

  return (
    <>
      <div className="detail-header">
        <h1 className="title">{detail.summary.title}</h1>
        <div className="meta">
          <span className={`badge ${statusClass}`}>{detail.summary.status}</span>
          <span className="text-sm">{detail.materials.length} 个素材</span>
        </div>
      </div>

      <JobNotice slug={detail.summary.slug} jobs={jobs} />

      <div className="area-section input-area">
        <AddMaterial
          isRecording={isRecording}
          onFile={onFile}
          onPolishText={onPolishText}
          onSubmit={onAddText}
          onTextDraftChange={onTextDraftChange}
          onToggleRecording={onToggleRecording}
          polishing={polishing}
          textDraft={textDraft}
          transcribing={transcribing}
        />
      </div>

      <div className="area-section preview-area">
        <MaterialsList slug={detail.summary.slug} materials={detail.materials} />
        <SkillStatus detail={detail} />
      </div>

      <TestPublish
        onPublish={onPublish}
        onPublishTokenChange={onPublishTokenChange}
        onUse={onUse}
        publishToken={publishToken}
        useOutput={useOutput}
        useRunning={useRunning}
        useSession={useSession}
        useStatus={useStatus}
      />
    </>
  );
}
