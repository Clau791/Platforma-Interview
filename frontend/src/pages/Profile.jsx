import { useEffect, useRef, useState } from "react";

import { apiRequest } from "../lib/api";


export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("");
  const [aiProvider] = useState("gemini");
  const [fullName, setFullName] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [voiceGender, setVoiceGender] = useState("female");
  const [interviewGender, setInterviewGender] = useState("female");
  const [ttsVoice, setTtsVoice] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiTtsModel, setAiTtsModel] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [geminiVoices, setGeminiVoices] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [voiceProbeLoading, setVoiceProbeLoading] = useState(false);
  const [voiceProbeResults, setVoiceProbeResults] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAudioRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      setStatus("Încarc profilul...");
      try {
        const data = await apiRequest("/profile", { method: "GET" });
        setProfile(data);
        setFullName(data.full_name || "");
        const preferences = data.preferences || {};
        setGeminiApiKey(preferences.geminiApiKey || "");
        setVoiceGender(preferences.voiceGender || "female");
        setInterviewGender(preferences.interviewGender || "female");
        setTtsVoice(preferences.ttsVoice || "");
        setAiModel(preferences.aiModel || "");
        setAiTtsModel(preferences.aiTtsModel || "");
        if (preferences.availableModels && preferences.availableModels.gemini) {
          setAvailableModels(preferences.availableModels.gemini);
        } else {
          setAvailableModels([]);
        }
        setStatus("");
      } catch (error) {
        setStatus(error.message);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    const preferences = profile?.preferences || {};
    const cached = preferences.availableModels?.[aiProvider] || [];
    setAvailableModels(cached);
  }, [aiProvider, profile]);

  useEffect(() => {
    const loadGeminiVoices = async () => {
      if (aiProvider !== "gemini") {
        return;
      }
      try {
        const data = await apiRequest("/models/gemini/voices", { method: "GET" });
        setGeminiVoices(data.voices || []);
      } catch {
        setGeminiVoices([]);
      }
    };
    loadGeminiVoices();
  }, [aiProvider]);

  const validateKey = async () => {
    setLoadingModels(true);
    setStatus("Validez cheia și încarc modelele...");
    const key = geminiApiKey;
    try {
      const data = await apiRequest(`/models/validate?provider=${aiProvider}`, {
        method: "POST",
        body: {
          api_key: key || null,
          limit: 200,
        },
      });
      setAvailableModels(data.models || []);
      if (data.selected_model) {
        setAiModel(data.selected_model);
      }
      if (data.selected_tts_model) {
        setAiTtsModel(data.selected_tts_model);
      }
      if (key) {
        setGeminiApiKey(key);
      }
      setProfile((prev) => {
        if (!prev) return prev;
        const existingPrefs = prev.preferences || {};
        const nextAvailable = {
          ...(existingPrefs.availableModels || {}),
          [aiProvider]: data.models || [],
        };
        const nextPrefs = {
          ...existingPrefs,
          aiProvider,
          availableModels: nextAvailable,
          aiModel: data.selected_model || aiModel,
          aiTtsModel: data.selected_tts_model || aiTtsModel,
          ...(key ? { geminiApiKey: key } : {}),
        };
        return { ...prev, preferences: nextPrefs };
      });
      setStatus("Cheie validată. Modelele au fost memorate.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoadingModels(false);
    }
  };

  const updateProfile = async () => {
    if (!profile) {
      return;
    }
    setStatus("Salvez...");
    try {
      const data = await apiRequest("/profile", {
        method: "PUT",
        body: {
          experience_level: profile.experience_level,
          target_role: profile.target_role,
          technologies: profile.technologies,
          full_name: fullName,
          preferences: {
            ...(profile.preferences || {}),
            aiProvider: "gemini",
            geminiApiKey,
            voiceGender,
            interviewGender,
            ttsVoice,
            aiModel,
            aiTtsModel,
          },
        },
      });
      setProfile(data);
      setFullName(data.full_name || fullName);
      const preferences = data.preferences || {};
      setGeminiApiKey(preferences.geminiApiKey || "");
      setVoiceGender(preferences.voiceGender || voiceGender);
      setInterviewGender(preferences.interviewGender || interviewGender);
      setTtsVoice(preferences.ttsVoice || ttsVoice);
      setAiModel(preferences.aiModel || aiModel);
      setAiTtsModel(preferences.aiTtsModel || aiTtsModel);
      setStatus("Salvat.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const probeGeminiVoices = async () => {
    setVoiceProbeLoading(true);
    setStatus("Testez vocile Gemini disponibile...");
    try {
      const data = await apiRequest("/models/gemini/voices/probe", {
        method: "POST",
        body: {
          api_key: geminiApiKey || null,
          model: aiTtsModel || "gemini-2.5-flash-preview-tts",
        },
      });
      setVoiceProbeResults(data.results || []);
      const okCount = (data.results || []).filter((item) => item.available).length;
      setStatus(`Probe complet: ${okCount}/${(data.results || []).length} voci disponibile.`);
    } catch (error) {
      setStatus(error.message);
      setVoiceProbeResults([]);
    } finally {
      setVoiceProbeLoading(false);
    }
  };

  const previewSelectedVoice = async () => {
    const voiceToPreview =
      ttsVoice || (voiceGender === "male" ? "Puck" : "Kore");
    if (!geminiApiKey) {
      setStatus("Adaugă mai întâi cheia Gemini API.");
      return;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewLoading(true);
    setStatus(`Generez sample audio pentru vocea ${voiceToPreview}...`);
    try {
      const data = await apiRequest("/models/gemini/voices/preview", {
        method: "POST",
        body: {
          voice: voiceToPreview,
          api_key: geminiApiKey,
          model: aiTtsModel || "gemini-2.5-flash-preview-tts",
        },
      });
      const binary = atob(data.audio_b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mime_type || "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      previewAudioRef.current = audio;
      await audio.play();
      setStatus(`Redau vocea ${voiceToPreview}.`);
    } catch (err) {
      setStatus(`Eroare preview voce: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  if (!profile) {
    return <p className="muted text-sm">{status || "Profilul nu a fost încărcat."}</p>;
  }

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="hero-title">Profilul tău</h1>
          <p className="hero-subtitle">
            Ține rolul țintă și stack-ul tehnic actualizate pentru întrebări de interviu
            mai relevante.
          </p>
        </div>
        <span className="pill">Setări profil</span>
      </div>

      <div className="surface-card space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="form-label">Nume complet</span>
            <input
              className="input-field"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">Nivel experiență</span>
            <input
              className="input-field"
              value={profile.experience_level || ""}
              onChange={(event) =>
                setProfile({ ...profile, experience_level: event.target.value })
              }
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">Rol țintă</span>
            <input
              className="input-field"
              value={profile.target_role || ""}
              onChange={(event) =>
                setProfile({ ...profile, target_role: event.target.value })
              }
            />
          </label>
          <div className="space-y-2">
            <span className="form-label">Provider AI</span>
            <div className="input-field bg-[color:var(--surface-alt)]">Gemini</div>
          </div>
          <label className="space-y-2">
            <span className="form-label">Model AI</span>
            <input
              className="input-field"
              value={aiModel}
              onChange={(event) => setAiModel(event.target.value)}
              placeholder="Lasă gol pentru modelul implicit"
            />
            <span className="muted text-xs">
              Validează cheia și alege din modelele disponibile. Pentru Gemini sunt afișate doar modele native
              dialog/audio.
            </span>

            {availableModels.length > 0 && (
              <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-alt)] p-2 text-xs text-slate-700">
                <div className="flex flex-wrap gap-2">
                  {availableModels.map((m) => (
                    <button
                      type="button"
                      key={m}
                      className={`pill ${aiModel === m ? "border border-[color:var(--accent)]" : ""}`}
                      onClick={() => setAiModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </label>
          <label className="space-y-2">
            <span className="form-label">Tip voce</span>
            <select
              className="input-field"
              value={voiceGender}
              onChange={(event) => setVoiceGender(event.target.value)}
            >
              <option value="female">Feminin</option>
              <option value="male">Masculin</option>
            </select>
            <span className="muted text-xs">Genul vocii intervievatorului Gemini Live.</span>
          </label>
          <label className="space-y-2">
            <span className="form-label">Avatar intervievator</span>
            <select
              className="input-field"
              value={interviewGender}
              onChange={(event) => setInterviewGender(event.target.value)}
            >
              <option value="female">Feminin</option>
              <option value="male">Masculin</option>
            </select>
            <span className="muted text-xs">Controalează avatarul și vocea implicită a coach-ului.</span>
          </label>
          <label className="space-y-2">
              <span className="form-label">Gemini API Key</span>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type="password"
                  placeholder="Adaugă cheia Gemini API"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                />
                <button type="button" className="btn-ghost text-xs whitespace-nowrap" onClick={validateKey} disabled={loadingModels}>
                  Validează cheia
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs whitespace-nowrap"
                  onClick={probeGeminiVoices}
                  disabled={voiceProbeLoading}
                >
                  Probe voci
                </button>
              </div>
              <span className="muted text-xs">Adaugă cheia Gemini API pentru providerul Gemini.</span>
              <span className="muted text-xs">
                După validare, providerul activ devine Gemini și modelul este selectat automat.
              </span>
            </label>
          <label className="space-y-2">
            <span className="form-label">Voce Gemini (TTS)</span>
            <div className="flex gap-2">
              <select
                className="input-field flex-1"
                value={ttsVoice}
                onChange={(event) => setTtsVoice(event.target.value)}
              >
                <option value="">Auto după gen (male/female)</option>
                {geminiVoices.map((voiceName) => (
                  <option key={voiceName} value={voiceName}>
                    {voiceName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost text-xs whitespace-nowrap"
                onClick={previewSelectedVoice}
                disabled={previewLoading}
                title="Ascultă un sample al vocii selectate"
              >
                {previewLoading ? "..." : "▶ Ascultă"}
              </button>
            </div>
            <span className="muted text-xs">
              Dacă alegi o voce explicită, are prioritate peste setarea Female/Male.
            </span>
            {voiceProbeResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-alt)] p-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  {voiceProbeResults.map((item) => (
                    <button
                      type="button"
                      key={item.voice}
                      onClick={() => {
                        if (item.available) setTtsVoice(item.voice);
                      }}
                      className={`pill ${item.available ? "border border-emerald-500" : "border border-rose-400"} ${
                        ttsVoice === item.voice ? "ring-1 ring-[color:var(--accent)]" : ""
                      }`}
                      title={item.error || ""}
                    >
                      {item.voice}: {item.available ? "OK" : "NOK"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="form-label">Tehnologii</span>
            <input
              className="input-field"
              value={(profile.technologies || []).join(", ")}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  technologies: event.target.value.split(",").map((item) => item.trim()),
                })
              }
            />
          </label>
        </div>
        <button className="btn-primary" onClick={updateProfile}>
          Salvează profilul
        </button>
        {status && <p className="muted text-sm">{status}</p>}
      </div>
    </div>
  );
}
