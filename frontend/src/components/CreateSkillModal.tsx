import type { FormEvent } from "react";

type CreateSkillModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
};

export function CreateSkillModal({ open, onClose, onSubmit }: CreateSkillModalProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className={`modal-overlay ${open ? "open" : ""}`} id="create-modal-overlay">
      <div className="modal-content">
        <form id="create-skill-form" onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>新建 Skill</h3>
            <button type="button" className="modal-close" id="close-create-btn" onClick={onClose}>
              &times;
            </button>
          </div>
          <div className="modal-body">
            <div>
              <label className="text-sm text-muted">标识符 (Slug)</label>
              <input name="slug" placeholder="e.g. format-code" pattern="[a-z0-9][a-z0-9_-]{0,63}" required className="mt-2" />
            </div>
            <div>
              <label className="text-sm text-muted">标题</label>
              <input name="title" placeholder="e.g. Format Code" required className="mt-2" />
            </div>
            <div>
              <label className="text-sm text-muted">分类</label>
              <select name="target_category" className="mt-2" defaultValue="Workflow">
                <option>Workflow</option>
                <option>BestPractice</option>
                <option>APIGuide</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted">输出语言</label>
              <select name="output_language" className="mt-2" defaultValue="中文">
                <option value="中文">中文</option>
                <option value="English">English</option>
              </select>
            </div>
            <button type="submit" className="btn-primary btn-full mt-3">创建 Skill</button>
          </div>
        </form>
      </div>
    </div>
  );
}
