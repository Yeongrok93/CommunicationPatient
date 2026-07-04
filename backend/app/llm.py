"""Claude API 연동: 가상환자 응답 생성 + 발화 채점 + 커뮤니케이션 코칭 피드백."""
import json
import os

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-5"
SCORE_MODEL = "claude-haiku-4-5"

PATIENT_SYSTEM_PROMPT = """\
당신은 의대생/간호대생의 의사소통 교육을 위한 가상환자 역할극 배우입니다.
아래 환자 설정에 맞게, 딱 그 환자로서만 자연스럽게 대답하세요.
의료 지식을 가르치거나 학습자를 평가하는 발언은 절대 하지 마세요(그건 별도 코치가 합니다).

[환자 설정]
{persona}
"""

COACH_SYSTEM_PROMPT = """\
당신은 임상 커뮤니케이션 교육 코치입니다.
아래는 학습자가 가상환자에게 한 발화의 전사와 음향(운율) 분석 요약입니다.
공감, 명료성, 환자 배려 관점에서 2~4문장으로 구체적인 피드백을 한국어로 제공하세요.
숫자를 그대로 나열하지 말고, 그 숫자가 실제 대화에서 어떻게 들렸을지 해석해서 말하세요.
"""

SCORE_SYSTEM_PROMPT = """\
당신은 임상 커뮤니케이션 교육 평가자입니다.
학습자(의료진 역할)가 가상환자에게 한 발화를 아래 세 항목에 대해 1~10점(정수, 10점이 가장 좋음)으로 채점하세요.

- speech_rate: 환자와 대화하기에 적절한 말속도인지 (제공된 말속도 수치를 근거로 판단. 너무 빠르거나 느리면 감점)
- fluency: 더듬거림, 반복, "음"/"어" 같은 filler word, 부자연스러운 긴 침묵 없이 매끄럽게 말했는지 (발화 텍스트와 침묵 지표를 근거로 판단)
- empathy: 환자의 감정과 상황을 배려하는 표현을 사용했는지 (발화 내용 자체를 근거로 판단)

각 항목마다 점수와 그 이유를 담은 한 줄 코멘트(한국어)를 반환하세요."""

_SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        "speech_rate_score": {"type": "integer"},
        "speech_rate_comment": {"type": "string"},
        "fluency_score": {"type": "integer"},
        "fluency_comment": {"type": "string"},
        "empathy_score": {"type": "integer"},
        "empathy_comment": {"type": "string"},
    },
    "required": [
        "speech_rate_score",
        "speech_rate_comment",
        "fluency_score",
        "fluency_comment",
        "empathy_score",
        "empathy_comment",
    ],
    "additionalProperties": False,
}


def score_turn(transcript: str, prosody: dict) -> dict:
    """말속도/유창성/공감을 경량 모델(Haiku)로 10점 만점 채점."""
    prompt = f"""[학습자 발화 텍스트]
{transcript}

[음향 지표]
말속도: {prosody.get('words_per_minute')} 단어/분
침묵: {prosody.get('pause_count')}회, 총 {prosody.get('total_pause_sec')}초, 최장 {prosody.get('longest_pause_sec')}초
"""
    response = client.messages.create(
        model=SCORE_MODEL,
        max_tokens=400,
        system=SCORE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": _SCORE_SCHEMA}},
    )
    return json.loads(_extract_text(response))


def _extract_text(response) -> str:
    return next((b.text for b in response.content if b.type == "text"), "")


def generate_patient_reply(persona: str, history: list[dict], user_text: str) -> str:
    messages = history + [{"role": "user", "content": user_text}]
    response = client.messages.create(
        model=MODEL,
        max_tokens=300,
        thinking={"type": "disabled"},
        system=PATIENT_SYSTEM_PROMPT.format(persona=persona),
        messages=messages,
    )
    return _extract_text(response)


def generate_coaching_feedback(transcript: str, prosody_summary_kr: str) -> str:
    prompt = f"""[발화 내용]
{transcript}

[음향 분석 요약]
{prosody_summary_kr}
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        thinking={"type": "disabled"},
        system=COACH_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response)
