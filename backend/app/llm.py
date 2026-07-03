"""Claude API 연동: 가상환자 응답 생성 + 커뮤니케이션 코칭 피드백."""
import os

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-5"

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

# NOTE: 아래 임계값은 문헌 기반 참고치로 잡은 placeholder입니다.
# 정식 연구 단계에서는 숙련자(교수/SP) baseline 녹음 대비 상대평가로 교체 필요.
_THRESHOLDS = {
    "wpm_fast": 170,
    "wpm_slow": 90,
    "f0_std_low": 15.0,
    "pause_interrupt_sec": 0.3,
    "pause_long_sec": 2.5,
}


def summarize_prosody_kr(p: dict) -> str:
    notes = []

    wpm = p.get("words_per_minute") or 0
    if wpm > _THRESHOLDS["wpm_fast"]:
        notes.append(f"말속도가 빠른 편(약 {wpm} 단어/분)")
    elif 0 < wpm < _THRESHOLDS["wpm_slow"]:
        notes.append(f"말속도가 느린 편(약 {wpm} 단어/분)")
    else:
        notes.append(f"말속도는 무난한 편(약 {wpm} 단어/분)")

    f0_std = p.get("f0_std_hz")
    if f0_std is not None:
        if f0_std < _THRESHOLDS["f0_std_low"]:
            notes.append(f"억양 변화가 적어 다소 단조롭게 들릴 수 있음(F0 표준편차 {f0_std}Hz)")
        else:
            notes.append(f"억양 변화가 있는 편(F0 표준편차 {f0_std}Hz)")

    longest_pause = p.get("longest_pause_sec", 0)
    if longest_pause > _THRESHOLDS["pause_long_sec"]:
        notes.append(f"가장 긴 침묵이 {longest_pause}초로 다소 길게 끊긴 구간이 있음")

    notes.append(
        f"총 발화 {p.get('duration_sec')}초 중 무음 구간 {p.get('total_pause_sec')}초"
        f"(침묵 {p.get('pause_count')}회)"
    )

    return " / ".join(notes)


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
