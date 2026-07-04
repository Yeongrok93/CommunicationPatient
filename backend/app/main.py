import asyncio
import base64
import json
import os
import tempfile
import uuid

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import audio_utils, llm, prosody, tts, whisper_stt

app = FastAPI(title="communication-mic backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://communication-patient.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

TMP_DIR = os.path.join(tempfile.gettempdir(), "comm_mic_audio")
os.makedirs(TMP_DIR, exist_ok=True)


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}


@app.post("/api/turn")
async def turn(
    audio: UploadFile,
    persona: str = Form(...),
    history: str = Form("[]"),
):
    """학습자 발화 1턴 처리: 전사 + 운율분석 + 가상환자 응답."""
    wav_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}.wav")
    raw_bytes = await audio.read()
    audio_utils.to_wav(raw_bytes, wav_path)

    try:
        stt_result = whisper_stt.transcribe(wav_path)
        if not stt_result["text"].strip():
            raise HTTPException(
                status_code=422,
                detail="음성이 인식되지 않았습니다. 마이크에 더 가까이서, 좀 더 길게 말씀해주세요.",
            )

        prosody_result = prosody.analyze_prosody(wav_path, stt_result["word_count"])
        parsed_history = json.loads(history)

        # 채점(Haiku)과 환자 응답 생성(Sonnet)은 서로 의존성이 없어 동시에 실행
        scores, patient_reply = await asyncio.gather(
            asyncio.to_thread(llm.score_turn, stt_result["text"], prosody_result),
            asyncio.to_thread(
                llm.generate_patient_reply, persona, parsed_history, stt_result["text"]
            ),
        )
        patient_audio_bytes = await asyncio.to_thread(tts.synthesize_speech, patient_reply)
        patient_audio_b64 = base64.b64encode(patient_audio_bytes).decode("ascii")

        updated_history = parsed_history + [
            {"role": "user", "content": stt_result["text"]},
            {"role": "assistant", "content": patient_reply},
        ]
    finally:
        os.remove(wav_path)

    return {
        "transcript": stt_result["text"],
        "prosody": prosody_result,
        "scores": scores,
        "patient_reply": patient_reply,
        "patient_audio_b64": patient_audio_b64,
        "history": updated_history,
    }


class TurnLog(BaseModel):
    transcript: str
    scores: dict


class SessionFeedbackRequest(BaseModel):
    turns: list[TurnLog]


@app.post("/api/session-feedback")
def session_feedback(req: SessionFeedbackRequest):
    """세션 종료 시 누적 발화를 종합해 구조화된 리포트 생성."""
    combined_transcript = "\n".join(
        f"[{i+1}번째 발화] {t.transcript}" for i, t in enumerate(req.turns)
    )
    combined_scores = "\n".join(
        f"[{i+1}번째 발화] 말속도 {t.scores.get('speech_rate_score')}/10"
        f"({t.scores.get('speech_rate_comment')}), "
        f"유창성 {t.scores.get('fluency_score')}/10({t.scores.get('fluency_comment')}), "
        f"공감 {t.scores.get('empathy_score')}/10({t.scores.get('empathy_comment')})"
        for i, t in enumerate(req.turns)
    )
    return llm.generate_session_report(combined_transcript, combined_scores)
