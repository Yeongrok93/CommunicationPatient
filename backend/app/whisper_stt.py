"""faster-whisper 기반 음성 전사."""
import os
from functools import lru_cache

from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    # CPU 환경 기준. GPU 있으면 device="cuda", compute_type="float16"으로 변경.
    return WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe(wav_path: str) -> dict:
    model = get_model()
    segments, info = model.transcribe(wav_path, language="ko", vad_filter=True)
    segments = list(segments)
    text = "".join(seg.text for seg in segments).strip()
    word_count = len(text.split())

    return {
        "text": text,
        "word_count": word_count,
        "language": info.language,
        "segments": [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
        ],
    }
