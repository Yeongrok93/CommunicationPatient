"""Parselmouth 기반 음향(운율) 지표 추출."""
import parselmouth
from parselmouth.praat import call


def analyze_prosody(wav_path: str, word_count: int) -> dict:
    snd = parselmouth.Sound(wav_path)
    duration = snd.get_total_duration()

    pitch = snd.to_pitch()
    f0_values = pitch.selected_array["frequency"]
    f0_voiced = f0_values[f0_values != 0]

    intensity = snd.to_intensity()
    intensity_mean = call(intensity, "Get mean", 0, 0, "energy")

    # 무음 구간(pause) 검출 -> 발화 구간만 남겨 실질 말속도 계산에 사용
    textgrid = call(
        snd, "To TextGrid (silences)", 100, 0, -25, 0.1, 0.1, "silent", "sounding"
    )
    n_intervals = call(textgrid, "Get number of intervals", 1)
    pause_durations = []
    for i in range(1, n_intervals + 1):
        label = call(textgrid, "Get label of interval", 1, i)
        if label == "silent":
            start = call(textgrid, "Get start point", 1, i)
            end = call(textgrid, "Get end point", 1, i)
            pause_durations.append(end - start)

    total_pause = sum(pause_durations)
    speaking_time = max(duration - total_pause, 0.01)

    # 한국어 기준: 음절수 근사치가 없으므로 STT 단어수로 대체(추후 음절 카운트로 교체 가능)
    words_per_minute = (word_count / speaking_time) * 60 if word_count else 0.0

    return {
        "duration_sec": round(duration, 2),
        "f0_mean_hz": round(float(f0_voiced.mean()), 1) if len(f0_voiced) else None,
        "f0_std_hz": round(float(f0_voiced.std()), 1) if len(f0_voiced) else None,
        "intensity_mean_db": round(float(intensity_mean), 1),
        "pause_count": len(pause_durations),
        "total_pause_sec": round(total_pause, 2),
        "longest_pause_sec": round(max(pause_durations), 2) if pause_durations else 0.0,
        "words_per_minute": round(words_per_minute, 1),
    }
