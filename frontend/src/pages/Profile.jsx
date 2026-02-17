import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";


export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("");
  const [aiProvider, setAiProvider] = useState("openai");
  const [fullName, setFullName] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [voiceGender, setVoiceGender] = useState("female");
  const [interviewGender, setInterviewGender] = useState("female");
  const [aiModel, setAiModel] = useState("");
  const [aiTtsModel, setAiTtsModel] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      setStatus("Loading profile...");
      try {
        const data = await apiRequest("/profile", { method: "GET" });
        setProfile(data);
        setFullName(data.full_name || "");
        const preferences = data.preferences || {};
        setAiProvider(preferences.aiProvider || "openai");
        setOpenaiApiKey(preferences.openaiApiKey || "");
        setGeminiApiKey(preferences.geminiApiKey || "");
        setVoiceGender(preferences.voiceGender || "female");
        setInterviewGender(preferences.interviewGender || "female");
        setAiModel(preferences.aiModel || "");
        setAiTtsModel(preferences.aiTtsModel || "");
        if (preferences.availableModels && preferences.availableModels[aiProvider]) {
          setAvailableModels(preferences.availableModels[aiProvider]);
        }
        setStatus("");
      } catch (error) {
        setStatus(error.message);
      }
    };
    loadProfile();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    setStatus("Loading models...");
    try {
      const data = await apiRequest(`/models?provider=${aiProvider}&limit=200`, { method: "GET" });
      setAvailableModels(data.models || []);
      setStatus("");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoadingModels(false);
    }
  };

  const validateKey = async () => {
    setLoadingModels(true);
    setStatus("Validating key and fetching models...");
    const key = aiProvider === "openai" ? openaiApiKey : geminiApiKey;
    try {
      const data = await apiRequest(
        `/models/validate?provider=${aiProvider}&limit=200&api_key=${encodeURIComponent(key || "")}`,
        { method: "POST" }
      );
      setAvailableModels(data.models || []);
      // also persist key by updating local prefs fields
      if (aiProvider === "openai" && key) {
        setOpenaiApiKey(key);
      }
      if (aiProvider === "gemini" && key) {
        setGeminiApiKey(key);
      }
      setStatus("Key validated and models cached.");
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
    setStatus("Saving...");
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
            aiProvider,
            openaiApiKey,
            geminiApiKey,
            voiceGender,
            interviewGender,
            aiModel,
            aiTtsModel,
          },
        },
      });
      setProfile(data);
      setFullName(data.full_name || fullName);
      const preferences = data.preferences || {};
      setAiProvider(preferences.aiProvider || aiProvider);
      setOpenaiApiKey(preferences.openaiApiKey || "");
      setGeminiApiKey(preferences.geminiApiKey || "");
      setVoiceGender(preferences.voiceGender || voiceGender);
      setInterviewGender(preferences.interviewGender || interviewGender);
      setAiModel(preferences.aiModel || aiModel);
      setAiTtsModel(preferences.aiTtsModel || aiTtsModel);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!profile) {
    return <p className="muted text-sm">{status || "No profile loaded"}</p>;
    }

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="hero-title">Your profile</h1>
          <p className="hero-subtitle">
            Keep your target role and tech stack up to date for smarter interview
            questions.
          </p>
        </div>
        <span className="pill">Profile Settings</span>
      </div>

      <div className="surface-card space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="form-label">Full name</span>
            <input
              className="input-field"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">Experience level</span>
            <input
              className="input-field"
              value={profile.experience_level || ""}
              onChange={(event) =>
                setProfile({ ...profile, experience_level: event.target.value })
              }
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">Target role</span>
            <input
              className="input-field"
              value={profile.target_role || ""}
              onChange={(event) =>
                setProfile({ ...profile, target_role: event.target.value })
              }
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">AI Provider</span>
            <select
              className="input-field"
              value={aiProvider}
              onChange={(event) => setAiProvider(event.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="form-label">AI Model</span>
            <input
              className="input-field"
              value={aiModel}
              onChange={(event) => setAiModel(event.target.value)}
              placeholder="Lasă gol pentru modelul implicit"
            />
            <span className="muted text-xs">
              Validate Your API key and choose from available models below.
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
          {aiProvider === "openai" && (
            <label className="space-y-2">
              <span className="form-label">OpenAI API Key</span>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type="password"
                  placeholder="Add OpenAI API KEY"
                  value={openaiApiKey}
                  onChange={(event) => setOpenaiApiKey(event.target.value)}
                />
                <button type="button" className="btn-ghost text-xs whitespace-nowrap" onClick={validateKey} disabled={loadingModels}>
                  Validate key
                </button>
              </div>
              <span className="muted text-xs">Stored in your profile preferences.</span>
            </label>
          )}
          <label className="space-y-2">
            <span className="form-label">Voice model</span>
            <select
              className="input-field"
              value={voiceGender}
              onChange={(event) => setVoiceGender(event.target.value)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <span className="muted text-xs">
              Folosit pentru vocea TTS (OpenAI: female→nova, male→onyx).
            </span>
          </label>
          {aiProvider === "openai" && (
            <label className="space-y-2">
              <span className="form-label">TTS Model (OpenAI)</span>
              <select
                className="input-field"
                value={aiTtsModel}
                onChange={(event) => setAiTtsModel(event.target.value)}
              >
                <option value="">Default (env)</option>
                <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
                <option value="tts-1">tts-1</option>
                <option value="tts-1-hd">tts-1-hd</option>
              </select>
              <span className="muted text-xs">Modelul TTS folosit la răspunsuri audio.</span>
            </label>
          )}
          <label className="space-y-2">
            <span className="form-label">Interviewer avatar</span>
            <select
              className="input-field"
              value={interviewGender}
              onChange={(event) => setInterviewGender(event.target.value)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <span className="muted text-xs">Controalează avatarul și vocea implicită a coach-ului.</span>
          </label>
          {aiProvider === "gemini" && (
            <label className="space-y-2">
              <span className="form-label">Gemini API Key</span>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type="password"
                  placeholder="Add Gemini API KEY"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                />
                <button type="button" className="btn-ghost text-xs whitespace-nowrap" onClick={validateKey} disabled={loadingModels}>
                  Validate key
                </button>
              </div>
              <span className="muted text-xs">Add Gemini API KEY for the Gemini provider.</span>
            </label>
          )}
          <label className="space-y-2 md:col-span-2">
            <span className="form-label">Technologies</span>
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
          Save Profile
        </button>
        {status && <p className="muted text-sm">{status}</p>}
      </div>
    </div>
  );
}
