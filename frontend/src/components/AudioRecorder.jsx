import { useRef, useState } from "react";

import { apiRequest } from "../lib/api";


export default function AudioRecorder({
  sessionId,
  onResponse,
  aiProvider = "openai",
  aiModel,
  aiTtsModel
}) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("");

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");
        formData.append("ai_provider", aiProvider);
        if (aiModel) formData.append("ai_model", aiModel);
        if (aiTtsModel) formData.append("ai_tts_model", aiTtsModel);

        setStatus("Uploading audio...");
        try {
          const data = await apiRequest(`/sessions/${sessionId}/audio`, {
            method: "POST",
            body: formData
          });
          onResponse?.(data);
          setStatus("Audio processed.");
        } catch (error) {
          setStatus(error.message);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("Recording...");
    } catch (error) {
      setStatus("Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }
    recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          onClick={startRecording}
          disabled={isRecording || !sessionId}
        >
          Start Recording
        </button>
        <button
          className="btn-ghost"
          onClick={stopRecording}
          disabled={!isRecording}
        >
          Stop
        </button>
      </div>
      {status && <p className="muted text-sm">{status}</p>}
    </div>
  );
}
