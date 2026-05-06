import "./styles.css";

type SkillSummary = {
  slug: string;
  title: string;
  status: string;
  target_category?: string | null;
  material_count: number;
  usable_material_count: number;
  updated_at?: string | null;
};

type MaterialSummary = {
  id: string;
  type: string;
  status: string;
  path: string;
  uploaded_at?: string | null;
  source_file?: string | null;
  asr?: Record<string, unknown>;
};

type SkillDetail = {
  summary: SkillSummary;
  index_body: string;
  materials: MaterialSummary[];
  draft: string;
  proposal: string;
};

type JobRecord = {
  id: string;
  kind: string;
  slug?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  message: string;
};

const state = {
  skills: [] as SkillSummary[],
  selectedSlug: null as string | null,
  detail: null as SkillDetail | null,
  jobs: [] as JobRecord[],
  token: localStorage.getItem("skillCreatorAdminToken") || "",
  error: "",
  useSession: "",
  transcribing: false,
  isRecording: false,
  textDraft: "",
  isModalOpen: false,
  materialTab: 'text' as 'text' | 'file',
  isMobileListVisible: true,
  settingsOpen: false,
  isSidebarCollapsed: false,
};

// Global recording references
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: BlobPart[] = [];

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing app root");
const app = root;
const apiBase = import.meta.env.BASE_URL;

