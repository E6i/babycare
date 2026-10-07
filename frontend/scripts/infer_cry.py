import json
import logging
import os
import sys
import tempfile
import warnings
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ.setdefault("KERAS_BACKEND", "tensorflow")
warnings.filterwarnings("ignore", message="pkg_resources is deprecated.*")

import keras
import librosa
import numpy as np
import soundfile as sf
import tensorflow as tf

try:
    from pydub import AudioSegment

    PYDUB_AVAILABLE = True
except Exception:
    PYDUB_AVAILABLE = False

tf.get_logger().setLevel("ERROR")
logging.getLogger("absl").setLevel(logging.ERROR)

DEFAULT_CATEGORIES = ["background", "belly_pain", "discomfort", "hungry", "tired"]
IMG_SIZE = 128
SR = 22050
DURATION_SECONDS = 3.0

ADVICE_BY_CLASS = {
    "hungry": "The baby may be hungry. Try feeding in a calm environment and observe if crying settles.",
    "tired": "The baby may be tired. Try reducing noise, dimming lights, and using a gentle rocking routine.",
    "belly_pain": "The baby may have belly discomfort. Try gentle clockwise belly massage and burping support.",
    "discomfort": "The baby may be uncomfortable. Check diaper, clothing tightness, temperature, and sleeping position.",
    "background": "The recording appears to be mostly background sound. Try recording a clearer 3-second cry clip.",
}


def read_model_labels() -> list[str]:
    raw_labels = os.getenv("MODEL_LABELS") or os.getenv("PREDICTION_LABELS")
    if not raw_labels:
        return DEFAULT_CATEGORIES

    labels = [label.strip() for label in raw_labels.split(",") if label.strip()]
    if not labels:
        raise ValueError("MODEL_LABELS is set but does not contain any labels.")

    return labels


def strip_inactive_quantization_config(value):
    if isinstance(value, dict):
        return {
            key: strip_inactive_quantization_config(item)
            for key, item in value.items()
            if not (key == "quantization_config" and item is None)
        }

    if isinstance(value, list):
        return [strip_inactive_quantization_config(item) for item in value]

    return value


def load_prediction_model(model_path: Path):
    try:
        return keras.models.load_model(model_path, compile=False)
    except TypeError as error:
        if "quantization_config" not in str(error):
            raise

        with tempfile.TemporaryDirectory() as tmp_dir:
            patched_path = Path(tmp_dir) / model_path.name
            with ZipFile(model_path, "r") as source, ZipFile(patched_path, "w", ZIP_DEFLATED) as target:
                for entry in source.infolist():
                    data = source.read(entry.filename)
                    if entry.filename == "config.json":
                        config = strip_inactive_quantization_config(json.loads(data.decode("utf-8")))
                        data = json.dumps(config, separators=(",", ":")).encode("utf-8")
                    target.writestr(entry, data)

            return keras.models.load_model(patched_path, compile=False)


def load_audio(path: Path) -> tuple[np.ndarray, int]:
    try:
        y, sr = sf.read(str(path), dtype="float32")
    except Exception:
        if not PYDUB_AVAILABLE:
            raise RuntimeError("Unsupported audio format and pydub is not installed.")
        ext = path.suffix.lower().replace(".", "") or "wav"
        audio = AudioSegment.from_file(str(path), format=ext)
        audio = audio.set_frame_rate(SR).set_channels(1)
        samples = np.array(audio.get_array_of_samples()).astype(np.float32)
        y = samples / (2**15)
        sr = SR

    if y.ndim > 1:
        y = np.mean(y, axis=1)

    if sr != SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=SR)
        sr = SR

    return y.astype(np.float32), sr


