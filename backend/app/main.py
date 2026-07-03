import json
import os
import tempfile
import uuid

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import audio_utils, llm, prosody, whisper_stt

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


@app.get("/api/health")
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
        prosody_summary_kr = llm.summarize_prosody_kr(prosody_result)

        parsed_history = json.loads(history)
        patient_reply = llm.generate_patient_reply(
            persona, parsed_history, stt_result["text"]
        )

        updated_history = parsed_history + [
            {"role": "user", "content": stt_result["text"]},
            {"role": "assistant", "content": patient_reply},
        ]
    finally:
        os.remove(wav_path)

    return {
        "transcript": stt_result["text"],
        "prosody": prosody_result,
        "prosody_summary_kr": prosody_summary_kr,
        "patient_reply": patient_reply,
        "history": updated_history,
    }


class TurnLog(BaseModel):
    transcript: str
    prosody_summary_kr: str


class SessionFeedbackRequest(BaseModel):
    turns: list[TurnLog]


@app.post("/api/session-feedback")
def session_feedback(req: SessionFeedbackRequest):
    """세션 종료 시 누적 발화를 종합해 코칭 피드백 생성."""
    combined_transcript = "\n".join(
        f"[{i+1}번째 발화] {t.transcript}" for i, t in enumerate(req.turns)
    )
    combined_prosody = "\n".join(
        f"[{i+1}번째 발화] {t.prosody_summary_kr}" for i, t in enumerate(req.turns)
    )
    feedback = llm.generate_coaching_feedback(combined_transcript, combined_prosody)
    return {"feedback": feedback}
