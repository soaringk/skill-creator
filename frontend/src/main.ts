import "./styles.css";

type SkillSummary = {
  slug: string;
  title: string;
  status: string;
  target_category?: string | null;
  updated_at?: string | null;
  rules_target?: string | null;
};

type MaterialSummary = {
  id: string;
  type: string;
  path: string;
  uploaded_at?: string | null;
  content?: string;
};

type SkillDetail = {
  summary: SkillSummary;
  index_body: string;
  materials: MaterialSummary[];
  draft: string;
  promoted?: string | null;
};

type DraftSections = {
  publishable: string;
  review: string;
  raw: string;
};

type JobRecord = {
  id: string;
  kind: string;
  slug?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  message: string;
  result?: Record<string, unknown>;
};

type UseStreamEvent =
  | { type: "session"; session_id: string }
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type AsrStreamEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string; final?: boolean; request_id?: string | null }
  | { type: "done" }
  | { type: "error"; message: string };

const state = {
  skills: [] as SkillSummary[],
  jobs: [] as JobRecord[],
  selectedSlug: null as string | null,
  detail: null as SkillDetail | null,
  error: "",
  useSession: "",
  useOutput: "",
  useStatus: "",
  useRunning: false,
  transcribing: false,
  isRecording: false,
  textDraft: "",
  isModalOpen: false,
  isMobileListVisible: true,
  isSidebarCollapsed: false,
  publishToken: "",
  detailsOpen: {} as Record<string, boolean>,
};

let recordingSocket: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let audioSource: MediaStreamAudioSourceNode | null = null;
let audioStream: MediaStream | null = null;
let asrBaseText = "";
let asrFinalText = "";
let asrPartialText = "";
let jobRefreshTimer: number | null = null;

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing app root");
const app = root;
const apiBase = import.meta.env.BASE_URL;

