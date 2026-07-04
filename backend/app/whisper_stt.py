"""OpenAI Whisper API 기반 음성 전사."""
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


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
