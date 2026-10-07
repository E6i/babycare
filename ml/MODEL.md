# Cry classification model

- Artifact: `models/best_model.keras`, supplied with the original project.
- Runtime: TensorFlow 2.17.1 / Keras 3.12.2.
- Artifact save metadata: Keras 3.13.2, `2026-03-09@07:49:49` (timezone unspecified).
- Backbone: MobileNetV2 (`mobilenetv2_1.00_128`), 154 internal layers.
- Head: global average pooling → Dense(384, ReLU) → BatchNorm → Dropout(0.4) → Dense(192, ReLU) → BatchNorm → Dropout(0.25) → Dense(5, softmax).
- Parameters: 2,827,077 total; 2,291,781 trainable and 535,296 non-trainable when loaded in the inspected runtime.
- Saved augmentation: GaussianNoise stddev 0.01; RandomTranslation height 0.03, width 0.06, nearest fill and bilinear interpolation.
- Saved optimizer: Adam, checkpoint learning rate approximately 1.25e-6; sparse categorical cross-entropy; accuracy metric configured, with no verified accuracy result supplied.
- Input: three-second audio windows, 22,050 Hz; `(128, 128, 3)` feature tensor.
- Default labels: `background, belly_pain, discomfort, hungry, tired`.
- Inference implementation: `../frontend/scripts/infer_cry.py`.

The default label order is inherited from the application configuration. Verify it against training records before relying on results. Training data provenance, class balance, evaluation metrics, and redistribution terms have not been documented in the supplied source. No accuracy, clinical reliability, or ownership claim is made here.

A model output is not a medical diagnosis. Low-confidence or ambiguous outputs are handled by the application; this does not establish reliability. Do not commit real child recordings as examples.

Read the [detailed technical guide](../docs/TECHNICAL_GUIDE.md) for augmentation semantics, exact preprocessing, saved training configuration, uncertainty rules, and discrepancies with the older presentation. The [implementation reference](../docs/IMPLEMENTATION_REFERENCE.md) contains every serialized layer setting. Regenerate it from the repository root with `python3 ml/inspect_artifact.py`.