function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${apiBase}${normalizedPath}`;
}

function wsUrl(path: string): string {
  const url = new URL(apiUrl(path), window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(apiUrl(path), { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(errorMessage(text, response.status));
  }
  return (await response.json()) as T;
}

function errorMessage(body: string, status: number): string {
  if (!body) return `Request failed: ${status}`;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Keep the original response body.
  }
  return body;
}

async function load(options: { preserveScroll?: boolean } = {}): Promise<void> {
  try {
    const [skills, jobs] = await Promise.all([
      api<SkillSummary[]>("/api/skills"),
      api<JobRecord[]>("/api/jobs"),
    ]);
    state.skills = skills;
    state.jobs = jobs;

    if (!state.selectedSlug && skills.length > 0) {
      state.selectedSlug = skills[0].slug;
      if (window.innerWidth > 768) state.isMobileListVisible = false;
    }
    if (state.selectedSlug) {
      state.detail = await api<SkillDetail>(`/api/skills/${state.selectedSlug}`);
    }
    state.error = "";
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render({ preserveScroll: options.preserveScroll });
  scheduleJobRefresh();
}

function scheduleJobRefresh(): void {
  if (jobRefreshTimer !== null) {
    window.clearTimeout(jobRefreshTimer);
    jobRefreshTimer = null;
  }
  if (!state.jobs.some(job => job.status === "queued" || job.status === "running")) return;
  jobRefreshTimer = window.setTimeout(() => {
    jobRefreshTimer = null;
    void load({ preserveScroll: true });
  }, 2000);
}

async function selectSkill(slug: string): Promise<void> {
  state.selectedSlug = slug;
  state.isMobileListVisible = false;
  state.textDraft = "";
  state.error = "";
  state.detail = await api<SkillDetail>(`/api/skills/${slug}`);
  render();
}

async function createSkill(event: Event): Promise<void> {
  event.preventDefault();
  const form = new FormData(event.currentTarget as HTMLFormElement);
  await api<SkillSummary>("/api/skills", {
    method: "POST",
    body: JSON.stringify({
      slug: String(form.get("slug") || ""),
      title: String(form.get("title") || ""),
      target_category: String(form.get("target_category") || "Workflow"),
      goal: String(form.get("goal") || ""),
      trigger_draft: String(form.get("trigger_draft") || ""),
      notes: String(form.get("notes") || "")
    })
  });
  state.isModalOpen = false;
  await load();
}

async function addText(event: Event): Promise<void> {
  event.preventDefault();
  if (!state.selectedSlug) return;
  const form = new FormData(event.currentTarget as HTMLFormElement);
  await api<MaterialSummary>(`/api/skills/${state.selectedSlug}/materials/text`, {
    method: "POST",
    body: JSON.stringify({
      text: String(form.get("text") || ""),
      confidence: String(form.get("confidence") || "medium"),
    })
  });
  state.textDraft = "";
  await load();
}

async function toggleRecording(): Promise<void> {
  if (state.isRecording) {
    stopRealtimeRecording();
    return;
  }

  try {
    await startRealtimeRecording();
  } catch (err) {
    state.error = "Microphone access denied or unavailable. " + (err instanceof Error ? err.message : String(err));
    cleanupRealtimeRecording();
    render();
  }
}

async function startRealtimeRecording(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("浏览器不支持实时录音。");

  audioStream = stream;
  audioContext = new AudioContextClass();
  audioSource = audioContext.createMediaStreamSource(stream);
  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  recordingSocket = new WebSocket(wsUrl("/api/asr/realtime"));
  recordingSocket.binaryType = "arraybuffer";

  resetAsrDraft();
  state.error = "";
  state.transcribing = true;
  state.isRecording = true;
  render();

  recordingSocket.onopen = () => {
    if (!audioContext || !audioSource || !audioProcessor) return;
    audioProcessor.onaudioprocess = (event) => {
      if (!recordingSocket || recordingSocket.readyState !== WebSocket.OPEN || !audioContext) return;
      const pcm = floatTo16BitPcm(downsample(event.inputBuffer.getChannelData(0), audioContext.sampleRate, 16000));
      event.outputBuffer.getChannelData(0).fill(0);
      if (pcm.byteLength > 0) recordingSocket.send(pcm);
    };
    audioSource.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
  };
  recordingSocket.onmessage = (event) => {
    try {
      handleAsrEvent(JSON.parse(String(event.data)) as AsrStreamEvent);
    } catch (error) {
      state.error = "Transcription failed: " + (error instanceof Error ? error.message : String(error));
      state.transcribing = false;
      state.isRecording = false;
      cleanupRealtimeRecording();
    }
    render();
  };
  recordingSocket.onerror = () => {
    state.error = "实时识别连接失败。";
    state.transcribing = false;
    state.isRecording = false;
    cleanupRealtimeRecording();
    render();
  };
  recordingSocket.onclose = () => {
    state.isRecording = false;
    state.transcribing = false;
    cleanupRealtimeRecording(false);
    render();
  };
}

function stopRealtimeRecording(): void {
  state.isRecording = false;
  state.transcribing = true;
  audioProcessor?.disconnect();
  audioSource?.disconnect();
  audioStream?.getTracks().forEach(track => track.stop());
  if (recordingSocket?.readyState === WebSocket.OPEN) {
    recordingSocket.send("stop");
  } else {
    cleanupRealtimeRecording();
    state.transcribing = false;
  }
  render();
}

function cleanupRealtimeRecording(closeSocket = true): void {
  audioProcessor?.disconnect();
  audioSource?.disconnect();
  audioStream?.getTracks().forEach(track => track.stop());
  void audioContext?.close().catch(() => undefined);
  if (closeSocket && recordingSocket && recordingSocket.readyState < WebSocket.CLOSING) {
    recordingSocket.close();
  }
  audioProcessor = null;
  audioSource = null;
  audioStream = null;
  audioContext = null;
  recordingSocket = null;
}

async function transcribeOfflineFile(file: File): Promise<void> {
  if (!file.type.startsWith("audio/")) {
    state.error = "请上传音频文件。";
    render();
    return;
  }
  state.transcribing = true;
  state.error = "";
  resetAsrDraft();
  render();
  try {
    const payload = new FormData();
    payload.set("file", file);
    const response = await fetch(apiUrl("/api/asr/text-draft/stream"), {
      method: "POST",
      body: payload
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(errorMessage(text, response.status));
    }
    if (!response.body) throw new Error("浏览器不支持流式响应。");
    await readAsrStream(response.body);
  } catch (error) {
    state.error = "Transcription failed: " + (error instanceof Error ? error.message : String(error));
  } finally {
    state.transcribing = false;
    render();
  }
}

function resetAsrDraft(): void {
  asrBaseText = state.textDraft.trim();
  asrFinalText = "";
  asrPartialText = "";
}

function handleAsrEvent(event: AsrStreamEvent): void {
  if (event.type === "status") return;
  if (event.type === "error") throw new Error(event.message);
  if (event.type === "done") {
    asrPartialText = "";
    applyAsrDraft();
    return;
  }
  if (event.type === "text") {
    if (event.final) {
      asrFinalText = joinText(asrFinalText, event.text);
      asrPartialText = "";
    } else {
      asrPartialText = event.text;
    }
    applyAsrDraft();
  }
}

function applyAsrDraft(): void {
  const transcript = joinText(asrFinalText, asrPartialText);
  state.textDraft = joinText(asrBaseText, transcript);
}

function joinText(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

async function readAsrStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) handleAsrEvent(JSON.parse(line) as AsrStreamEvent);
    }
    render();
    if (done) break;
  }
  if (buffer.trim()) {
    handleAsrEvent(JSON.parse(buffer) as AsrStreamEvent);
    render();
  }
}

function downsample(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

async function publishSkill(): Promise<void> {
  if (!state.selectedSlug) return;
  const token = state.publishToken.trim();
  if (!token) throw new Error("发布需要 Admin Token。");
  await api<unknown>(`/api/skills/${state.selectedSlug}/promote`, {
    method: "POST",
    body: "{}",
    headers: { "X-Admin-Token": token },
  });
  state.publishToken = "";
  await load();
}

async function useSkill(event: Event): Promise<void> {
  event.preventDefault();
  if (!state.selectedSlug) return;
  const form = new FormData(event.currentTarget as HTMLFormElement);
  state.error = "";
  state.useSession = "";
  state.useOutput = "";
  state.useStatus = "正在连接 Agent...";
  state.useRunning = true;
  render();
  try {
    const response = await fetch(apiUrl(`/api/skills/${state.selectedSlug}/use/stream`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: String(form.get("prompt") || ""),
        source: String(form.get("source") || "promoted")
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(errorMessage(text, response.status));
    }
    if (!response.body) throw new Error("浏览器不支持流式响应。");
    await readUseStream(response.body);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.useRunning = false;
    if (state.useStatus !== "运行失败") state.useStatus = state.useOutput ? "完成" : "";
    render();
  }
}

function render(options: { preserveScroll?: boolean } = {}): void {
  const mainContent = document.querySelector<HTMLElement>(".main-content");
  const previousScrollTop = options.preserveScroll ? mainContent?.scrollTop : undefined;
  app.innerHTML = `
    <div class="app-layout">
      ${!state.isMobileListVisible ? `
      <nav class="mobile-nav">
        <button class="nav-btn" id="back-btn">← Skill 创作列表</button>
      </nav>
      ` : ""}

      <div class="sidebar ${state.isMobileListVisible ? '' : 'hidden-on-mobile'} ${state.isSidebarCollapsed ? 'collapsed' : ''}">
        <div class="sidebar-header">
          <h2>Skill 创作列表</h2>
          <div style="display:flex; align-items:center; gap:12px;">
            <button class="nav-btn" id="open-create-btn" style="font-size:24px;">+</button>
            <button class="nav-btn desktop-only" id="close-sidebar-btn" style="font-size:20px; padding:0 4px;">✕</button>
          </div>
        </div>
        <div class="skill-list">
          ${state.skills.map(renderSkillCard).join("") || `<div class="text-muted text-center mt-3">暂无 Skill。</div>`}
        </div>
      </div>

      <div class="main-content ${!state.isMobileListVisible ? '' : 'hidden-on-mobile'}">
        <div class="desktop-only-flex" style="margin-bottom: 12px; align-items: center;">
          <button class="nav-btn" id="toggle-sidebar-btn" style="font-size:20px; padding: 4px; display: flex; align-items: center; gap: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            ${state.isSidebarCollapsed ? '<span style="font-size: 15px; font-weight: 600;">Skill 创作列表</span>' : ''}
          </button>
        </div>
        ${state.error ? `
          <div class="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>${escapeHtml(state.error)}</span>
          </div>
        ` : ""}
        ${state.detail ? renderSkillDetail(state.detail) : `<div class="text-muted text-center mt-3">请选择一个 Skill 创作项以开始。</div>`}
      </div>

      <!-- Create Modal -->
      <div class="modal-overlay ${state.isModalOpen ? 'open' : ''}" id="create-modal-overlay">
        <div class="modal-content">
          <form id="create-skill-form">
            <div class="modal-header">
              <h3>新建 Skill</h3>
              <button type="button" class="modal-close" id="close-create-btn">&times;</button>
            </div>
            <div class="modal-body">
              <div>
                <label class="text-sm text-muted">标识符 (Slug)</label>
                <input name="slug" placeholder="e.g. format-code" pattern="[a-z0-9][a-z0-9_-]{0,63}" required class="mt-2" />
              </div>
              <div>
                <label class="text-sm text-muted">标题</label>
                <input name="title" placeholder="e.g. Format Code" required class="mt-2" />
              </div>
              <div>
                <label class="text-sm text-muted">分类</label>
                <select name="target_category" class="mt-2">
                  <option>Workflow</option>
                  <option>BestPractice</option>
                  <option>APIGuide</option>
                </select>
              </div>
              <button type="submit" class="btn-primary btn-full mt-3">创建 Skill</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  attachListeners();
  if (previousScrollTop !== undefined) {
    const nextMainContent = document.querySelector<HTMLElement>(".main-content");
    if (nextMainContent) nextMainContent.scrollTop = previousScrollTop;
  }
}

