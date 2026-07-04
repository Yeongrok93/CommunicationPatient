"""OpenAI API 클라이언트 (Whisper STT, TTS 공용)."""
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