function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${apiBase}${normalizedPath}`;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (state.token) headers.set("X-Admin-Token", state.token);
  
  const response = await fetch(apiUrl(path), { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function load(): Promise<void> {
  try {
    const [skills, jobs] = await Promise.all([
      api<SkillSummary[]>("/api/skills"),
      api<JobRecord[]>("/api/jobs")
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
  render();
}

function saveToken(value: string): void {
  state.token = value.trim();
  localStorage.setItem("skillCreatorAdminToken", state.token);
  render();
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
      source_url: String(form.get("source_url") || "") || null,
      confidence: String(form.get("confidence") || "medium"),
      topics: []
    })
  });
  state.textDraft = "";
  await load();
}

async function toggleRecording(): Promise<void> {
  if (state.isRecording && mediaRecorder) {
    mediaRecorder.stop();
    state.isRecording = false;
    render();
    return;
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm';
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      const file = new File([audioBlob], `recording.${ext}`, { type: mimeType });
      await transcribeFile(file);
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    state.isRecording = true;
    render();
  } catch (err) {
    state.error = "Microphone access denied or unavailable. " + (err instanceof Error ? err.message : String(err));
    render();
  }
}

async function transcribeFile(file: File): Promise<void> {
  state.transcribing = true;
  state.error = "";
  render();
  try {
    const payload = new FormData();
    payload.set("file", file);
    const result = await api<{ text: string; request_id?: string | null }>("/api/asr/text-draft", {
      method: "POST",
      body: payload
    });
    const current = state.textDraft.trim();
    state.textDraft = current ? `${current}\n\n${result.text}` : result.text;
  } catch (error) {
    state.error = "Transcription failed: " + (error instanceof Error ? error.message : String(error));
  } finally {
    state.transcribing = false;
    render();
  }
}

async function addAudio(event: Event): Promise<void> {
  event.preventDefault();
  if (!state.selectedSlug) return;
  const form = new FormData(event.currentTarget as HTMLFormElement);
  await api<{ material: MaterialSummary; job: JobRecord }>(
    `/api/skills/${state.selectedSlug}/materials/audio`,
    {
      method: "POST",
      body: form
    }
  );
  await load();
}

async function action(path: string): Promise<void> {
  await api<unknown>(path, { method: "POST", body: "{}" });
  await load();
}

async function useSkill(event: Event): Promise<void> {
  event.preventDefault();
  if (!state.selectedSlug) return;
  const form = new FormData(event.currentTarget as HTMLFormElement);
  const result = await api<{ session_id: string }>(`/api/skills/${state.selectedSlug}/use`, {
    method: "POST",
    body: JSON.stringify({
      prompt: String(form.get("prompt") || ""),
      source: String(form.get("source") || "promoted")
    })
  });
  state.useSession = result.session_id;
  render();
}

function render(): void {
  app.innerHTML = `
    <div class="app-layout">
      <nav class="mobile-nav">
        ${!state.isMobileListVisible ? 
          `<button class="nav-btn" id="back-btn">← Candidates</button>` : 
          `<div style="font-size:18px;">Skill Creator</div>`
        }
        <button class="nav-btn" id="settings-btn" style="font-size:20px;">⚙️</button>
      </nav>

      <div class="sidebar ${state.isMobileListVisible ? '' : 'hidden-on-mobile'} ${state.isSidebarCollapsed ? 'collapsed' : ''}">
        <div class="sidebar-header">
          <h2>Candidates</h2>
          <div style="display:flex; align-items:center; gap:12px;">
            <button class="nav-btn" id="open-create-btn" style="font-size:24px;">+</button>
            <button class="nav-btn desktop-only" id="close-sidebar-btn" style="font-size:20px; padding:0 4px;">✕</button>
          </div>
        </div>
        ${state.settingsOpen ? `
          <div style="padding: 16px; border-bottom: 1px solid var(--border); background: #f9f9f9;">
            <p class="text-sm text-muted mb-2">Admin Token</p>
            <input type="password" id="token-input" value="${escapeHtml(state.token)}" placeholder="Enter token..." />
          </div>
        ` : ''}
        <div class="skill-list">
          ${state.skills.map(renderSkillCard).join("") || `<div class="text-muted text-center mt-3">No candidates found.</div>`}
        </div>
      </div>

      <div class="main-content ${!state.isMobileListVisible ? '' : 'hidden-on-mobile'}">
        <div class="desktop-only-flex" style="margin-bottom: 12px; align-items: center;">
          <button class="nav-btn" id="toggle-sidebar-btn" style="font-size:20px; padding: 4px; display: flex; align-items: center; gap: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            ${state.isSidebarCollapsed ? '<span style="font-size: 15px; font-weight: 600;">Candidates</span>' : ''}
          </button>
        </div>
        ${state.error ? `
          <div class="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>${escapeHtml(state.error)}</span>
          </div>
        ` : ""}
        ${state.detail ? renderSkillDetail(state.detail) : `<div class="text-muted text-center mt-3">Select a candidate to start.</div>`}
      </div>

      <!-- Create Modal -->
      <div class="modal-overlay ${state.isModalOpen ? 'open' : ''}" id="create-modal-overlay">
        <div class="modal-content">
          <form id="create-skill-form">
            <div class="modal-header">
              <h3>New Candidate</h3>
              <button type="button" class="modal-close" id="close-create-btn">&times;</button>
            </div>
            <div class="modal-body">
              <div>
                <label class="text-sm text-muted">Slug</label>
                <input name="slug" placeholder="e.g. format-code" pattern="[a-z0-9][a-z0-9_-]{0,63}" required class="mt-2" />
              </div>
              <div>
                <label class="text-sm text-muted">Title</label>
                <input name="title" placeholder="e.g. Format Code" required class="mt-2" />
              </div>
              <div>
                <label class="text-sm text-muted">Category</label>
                <select name="target_category" class="mt-2">
                  <option>Workflow</option>
                  <option>BestPractice</option>
                  <option>APIGuide</option>
                </select>
              </div>
              <button type="submit" class="btn-primary btn-full mt-3">Create Candidate</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  attachListeners();
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
      <div class="tabs">
        <button type="button" class="tab ${state.materialTab === 'text' ? 'active' : ''}" data-tab="text">✍️ Text Input</button>
        <button type="button" class="tab ${state.materialTab === 'file' ? 'active' : ''}" data-tab="file">📁 Audio Upload</button>
      </div>
      
      <div>
        ${state.materialTab === 'text' ? `
          <form id="text-form">
            <div class="asr-actions">
              <button type="button" class="btn-record ${state.isRecording ? 'recording' : ''}" id="btn-record">
                ${state.isRecording ? '🛑 Stop Recording' : '🎙️ Record Audio'}
              </button>
              <label class="btn-upload-asr">
                📁 Upload for ASR
                <input type="file" id="asr-file" accept="audio/*,video/*" style="display: none;" />
              </label>
            </div>
            
            ${state.transcribing ? `<div class="text-sm text-muted mb-2">Transcribing audio, please wait...</div>` : ''}
            
            <textarea name="text" id="text-material-body" rows="6" placeholder="Transcribed text will appear here. You can also paste or type manually." required>${escapeHtml(state.textDraft)}</textarea>
            
            <input type="text" name="source_url" placeholder="Source URL (optional)" class="mt-2" />
            <select name="confidence" class="mt-2">
              <option value="high">High Confidence</option>
              <option value="medium" selected>Medium Confidence</option>
              <option value="low">Low Confidence</option>
            </select>
            <button type="submit" class="btn-primary btn-full mt-3">Save Text Material</button>
          </form>
        ` : ''}

        ${state.materialTab === 'file' ? `
          <form id="audio-file-form">
            <p class="text-muted text-sm mb-2 text-center">Upload raw audio to save it as a material and transcribe in the background.</p>
            <label class="file-drop-area">
              <input type="file" name="file" accept="audio/*,video/*" required />
              <div class="drop-msg">Select Audio File</div>
            </label>
            <button type="submit" class="btn-primary btn-full mt-2">Upload & Process</button>
          </form>
        ` : ''}
      </div>
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
        <span class="text-sm">${detail.summary.usable_material_count}/${detail.summary.material_count} usable materials</span>
      </div>
      
      <div class="workflow-bar mt-3">
        <button type="button" class="btn-workflow" data-action="/api/skills/${escapeHtml(slug)}/draft">Draft</button>
        <button type="button" class="btn-workflow" data-action="/api/skills/${escapeHtml(slug)}/propose">Propose</button>
        <button type="button" class="btn-workflow" data-action="/api/skills/${escapeHtml(slug)}/approve">Approve</button>
        <button type="button" class="btn-workflow" data-action="/api/skills/${escapeHtml(slug)}/promote">Promote</button>
      </div>
    </div>

    ${renderAddMaterial()}

    <div class="card">
      <h2 class="card-title">Materials (${detail.materials.length})</h2>
      <div>
        ${detail.materials.map(m => `
          <div class="material-item">
            <div class="m-type">${escapeHtml(m.type)}</div>
            <div class="badge ${m.status.toLowerCase()}">${escapeHtml(m.status)}</div>
            <div class="m-id">${escapeHtml(m.id.substring(0,8))}</div>
          </div>
        `).join('') || '<div class="text-muted text-sm text-center">No materials yet.</div>'}
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">State</h2>
      <details>
        <summary>View Draft</summary>
        <pre class="code-block">${escapeHtml(detail.draft || "No draft yet.")}</pre>
      </details>
      <details class="mt-2">
        <summary>View Proposal</summary>
        <pre class="code-block">${escapeHtml(detail.proposal || "No proposal yet.")}</pre>
      </details>
    </div>

    <div class="card">
      <h2 class="card-title">Test Skill</h2>
      <form id="use-skill">
        <textarea name="prompt" rows="3" placeholder="Ask the read-only skill agent..." required></textarea>
        <select name="source" class="mt-2">
          <option value="promoted">Promoted skill</option>
          <option value="draft">Draft</option>
        </select>
        <button type="submit" class="btn-secondary btn-full mt-2">Launch Agent</button>
        ${state.useSession ? `<div class="mt-2 text-sm text-muted text-center">Session: ${escapeHtml(state.useSession)}</div>` : ''}
      </form>
    </div>

    <div class="card mb-3">
      <h2 class="card-title">Active Jobs</h2>
      <div class="jobs-list">
         ${state.jobs.filter(j => j.slug === slug).map(renderJob).join('') || '<div class="text-muted text-sm text-center">No recent jobs.</div>'}
      </div>
    </div>
  `;
}

function renderJob(job: JobRecord): string {
  const statusClass = job.status.toLowerCase();
  return `
    <div class="job-item ${statusClass}">
      <div class="job-header">
        <span>${escapeHtml(job.kind)}</span>
        <span class="badge ${statusClass}">${escapeHtml(job.status)}</span>
      </div>
      <div class="job-message">${escapeHtml(job.message)}</div>
    </div>
  `;
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
  
  document.querySelector<HTMLButtonElement>('#settings-btn')?.addEventListener('click', () => {
    state.settingsOpen = !state.settingsOpen;
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

  document.querySelectorAll<HTMLButtonElement>('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      state.materialTab = (e.currentTarget as HTMLElement).dataset.tab as any;
      render();
    });
  });

  // Material Form Handlers
  document.querySelector<HTMLFormElement>('#text-form')?.addEventListener('submit', addText);
  document.querySelector<HTMLFormElement>('#audio-file-form')?.addEventListener('submit', addAudio);
  
  // ASR Inline Handlers
  document.querySelector<HTMLButtonElement>('#btn-record')?.addEventListener('click', toggleRecording);
  
  document.querySelector<HTMLInputElement>('#asr-file')?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      void transcribeFile(target.files[0]);
      target.value = ""; // reset
    }
  });
  
  document.querySelector<HTMLTextAreaElement>('#text-material-body')?.addEventListener('input', (e) => {
    state.textDraft = (e.target as HTMLTextAreaElement).value;
  });

  // Other Actions
  document.querySelector<HTMLFormElement>('#create-skill-form')?.addEventListener('submit', createSkill);
  document.querySelector<HTMLFormElement>('#use-skill')?.addEventListener('submit', useSkill);

  document.querySelectorAll<HTMLDivElement>('[data-skill]').forEach(el => {
    el.addEventListener('click', () => {
      const slug = (el as HTMLElement).dataset.skill;
      if (slug) selectSkill(slug);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const actionUrl = (el as HTMLElement).dataset.action;
      if (actionUrl) action(actionUrl);
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
  
  document.querySelector<HTMLInputElement>('#token-input')?.addEventListener('change', (e) => {
    saveToken((e.target as HTMLInputElement).value);
  });

  // File Drop styling for standard file inputs
  document.querySelectorAll<HTMLInputElement>('input[type="file"]:not(#asr-file)').forEach(input => {
    input.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const dropArea = target.closest('.file-drop-area');
      const msg = dropArea?.querySelector('.drop-msg');
      if (msg && target.files?.length) {
        msg.textContent = target.files[0].name;
        dropArea?.classList.add('has-file');
      }
    });
  });
}

void load();
setInterval(() => void load(), 10000);