function renderSkillCard(skill: SkillSummary): string {
  const active = skill.slug === state.selectedSlug ? " active" : "";
  const statusClass = skill.status.toLowerCase();
  return `
    <div class="skill-card${active}" data-skill="${escapeHtml(skill.slug)}">
      <div class="skill-card-title">${escapeHtml(skill.title)}</div>
      <div class="skill-card-meta">
        <span class="badge ${statusClass}">${escapeHtml(skill.status)}</span>
        <span>${escapeHtml(skill.slug)}</span>
      </div>
    </div>
  `;
}

function renderAddMaterial(): string {
  return `
    <div class="card">
      <div class="area-header">1. 提供素材</div>
      <form id="text-form">
        <div class="asr-actions">
          <button type="button" class="btn-record ${state.isRecording ? 'recording' : ''}" id="btn-record">
            ${state.isRecording ? '🛑 停止' : '🎙️ 语音输入'}
          </button>
          <label class="btn-upload-asr">
            📁 上传音频
            <input type="file" id="asr-file" accept="audio/*" style="display: none;" />
          </label>
        </div>

        ${state.transcribing ? `<div class="text-sm text-muted mb-2">正在识别语音，请稍候...</div>` : ''}

        <textarea name="text" id="text-material-body" rows="6" placeholder="识别结果将显示在此处。支持直接输入或粘贴文本。" required>${escapeHtml(state.textDraft)}</textarea>

        <div class="confidence-row mt-2">
          <label class="confidence-label">素材权重:</label>
          <select name="confidence" class="confidence-select">
            <option value="high">核心</option>
            <option value="medium" selected>参考</option>
            <option value="low">补充</option>
          </select>
        </div>
        <button type="submit" class="btn-primary btn-full mt-3">保存文本</button>
      </form>
    </div>
  `;
}

