import type { FormEvent } from "react";

type AddMaterialProps = {
  isRecording: boolean;
  onFile: (file: File) => void;
  onPolishText: () => void;
  onTextDraftChange: (value: string) => void;
  onToggleRecording: () => void;
  onSubmit: (form: FormData) => Promise<void>;
  polishing: boolean;
  textDraft: string;
  transcribing: boolean;
};

export function AddMaterial({
  isRecording,
  onFile,
  onPolishText,
  onSubmit,
  onTextDraftChange,
  onToggleRecording,
  polishing,
  textDraft,
  transcribing,
}: AddMaterialProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="card">
      <div className="area-header">1. 提供素材</div>
      <form id="text-form" onSubmit={handleSubmit}>
        <div className="asr-actions">
          <button type="button" className={`btn-record ${isRecording ? "recording" : ""}`} id="btn-record" onClick={onToggleRecording}>
            {isRecording ? "🛑 停止" : "🎙️ 语音输入"}
          </button>
          <label className="btn-upload-asr">
            📁 上传音频
            <input
              type="file"
              id="asr-file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) onFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {transcribing ? <div className="text-sm text-muted mb-2">正在识别语音，请稍候...</div> : null}

        <textarea
          name="text"
          id="text-material-body"
          rows={6}
          placeholder="识别结果将显示在此处。支持直接输入或粘贴文本。"
          required
          value={textDraft}
          onChange={event => onTextDraftChange(event.currentTarget.value)}
        />

        <div className="confidence-row mt-2">
          <label className="confidence-label">素材权重:</label>
          <select name="confidence" className="confidence-select" defaultValue="medium">
            <option value="high">核心</option>
            <option value="medium">参考</option>
            <option value="low">补充</option>
          </select>
        </div>
        <div className="material-actions mt-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={polishing || transcribing || !textDraft.trim()}
            onClick={onPolishText}
          >
            {polishing ? "润色中..." : "润色"}
          </button>
          <button type="submit" className="btn-primary" disabled={polishing || transcribing}>记录</button>
        </div>
      </form>
    </div>
  );
}
