import { useEffect, useState } from "react";

import AudioRecorder from "../components/AudioRecorder";
import CodeEditor from "../components/CodeEditor";
import VideoSnapshot from "../components/VideoSnapshot";
import { apiRequest } from "../lib/api";
import { getToken } from "../lib/auth";


export default function Arena() {
  const [sessionId, setSessionId] = useState(null);
  const [assistantText, setAssistantText] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [status, setStatus] = useState("");
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiTtsModel, setAiTtsModel] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [avatarGender, setAvatarGender] = useState("female");
  const [profileName, setProfileName] = useState("");
  const [showAvatar, setShowAvatar] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!getToken()) {
        setProfileStatus("Autentificare necesară pentru a folosi Arena.");
        return;
      }
      try {
        const data = await apiRequest("/profile", { method: "GET" });
        setAiProvider(data.preferences?.aiProvider || "openai");
        setAiModel(data.preferences?.aiModel || "");
        setAiTtsModel(data.preferences?.aiTtsModel || "");
        setAvatarGender(data.preferences?.interviewGender || "female");
        setProfileName(data.full_name || "");
      } catch (error) {
        setProfileStatus("Could not load profile preferences.");
      }
    };
    loadPreferences();
  }, []);

  const fetchHistory = async () => {
    if (!getToken()) {
      return;
    }
    try {
      const data = await apiRequest("/sessions", { method: "GET" });
      setSessionHistory(data || []);
    } catch {
      // ignore to keep UI clean
    }
  };

  const createSession = async () => {
    if (!getToken()) {
      setStatus("Autentifică-te pentru a crea o sesiune.");
      return;
    }
    setStatus("Creating session...");
    try {
      const data = await apiRequest("/sessions", {
        method: "POST",
        body: { config: { mode: "voice", difficulty: "medium" } }
      });
      setSessionId(data.id);
      setStatus("Session ready.");
      fetchHistory();
      return data.id;
    } catch (error) {
      setStatus(error.message);
    }
  };

  const startSession = async () => {
    if (!getToken()) {
      setStatus("Autentifică-te pentru a porni sesiunea.");
      return;
    }
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const newId = await createSession();
      if (!newId) {
        return;
      }
      activeSessionId = newId;
    }
    setStatus("Starting session...");
    try {
      await apiRequest(`/sessions/${activeSessionId}/start`, { method: "POST" });
      setSessionId(activeSessionId);
      const greeting = `Hello ${profileName || "there"}, how are you today?`;
      setAssistantText(greeting);
      setShowAvatar(true);
      setStatus("Session started.");
      fetchHistory();
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="space-y-8 fade-up">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="hero-title">The Arena</h1>
          <p className="hero-subtitle">
            Voice-first interview simulation with emotion tracking and technical drills.
          </p>
        </div>
        <div className="surface-card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={createSession}>
              Create Session
            </button>
            <button className="btn-ghost" onClick={startSession}>
              Start Session
            </button>
          </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="pill">Mode: Voice</span>
          {sessionId && <span className="muted">Session: {sessionId}</span>}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <span className="muted">AI provider: {aiProvider}</span>
          <span className="muted">
            {sessionHistory.length > 0 ? `Sessions: ${sessionHistory.length}` : ""}
          </span>
          {profileStatus && <span className="muted">{profileStatus}</span>}
        </div>
      </div>
    </header>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Voice Loop & Emotion Tracking</h2>
          <div className="pill">Live</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <AudioRecorder
              sessionId={sessionId}
              aiProvider={aiProvider}
              aiModel={aiModel}
              aiTtsModel={aiTtsModel}
              onResponse={(data) => setAssistantText(data.assistant_text)}
            />
            {showAvatar && (
              <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-alt)] p-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
                    avatarGender === "male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                  }`}
                >
                  {avatarGender === "male" ? "👨‍💼" : "👩‍💼"}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {avatarGender === "male" ? "Coach (Male)" : "Coach (Female)"}
                  </p>
                  <p className="muted">Live interviewer avatar</p>
                </div>
              </div>
            )}
            {assistantText && (
              <div className="surface-card">
                <p className="muted text-sm">Coach response</p>
                <p className="mt-2">{assistantText}</p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <VideoSnapshot sessionId={sessionId} onEmotion={(data) => setEmotion(data)} />
            {emotion && (
              <div className="surface-card text-sm">
                <span className="muted">Current emotion</span>
                <div className="mt-2 flex items-center gap-2">
                  <span className="pill">{emotion.emotion}</span>
                  <span className="muted">
                    {Math.round(emotion.confidence * 100)}% confidence
                  </span>
                </div>
                {emotion.raw_scores && (
                  <pre className="mt-2 rounded-lg bg-[color:var(--surface-alt)] p-2 text-xs text-left text-slate-700">
                    {JSON.stringify(emotion.raw_scores, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="section-title">Technical Challenge</h2>
        <CodeEditor sessionId={sessionId} />
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Session History</h2>
          <button className="btn-ghost text-sm" onClick={fetchHistory}>
            Refresh
          </button>
        </div>
        {sessionHistory.length === 0 ? (
          <p className="muted text-sm">No sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {sessionHistory.map((item) => (
              <div
                key={item.id}
                className="surface-card flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="pill">{item.status}</span>
                    <span className="muted">{item.id}</span>
                  </div>
                  <div className="muted">
                    Started: {item.started_at ? new Date(item.started_at).toLocaleString() : "-"} | Ended:{" "}
                    {item.ended_at ? new Date(item.ended_at).toLocaleString() : "-"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs">
                  <div className="muted">
                    Created: {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => {
                        setSessionId(item.id);
                        setShowAvatar(false);
                        setAssistantText("");
                        setEmotion(null);
                        setStatus("Session loaded. Click Start Session to resume.");
                      }}
                    >
                      Load
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => {
                        setSessionId(item.id);
                        startSession();
                      }}
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {status && <p className="muted text-sm">{status}</p>}
    </div>
  );
}
