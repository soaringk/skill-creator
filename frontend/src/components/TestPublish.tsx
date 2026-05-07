import type { FormEvent } from "react";

type TestPublishProps = {
  onPublish: () => void;
  onPublishTokenChange: (value: string) => void;
  onUse: (form: FormData) => Promise<void>;
  publishToken: string;
  useOutput: string;
  useRunning: boolean;
  useSession: string;
  useStatus: string;
};

export function TestPublish({
  onPublish,
  onPublishTokenChange,
  onUse,
  publishToken,
  useOutput,
  useRunning,
  useSession,
  useStatus,
}: TestPublishProps) {
  async function handleUse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUse(new FormData(event.currentTarget));
  }

  return (
    <div className="area-section test-area">
      <div className="card">
        <div className="area-header">3. 测试与发布</div>
        <form id="use-skill" onSubmit={handleUse}>
          <textarea name="prompt" rows={3} placeholder="描述如何使用 Skill..." required />
          <select name="source" className="mt-2" defaultValue="draft">
            <option value="draft">草稿版本</option>
            <option value="promoted">发布版本</option>
          </select>
          <button type="submit" className="btn-secondary btn-full mt-2" disabled={useRunning}>
            {useRunning ? "运行中..." : "运行 Agent"}
          </button>
          <AgentOutput
            output={useOutput}
            running={useRunning}
            session={useSession}
            status={useStatus}
          />
        </form>

        <hr style={{ border: "none", borderTop: "1px solid var(--glass-border)", margin: "24px 0" }} />

        <div className="publish-section">
          <p className="text-muted text-sm mb-2">发布需要 Admin Token。</p>
          <input
            id="publish-token"
            type="password"
            autoComplete="off"
            placeholder="Admin Token"
            value={publishToken}
            className="mb-2"
            onChange={event => onPublishTokenChange(event.currentTarget.value)}
          />
          <button type="button" className="btn-primary btn-full publish-button" id="publish-skill" onClick={onPublish}>
            发布 Skill
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentOutput({
  output,
  running,
  session,
  status,
}: {
  output: string;
  running: boolean;
  session: string;
  status: string;
}) {
  if (!session && !output && !status) return null;

  return (
    <div className="agent-output mt-2">
      <div className="agent-output-header">
        <span>{status || "输出"}</span>
        {session ? <span>会话 {session.substring(0, 8)}</span> : null}
      </div>
      <pre>{output || (running ? "等待输出..." : "暂无输出。")}</pre>
    </div>
  );
}
