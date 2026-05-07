import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUrl, errorMessage, wsUrl } from "./api";
import { downsample, floatTo16BitPcm, joinText } from "./audio";
import { CreateSkillModal } from "./components/CreateSkillModal";
import { Sidebar } from "./components/Sidebar";
import { SkillDetail } from "./components/SkillDetail";
import type { AsrStreamEvent, JobRecord, MaterialSummary, SkillDetail as SkillDetailType, SkillSummary, UseStreamEvent } from "./types";

export function App() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetailType | null>(null);
  const [error, setError] = useState("");
  const [useSession, setUseSession] = useState("");
  const [useOutput, setUseOutput] = useState("");
  const [useStatus, setUseStatus] = useState("");
  const [useRunning, setUseRunning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileListVisible, setIsMobileListVisible] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [publishToken, setPublishToken] = useState("");

  const recordingSocket = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioProcessor = useRef<ScriptProcessorNode | null>(null);
  const audioSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const asrBaseText = useRef("");
  const asrFinalText = useRef("");
  const asrPartialText = useRef("");
  const textDraftRef = useRef(textDraft);
  const useOutputRef = useRef(useOutput);

  useEffect(() => {
    textDraftRef.current = textDraft;
  }, [textDraft]);

  useEffect(() => {
    useOutputRef.current = useOutput;
  }, [useOutput]);

  const loadData = useCallback(async () => {
    try {
      const [nextSkills, nextJobs] = await Promise.all([
        api<SkillSummary[]>("/api/skills"),
        api<JobRecord[]>("/api/jobs"),
      ]);
      setSkills(nextSkills);
      setJobs(nextJobs);

      let nextSlug = selectedSlug;
      if (!nextSlug && nextSkills.length > 0) {
        nextSlug = nextSkills[0].slug;
        setSelectedSlug(nextSlug);
        if (window.innerWidth > 768) setIsMobileListVisible(false);
      }
      if (nextSlug) {
        setDetail(await api<SkillDetailType>(`/api/skills/${nextSlug}`));
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSlug]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!jobs.some(job => job.status === "queued" || job.status === "running")) return;
    const timer = window.setTimeout(() => void loadData(), 2000);
    return () => window.clearTimeout(timer);
  }, [jobs, loadData]);

  useEffect(() => () => cleanupRealtimeRecording(), []);

  async function selectSkill(slug: string) {
    setSelectedSlug(slug);
    setIsMobileListVisible(false);
    setTextDraft("");
    setError("");
    setDetail(await api<SkillDetailType>(`/api/skills/${slug}`));
  }

  async function createSkill(form: FormData) {
    await api<SkillSummary>("/api/skills", {
      method: "POST",
      body: JSON.stringify({
        slug: String(form.get("slug") || ""),
        title: String(form.get("title") || ""),
        target_category: String(form.get("target_category") || "Workflow"),
        output_language: String(form.get("output_language") || "中文"),
        goal: String(form.get("goal") || ""),
        trigger_draft: String(form.get("trigger_draft") || ""),
        notes: String(form.get("notes") || ""),
      }),
    });
    setIsModalOpen(false);
    await loadData();
  }

  async function addText(form: FormData) {
    if (!selectedSlug) return;
    await api<MaterialSummary>(`/api/skills/${selectedSlug}/materials/text`, {
      method: "POST",
      body: JSON.stringify({
        text: String(form.get("text") || ""),
        confidence: String(form.get("confidence") || "medium"),
      }),
    });
    setTextDraft("");
    await loadData();
  }

  async function polishText() {
    const source = textDraftRef.current.trim();
    if (!source) {
      setError("请输入需要润色的文本。");
      return;
    }
    setPolishing(true);
    setError("");
    try {
      const result = await api<{ text: string }>("/api/text/polish", {
        method: "POST",
        body: JSON.stringify({ text: source }),
      });
      setTextDraft(result.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolishing(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRealtimeRecording();
      return;
    }
    try {
      await startRealtimeRecording();
    } catch (err) {
      setError("Microphone access denied or unavailable. " + (err instanceof Error ? err.message : String(err)));
      cleanupRealtimeRecording();
    }
  }

  async function startRealtimeRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error("浏览器不支持实时录音。");

    audioStream.current = stream;
    audioContext.current = new AudioContextClass();
    audioSource.current = audioContext.current.createMediaStreamSource(stream);
    audioProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
    recordingSocket.current = new WebSocket(wsUrl("/api/asr/realtime"));
    recordingSocket.current.binaryType = "arraybuffer";

    resetAsrDraft();
    setError("");
    setTranscribing(true);
    setIsRecording(true);

    recordingSocket.current.onopen = () => {
      if (!audioContext.current || !audioSource.current || !audioProcessor.current) return;
      audioProcessor.current.onaudioprocess = event => {
        if (!recordingSocket.current || recordingSocket.current.readyState !== WebSocket.OPEN || !audioContext.current) return;
        const pcm = floatTo16BitPcm(downsample(event.inputBuffer.getChannelData(0), audioContext.current.sampleRate, 16000));
        event.outputBuffer.getChannelData(0).fill(0);
        if (pcm.byteLength > 0) recordingSocket.current.send(pcm);
      };
      audioSource.current.connect(audioProcessor.current);
      audioProcessor.current.connect(audioContext.current.destination);
    };
    recordingSocket.current.onmessage = event => {
      try {
        handleAsrEvent(JSON.parse(String(event.data)) as AsrStreamEvent);
      } catch (err) {
        setError("Transcription failed: " + (err instanceof Error ? err.message : String(err)));
        setTranscribing(false);
        setIsRecording(false);
        cleanupRealtimeRecording();
      }
    };
    recordingSocket.current.onerror = () => {
      setError("实时识别连接失败。");
      setTranscribing(false);
      setIsRecording(false);
      cleanupRealtimeRecording();
    };
    recordingSocket.current.onclose = () => {
      setIsRecording(false);
      setTranscribing(false);
      cleanupRealtimeRecording(false);
    };
  }

  function stopRealtimeRecording() {
    setIsRecording(false);
    setTranscribing(true);
    audioProcessor.current?.disconnect();
    audioSource.current?.disconnect();
    audioStream.current?.getTracks().forEach(track => track.stop());
    if (recordingSocket.current?.readyState === WebSocket.OPEN) {
      recordingSocket.current.send("stop");
    } else {
      cleanupRealtimeRecording();
      setTranscribing(false);
    }
  }

  function cleanupRealtimeRecording(closeSocket = true) {
    audioProcessor.current?.disconnect();
    audioSource.current?.disconnect();
    audioStream.current?.getTracks().forEach(track => track.stop());
    void audioContext.current?.close().catch(() => undefined);
    if (closeSocket && recordingSocket.current && recordingSocket.current.readyState < WebSocket.CLOSING) {
      recordingSocket.current.close();
    }
    audioProcessor.current = null;
    audioSource.current = null;
    audioStream.current = null;
    audioContext.current = null;
    recordingSocket.current = null;
  }

  async function transcribeOfflineFile(file: File) {
    if (!file.type.startsWith("audio/")) {
      setError("请上传音频文件。");
      return;
    }
    setTranscribing(true);
    setError("");
    resetAsrDraft();
    try {
      const payload = new FormData();
      payload.set("file", file);
      const response = await fetch(apiUrl("/api/asr/text-draft/stream"), {
        method: "POST",
        body: payload,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(errorMessage(text, response.status));
      }
      if (!response.body) throw new Error("浏览器不支持流式响应。");
      await readAsrStream(response.body);
    } catch (err) {
      setError("Transcription failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTranscribing(false);
    }
  }

  function resetAsrDraft() {
    asrBaseText.current = textDraftRef.current.trim();
    asrFinalText.current = "";
    asrPartialText.current = "";
  }

  function handleAsrEvent(event: AsrStreamEvent) {
    if (event.type === "status") return;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") {
      asrPartialText.current = "";
      applyAsrDraft();
      return;
    }
    if (event.type === "text") {
      if (event.final) {
        asrFinalText.current = joinText(asrFinalText.current, event.text);
        asrPartialText.current = "";
      } else {
        asrPartialText.current = event.text;
      }
      applyAsrDraft();
    }
  }

  function applyAsrDraft() {
    const transcript = joinText(asrFinalText.current, asrPartialText.current);
    setTextDraft(joinText(asrBaseText.current, transcript));
  }

  async function readAsrStream(body: ReadableStream<Uint8Array>) {
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
      if (done) break;
    }
    if (buffer.trim()) handleAsrEvent(JSON.parse(buffer) as AsrStreamEvent);
  }

  async function publishSkill() {
    if (!selectedSlug) return;
    const token = publishToken.trim();
    if (!token) {
      setError("发布需要 Admin Token。");
      return;
    }
    try {
      await api<unknown>(`/api/skills/${selectedSlug}/promote`, {
        method: "POST",
        body: "{}",
        headers: { "X-Admin-Token": token },
      });
      setPublishToken("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function useSkill(form: FormData) {
    if (!selectedSlug) return;
    setError("");
    setUseSession("");
    setUseOutput("");
    setUseStatus("正在连接 Agent...");
    setUseRunning(true);
    try {
      const response = await fetch(apiUrl(`/api/skills/${selectedSlug}/use/stream`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: String(form.get("prompt") || ""),
          source: String(form.get("source") || "promoted"),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(errorMessage(text, response.status));
      }
      if (!response.body) throw new Error("浏览器不支持流式响应。");
      await readUseStream(response.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUseRunning(false);
      setUseStatus(current => current === "运行失败" ? current : useOutputRef.current ? "完成" : "");
    }
  }

  async function readUseStream(body: ReadableStream<Uint8Array>) {
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
      if (done) break;
    }
    if (buffer.trim()) handleUseStreamEvent(JSON.parse(buffer) as UseStreamEvent);
  }

  function handleUseStreamEvent(event: UseStreamEvent) {
    if (event.type === "session") {
      setUseSession(event.session_id);
      return;
    }
    if (event.type === "status") {
      setUseStatus(event.message);
      return;
    }
    if (event.type === "delta") {
      setUseOutput(current => {
        const next = current + event.text;
        useOutputRef.current = next;
        return next;
      });
      setUseStatus("正在输出");
      return;
    }
    if (event.type === "error") {
      setUseStatus("运行失败");
      throw new Error(event.message);
    }
    if (event.type === "done") setUseStatus("完成");
  }

  return (
    <div className="app-layout">
      {!isMobileListVisible ? (
        <nav className="mobile-nav">
          <button className="nav-btn" id="back-btn" onClick={() => setIsMobileListVisible(true)}>
            ← Skill 创作列表
          </button>
        </nav>
      ) : null}

      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileVisible={isMobileListVisible}
        onClose={() => setIsSidebarCollapsed(true)}
        onCreate={() => setIsModalOpen(true)}
        onSelect={slug => void selectSkill(slug)}
        selectedSlug={selectedSlug}
        skills={skills}
      />

      <div className={`main-content ${!isMobileListVisible ? "" : "hidden-on-mobile"}`}>
        <div className="desktop-only-flex" style={{ marginBottom: 12, alignItems: "center" }}>
          <button
            className="nav-btn"
            id="toggle-sidebar-btn"
            style={{ fontSize: 20, padding: 4, display: "flex", alignItems: "center", gap: 8 }}
            onClick={() => setIsSidebarCollapsed(value => !value)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            {isSidebarCollapsed ? <span style={{ fontSize: 15, fontWeight: 600 }}>Skill 创作列表</span> : null}
          </button>
        </div>
        {error ? (
          <div className="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        ) : null}
        {detail ? (
          <SkillDetail
            detail={detail}
            isRecording={isRecording}
            jobs={jobs}
            onAddText={addText}
            onFile={file => void transcribeOfflineFile(file)}
            onPublish={() => void publishSkill()}
            onPublishTokenChange={setPublishToken}
            onPolishText={() => void polishText()}
            onTextDraftChange={setTextDraft}
            onToggleRecording={() => void toggleRecording()}
            onUse={useSkill}
            polishing={polishing}
            publishToken={publishToken}
            textDraft={textDraft}
            transcribing={transcribing}
            useOutput={useOutput}
            useRunning={useRunning}
            useSession={useSession}
            useStatus={useStatus}
          />
        ) : (
          <div className="text-muted text-center mt-3">请选择一个 Skill 创作项以开始。</div>
        )}
      </div>

      <CreateSkillModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={createSkill}
      />
    </div>
  );
}
