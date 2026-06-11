import { useEffect, useRef, useState } from "react";

import AudioRecorder from "../components/AudioRecorder";
import CodeEditor from "../components/CodeEditor";
import VideoSnapshot from "../components/VideoSnapshot";
import { apiRequest } from "../lib/api";
import { getToken } from "../lib/auth";

const GEMINI_NATIVE_TAGS = ["native-audio", "native_audio", "native-dialog", "native_dialog"];

function isGeminiNativeModel(model) {
  const name = (model || "").toLowerCase();
  return GEMINI_NATIVE_TAGS.some((tag) => name.includes(tag));
}

const NORMAL_SYSTEM_PROMPT =
  "Ești un intervievator comportamental senior pentru simulări de interviu. Vorbești exclusiv în limba română, cu ton profesionist și empatic. " +
  "Reguli: pune o singură întrebare pe tură; după întrebare, oprește-te și așteaptă răspunsul; " +
  "pune întrebări situaționale și comportamentale (STAR method); " +
  "adaptează tonul în funcție de starea emoțională a candidatului — dacă pare stresat, fii mai blând și încurajator; dacă e încrezător, provoacă-l cu întrebări mai dificile; " +
  "la final oferă feedback constructiv și sfaturi concrete pentru îmbunătățire; " +
  "nu sări la următoarea întrebare fără confirmarea unui răspuns real.";

const TECHNICAL_SYSTEM_PROMPT =
  "Ești un intervievator tehnic senior pentru simulări de interviu de programare. Vorbești exclusiv în limba română, cu ton profesionist și clar. " +
  "Reguli: generează probleme de cod adaptate nivelului candidatului; " +
  "descrie problema clar cu cerințe, restricții și exemple de input/output; " +
  "după ce dai problema, oprește-te și așteaptă ca utilizatorul să scrie codul; " +
  "oferă hint-uri dacă utilizatorul cere ajutor; " +
  "după ce utilizatorul trimite soluția, analizează corectitudinea, complexitatea și calitatea codului; " +
  "pune întrebări de follow-up despre abordare și optimizări posibile; " +
  "nu sări la următoarea problemă fără a discuta soluția curentă.";


