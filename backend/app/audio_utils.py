"""브라우저에서 올라오는 webm/opus 등 임의 포맷을 16kHz mono WAV로 변환.

시스템 ffmpeg 설치 없이 PyAV(faster-whisper 의존성으로 이미 설치됨)만으로 처리.
Parselmouth(Praat)가 안정적으로 읽는 포맷이 WAV이므로, STT/프로소디 분석 모두
이 함수로 만든 동일한 WAV 파일을 입력으로 사용한다.
"""
import io
import wave

import av
import numpy as np

TARGET_SR = 16000


def to_wav(raw_bytes: bytes, out_path: str) -> None:
    container = av.open(io.BytesIO(raw_bytes))
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="s16", layout="mono", rate=TARGET_SR)

    chunks = []
    for packet in container.demux(stream):
        for frame in packet.decode():
            for rframe in resampler.resample(frame):
                chunks.append(rframe.to_ndarray())
    container.close()

    if not chunks:
        raise ValueError("오디오에서 프레임을 디코딩하지 못했습니다.")

    pcm = np.concatenate(chunks, axis=1).astype(np.int16).tobytes()
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_SR)
        wf.writeframes(pcm)
