import { useState } from "react";
import Editor from "@monaco-editor/react";

import { apiRequest } from "../lib/api";


export default function CodeEditor({ sessionId }) {
  const [code, setCode] = useState("// scrie soluția ta aici\n");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const runCode = async () => {
    setStatus("Rulez codul...");
    try {
      const data = await apiRequest(`/sessions/${sessionId}/code/execute`, {
        method: "POST",
        body: {
          language: "javascript",
          source_code: code
        }
      });
      setOutput(data.stderr || data.stdout || "Fără output");
      setStatus("Finalizat");
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <div className="space-y-2">
      <Editor
        height="240px"
        defaultLanguage="javascript"
        value={code}
        theme="vs-light"
        onChange={(value) => setCode(value ?? "")}
        options={{ minimap: { enabled: false } }}
      />
      <button
        className="btn-secondary"
        onClick={runCode}
        disabled={!sessionId}
      >
        Rulează codul
      </button>
      {status && <p className="muted text-sm">{status}</p>}
      {output && <pre className="surface-card text-sm whitespace-pre-wrap">{output}</pre>}
    </div>
  );
}
