import io
import logging

import cv2
import numpy as np
from deepface import DeepFace

from app.utils.errors import AppError

logger = logging.getLogger(__name__)


def _decode_frame(frame_bytes: bytes):
    array = np.frombuffer(frame_bytes, np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise AppError("Unable to decode frame", code="decode_failed")
    return image


def _map_emotion(emotion_scores: dict[str, float]) -> tuple[str, float]:
    fear_score = emotion_scores.get("fear", 0.0)
    angry_score = emotion_scores.get("angry", 0.0)
    disgust_score = emotion_scores.get("disgust", 0.0)
    calm_score = emotion_scores.get("neutral", 0.0)
    happy_score = emotion_scores.get("happy", 0.0)
    surprise_score = emotion_scores.get("surprise", 0.0)

    dominant = max(emotion_scores, key=emotion_scores.get)
    dominant_pct = emotion_scores.get(dominant, 0.0)

    if fear_score >= 35.0:
        return "fear", fear_score / 100.0
    if angry_score + disgust_score >= 55.0:
        combined = angry_score + disgust_score
        return "stress", min(1.0, combined / 100.0)
    if happy_score >= 35.0 or surprise_score >= 30.0:
        return "confidence", max(happy_score, surprise_score) / 100.0
    if calm_score >= 60.0 and dominant in {"neutral", "happy"}:
        return "confidence", calm_score / 100.0

    label = "neutral"
    if dominant in {"angry", "disgust"}:
        label = "stress"
    elif dominant == "fear":
        label = "fear"

    return label, dominant_pct / 100.0


def analyze_emotion(frame_bytes: bytes) -> dict:
    if not frame_bytes:
        raise AppError("Empty frame", code="empty_frame")

    try:
        image = _decode_frame(frame_bytes)
        result = DeepFace.analyze(
            image,
            actions=["emotion"],
            enforce_detection=False,
            detector_backend="opencv",
        )
        # DeepFace can return a dict or a list of dicts depending on version.
        payload = result[0] if isinstance(result, list) else result
        emotions = payload.get("emotion") or payload.get("emotions")
        if not emotions:
            raise ValueError("DeepFace returned no emotion scores")

        emotion_label, confidence = _map_emotion(emotions)
        logger.debug("Emotion scores: %s", emotions)
        return {
            "emotion": emotion_label,
            "confidence": round(confidence, 2),
            "raw_scores": emotions,
        }
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Emotion analysis failed")
        raise AppError("Emotion detection failed", code="emotion_failed") from exc
