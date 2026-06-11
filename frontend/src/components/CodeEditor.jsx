import { useState } from "react";
import Editor from "@monaco-editor/react";

import { apiRequest } from "../lib/api";


const DEFAULT_CODE = {
  python: "# scrie soluția ta aici\n\n",
  javascript: "// scrie soluția ta aici\n\n",
};

export default function CodeEditor({ sessionId, problemDescription = "", onReviewComplete, onSendToInterviewer }) {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [output, setOutput] = useState("");
  const [review, setReview] = useState(null);
  const [runStatus, setRunStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [liveSendStatus, setLiveSendStatus] = useState("");
  const [lastStdout, setLastStdout] = useState("");
  const [lastStderr, setLastStderr] = useState("");
  const [lastExitCode, setLastExitCode] = useState(null);

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (code === DEFAULT_CODE.python || code === DEFAULT_CODE.javascript) {
      setCode(DEFAULT_CODE[newLang] || "");
    }
  };

  const runCode = async () => {
    if (!sessionId) return;
    setRunStatus("Rulez codul...");
    setReview(null);
    try {
      const data = await apiRequest(`/sessions/${sessionId}/code/execute`, {
        method: "POST",
        body: { language, source_code: code },
      });
      setLastStdout(data.stdout || "");
      setLastStderr(data.stderr || "");
      setLastExitCode(data.exit_code);
      setOutput(
        (data.stderr ? `STDERR:\n${data.stderr}\n\n` : "") +
        (data.stdout ? `STDOUT:\n${data.stdout}` : "(fără output)")
      );
      setRunStatus(data.exit_code === 0 ? "Executat cu succes" : `Exit code: ${data.exit_code}`);
    } catch (error) {
      setOutput(error.message);
      setRunStatus("Eroare la execuție");
    }
  };

  const sendToInterviewer = () => {
    if (!onSendToInterviewer) return;
    const ok = onSendToInterviewer(code, language);
    setLiveSendStatus(
      ok
        ? "Cod trimis intervievatorului live — îți va răspunde prin voce."
        : "Nu am putut trimite codul (interviul live nu este activ)."
    );
  };

  const submitReview = async () => {
    if (!sessionId) return;
    setReviewStatus("Analizez codul...");
    try {
      const data = await apiRequest(`/sessions/${sessionId}/code/review`, {
        method: "POST",
        body: {
          problem_description: problemDescription,
          source_code: code,
          language,
          stdout: lastStdout,
          stderr: lastStderr,
          exit_code: lastExitCode ?? 0,
        },
      });
      setReview(data);
      setReviewStatus("");
      onReviewComplete?.(data);
    } catch (error) {
      setReviewStatus(error.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="form-label">Limbaj</span>
          <select
            className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-sm focus:border-[color:var(--accent)] focus:outline-none"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option className="bg-white text-slate-950" value="python">Python</option>
            <option className="bg-white text-slate-950" value="javascript">JavaScript</option>
          </select>
        </label>
        <button className="btn-secondary text-sm" onClick={runCode} disabled={!sessionId}>
          Rulează codul
        </button>
        {onSendToInterviewer && (
          <button className="btn-primary text-sm" onClick={sendToInterviewer} disabled={!sessionId}>
            Trimite intervievatorului (live)
          </button>
        )}
        <button className="btn-secondary text-sm" onClick={submitReview} disabled={!sessionId}>
          Review scris
        </button>
      </div>

      {liveSendStatus && <p className="muted text-xs">{liveSendStatus}</p>}

      <Editor
        height="300px"
        language={language}
        value={code}
        theme="vs-light"
        onChange={(value) => setCode(value ?? "")}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />

      {runStatus && <p className="muted text-xs">{runStatus}</p>}

      {output && (
        <div className="surface-card">
          <p className="muted text-xs mb-1" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Output</p>
          <pre className="text-sm whitespace-pre-wrap font-mono">{output}</pre>
        </div>
      )}

      {reviewStatus && <p className="muted text-sm">{reviewStatus}</p>}

      {review && (
        <div className="surface-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="muted text-xs" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Review AI</p>
            <div className="flex items-center gap-2">
              <span className={`pill ${review.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {review.correct ? "Corect" : "Incorect"}
              </span>
              <span className="pill">{review.score}/10</span>
            </div>
          </div>
          <p className="text-sm" style={{ whiteSpace: "pre-wrap" }}>{review.review}</p>
          {review.complexity && review.complexity !== "N/A" && (
            <p className="text-xs muted">Complexitate: {review.complexity}</p>
          )}
          {review.suggestions?.length > 0 && (
            <div>
              <p className="text-xs muted mb-1">Sugestii:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {review.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
