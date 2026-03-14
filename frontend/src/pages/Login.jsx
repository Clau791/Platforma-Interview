import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../lib/api";
import { setToken } from "../lib/auth";


export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("junior");
  const [targetRole, setTargetRole] = useState("Frontend Developer");
  const [technologies, setTechnologies] = useState("React,JavaScript");
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState("");
  const [mode, setMode] = useState("login");

  const handleLogin = async () => {
    setStatus("Autentificare...");
    setFormError("");
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      setToken(data.access_token);
      setStatus("Autentificat.");
      navigate("/arena");
    } catch (error) {
      setStatus(error.message);
      setFormError("");
    }
  };

  const handleRegister = async () => {
    setStatus("Înregistrare...");
    setFormError("");

    if (password.length < 8) {
      setFormError("Parola trebuie să aibă minim 8 caractere.");
      setStatus("");
      return;
    }
    if (fullName.trim().length < 2) {
      setFormError("Te rugăm să adaugi numele complet (minim 2 caractere).");
      setStatus("");
      return;
    }
    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: {
          email,
          full_name: fullName,
          password,
          experience_level: experienceLevel,
          target_role: targetRole,
          technologies: technologies.split(",").map((item) => item.trim())
        }
      });
      setToken(data.access_token);
      setStatus("Cont creat.");
      navigate("/arena");
    } catch (error) {
      setStatus(error.message);
      setFormError(
        "Validation failed: email valid, parola minim 8 caractere, câmpurile să nu fie goale."
      );
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setFormError("");
    setStatus("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4 fade-up">
        <h1 className="hero-title">Bine ai revenit.</h1>
        <p className="hero-subtitle">
          Conectează-te pentru a continua antrenamentul de interviu sau creează un profil nou.
        </p>
        <div className="surface-card space-y-3">
          <p className="muted">
            Tip: folosește microfon și cameră reale pentru cele mai precise evaluări.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="pill">JWT Auth</span>
            <span className="pill">Voice-first</span>
            <span className="pill">Rapoarte progres</span>
          </div>
        </div>
      </div>

      <div className="surface-card space-y-5 fade-up">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Autentificare / Înregistrare</h2>
          <div className="flex gap-2">
            <button
              className={mode === "login" ? "pill" : "pill ghost"}
              onClick={() => switchMode("login")}
            >
              Conectare
            </button>
            <button
              className={mode === "register" ? "pill" : "pill ghost"}
              onClick={() => switchMode("register")}
            >
              Înregistrare
            </button>
          </div>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2">
            <span className="form-label">Email</span>
            <input
              className="input-field"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="form-label">Parolă</span>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "register" && (
            <>
              <label className="space-y-2 md:col-span-2">
                <span className="form-label">Nume complet</span>
                <input
                  className="input-field"
                  placeholder="Nume și prenume"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="form-label">Nivel experiență</span>
                <select
                  className="input-field"
                  value={experienceLevel}
                  onChange={(event) => setExperienceLevel(event.target.value)}
                >
                  <option value="junior">Junior</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="form-label">Rol țintă</span>
                <input
                  className="input-field"
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="form-label">Tehnologii (separate prin virgulă)</span>
                <input
                  className="input-field"
                  value={technologies}
                  onChange={(event) => setTechnologies(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "login" ? (
            <button className="btn-primary" onClick={handleLogin}>
              Conectare
            </button>
          ) : (
            <button className="btn-primary" onClick={handleRegister}>
              Înregistrare
            </button>
          )}
        </div>
        {status && <p className="muted text-sm">{status}</p>}
      </div>
    </div>
  );
}
