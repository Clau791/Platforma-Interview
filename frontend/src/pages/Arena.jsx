import { useEffect, useState } from "react";

import AudioRecorder from "../components/AudioRecorder";
import CodeEditor from "../components/CodeEditor";
import VideoSnapshot from "../components/VideoSnapshot";
import { apiRequest } from "../lib/api";
import { getToken } from "../lib/auth";

const GEMINI_NATIVE_TAGS = ["native-audio", "native_audio", "native-dialog", "native_dialog"];
const MALE_VOICE_HINTS = ["male", "mascul", "barbat", "man", "onyx", "puck", "alex", "daniel", "radu"];
const FEMALE_VOICE_HINTS = ["female", "fem", "femeie", "woman", "nova", "kore", "ana", "ioana", "alina"];
const PLACEHOLDER_KEYS = ["", "change_me", "your_api_key", "your_api_key_here"];

function isGeminiNativeModel(model) {
  const name = (model || "").toLowerCase();
  return GEMINI_NATIVE_TAGS.some((tag) => name.includes(tag));
}

function pickRomanianVoice(preferredGender = "female") {
  if (!("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) {
    return null;
  }
  const gender = String(preferredGender || "female").toLowerCase();
  const hints = gender === "male" ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;
  const oppositeHints = gender === "male" ? FEMALE_VOICE_HINTS : MALE_VOICE_HINTS;
  const scored = voices.map((voice) => {
    const haystack = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
    let score = 0;
    if (hints.some((hint) => haystack.includes(hint))) {
      score += 10;
    }
    if (oppositeHints.some((hint) => haystack.includes(hint))) {
      score -= 4;
    }
    if (String(voice.lang || "").toLowerCase().startsWith("ro")) {
      score += 4;
    }
    if (voice.default) {
      score += 1;
    }
    return { voice, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0]) {
    return scored[0].voice;
  }
  return (
    voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("ro")) ||
    voices.find((voice) => voice.default) ||
    voices[0]
  );
}


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
  const [voiceGender, setVoiceGender] = useState("female");
  const [ttsVoice, setTtsVoice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [showAvatar, setShowAvatar] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const useGeminiLive = aiProvider === "gemini" && isGeminiNativeModel(aiModel);

  const hasRealOpenAiKey = (key) =>
    Boolean(key) && !PLACEHOLDER_KEYS.includes(String(key || "").trim().toLowerCase());

  const normalizeSessionId = (value) => {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object" && typeof value.id === "string") {
      return value.id;
    }
    return null;
  };

  const speakBrowserText = (text) => {
    if (!text || !("speechSynthesis" in window)) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickRomanianVoice(voiceGender || avatarGender || "female");
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "ro-RO";
    } else {
      utterance.lang = "ro-RO";
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const playDataAudio = async (ttsAudioUrl) => {
    if (!ttsAudioUrl) {
      return false;
    }
    try {
      const audio = new Audio(ttsAudioUrl);
      await audio.play();
      setLastAudioUrl(ttsAudioUrl);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return;
    }
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
        let provider = prefs.aiProvider || "openai";
        const openaiKey = prefs.openaiApiKey || "";
        const geminiKey = prefs.geminiApiKey || "";
        if (provider === "openai" && !hasRealOpenAiKey(openaiKey) && geminiKey) {
          provider = "gemini";
          setProfileStatus(
            "Providerul a fost trecut automat pe Gemini deoarece cheia OpenAI este lipsă/invalidă."
          );
        } else {
          setProfileStatus("");
        }
        const rawModel = prefs.aiModel || "";
        const normalizedModel =
          provider === "gemini" && rawModel && !String(rawModel).toLowerCase().includes("gemini")
            ? ""
            : rawModel;
        setAiProvider(provider);
        setAiModel(normalizedModel);
        setAiTtsModel(
          provider === "gemini"
            ? prefs.aiTtsModel || "gemini-2.5-flash-preview-tts"
            : prefs.aiTtsModel || ""
        );
        setAvatarGender(prefs.interviewGender || "female");
        setVoiceGender(prefs.voiceGender || prefs.interviewGender || "female");
        setTtsVoice(prefs.ttsVoice || "");
        setProfileName(data.full_name || "");
        setGeminiApiKey(geminiKey);
      } catch (error) {
        setProfileStatus("Nu am putut încărca preferințele profilului.");
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
    setStatus("Creez sesiunea...");
    try {
      const data = await apiRequest("/sessions", {
        method: "POST",
        body: { config: { mode: "voice", difficulty: "medium" } }
      });
      setSessionId(data.id);
      setStatus("Sesiunea este pregătită.");
      fetchHistory();
      return data.id;
    } catch (error) {
      setStatus(error.message);
    }
  };

  const startSession = async (targetSessionId = null) => {
    if (!getToken()) {
      setStatus("Autentifică-te pentru a porni sesiunea.");
      return;
    }
    let activeSessionId = normalizeSessionId(targetSessionId) || normalizeSessionId(sessionId);
    if (!activeSessionId) {
      const newId = await createSession();
      if (!newId) {
        return;
      }
      activeSessionId = newId;
    }
    if (typeof activeSessionId !== "string") {
      setStatus("ID-ul sesiunii este invalid. Reîncearcă după creare sesiune.");
      return;
    }
    setAssistantText("");
    setStatus("Pornesc sesiunea...");
    try {
      await apiRequest(`/sessions/${activeSessionId}/start`, { method: "POST" });
      setSessionId(activeSessionId);

      if (useGeminiLive) {
        // In Gemini Live we let the live websocket deliver the greeting/question.
        // Avoid duplicate welcome voices from mixed pipelines.
        setShowAvatar(true);
        setStatus("Sesiunea a pornit. Fluxul vocal Gemini Live este activ.");
        fetchHistory();
        return;
      }

      const fallbackWelcome = `Bună, ${profileName || "candidat"}! Începem interviul.`;
      setAssistantText(fallbackWelcome);

      try {
        const welcomeFormData = new FormData();
        welcomeFormData.append("ai_provider", aiProvider);
        if (aiModel) welcomeFormData.append("ai_model", aiModel);
        if (aiTtsModel) welcomeFormData.append("ai_tts_model", aiTtsModel);
        if (ttsVoice) welcomeFormData.append("tts_voice", ttsVoice);
        if (voiceGender) welcomeFormData.append("voice_gender", voiceGender);
        if (avatarGender) welcomeFormData.append("interview_gender", avatarGender);
        if (profileName) welcomeFormData.append("full_name", profileName);

        const welcome = await apiRequest(`/sessions/${activeSessionId}/welcome`, {
          method: "POST",
          body: welcomeFormData
        });
        const welcomeText =
          (welcome?.assistant_text || "").trim() || fallbackWelcome;
        setAssistantText(welcomeText);
        const played = await playDataAudio(welcome?.tts_audio_url || "");
        if (!played) {
          speakBrowserText(welcomeText);
        }
      } catch {
        // Keep session start resilient even if welcome generation fails.
        speakBrowserText(fallbackWelcome);
      }
      setShowAvatar(true);
      setStatus(
        useGeminiLive
          ? "Sesiunea a pornit. Fluxul vocal Gemini Live este activ."
          : "Sesiunea a pornit. Captura vocală automată este activă."
      );
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
          <h1 className="hero-title">Arena</h1>
          <p className="hero-subtitle">
            Simulare de interviu orientată pe voce, cu urmărire emoții și exerciții tehnice.
          </p>
        </div>
        <div className="surface-card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={createSession}>
              Creează sesiune
            </button>
            <button className="btn-ghost" onClick={() => startSession()}>
              Pornește sesiunea
            </button>
          </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="pill">Mod: Voce</span>
          {sessionId && <span className="muted">Sesiune: {sessionId}</span>}
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <span className="muted">Provider AI: {aiProvider}</span>
          <span className="muted">
            Flux voce: {useGeminiLive ? "Gemini Live" : "Standard backend"}
          </span>
          <span className="muted">Model: {aiModel || "implicit"}</span>
          <span className="muted">Voce TTS: {ttsVoice || `auto (${voiceGender || "female"})`}</span>
          <span className="muted">
            {sessionHistory.length > 0 ? `Sesiuni: ${sessionHistory.length}` : ""}
          </span>
          {profileStatus && <span className="muted">{profileStatus}</span>}
        </div>
      </div>
    </header>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Flux vocal și urmărire emoții</h2>
          <div className="pill">Live</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <AudioRecorder
              sessionId={sessionId}
              aiProvider={aiProvider}
              aiModel={aiModel}
              aiTtsModel={aiTtsModel}
              autoRecord={Boolean(showAvatar && sessionId)}
              geminiApiKey={geminiApiKey}
              interviewGender={avatarGender}
              voiceGender={voiceGender}
              ttsVoice={ttsVoice}
              profileName={profileName}
              onResponse={(data) => {
                setAssistantText(data.assistant_text);
                if (data.tts_audio_url) {
                  setLastAudioUrl(data.tts_audio_url);
                }
              }}
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
                    {avatarGender === "male" ? "Intervievator (Bărbat)" : "Intervievator (Femeie)"}
                  </p>
                  <p className="muted">Avatar intervievator live</p>
                </div>
              </div>
            )}
            {assistantText && (
              <div className="surface-card">
                <p className="muted text-sm">Răspuns intervievator</p>
                <p className="mt-2">{assistantText}</p>
                {lastAudioUrl && (
                  <button
                    className="btn-ghost mt-3 text-xs"
                    onClick={async () => {
                      const audio = new Audio(lastAudioUrl);
                      await audio.play();
                    }}
                  >
                    Redă din nou vocea
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <VideoSnapshot sessionId={sessionId} onEmotion={(data) => setEmotion(data)} />
            {emotion && (
              <div className="surface-card text-sm">
                <span className="muted">Emoție curentă</span>
                <div className="mt-2 flex items-center gap-2">
                  <span className="pill">{emotion.emotion}</span>
                  <span className="muted">
                    {Math.round(emotion.confidence * 100)}% încredere
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
        <h2 className="section-title">Provocare tehnică</h2>
        <CodeEditor sessionId={sessionId} />
      </section>

      <section className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Istoric sesiuni</h2>
          <button className="btn-ghost text-sm" onClick={fetchHistory}>
            Reîncarcă
          </button>
        </div>
        {sessionHistory.length === 0 ? (
          <p className="muted text-sm">Nu există sesiuni încă.</p>
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
                    Start: {item.started_at ? new Date(item.started_at).toLocaleString() : "-"} | Final:{" "}
                    {item.ended_at ? new Date(item.ended_at).toLocaleString() : "-"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs">
                  <div className="muted">
                    Creată: {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => {
                        setSessionId(item.id);
                        setShowAvatar(false);
                        setAssistantText("");
                        setEmotion(null);
                        setStatus("Sesiunea a fost încărcată. Apasă „Pornește sesiunea” pentru reluare.");
                      }}
                    >
                      Încarcă
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => {
                        startSession(item.id);
                      }}
                    >
                      Reia
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
