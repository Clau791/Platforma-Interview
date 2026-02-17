import { useRef, useState } from "react";

import { apiRequest } from "../lib/api";


export default function VideoSnapshot({ sessionId, onEmotion }) {
  const videoRef = useRef(null);
  const intervalRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [needAuth, setNeedAuth] = useState(false);

  const startCapture = async () => {
    setStatus("");
    setNeedAuth(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsRunning(true);
      setStatus("Emotion capture running...");

      intervalRef.current = setInterval(async () => {
        const canvas = document.createElement("canvas");
        const video = videoRef.current;
        if (!video) {
          return;
        }
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            return;
          }
          const formData = new FormData();
          formData.append("frame", blob, "frame.jpg");
          try {
            const data = await apiRequest(`/sessions/${sessionId}/emotion`, {
              method: "POST",
              body: formData
            });
            onEmotion?.(data);
          } catch (error) {
            const msg = error.message || "";
            if (msg.toLowerCase().includes("not authenticated") || msg.toLowerCase().includes("credentials")) {
              setNeedAuth(true);
              setStatus("Autentificare necesară pentru emotion capture.");
            } else {
              setStatus(msg || "Emotion capture failed.");
            }
          }
        }, "image/jpeg");
      }, 4000);
    } catch (error) {
      setStatus("Camera permission denied.");
    }
  };

  const stopCapture = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      video.srcObject = null;
    }
    setIsRunning(false);
    setStatus("Emotion capture stopped.");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          onClick={startCapture}
          disabled={isRunning || !sessionId}
        >
          Start Emotion Capture
        </button>
        <button
          className="btn-ghost"
          onClick={stopCapture}
          disabled={!isRunning}
        >
          Stop
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted
        className="h-36 w-full rounded-xl border border-[color:var(--border)] bg-white object-cover"
      />
      {status && <p className="muted text-sm">{status}</p>}
      {needAuth && <p className="text-sm text-red-600">Conectează-te pentru a continua.</p>}
    </div>
  );
}