function renderSkillDetail(detail: SkillDetail): string {
  const slug = detail.summary.slug;
  const statusClass = detail.summary.status.toLowerCase();

  return `
    <div class="detail-header">
      <h1 class="title">${escapeHtml(detail.summary.title)}</h1>
      <div class="meta">
        <span class="badge ${statusClass}">${escapeHtml(detail.summary.status)}</span>
        <span class="text-sm">${detail.materials.length} 个素材</span>
      </div>
    </div>

    ${renderJobNotice(slug)}

    <div class="area-section input-area">
      ${renderAddMaterial()}
    </div>

    <div class="area-section preview-area">
      <div class="card">
        <div class="area-header">2. 审核与完善</div>
        <h2 class="card-title">素材 (${detail.materials.length})</h2>
        <div>
          ${detail.materials.map(m => {
            const firstLine = m.content ? m.content.split(/\r?\n/).find(l => l.trim().length > 0)?.replace(/^#+\s*/, '').trim() : '';
            const title = firstLine || m.type;
            const displayTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
            return `
            <div class="material-item">
              <details ${detailsAttributes(`material:${slug}:${m.id}`)}>
                <summary class="material-preview-summary">
                  <div class="m-type" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(title)}">${escapeHtml(displayTitle)}</div>
                  <div class="m-id">${escapeHtml(m.id.substring(0,8))}</div>
                </summary>
                ${m.content ? '<pre class="code-block" style="margin-top: 10px;">' + escapeHtml(m.content) + '</pre>' : '<div class="text-muted text-sm mt-2 text-center">暂无内容。</div>'}
              </details>
            </div>
            `;
          }).join('') || '<div class="text-muted text-sm text-center">暂无素材。</div>'}
        </div>
      </div>

      ${renderSkillStatus(detail)}
    </div>

    <div class="area-section test-area">
      <div class="card">
        <div class="area-header">3. 测试与发布</div>
        <form id="use-skill">
          <textarea name="prompt" rows="3" placeholder="描述如何使用 Skill..." required></textarea>
          <select name="source" class="mt-2">
            <option value="draft">草稿版本</option>
            <option value="promoted">发布版本</option>
          </select>
          <button type="submit" class="btn-secondary btn-full mt-2" ${state.useRunning ? "disabled" : ""}>${state.useRunning ? "运行中..." : "运行 Agent"}</button>
          ${renderAgentOutput()}
        </form>

        <hr style="border: none; border-top: 1px solid var(--glass-border); margin: 24px 0;" />

        <div class="publish-section">
          <p class="text-muted text-sm mb-2">发布需要 Admin Token。</p>
          <input
            id="publish-token"
            type="password"
            autocomplete="off"
            placeholder="Admin Token"
            value="${escapeHtml(state.publishToken)}"
            class="mb-2"
          />
          <button type="button" class="btn-primary btn-full publish-button" id="publish-skill">
            发布 Skill
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSkillStatus(detail: SkillDetail): string {
  const draft = parseDraftSections(detail.draft);
  return `
    <div class="card mt-3">
      <h2 class="card-title">Skill 状态</h2>
      ${draft.publishable || draft.review ? `
        <details ${detailsAttributes(`status:${detail.summary.slug}:publishable`, true)}>
          <summary>可发布内容</summary>
          <pre class="draft-block">${escapeHtml(draft.publishable || "暂无可发布内容。")}</pre>
        </details>
        ${draft.review ? `
        <details class="mt-2" ${detailsAttributes(`status:${detail.summary.slug}:review`)}>
          <summary>评审意见</summary>
          <pre class="draft-block">${escapeHtml(draft.review)}</pre>
        </details>
        ` : ''}
      ` : `
        <details ${detailsAttributes(`status:${detail.summary.slug}:raw`, true)}>
          <summary>草稿</summary>
          <pre class="draft-block">${escapeHtml(draft.raw || "暂无草稿。")}</pre>
        </details>
      `}
      ${detail.promoted ? `
      <details class="mt-2" ${detailsAttributes(`status:${detail.summary.slug}:promoted`)}>
        <summary>已发布版本</summary>
        <pre class="draft-block">${escapeHtml(detail.promoted)}</pre>
      </details>
      ` : ''}
    </div>
  `;
}

function detailsAttributes(key: string, defaultOpen = false): string {
  const open = state.detailsOpen[key] ?? defaultOpen;
  return `data-details-key="${escapeHtml(key)}"${open ? " open" : ""}`;
}

function renderAgentOutput(): string {
  if (!state.useSession && !state.useOutput && !state.useStatus) return "";
  return `
    <div class="agent-output mt-2">
      <div class="agent-output-header">
        <span>${escapeHtml(state.useStatus || "输出")}</span>
        ${state.useSession ? `<span>会话 ${escapeHtml(state.useSession.substring(0, 8))}</span>` : ""}
      </div>
      <pre>${escapeHtml(state.useOutput || (state.useRunning ? "等待输出..." : "暂无输出。"))}</pre>
    </div>
  `;
}

async function readUseStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) handleUseStreamEvent(JSON.parse(line) as UseStreamEvent);
    }
    render();
    if (done) break;
  }
  if (buffer.trim()) {
    handleUseStreamEvent(JSON.parse(buffer) as UseStreamEvent);
    render();
  }
}

function handleUseStreamEvent(event: UseStreamEvent): void {
  if (event.type === "session") {
    state.useSession = event.session_id;
    return;
  }
  if (event.type === "status") {
    state.useStatus = event.message;
    return;
  }
  if (event.type === "delta") {
    state.useOutput += event.text;
    state.useStatus = "正在输出";
    return;
  }
  if (event.type === "error") {
    state.useStatus = "运行失败";
    throw new Error(event.message);
  }
  if (event.type === "done") {
    state.useStatus = "完成";
  }
}

function parseDraftSections(draft: string): DraftSections {
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

function renderJobNotice(slug: string): string {
  const job = latestDraftJob(slug);
  if (!job || job.status === "completed") return "";
  if (job.status === "failed") {
    return `
      <div class="job-banner failed">
        <span class="job-dot"></span>
        <div class="job-copy">
          <div class="job-title">草稿生成失败</div>
          <div class="job-message">${escapeHtml(job.message || "Unknown error")}</div>
        </div>
      </div>
    `;
  }
  const title = job.status === "queued" ? "排队中" : "正在生成草稿";
  return `
    <div class="job-banner">
      <span class="job-dot"></span>
      <div class="job-copy">
        <div class="job-title">${title}</div>
        <div class="job-message">完成后会自动刷新。</div>
      </div>
    </div>
  `;
}

function latestDraftJob(slug: string): JobRecord | undefined {
  return state.jobs
    .filter(item => item.slug === slug && item.kind === "draft")
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attachListeners() {
  document.querySelector<HTMLButtonElement>('#back-btn')?.addEventListener('click', () => {
    state.isMobileListVisible = true;
    render();
  });

  document.querySelector<HTMLButtonElement>('#toggle-sidebar-btn')?.addEventListener('click', () => {
    state.isSidebarCollapsed = !state.isSidebarCollapsed;
    render();
  });

  document.querySelector<HTMLButtonElement>('#close-sidebar-btn')?.addEventListener('click', () => {
    state.isSidebarCollapsed = true;
    render();
  });

  // Material Form Handlers
  document.querySelector<HTMLFormElement>('#text-form')?.addEventListener('submit', addText);

  // ASR Inline Handlers
  document.querySelector<HTMLButtonElement>('#btn-record')?.addEventListener('click', toggleRecording);

  document.querySelector<HTMLInputElement>('#asr-file')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      void transcribeOfflineFile(target.files[0]);
      target.value = ""; // reset
    }
  });

  document.querySelector<HTMLTextAreaElement>('#text-material-body')?.addEventListener('input', (e) => {
    state.textDraft = (e.target as HTMLTextAreaElement).value;
  });

  document.querySelector<HTMLInputElement>('#publish-token')?.addEventListener('input', (e) => {
    state.publishToken = (e.target as HTMLInputElement).value;
  });

  document.querySelectorAll<HTMLDetailsElement>('details[data-details-key]').forEach(el => {
    el.addEventListener('toggle', () => {
      const key = el.dataset.detailsKey;
      if (key) state.detailsOpen[key] = el.open;
    });
  });

  // Other Actions
  document.querySelector<HTMLFormElement>('#create-skill-form')?.addEventListener('submit', createSkill);
  document.querySelector<HTMLFormElement>('#use-skill')?.addEventListener('submit', useSkill);
  document.querySelector<HTMLButtonElement>('#publish-skill')?.addEventListener('click', () => {
    publishSkill().catch((error) => {
      state.error = error instanceof Error ? error.message : String(error);
      render();
    });
  });

  document.querySelectorAll<HTMLDivElement>('[data-skill]').forEach(el => {
    el.addEventListener('click', () => {
      const slug = (el as HTMLElement).dataset.skill;
      if (slug) selectSkill(slug);
    });
  });

  document.querySelector<HTMLButtonElement>('#open-create-btn')?.addEventListener('click', () => {
    state.isModalOpen = true;
    render();
  });

  document.querySelector<HTMLButtonElement>('#close-create-btn')?.addEventListener('click', () => {
    state.isModalOpen = false;
    render();
  });


}

void load();