def extract_features_from_segment(segment: np.ndarray, sr: int = SR) -> np.ndarray:
    mels = librosa.feature.melspectrogram(y=segment, sr=sr, n_mels=128, fmax=8000)
    mels_db = librosa.power_to_db(mels, ref=np.max)
    mels_db = np.pad(
        mels_db, ((0, 0), (0, max(0, IMG_SIZE - mels_db.shape[1]))), mode="constant"
    )[:, :IMG_SIZE]
    m1 = (mels_db - np.min(mels_db)) / (np.max(mels_db) - np.min(mels_db) + 1e-6)

    mfcc = librosa.feature.mfcc(y=segment, sr=sr, n_mfcc=64)
    mfcc_delta = librosa.feature.delta(mfcc)
    m2_raw = np.vstack([mfcc, mfcc_delta])
    m2 = np.pad(
        m2_raw, ((0, 0), (0, max(0, IMG_SIZE - m2_raw.shape[1]))), mode="constant"
    )[:, :IMG_SIZE]
    m2 = (m2 - np.min(m2)) / (np.max(m2) - np.min(m2) + 1e-6)

    delta = librosa.feature.delta(mels_db)
    m3 = (delta - np.min(delta)) / (np.max(delta) - np.min(delta) + 1e-6)

    return np.stack([m1, m2, m3], axis=-1)


def main():
    if len(sys.argv) < 2:
        raise ValueError("Usage: infer_cry.py <audio_path>")

    audio_path = Path(sys.argv[1]).resolve()
    repo_root = Path(__file__).resolve().parents[2]
    model_path = repo_root / "ml" / "models" / "best_model.keras"
    confidence_threshold = float(os.getenv("PREDICTION_CONFIDENCE_THRESHOLD", "0.45"))
    uncertain_floor = float(os.getenv("PREDICTION_UNCERTAIN_FLOOR", "0.32"))
    ambiguity_margin = float(os.getenv("PREDICTION_AMBIGUITY_MARGIN", "0.08"))
    categories = read_model_labels()

    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    model = load_prediction_model(model_path)
    y, sr = load_audio(audio_path)

    if len(y) == 0 or float(np.max(np.abs(y))) < 0.005:
        predicted_class = "background"
        confidence = 1.0
        signal_quality = "low"
        top_predictions = [{"label": "background", "score": 1.0}]
    else:
        y = librosa.util.fix_length(y, size=int(DURATION_SECONDS * sr))
        feat = extract_features_from_segment(y, sr).reshape(1, IMG_SIZE, IMG_SIZE, 3)
        probs = np.asarray(model.predict(feat, verbose=0)[0], dtype=np.float32)
        if len(categories) != len(probs):
            raise ValueError(
                f"Model output has {len(probs)} classes, but label mapping has {len(categories)} labels: {categories}"
            )

        sorted_indices = np.argsort(probs)[::-1][:3]
        top_predictions = [
            {"label": categories[int(i)], "score": round(float(probs[int(i)]), 4)}
            for i in sorted_indices
        ]
        idx = int(np.argmax(probs))
        predicted_class = categories[idx]
        confidence = float(probs[idx])
        second_confidence = float(probs[int(sorted_indices[1])]) if len(sorted_indices) > 1 else 0.0
        is_ambiguous = (confidence - second_confidence) < ambiguity_margin
        signal_quality = "good" if confidence >= confidence_threshold and not is_ambiguous else "low_confidence"

        if predicted_class != "background" and confidence < uncertain_floor:
            predicted_class = "uncertain"

    if predicted_class == "uncertain":
        advice = (
            "The model confidence is low for this audio. Please provide a clearer 3-second cry clip and "
            "check feeding, comfort, sleep, and tummy indicators."
        )
    else:
        advice = ADVICE_BY_CLASS.get(
            predicted_class,
            "The cry was detected, but the exact reason is unclear. Please check feeding, comfort, and sleep needs.",
        )
        if signal_quality == "low_confidence" and predicted_class != "background":
            advice = (
                "This is the closest audio pattern, but confidence is limited. Use it as a supportive clue, "
                "then compare it with feeding, diaper, temperature, sleep, and tummy signs. "
                + advice
            )

    print(
        json.dumps(
            {
                "predicted_class": predicted_class,
                "confidence": round(confidence, 4),
                "advice": advice,
                "signal_quality": signal_quality,
                "top_predictions": top_predictions,
            }
        )
    )


if __name__ == "__main__":
    main()
