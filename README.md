# Imagene 🎹

Real-time polyphonic piano transcription in your browser. Imagene listens to piano audio from your microphone and converts it into sheet music notation.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![React](https://img.shields.io/badge/React-18-blue.svg)

## Features

- **Real-time Transcription**: Captures piano audio and transcribes it as you play
- **Privacy-First**: All processing happens locally in your browser - no audio sent to servers
- **Sheet Music Export**: Download transcriptions as MusicXML files compatible with notation software
- **Live Visualization**: Real-time piano roll display showing detected notes
- **Adjustable Settings**: Customize BPM, time signature, and detection thresholds

## Architecture

Imagene uses a multi-threaded architecture to ensure smooth performance:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Main Thread   │────▶│  Audio Worklet   │────▶│  Worker Thread  │
│   (React UI)    │     │ (Audio Capture)  │     │  (ML Inference) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │                        ▼                        │
        │               SharedArrayBuffer                 │
        │              (Lock-free Ring Buffer)            │
        │                                                 │
        ◀─────────────── Detected Notes ──────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Audio Capture | AudioWorklet + SharedArrayBuffer | Glitch-free real-time audio acquisition |
| DSP | Mel Spectrogram (WASM) | Feature extraction for ML model |
| ML Inference | ONNX Runtime Web | Neural network execution (CPU/WebGPU) |
| Notation | OpenSheetMusicDisplay | MusicXML rendering |
| State | Zustand | Application state management |

## Getting Started

### Prerequisites

- Node.js 18+ 
- Modern browser with SharedArrayBuffer support (Chrome, Firefox, Edge)
- Microphone access

### Installation

```bash
# Clone the repository
git clone https://github.com/VedantS01/imagene.git
cd imagene

# Install dependencies
npm install

# Copy ONNX Runtime WASM files
cp node_modules/onnxruntime-web/dist/ort-wasm*.wasm public/onnx/

# Start development server
npm run dev
```

### Model Setup

1. Download or convert a Basic Pitch compatible ONNX model
2. Place it in `public/models/basic-pitch-q8.onnx`
3. See `public/models/README.md` for detailed instructions

## Usage

1. Open the application in your browser (default: http://localhost:5173)
2. Click "Start Recording" to begin
3. Play piano near your microphone
4. Click "Stop Recording" when finished
5. View the transcription and download as MusicXML

## Technical Details

### Audio Processing Pipeline

1. **Capture**: AudioWorklet captures 128-sample blocks at native sample rate
2. **Buffer**: Lock-free ring buffer transfers data to worker thread
3. **Resample**: Audio is resampled to 22.05kHz (model input rate)
4. **Features**: Mel spectrogram computed with 2048-sample windows
5. **Inference**: CNN processes spectrogram → piano roll probabilities
6. **Decode**: Hysteresis thresholding extracts note events
7. **Quantize**: Notes are snapped to musical grid
8. **Render**: MusicXML generated and rendered as sheet music

### Addressing Piano Acoustics

The neural network approach handles challenging piano characteristics:

- **Inharmonicity**: CNNs learn non-linear partial relationships
- **Percussive Attacks**: Separate onset detection from sustain
- **Sympathetic Resonance**: Contextual analysis distinguishes sources
- **Double Decay**: Low offset threshold captures full note duration

### Browser Requirements

SharedArrayBuffer requires cross-origin isolation headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Vite dev server is configured to serve these headers automatically.

## Project Structure

```
src/
├── audio/
│   ├── AudioEngine.ts       # Audio context and worklet management
│   ├── AudioRecorderWorklet.ts  # AudioWorkletProcessor
│   └── RingBuffer.ts        # SharedArrayBuffer ring buffer
├── components/
│   ├── Controls.tsx         # Recording controls and settings
│   ├── PianoRoll.tsx        # Real-time visualization
│   └── SheetMusicDisplay.tsx # OSMD wrapper
├── hooks/
│   └── useTranscription.ts  # Transcription orchestration hook
├── music/
│   ├── MusicXMLGenerator.ts # MusicXML construction
│   └── Quantizer.ts         # Beat detection and note quantization
├── store/
│   └── index.ts             # Zustand state store
├── types/
│   └── index.ts             # TypeScript interfaces
├── workers/
│   └── Processor.worker.ts  # DSP and ML inference worker
├── App.tsx                  # Main application component
└── main.tsx                 # Entry point
```

## Development

```bash
# Run development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Production build
npm run build

# Preview production build
npm run preview
```

## Acknowledgments

- [Basic Pitch](https://github.com/spotify/basic-pitch) - Piano transcription model by Spotify
- [ONNX Runtime Web](https://onnxruntime.ai/) - ML inference in browsers
- [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) - MusicXML rendering
- [Magenta](https://magenta.tensorflow.org/) - "Onsets and Frames" research

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ using React, Web Audio API, and ONNX Runtime
