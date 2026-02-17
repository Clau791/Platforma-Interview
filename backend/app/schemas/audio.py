from typing import Optional

from pydantic import BaseModel


class AudioResponse(BaseModel):
    transcript: str
    assistant_text: str
    tts_audio_url: Optional[str] = None
    latency_ms: Optional[int] = None