function ChatHistory({ messages, scrollRef }) {
  return (
    <section className="surface-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title text-xl">Istoric mesaje</h2>
        <span className="pill text-xs">{messages.length}</span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[420px] min-h-[220px] space-y-3 overflow-y-auto pr-2"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-alt)] px-4 text-center text-sm muted">
            Mesajele vor apărea aici pe măsură ce se desfășoară interviul.
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <article
                key={message.client_id || message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                    isUser
                      ? "border-teal-200 bg-teal-50 text-slate-950"
                      : "border-slate-200 bg-white text-slate-950"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {isUser ? "Tu" : "Intervievator"}
                    </span>
                    {message.partial && <span className="text-[11px] text-slate-500">în curs</span>}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}


export default function Arena() {
  const [interviewMode, setInterviewMode] = useState(null); // null = mode selection, "normal" | "technical"
  const [sessionId, setSessionId] = useState(null);
  const [assistantText, setAssistantText] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [status, setStatus] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiTtsModel, setAiTtsModel] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [avatarGender, setAvatarGender] = useState("female");
  const [voiceGender, setVoiceGender] = useState("female");
  const [ttsVoice, setTtsVoice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [showAvatar, setShowAvatar] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [lastUserText, setLastUserText] = useState("");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [messages, setMessages] = useState([]);
  const [interviewActive, setInterviewActive] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const messagesScrollRef = useRef(null);
  const audioRecorderRef = useRef(null);

  const normalizeSessionId = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && typeof value.id === "string") return value.id;
    return null;
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!getToken()) {
        setProfileStatus("Autentificare necesară pentru a folosi Arena.");
        return;
      }
      try {
        const data = await apiRequest("/profile", { method: "GET" });
        const prefs = data.preferences || {};
        const geminiKey = prefs.geminiApiKey || "";
        const rawModel = prefs.aiModel || "";
        setAiModel(rawModel);
        setAiTtsModel(prefs.aiTtsModel || "gemini-2.5-flash-preview-tts");
        setAvatarGender(prefs.interviewGender || "female");
        setVoiceGender(prefs.voiceGender || prefs.interviewGender || "female");
        setTtsVoice(prefs.ttsVoice || "");
        setProfileName(data.full_name || "");
        setGeminiApiKey(geminiKey);
        if (!geminiKey) {
          setProfileStatus("Cheia Gemini nu este configurată. Mergi la Profil pentru setup.");
        }
      } catch {
        setProfileStatus("Nu am putut încărca preferințele profilului.");
      }
    };
    loadPreferences();
  }, []);

  const fetchHistory = async () => {
    if (!getToken()) return;
    try {
      const data = await apiRequest("/sessions", { method: "GET" });
      setSessionHistory(data || []);
    } catch {
      // ignore
    }
  };

  const normalizeMessage = (message) => ({
    id: message.id,
    client_id: message.client_id || message.id,
    role: message.role,
    content: message.content || "",
    created_at: message.created_at || new Date().toISOString(),
    partial: Boolean(message.partial),
  });

  const loadSessionMessages = async (targetSessionId) => {
    if (!targetSessionId || !getToken()) {
      setMessages([]);
      return;
    }
    try {
      const data = await apiRequest(`/sessions/${targetSessionId}/messages`, { method: "GET" });
      const loaded = (data || []).map(normalizeMessage);
      setMessages(loaded);
      const lastUser = [...loaded].reverse().find((item) => item.role === "user");
      const lastAssistant = [...loaded].reverse().find((item) => item.role === "assistant");
      setLastUserText(lastUser?.content || "");
      setLastAssistantText(lastAssistant?.content || "");
    } catch {
      setMessages([]);
    }
  };

  const upsertTranscriptMessage = ({ role, content, client_id, partial = false }) => {
    const trimmed = (content || "").trim();
    if (!role || !trimmed) return;
    const clientId = client_id || `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMessages((previous) => {
      const existingIndex = previous.findIndex((item) => item.client_id === clientId);
      const nextMessage = normalizeMessage({
        client_id: clientId,
        role,
        content: trimmed,
        partial,
        created_at: new Date().toISOString(),
      });
      if (existingIndex === -1) {
        return [...previous, nextMessage];
      }
      return previous.map((item, index) =>
        index === existingIndex
          ? { ...item, content: trimmed, partial: Boolean(partial), created_at: item.created_at }
          : item
      );
    });
    if (role === "user") setLastUserText(trimmed);
    if (role === "assistant") setLastAssistantText(trimmed);
  };

  const createAndStartSession = async (mode) => {
    if (!getToken()) {
      setStatus("Autentifică-te pentru a crea o sesiune.");
      return;
    }
    setStatus("Creez sesiunea...");
    try {
      const aiContext = {
        difficulty: "medium",
        aiProvider: "gemini",
        aiModel,
        aiTtsModel,
        ttsVoice,
        voiceGender,
        interviewGender: avatarGender,
        profileName,
      };
      const data = await apiRequest("/sessions", {
        method: "POST",
        body: { mode, config: aiContext },
      });
      const newId = data.id;
      setSessionId(newId);
      setInterviewMode(mode);
      setMessages([]);

      setStatus("Pornesc sesiunea...");
      await apiRequest(`/sessions/${newId}/start`, { method: "POST" });

      setShowAvatar(true);
      setInterviewActive(true);
      setAssistantText("");
      setLastUserText("");
      setLastAssistantText("");
      setEmotion(null);
      setStatus("Sesiunea a pornit. Gemini Live este activ.");
      fetchHistory();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const endInterview = async () => {
    if (!sessionId) return;
    try {
      await apiRequest(`/sessions/${sessionId}/end`, { method: "POST" });
      setInterviewActive(false);
      setShowAvatar(false);
      setStatus("Interviul s-a încheiat. Generez raportul...");
      fetchHistory();

      setReportLoading(true);
      try {
        const data = await apiRequest(`/sessions/${sessionId}/report/generate`, { method: "POST" });
        setReport(data.report_json);
        setStatus("Raportul a fost generat.");
      } catch {
        setStatus("Nu am putut genera raportul.");
      } finally {
        setReportLoading(false);
      }
    } catch (error) {
      setStatus(error.message);
    }
  };

  const resetToModeSelection = () => {
    setInterviewMode(null);
    setSessionId(null);
    setInterviewActive(false);
    setShowAvatar(false);
    setAssistantText("");
    setLastUserText("");
    setLastAssistantText("");
    setMessages([]);
    setEmotion(null);
    setStatus("");
    setReport(null);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const node = messagesScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const systemPrompt = interviewMode === "technical" ? TECHNICAL_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;

  // --- MODE SELECTION SCREEN ---
  if (!interviewMode) {
    return (
      <div className="space-y-8 fade-up">
        <header className="space-y-2 text-center">
          <h1 className="hero-title">Arena</h1>
          <p className="hero-subtitle">Alege tipul de interviu pentru a începe simularea.</p>
          {profileStatus && <p className="muted text-sm">{profileStatus}</p>}
        </header>

        <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
          <button
            className="surface-card text-left space-y-3 hover:border-[color:var(--accent)] transition-colors cursor-pointer"
            onClick={() => createAndStartSession("normal")}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xl">
                🎤
              </div>
              <h2 className="text-lg font-semibold">Interviu Normal</h2>
            </div>
            <p className="text-sm muted">
              Interviu comportamental cu întrebări situaționale. AI-ul evaluează comunicarea, starea
              emoțională și oferă feedback constructiv.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="pill">Voce</span>
              <span className="pill">Emoții</span>
              <span className="pill">Feedback</span>
            </div>
          </button>

          <button
            className="surface-card text-left space-y-3 hover:border-[color:var(--accent)] transition-colors cursor-pointer"
            onClick={() => createAndStartSession("technical")}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xl">
                💻
              </div>
              <h2 className="text-lg font-semibold">Interviu Tehnic</h2>
            </div>
            <p className="text-sm muted">
              Probleme de cod generate de AI. Scrie soluția în sandbox, primește review detaliat
              și întrebări de follow-up.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="pill">Cod</span>
              <span className="pill">Review AI</span>
              <span className="pill">Hints</span>
            </div>
          </button>
        </div>

        {sessionHistory.length > 0 && (
          <section className="panel space-y-3 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Istoric sesiuni</h2>
              <button className="btn-ghost text-sm" onClick={fetchHistory}>Reîncarcă</button>
            </div>
            <div className="space-y-2">
              {sessionHistory.map((item) => (
                <div key={item.id} className="surface-card flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="pill">{item.mode || "normal"}</span>
                      <span className="pill">{item.status}</span>
                    </div>
                    <div className="muted text-xs">
                      {item.started_at ? new Date(item.started_at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => {
                      setInterviewMode(item.mode || "normal");
                      setSessionId(item.id);
                      setShowAvatar(true);
                      setInterviewActive(item.status === "in_progress");
                      setReport(null);
                      loadSessionMessages(item.id);
                    }}
                  >
                    Deschide
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // --- INTERVIEW ACTIVE SCREEN ---
  return (
    <div className="space-y-6 fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="hero-title text-2xl">
              {interviewMode === "technical" ? "Interviu Tehnic" : "Interviu Normal"}
            </h1>
            <span className="pill">{interviewActive ? "Live" : "Încheiat"}</span>
          </div>
          <p className="muted text-sm">Model: {aiModel || "implicit"} | Sesiune: {sessionId?.slice(0, 8)}...</p>
        </div>
        <div className="flex gap-2">
          {interviewActive && (
            <button className="btn-secondary" onClick={endInterview}>
              Încheie interviul
            </button>
          )}
          <button className="btn-ghost" onClick={resetToModeSelection}>
            Înapoi
          </button>
        </div>
      </header>

      {/* === NORMAL MODE LAYOUT === */}
      {interviewMode === "normal" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <AudioRecorder
              sessionId={sessionId}
              aiProvider="gemini"
              aiModel={aiModel}
              aiTtsModel={aiTtsModel}
              autoRecord={Boolean(showAvatar && sessionId && interviewActive)}
              geminiApiKey={geminiApiKey}
              interviewGender={avatarGender}
              voiceGender={voiceGender}
              ttsVoice={ttsVoice}
              profileName={profileName}
              systemPrompt={systemPrompt}
              onResponse={(data) => {
                if (data.assistant_text) {
                  setAssistantText((prev) => (prev ? prev + " " + data.assistant_text : data.assistant_text));
                }
              }}
              onTranscript={({ role, content, client_id, partial }) => {
                upsertTranscriptMessage({ role, content, client_id, partial });
              }}
            />

            {showAvatar && (
              <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-alt)] p-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
                  avatarGender === "male" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                }`}>
                  {avatarGender === "male" ? "👨‍💼" : "👩‍💼"}
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {avatarGender === "male" ? "Intervievator" : "Intervievatoare"}
                  </p>
                  <p className="muted">Interviu comportamental</p>
                </div>
              </div>
            )}

            <ChatHistory messages={messages} scrollRef={messagesScrollRef} />
          </div>

          <div className="space-y-4">
            <VideoSnapshot sessionId={sessionId} onEmotion={(data) => setEmotion(data)} />
            {emotion && (
              <div className="surface-card text-sm">
                <span className="muted">Emoție curentă</span>
                <div className="mt-2 flex items-center gap-2">
                  <span className="pill">{emotion.emotion}</span>
                  <span className="muted">{Math.round(emotion.confidence * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === TECHNICAL MODE LAYOUT === */}
      {interviewMode === "technical" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <AudioRecorder
              ref={audioRecorderRef}
              sessionId={sessionId}
              aiProvider="gemini"
              aiModel={aiModel}
              aiTtsModel={aiTtsModel}
              autoRecord={Boolean(showAvatar && sessionId && interviewActive)}
              geminiApiKey={geminiApiKey}
              interviewGender={avatarGender}
              voiceGender={voiceGender}
              ttsVoice={ttsVoice}
              profileName={profileName}
              systemPrompt={systemPrompt}
              onResponse={(data) => {
                if (data.assistant_text) {
                  setAssistantText((prev) => (prev ? prev + " " + data.assistant_text : data.assistant_text));
                }
              }}
              onTranscript={({ role, content, client_id, partial }) => {
                upsertTranscriptMessage({ role, content, client_id, partial });
              }}
            />

            <ChatHistory messages={messages} scrollRef={messagesScrollRef} />
          </div>

          <div className="space-y-4">
            <CodeEditor
              sessionId={sessionId}
              problemDescription={lastAssistantText}
              onReviewComplete={() => loadSessionMessages(sessionId)}
              onSendToInterviewer={(code, language) =>
                audioRecorderRef.current?.sendCodeContext(code, language)
              }
            />
          </div>
        </div>
      )}

      {/* === REPORT === */}
      {reportLoading && (
        <div className="panel text-center py-8">
          <p className="muted">Generez raportul de interviu...</p>
        </div>
      )}

      {report && !reportLoading && (
        <section className="panel space-y-6">
          <h2 className="section-title">Raport Interviu</h2>

          {report.summary && (
            <p className="text-sm" style={{ lineHeight: "1.6" }}>{report.summary}</p>
          )}

          {report.scores && (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {Object.entries(report.scores).map(([key, value]) => (
                <div key={key} className="surface-card text-center">
                  <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{value}/10</p>
                  <p className="muted text-xs mt-1" style={{ textTransform: "capitalize" }}>
                    {key.replace(/_/g, " ")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {report.feedback?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Feedback</h3>
              {report.feedback.map((f, i) => (
                <div key={i} className="surface-card text-sm">
                  <span className="pill mb-2">{f.area}</span>
                  <p className="mt-1">{f.observation}</p>
                  {f.suggestion && <p className="muted mt-1">Sugestie: {f.suggestion}</p>}
                </div>
              ))}
            </div>
          )}

          {report.code_reviews?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Review Cod</h3>
              {report.code_reviews.map((cr, i) => (
                <div key={i} className="surface-card text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="muted">{cr.problem}</span>
                    <span className="pill">{cr.score}/10</span>
                  </div>
                  <p>{cr.feedback}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {report.strengths?.length > 0 && (
              <div className="surface-card">
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--accent)" }}>Puncte forte</h3>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {report.improvements?.length > 0 && (
              <div className="surface-card">
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--highlight)" }}>De îmbunătățit</h3>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {report.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {status && <p className="muted text-sm">{status}</p>}
    </div>
  );
}
