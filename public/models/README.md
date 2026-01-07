# ONNX Models Directory

Place the following model files in this directory:

## Required Model: Basic Pitch

1. Download the Basic Pitch ONNX model from:
   - https://github.com/spotify/basic-pitch (convert from TensorFlow)
   - Or use a pre-converted ONNX model

2. Name the file: `basic-pitch-q8.onnx` for the quantized int8 version

## Model Specifications

The expected model should have:
- **Input**: Mel spectrogram tensor `[batch, time_frames, mel_bins]`
  - mel_bins: 256
  - Sample rate: 22050 Hz
  - Hop size: 256 samples
  - FFT size: 2048 samples

- **Output**: Piano roll probabilities `[batch, time_frames, 88]`
  - 88 piano keys (MIDI 21-108)
  - Values 0.0 to 1.0

## Converting from TensorFlow

```python
import tensorflow as tf
import tf2onnx

# Load the Basic Pitch model
model = tf.keras.models.load_model('basic_pitch_model')

# Convert to ONNX
spec = (tf.TensorSpec((None, None, 256), tf.float32, name="input"),)
output_path = "public/models/basic-pitch.onnx"

model_proto, _ = tf2onnx.convert.from_keras(
    model,
    input_signature=spec,
    output_path=output_path,
    opset=13
)

# Quantize to int8 (optional, for smaller size)
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    "public/models/basic-pitch.onnx",
    "public/models/basic-pitch-q8.onnx",
    weight_type=QuantType.QInt8
)
```

## ONNX Runtime WASM Files

Copy the following files from `node_modules/onnxruntime-web/dist/` to `public/onnx/`:

- `ort-wasm.wasm`
- `ort-wasm-simd.wasm`
- `ort-wasm-threaded.wasm`
- `ort-wasm-simd-threaded.wasm`

This allows the ONNX Runtime to load the WASM files correctly.
