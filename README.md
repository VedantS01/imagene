# Piano Simulator

A realistic piano simulator built with React, TypeScript, and Tone.js.

## Features
1.  **PianoScript**: A human-readable language to represent piano music.
2.  **Playback**: Realistic piano sound synthesis using Tone.js.
3.  **Visualizer**: Interactive piano keyboard UI.
4.  **Listening Engine**: Convert microphone input (piano sounds) into PianoScript using Essentia.js (WASM).

## Development Plan
1.  **Project Setup**: React + TypeScript + Vite (Completed).
2.  **Language Engine**: Define syntax and parser for PianoScript.
3.  **Playback Engine**: Implement audio synthesis.
4.  **UI Implementation**: Build the keyboard and editor.
5.  **Listening Engine**: Implement pitch detection and transcription (In Progress - Essentia.js integration).

## Getting Started

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the development server:
    ```bash
    npm run dev
    ```
    *Note: The application uses a WASM file for audio analysis which is served from the `public` directory.*

3.  Build for production:
    ```bash
    npm run build
    ```
