import { useEffect, useMemo, useRef, useState } from "react";

import { getToken } from "../lib/auth";
import { API_BASE_URL, apiRequest } from "../lib/api";


const GEMINI_NATIVE_TAGS = ["native-audio", "native_audio", "native-dialog", "native_dialog"];
const MALE_VOICE_HINTS = ["male", "mascul", "barbat", "man", "onyx", "puck", "alex", "daniel", "radu"];
const FEMALE_VOICE_HINTS = ["female", "fem", "femeie", "woman", "nova", "kore", "ana", "ioana", "alina"];
const LIVE_VAD_THRESHOLD = 0.012;
const LIVE_VAD_HANGOVER_MS = 500;
const LIVE_MODEL_SPEAKING_GRACE_MS = 220;
const LIVE_OUTPUT_GAIN = 0.75;
const UTF8_DECODER = new TextDecoder("utf-8");

function isGeminiNativeModel(model) {
  const name = (model || "").toLowerCase();
  return GEMINI_NATIVE_TAGS.some((tag) => name.includes(tag));
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  if (outputSampleRate > inputSampleRate) {
    return buffer;
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPcm(floatBuffer) {
  const pcm = new Int16Array(floatBuffer.length);
  for (let i = 0; i < floatBuffer.length; i += 1) {
    const s = Math.max(-1, Math.min(1, floatBuffer[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function int16ToBase64(pcm) {
  const bytes = new Uint8Array(pcm.buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function getSampleRateFromMimeType(mimeType) {
  if (!mimeType) {
    return 24000;
  }
  const match = String(mimeType).match(/rate=(\d+)/i);
  if (!match) {
    return 24000;
  }
  return Number(match[1]) || 24000;
}

function tryParseJsonFromArrayBuffer(arrayBuffer) {
  try {
    const decoded = UTF8_DECODER.decode(new Uint8Array(arrayBuffer)).trim();
    if (!decoded.startsWith("{")) {
      return null;
    }
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function scorePcmEndian(view, littleEndian) {
  const sampleCount = Math.min(Math.floor(view.byteLength / 2), 2048);
  if (!sampleCount) {
    return { score: Number.POSITIVE_INFINITY, rms: 0, clipRatio: 1 };
  }
  let sumSquares = 0;
  let clipCount = 0;
  let diffSum = 0;
  let prev = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = view.getInt16(i * 2, littleEndian) / 32768;
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    if (abs > 0.985) {
      clipCount += 1;
    }
    if (i > 0) {
      diffSum += Math.abs(sample - prev);
    }
    prev = sample;
  }
  const rms = Math.sqrt(sumSquares / sampleCount);
  const clipRatio = clipCount / sampleCount;
  const avgStep = diffSum / Math.max(1, sampleCount - 1);
  const rmsPenalty = Math.abs(rms - 0.12);
  const clipPenalty = clipRatio * 3;
  const stepPenalty = avgStep > 0.58 ? (avgStep - 0.58) * 1.7 : 0;
  return { score: rmsPenalty + clipPenalty + stepPenalty, rms, clipRatio };
}

function decodeInt16FromArrayBuffer(arrayBuffer, littleEndian) {
  const view = new DataView(arrayBuffer);
  const sampleCount = Math.floor(view.byteLength / 2);
  const pcm16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    pcm16[i] = view.getInt16(i * 2, littleEndian);
  }
  return pcm16;
}

function buildAudioWsUrl(
  sessionId,
  aiProvider,
  aiModel,
  aiTtsModel,
  ttsVoice,
  voiceGender,
  interviewGender,
  fullName
) {
  const token = getToken();
  if (!sessionId || !token) {
    return null;
  }
  const wsBase = API_BASE_URL.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
  const params = new URLSearchParams();
  params.set("token", token);
  if (aiProvider) {
    params.set("ai_provider", aiProvider);
  }
  if (aiModel) {
    params.set("ai_model", aiModel);
  }
  if (aiTtsModel) {
    params.set("ai_tts_model", aiTtsModel);
  }
  if (ttsVoice) {
    params.set("tts_voice", ttsVoice);
  }
  if (voiceGender) {
    params.set("voice_gender", voiceGender);
  }
  if (interviewGender) {
    params.set("interview_gender", interviewGender);
  }
  if (fullName) {
    params.set("full_name", fullName);
  }
  return `${wsBase}/sessions/${encodeURIComponent(sessionId)}/audio/ws?${params.toString()}`;
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

function speakWithBrowser(text, preferredGender = "female") {
  if (!text || !("speechSynthesis" in window)) {
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickRomanianVoice(preferredGender);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || "ro-RO";
  } else {
    utterance.lang = "ro-RO";
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export default function AudioRecorder({
  sessionId,
  onResponse,
  aiProvider = "openai",
  aiModel,
  aiTtsModel,
  autoRecord = false,
  geminiApiKey = "",
  interviewGender = "female",
  voiceGender = "female",
  ttsVoice = "",
  profileName = "",
}) {
  const liveMode = useMemo(
    () => aiProvider === "gemini" && isGeminiNativeModel(aiModel),
    [aiProvider, aiModel]
  );

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const playbackRef = useRef(null);
  const uploadQueueRef = useRef([]);
  const uploadInProgressRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const providerRef = useRef(aiProvider);
  const modelRef = useRef(aiModel);
  const ttsModelRef = useRef(aiTtsModel);
  const geminiApiKeyRef = useRef(geminiApiKey);
  const interviewGenderRef = useRef(interviewGender);
  const voiceGenderRef = useRef(voiceGender);
  const ttsVoiceRef = useRef(ttsVoice);
  const profileNameRef = useRef(profileName);
  const batchSocketRef = useRef(null);
  const liveSocketRef = useRef(null);
  const liveReadyRef = useRef(false);
  const liveGreetingSentRef = useRef(false);
  const inputAudioCtxRef = useRef(null);
  const inputSourceRef = useRef(null);
  const inputProcessorRef = useRef(null);
  const inputSilenceGainRef = useRef(null);
  const outputAudioCtxRef = useRef(null);
  const outputCursorRef = useRef(0);
  const liveFramesSentRef = useRef(0);
  const liveBytesSentRef = useRef(0);
  const liveMessagesReceivedRef = useRef(0);
  const liveAudioCallbacksRef = useRef(0);
  const liveFramesDroppedNotReadyRef = useRef(0);
  const liveFramesDroppedSocketRef = useRef(0);
  const liveAudioChunksReceivedRef = useRef(0);
  const liveTextChunksReceivedRef = useRef(0);
  const liveLastSendAtRef = useRef(0);
  const liveLastReceiveAtRef = useRef(0);
  const liveLastInputRmsRef = useRef(0);
  const liveLastOutputRmsRef = useRef(0);
  const liveModelSpeakingUntilRef = useRef(0);
  const liveLastUserSpeechAtRef = useRef(0);
  const liveFramesDroppedModelSpeakingRef = useRef(0);
  const liveFramesDroppedSilenceRef = useRef(0);
  const liveBinaryEndianRef = useRef("auto");
  const liveBinaryEndianVotesRef = useRef({ le: 0, be: 0 });
  const liveBinaryProbeCountRef = useRef(0);
  const liveOutputSampleRateRef = useRef(24000);

  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("");
  const [debugLines, setDebugLines] = useState([]);

  const pushDebug = (message) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setDebugLines((previous) => {
      const next = [...previous, line];
      if (next.length > 100) {
        return next.slice(next.length - 100);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return;
    }
    // Prime voices list early so first utterance is not dropped on some browsers.
    window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    providerRef.current = aiProvider;
    modelRef.current = aiModel;
    ttsModelRef.current = aiTtsModel;
    geminiApiKeyRef.current = geminiApiKey;
    interviewGenderRef.current = interviewGender;
    voiceGenderRef.current = voiceGender;
    ttsVoiceRef.current = ttsVoice;
    profileNameRef.current = profileName;
  }, [aiProvider, aiModel, aiTtsModel, geminiApiKey, interviewGender, voiceGender, ttsVoice, profileName]);

  const playVoiceFallback = async (data) => {
    const ttsUrl = data?.tts_audio_url;
    if (ttsUrl) {
      try {
        if (playbackRef.current) {
          playbackRef.current.pause();
          playbackRef.current = null;
        }
        const audio = new Audio(ttsUrl);
        playbackRef.current = audio;
        await audio.play();
        setStatus("Răspuns audio redat.");
        return;
      } catch {
        setStatus("Audio extern blocat; folosesc vocea browserului.");
      }
    }

    const fallbackText =
      (data?.assistant_text || "").trim() || "Am pregătit următoarea întrebare de interviu.";
    const preferredGender = voiceGenderRef.current || interviewGenderRef.current || "female";
    if (speakWithBrowser(fallbackText, preferredGender)) {
      setStatus("Răspuns redat cu vocea browserului.");
    } else {
      setStatus("Răspuns primit, dar browserul nu poate reda audio.");
    }
  };

  const emitAssistantText = (text) => {
    if (!text) {
      return;
    }
    onResponse?.({
      transcript: "",
      assistant_text: text,
      tts_audio_url: null,
      latency_ms: null,
    });
  };

  const enqueueGeminiAudio = (base64Audio, mimeType) => {
    if (!base64Audio) {
      return;
    }
    try {
      const sampleRate = getSampleRateFromMimeType(mimeType);
      liveOutputSampleRateRef.current = sampleRate;
      const pcm16 = base64ToInt16(base64Audio);
      const outputContext =
        outputAudioCtxRef.current ||
        new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      outputAudioCtxRef.current = outputContext;
      if (outputContext.state !== "running") {
        outputContext.resume().catch(() => {});
      }
      const float32 = new Float32Array(pcm16.length);
      let sumSquares = 0;
      for (let i = 0; i < pcm16.length; i += 1) {
        const sample = (pcm16[i] / 32768) * LIVE_OUTPUT_GAIN;
        float32[i] = sample;
        sumSquares += sample * sample;
      }
      liveLastOutputRmsRef.current = Math.sqrt(sumSquares / Math.max(float32.length, 1));

      const buffer = outputContext.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0);
      const source = outputContext.createBufferSource();
      source.buffer = buffer;
      source.connect(outputContext.destination);

      const now = outputContext.currentTime;
      const startAt = Math.max(now, outputCursorRef.current);
      source.start(startAt);
      outputCursorRef.current = startAt + buffer.duration;
      const holdMs = Math.ceil(buffer.duration * 1000) + LIVE_MODEL_SPEAKING_GRACE_MS;
      liveModelSpeakingUntilRef.current = Math.max(
        liveModelSpeakingUntilRef.current,
        Date.now() + holdMs
      );
    } catch {
      // ignore audio chunk decode errors
    }
  };

  const enqueueGeminiPcm16 = (pcm16, sampleRate = 24000) => {
    if (!pcm16 || !pcm16.length) {
      return;
    }
    try {
      const outputContext =
        outputAudioCtxRef.current ||
        new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      outputAudioCtxRef.current = outputContext;
      if (outputContext.state !== "running") {
        outputContext.resume().catch(() => {});
      }
      const float32 = new Float32Array(pcm16.length);
      let sumSquares = 0;
      for (let i = 0; i < pcm16.length; i += 1) {
        const sample = (pcm16[i] / 32768) * LIVE_OUTPUT_GAIN;
        float32[i] = sample;
        sumSquares += sample * sample;
      }
      liveLastOutputRmsRef.current = Math.sqrt(sumSquares / Math.max(float32.length, 1));

      const buffer = outputContext.createBuffer(1, float32.length, sampleRate);
      buffer.copyToChannel(float32, 0);
      const source = outputContext.createBufferSource();
      source.buffer = buffer;
      source.connect(outputContext.destination);

      const now = outputContext.currentTime;
      const startAt = Math.max(now, outputCursorRef.current);
      source.start(startAt);
      outputCursorRef.current = startAt + buffer.duration;
      const holdMs = Math.ceil(buffer.duration * 1000) + LIVE_MODEL_SPEAKING_GRACE_MS;
      liveModelSpeakingUntilRef.current = Math.max(
        liveModelSpeakingUntilRef.current,
        Date.now() + holdMs
      );
    } catch {
      // ignore audio chunk decode errors
    }
  };

  const enqueueGeminiBinaryAudio = (arrayBuffer, sourceLabel = "arraybuffer") => {
    if (!arrayBuffer || arrayBuffer.byteLength < 2048 || arrayBuffer.byteLength % 2 !== 0) {
      return false;
    }
    const view = new DataView(arrayBuffer);
    const leStats = scorePcmEndian(view, true);
    const beStats = scorePcmEndian(view, false);

    let chosenEndian = liveBinaryEndianRef.current;
    if (chosenEndian !== "le" && chosenEndian !== "be") {
      chosenEndian = leStats.score <= beStats.score ? "le" : "be";
      liveBinaryEndianVotesRef.current[chosenEndian] += 1;
      liveBinaryProbeCountRef.current += 1;
      if (liveBinaryProbeCountRef.current >= 6) {
        liveBinaryEndianRef.current =
          liveBinaryEndianVotesRef.current.le >= liveBinaryEndianVotesRef.current.be ? "le" : "be";
        pushDebug(`Gemini binary decode locked endian=${liveBinaryEndianRef.current}`);
      }
    }

    const useLittleEndian = chosenEndian === "le";
    const pcm16 = decodeInt16FromArrayBuffer(arrayBuffer, useLittleEndian);
    liveAudioChunksReceivedRef.current += 1;
    if (liveAudioChunksReceivedRef.current <= 5) {
      pushDebug(
        `Gemini binary audio frame bytes=${arrayBuffer.byteLength} (${sourceLabel}) endian=${chosenEndian} le_rms=${leStats.rms.toFixed(
          3
        )} be_rms=${beStats.rms.toFixed(3)}`
      );
    }
    enqueueGeminiPcm16(pcm16, liveOutputSampleRateRef.current || 24000);
    return true;
  };

  const handleGeminiLiveMessage = (payload) => {
    const outputTranscription =
      payload?.outputTranscription?.text ||
      payload?.output_transcription?.text ||
      payload?.serverContent?.outputTranscription?.text ||
      payload?.serverContent?.output_transcription?.text;
    if (outputTranscription) {
      liveTextChunksReceivedRef.current += 1;
      if (liveTextChunksReceivedRef.current <= 3) {
        pushDebug(`Gemini output transcription preview="${outputTranscription.slice(0, 80)}"`);
      }
      emitAssistantText(outputTranscription);
    }

    const inputTranscription =
      payload?.inputTranscription?.text ||
      payload?.input_transcription?.text ||
      payload?.serverContent?.inputTranscription?.text ||
      payload?.serverContent?.input_transcription?.text;
    if (inputTranscription) {
      setStatus("Te aud. Continuă să vorbești natural.");
    }

    const serverContent = payload?.serverContent || payload?.server_content;
    if (!serverContent) {
      return;
    }

    if (serverContent.interrupted && outputAudioCtxRef.current) {
      outputCursorRef.current = outputAudioCtxRef.current.currentTime;
    }

    const parts = serverContent?.modelTurn?.parts || serverContent?.model_turn?.parts || [];
    for (const part of parts) {
      if (part?.text) {
        liveTextChunksReceivedRef.current += 1;
        if (liveTextChunksReceivedRef.current <= 3) {
          pushDebug(`Gemini model text part preview="${String(part.text).slice(0, 80)}"`);
        }
      }
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        liveAudioChunksReceivedRef.current += 1;
        if (liveAudioChunksReceivedRef.current <= 5) {
          pushDebug(
            `Gemini audio chunk mime=${inline.mimeType || inline.mime_type || "-"} base64_len=${inline.data.length}`
          );
        }
        enqueueGeminiAudio(inline.data, inline.mimeType || inline.mime_type);
      }
    }
  };

  const processUploadQueue = async () => {
    if (uploadInProgressRef.current) {
      return;
    }

    const activeSessionId = sessionIdRef.current;
    const nextChunk = uploadQueueRef.current.shift();
    if (!activeSessionId || !nextChunk) {
      return;
    }

    uploadInProgressRef.current = true;
    setStatus("Procesez audio...");
    pushDebug(`HTTP upload chunk queued (remaining=${uploadQueueRef.current.length})`);
    try {
      const formData = new FormData();
      formData.append("audio", nextChunk, "audio.webm");
      formData.append("ai_provider", providerRef.current || "openai");
      if (modelRef.current) formData.append("ai_model", modelRef.current);
      if (ttsModelRef.current) formData.append("ai_tts_model", ttsModelRef.current);
      if (ttsVoiceRef.current) formData.append("tts_voice", ttsVoiceRef.current);
      if (voiceGenderRef.current) formData.append("voice_gender", voiceGenderRef.current);
      if (interviewGenderRef.current) formData.append("interview_gender", interviewGenderRef.current);
      if (profileNameRef.current) formData.append("full_name", profileNameRef.current);

      const data = await apiRequest(`/sessions/${activeSessionId}/audio`, {
        method: "POST",
        body: formData,
      });
      pushDebug(
        `HTTP /audio response transcript_len=${(data?.transcript || "").length} tts=${Boolean(
          data?.tts_audio_url
        )}`
      );
      onResponse?.(data);
      await playVoiceFallback(data);
      setStatus("Ascult continuu...");
    } catch (error) {
      pushDebug(`HTTP /audio error: ${error.message}`);
      setStatus(error.message);
    } finally {
      uploadInProgressRef.current = false;
      if (uploadQueueRef.current.length > 0) {
        void processUploadQueue();
      }
    }
  };

  const closeBatchSocket = () => {
    const socket = batchSocketRef.current;
    if (!socket) {
      return;
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      pushDebug("Audio WS closing");
      socket.close(1000, "client_close");
    }
    batchSocketRef.current = null;
  };

  const handleBatchSocketMessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.type === "ready") {
        pushDebug(`Audio WS ready session=${payload.session_id}`);
        setStatus("Socket audio conectat. Ascult continuu...");
        return;
      }
      if (payload?.type === "error") {
        pushDebug(`Audio WS error: ${payload.message}`);
        setStatus(payload.message || "Eroare socket audio.");
        return;
      }
      if (payload?.type === "audio_result" && payload.payload) {
        pushDebug(
          `Audio WS result transcript_len=${(payload.payload?.transcript || "").length} tts=${Boolean(
            payload.payload?.tts_audio_url
          )}`
        );
        onResponse?.(payload.payload);
        await playVoiceFallback(payload.payload);
        setStatus("Ascult continuu...");
      }
    } catch {
      // ignore malformed websocket payloads
    }
  };

  const stopBatchMode = () => {
    closeBatchSocket();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopGeminiLiveMode = async () => {
    liveReadyRef.current = false;
    liveGreetingSentRef.current = false;
    const socket = liveSocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            realtimeInput: { audioStreamEnd: true },
          })
        );
      } catch {
        // ignore close handshake errors
      }
      socket.close();
    }
    liveSocketRef.current = null;

    if (inputProcessorRef.current) {
      inputProcessorRef.current.disconnect();
      inputProcessorRef.current.onaudioprocess = null;
      inputProcessorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (inputSilenceGainRef.current) {
      inputSilenceGainRef.current.disconnect();
      inputSilenceGainRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      try {
        await inputAudioCtxRef.current.close();
      } catch {
        // ignore close errors
      }
      inputAudioCtxRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startBatchMode = async () => {
    if (!sessionIdRef.current || isRecording) {
      return;
    }

    try {
      pushDebug("startBatchMode: request microphone");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      pushDebug("startBatchMode: microphone granted");
      const wsUrl = buildAudioWsUrl(
        sessionIdRef.current,
        providerRef.current || "openai",
        modelRef.current,
        ttsModelRef.current,
        ttsVoiceRef.current,
        voiceGenderRef.current,
        interviewGenderRef.current,
        profileNameRef.current
      );
      if (wsUrl) {
        pushDebug(`startBatchMode: opening audio WS ${wsUrl}`);
        const socket = new WebSocket(wsUrl);
        batchSocketRef.current = socket;
        socket.onopen = () => {
          pushDebug("Audio WS open");
        };
        socket.onmessage = (event) => {
          void handleBatchSocketMessage(event);
        };
        socket.onerror = () => {
          pushDebug("Audio WS onerror");
          setStatus("Socket audio indisponibil, continui cu upload clasic.");
        };
        socket.onclose = (event) => {
          if (batchSocketRef.current === socket) {
            batchSocketRef.current = null;
          }
          pushDebug(`Audio WS close code=${event.code} reason=${event.reason || "-"}`);
          if (isRecording && event.code !== 1000) {
            setStatus("Socket audio închis, continui cu upload clasic.");
          }
        };
      }

      const recorderOptions = MediaRecorder.isTypeSupported("audio/webm")
        ? { mimeType: "audio/webm" }
        : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;
      uploadQueueRef.current = [];

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          pushDebug(`Recorder chunk size=${event.data.size}`);
          const activeSocket = batchSocketRef.current;
          if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
            try {
              const buffer = await event.data.arrayBuffer();
              activeSocket.send(buffer);
              pushDebug(`Chunk sent via WS bytes=${buffer.byteLength}`);
              return;
            } catch {
              pushDebug("Chunk WS send failed; fallback to HTTP");
              // fallback to classic upload queue
            }
          }
          uploadQueueRef.current.push(event.data);
          pushDebug(`Chunk queued for HTTP queue_size=${uploadQueueRef.current.length}`);
          void processUploadQueue();
        }
      };

      mediaRecorder.onerror = () => {
        pushDebug("MediaRecorder error event");
        setStatus("Eroare recorder audio.");
      };

      mediaRecorder.start(1200);
      pushDebug("MediaRecorder started timeslice=1200ms");
      setIsRecording(true);
      setStatus("Ascult continuu...");
    } catch {
      pushDebug("startBatchMode failed: getUserMedia/recorder error");
      closeBatchSocket();
      const streamLocal = streamRef.current;
      if (streamLocal) {
        streamLocal.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setStatus("Nu pot porni înregistrarea microfonului.");
    }
  };

  const startGeminiLiveMode = async () => {
    if (!sessionIdRef.current || isRecording) {
      return;
    }
    if (!geminiApiKeyRef.current) {
      setStatus("Cheia Gemini nu este configurată în profil.");
      return;
    }
    if (!modelRef.current) {
      setStatus("Selectează în profil un model Gemini native audio/dialog.");
      return;
    }

    try {
      pushDebug("startGeminiLiveMode: request microphone");
      liveReadyRef.current = false;
      liveGreetingSentRef.current = false;
      liveFramesSentRef.current = 0;
      liveBytesSentRef.current = 0;
      liveMessagesReceivedRef.current = 0;
      liveAudioCallbacksRef.current = 0;
      liveFramesDroppedNotReadyRef.current = 0;
      liveFramesDroppedSocketRef.current = 0;
      liveAudioChunksReceivedRef.current = 0;
      liveTextChunksReceivedRef.current = 0;
      liveLastSendAtRef.current = 0;
      liveLastReceiveAtRef.current = 0;
      liveLastInputRmsRef.current = 0;
      liveLastOutputRmsRef.current = 0;
      liveModelSpeakingUntilRef.current = 0;
      liveLastUserSpeechAtRef.current = 0;
      liveFramesDroppedModelSpeakingRef.current = 0;
      liveFramesDroppedSilenceRef.current = 0;
      liveBinaryEndianRef.current = "auto";
      liveBinaryEndianVotesRef.current = { le: 0, be: 0 };
      liveBinaryProbeCountRef.current = 0;
      liveOutputSampleRateRef.current = 24000;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      pushDebug("startGeminiLiveMode: microphone granted");

      const inputContext = new (window.AudioContext || window.webkitAudioContext)();
      inputAudioCtxRef.current = inputContext;
      await inputContext.resume();
      pushDebug(`Input audio context state=${inputContext.state} rate=${inputContext.sampleRate}`);
      const outputContext =
        outputAudioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      outputAudioCtxRef.current = outputContext;
      await outputContext.resume();
      pushDebug(`Output audio context state=${outputContext.state} rate=${outputContext.sampleRate}`);

      const modelName = modelRef.current?.startsWith("models/")
        ? modelRef.current
        : `models/${modelRef.current || ""}`;
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
        geminiApiKeyRef.current
      )}`;
      const socket = new WebSocket(wsUrl);
      liveSocketRef.current = socket;
      socket.binaryType = "arraybuffer";
      pushDebug(`Gemini Live WS opening model=${modelName}`);

      const sendInitialLivePrompt = () => {
        const activeSocket = liveSocketRef.current;
        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN || liveGreetingSentRef.current) {
          return;
        }
        liveGreetingSentRef.current = true;
        const coachFor = profileNameRef.current?.trim() || "candidat";
        activeSocket.send(
          JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Începe interviul acum. Salută candidatul exact cu „Bună, ${coachFor}!” apoi pune prima întrebare.`,
                    },
                  ],
                },
              ],
              turnComplete: true,
            },
          })
        );
        pushDebug("Gemini Live initial prompt sent");
      };

      socket.onopen = () => {
        // Start streaming right after socket opens; don't hard-block on setupComplete variant differences.
        liveReadyRef.current = true;
        const selectedGender = String(
          voiceGenderRef.current || interviewGenderRef.current || "female"
        ).toLowerCase();
        const voiceName = ttsVoiceRef.current || (selectedGender === "male" ? "Puck" : "Kore");
        socket.send(
          JSON.stringify({
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName,
                    },
                  },
                },
              },
              realtimeInputConfig: {
                automaticActivityDetection: {},
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [
                  {
                    text:
                      "Ești un intervievator tehnic pentru simulări de interviu. Vorbești exclusiv în limba română, cu ton profesionist și clar. Reguli: pune o singură întrebare pe tură; după întrebare, oprește-te și așteaptă răspunsul utilizatorului; dacă răspunsul este neclar sau nu se aude, spune explicit «Nu s-a auzit clar, te rog repetă»; nu spune niciodată «corect» fără un motiv scurt; nu sări la următoarea întrebare fără confirmarea unui răspuns real.",
                  },
                ],
              },
            },
          })
        );
        setStatus("Conexiune Gemini Live activă. Poți vorbi.");
        pushDebug(
          `Gemini Live WS open voice=${voiceName} key_present=${Boolean(
            geminiApiKeyRef.current
          )} model=${modelName}`
        );
        window.setTimeout(() => {
          sendInitialLivePrompt();
        }, 250);
      };

      socket.onmessage = async (event) => {
        liveMessagesReceivedRef.current += 1;
        liveLastReceiveAtRef.current = Date.now();
        let rawText = null;
        try {
          if (typeof event.data === "string") {
            rawText = event.data;
          } else if (event.data instanceof Blob) {
            if (liveMessagesReceivedRef.current <= 3) {
              pushDebug(`Gemini Live blob frame bytes=${event.data.size}`);
            }
            rawText = await event.data.text();
            if (!rawText || !rawText.trim().startsWith("{")) {
              const asBuffer = await event.data.arrayBuffer();
              const payloadFromBuffer = tryParseJsonFromArrayBuffer(asBuffer);
              if (payloadFromBuffer) {
                rawText = JSON.stringify(payloadFromBuffer);
              } else if (enqueueGeminiBinaryAudio(asBuffer, "blob")) {
                return;
              } else {
                pushDebug(`Gemini binary frame ignored bytes=${asBuffer.byteLength}`);
                return;
              }
            }
          } else if (event.data instanceof ArrayBuffer) {
            const payloadFromBuffer = tryParseJsonFromArrayBuffer(event.data);
            if (payloadFromBuffer) {
              rawText = JSON.stringify(payloadFromBuffer);
            } else if (enqueueGeminiBinaryAudio(event.data, "arraybuffer")) {
              return;
            } else {
              pushDebug(`Gemini binary frame ignored bytes=${event.data.byteLength}`);
              return;
            }
          } else {
            pushDebug(`Gemini WS unknown frame type=${typeof event.data}`);
            return;
          }

          const payload = JSON.parse(rawText);
          if (liveMessagesReceivedRef.current === 1) {
            pushDebug(`Gemini Live first message keys=${Object.keys(payload || {}).join(",")}`);
          }
          if (payload?.error) {
            pushDebug(`Gemini Live error payload=${JSON.stringify(payload.error).slice(0, 220)}`);
          }
          if (payload?.goAway || payload?.go_away) {
            pushDebug("Gemini Live goAway received");
          }
          if (liveMessagesReceivedRef.current % 20 === 0) {
            pushDebug(
              `Gemini Live WS rx_count=${liveMessagesReceivedRef.current} setup=${
                Boolean(payload.setupComplete || payload.setup_complete)
              } keys=${Object.keys(payload || {}).join(",")}`
            );
          }
          const hasSetupComplete =
            Object.prototype.hasOwnProperty.call(payload || {}, "setupComplete") ||
            Object.prototype.hasOwnProperty.call(payload || {}, "setup_complete");
          if (hasSetupComplete || payload?.type === "setupComplete" || payload?.type === "setup_complete") {
            liveReadyRef.current = true;
            setStatus("Conexiune Gemini Live activă. Poți vorbi.");
            pushDebug("Gemini Live setup complete");
            sendInitialLivePrompt();
            return;
          }
          handleGeminiLiveMessage(payload);
        } catch (error) {
          if (rawText) {
            const preview = rawText.slice(0, 140).replace(/\s+/g, " ");
            pushDebug(`Gemini WS parse failed preview="${preview}"`);
          } else {
            pushDebug(`Gemini WS message handling failed: ${error.message}`);
          }
        }
      };

      socket.onerror = () => {
        pushDebug("Gemini Live WS onerror");
        setStatus("Eroare la conexiunea Gemini Live.");
      };

      socket.onclose = (event) => {
        liveSocketRef.current = null;
        pushDebug(`Gemini Live WS close code=${event.code} reason=${event.reason || "-"}`);
        if (event.code !== 1000) {
          setStatus(`Conexiunea Gemini s-a închis (${event.code}): ${event.reason || "fără detalii"}`);
        }
      };

      const source = inputContext.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      const processor = inputContext.createScriptProcessor(2048, 1, 1);
      inputProcessorRef.current = processor;
      const silenceGain = inputContext.createGain();
      silenceGain.gain.value = 0;
      inputSilenceGainRef.current = silenceGain;

      processor.onaudioprocess = (audioEvent) => {
        liveAudioCallbacksRef.current += 1;
        if (liveAudioCallbacksRef.current === 1) {
          pushDebug("Gemini live onaudioprocess started");
        }
        const liveSocket = liveSocketRef.current;
        if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
          liveFramesDroppedSocketRef.current += 1;
          if (liveFramesDroppedSocketRef.current % 30 === 0) {
            pushDebug(
              `Gemini live drop reason=socket state=${liveSocket ? liveSocket.readyState : -1} drops=${
                liveFramesDroppedSocketRef.current
              }`
            );
          }
          return;
        }
        if (!liveReadyRef.current) {
          liveFramesDroppedNotReadyRef.current += 1;
          if (liveFramesDroppedNotReadyRef.current % 30 === 0) {
            pushDebug(
              `Gemini live drop reason=not_ready drops=${liveFramesDroppedNotReadyRef.current}`
            );
          }
          return;
        }
        const channel = audioEvent.inputBuffer.getChannelData(0);
        let sumSquares = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const sample = channel[i];
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / Math.max(channel.length, 1));
        liveLastInputRmsRef.current = rms;
        const nowMs = Date.now();
        if (rms >= LIVE_VAD_THRESHOLD) {
          liveLastUserSpeechAtRef.current = nowMs;
        }
        if (nowMs < liveModelSpeakingUntilRef.current) {
          liveFramesDroppedModelSpeakingRef.current += 1;
          if (liveFramesDroppedModelSpeakingRef.current % 60 === 0) {
            pushDebug(
              `Gemini live drop reason=model_speaking drops=${liveFramesDroppedModelSpeakingRef.current}`
            );
          }
          return;
        }
        if (nowMs - liveLastUserSpeechAtRef.current > LIVE_VAD_HANGOVER_MS) {
          liveFramesDroppedSilenceRef.current += 1;
          if (liveFramesDroppedSilenceRef.current % 80 === 0) {
            pushDebug(
              `Gemini live drop reason=silence rms=${rms.toFixed(4)} drops=${liveFramesDroppedSilenceRef.current}`
            );
          }
          return;
        }
        const downsampled = downsampleBuffer(channel, inputContext.sampleRate, 16000);
        const pcm16 = floatTo16BitPcm(downsampled);
        const base64 = int16ToBase64(pcm16);
        liveFramesSentRef.current += 1;
        liveBytesSentRef.current += pcm16.byteLength;
        liveLastSendAtRef.current = Date.now();
        if (liveFramesSentRef.current % 25 === 0) {
          pushDebug(
            `Gemini live tx_frames=${liveFramesSentRef.current} tx_kb=${Math.round(
              liveBytesSentRef.current / 1024
            )}`
          );
        }
        liveSocket.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: base64,
                mimeType: "audio/pcm;rate=16000",
              },
            },
          })
        );
      };

      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(inputContext.destination);

      setIsRecording(true);
    } catch {
      pushDebug("startGeminiLiveMode failed");
      await stopGeminiLiveMode();
      setStatus("Nu pot porni fluxul audio live.");
    }
  };

  const startRecording = async () => {
    pushDebug(
      `startRecording mode=${liveMode ? "gemini_live" : "batch"} provider=${
        providerRef.current
      } ai_model=${modelRef.current || "-"} tts_model=${ttsModelRef.current || "-"} tts_voice=${
        ttsVoiceRef.current || "-"
      }`
    );
    if (liveMode) {
      await startGeminiLiveMode();
      return;
    }
    await startBatchMode();
  };

  const stopRecording = async () => {
    pushDebug("stopRecording");
    stopBatchMode();
    await stopGeminiLiveMode();
    setIsRecording(false);
    setStatus("Flux audio oprit.");
  };

  useEffect(() => {
    if (autoRecord && sessionId && !isRecording) {
      void startRecording();
    }
    if (!autoRecord && isRecording) {
      void stopRecording();
    }
  }, [autoRecord, sessionId, isRecording, liveMode]);

  useEffect(() => {
    if (!isRecording || !liveMode) {
      return;
    }
    const interval = window.setInterval(() => {
      const socket = liveSocketRef.current;
      const readyState = socket ? socket.readyState : -1;
      const now = Date.now();
      const sinceSend = liveLastSendAtRef.current ? now - liveLastSendAtRef.current : -1;
      const sinceRecv = liveLastReceiveAtRef.current ? now - liveLastReceiveAtRef.current : -1;
      const stream = streamRef.current;
      const track = stream?.getAudioTracks?.()?.[0];
      const micState = track ? `${track.readyState}/${track.enabled ? "enabled" : "disabled"}` : "no-track";
      const inputState = inputAudioCtxRef.current ? inputAudioCtxRef.current.state : "none";
      pushDebug(
        `Gemini live heartbeat state=${readyState} tx_frames=${liveFramesSentRef.current} tx_kb=${Math.round(
          liveBytesSentRef.current / 1024
        )} rx_msgs=${liveMessagesReceivedRef.current} cb=${liveAudioCallbacksRef.current} drop_not_ready=${
          liveFramesDroppedNotReadyRef.current
        } drop_socket=${liveFramesDroppedSocketRef.current} drop_model=${
          liveFramesDroppedModelSpeakingRef.current
        } drop_silence=${liveFramesDroppedSilenceRef.current} rx_audio_chunks=${
          liveAudioChunksReceivedRef.current
        } rx_text_chunks=${liveTextChunksReceivedRef.current} rms_in=${liveLastInputRmsRef.current.toFixed(
          4
        )} rms_out=${liveLastOutputRmsRef.current.toFixed(
          4
        )} mic=${micState} input_ctx=${inputState} last_tx_ms=${sinceSend} last_rx_ms=${sinceRecv}`
      );
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isRecording, liveMode]);

  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, []);

  return (
    <div className="space-y-3">
      {autoRecord && sessionId && (
        <p className="muted text-xs">
          {liveMode
            ? "Mod live Gemini: audio este trimis continuu, iar modelul detectează capătul de replică."
            : "Mod standard: audio este trimis incremental către backend."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {sessionId && !isRecording && (
          <button className="btn-primary" onClick={startRecording} disabled={isRecording || !sessionId}>
            {autoRecord ? "Repornește microfonul" : "Pornește microfon"}
          </button>
        )}
        <button className="btn-ghost" onClick={stopRecording} disabled={!isRecording || autoRecord}>
          Oprește
        </button>
      </div>
      {status && <p className="muted text-sm">{status}</p>}
      <details className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-alt)] p-2 text-xs">
        <summary className="cursor-pointer select-none font-medium">Debug audio pipeline</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-700">
          {debugLines.length > 0 ? debugLines.join("\n") : "No debug events yet."}
        </pre>
      </details>
    </div>
  );
}
