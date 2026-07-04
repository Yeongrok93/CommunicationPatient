"""OpenAI Whisper API 기반 음성 전사."""
from .openai_client import client


def transcribe(wav_path: str) -> dict:
    with open(wav_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language="ko",
        )
    text = result.text.strip()
    word_count = len(text.split())

    return {
        "text": text,
        "word_count": word_count,
        "language": "ko",
        "segments": [],
    }
