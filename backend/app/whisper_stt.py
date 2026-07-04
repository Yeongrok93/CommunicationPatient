"""OpenAI Whisper API 기반 음성 전사."""
from .openai_client import client


TRANSCRIBE_PROMPT = "음, 어, 그... 같은 망설임 표현이나 말더듬도 생략하지 말고 들리는 그대로 받아써주세요."


def transcribe(wav_path: str) -> dict:
    with open(wav_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language="ko",
            prompt=TRANSCRIBE_PROMPT,
        )
    text = result.text.strip()
    word_count = len(text.split())

    return {
        "text": text,
        "word_count": word_count,
        "language": "ko",
        "segments": [],
    }
