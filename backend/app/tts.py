"""OpenAI TTS API 기반 가상환자 음성 합성."""
from .openai_client import client

VOICE = "onyx"


def synthesize_speech(text: str) -> bytes:
    response = client.audio.speech.create(
        model="tts-1",
        voice=VOICE,
        input=text,
    )
    return response.read()
