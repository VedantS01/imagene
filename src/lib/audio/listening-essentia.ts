import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import * as Tone from 'tone';

export class ListeningEngineEssentia {
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private isListening: boolean = false;
  private essentia: any = null;
  private onNoteDetected: (note: string) => void;
  
  // Recording State
  private recordedChunks: Float32Array[] = [];
  private sampleRate: number = 44100;

  constructor(onNoteDetected: (note: string) => void) {
    this.onNoteDetected = onNoteDetected;
  }

  public async start() {
    console.log("ListeningEngineEssentia: start() called");
    if (this.isListening) {
        console.log("ListeningEngineEssentia: Already listening");
        return;
    }

    try {
      this.recordedChunks = []; // Reset recording buffer

      // Initialize Essentia
      if (!this.essentia) {
        console.log("ListeningEngineEssentia: Initializing Essentia...");
        
        let wasmModule;

        if (typeof EssentiaWASM === 'function') {
            wasmModule = await EssentiaWASM({
                locateFile: (path: string) => {
                    if (path.endsWith('.wasm')) {
                        return import.meta.env.BASE_URL + 'essentia-wasm.web.wasm';
                    }
                    return path;
                }
            });
        } else {
            console.warn("ListeningEngineEssentia: EssentiaWASM is not a function, using as object. WASM path configuration might be ignored.");
            wasmModule = EssentiaWASM;
        }
        
        this.essentia = new Essentia(wasmModule);
        console.log("ListeningEngineEssentia: Essentia instance created", this.essentia);
      }

      console.log("ListeningEngineEssentia: Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("ListeningEngineEssentia: Microphone access granted");
      
      this.audioContext = new window.AudioContext();
      this.sampleRate = this.audioContext.sampleRate;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

      // Use a ScriptProcessor for recording
      const bufferSize = 4096; 
      this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptNode.onaudioprocess = (event) => {
        if (!this.isListening) return;
        
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Store buffer for post-processing
        this.recordedChunks.push(new Float32Array(inputData));
      };

      this.mediaStreamSource.connect(this.scriptNode);
      this.scriptNode.connect(this.audioContext.destination);

      this.isListening = true;
      console.log("Essentia Listening Engine Started (Recording Mode)");

    } catch (err) {
      console.error("Error starting Essentia engine:", err);
    }
  }

  public stop() {
    this.isListening = false;
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  public async stopAndProcess(): Promise<{note: string, time: number, duration: number}[]> {
    console.log("ListeningEngineEssentia: stopAndProcess() called");
    this.stop();
    try {
        return this.processRecordedAudio();
    } catch (error) {
        console.error("ListeningEngineEssentia: Error processing audio", error);
        return [];
    }
  }

  private processRecordedAudio(): {note: string, time: number, duration: number}[] {
    if (this.recordedChunks.length === 0) {
        console.log("ListeningEngineEssentia: No audio recorded");
        return [];
    }

    console.log("Processing recorded audio...");
    
    // Flatten chunks
    const totalLength = this.recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const fullBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
        fullBuffer.set(chunk, offset);
        offset += chunk.length;
    }

    const detectedNotes: {note: string, time: number, duration: number}[] = [];
    
    // Analysis parameters
    const frameSize = 4096;
    const hopSize = 1024; // 4x overlap
    const tolerance = 0.15;
    const silenceThreshold = 0.02; // Slightly higher for post-processing stability
    const attackThreshold = 1.5;

    let lastRms = 0;
    let lastNote: string | null = null;
    let lastNoteTime = -1000; // ms

    console.log(`Total samples to process: ${fullBuffer.length}`);
    console.log(`Sample rate: ${this.sampleRate}`);
    console.log(`Frame size: ${frameSize}, Hop size: ${hopSize}`);

    // Iterate through buffer with hopSize
    for (let i = 0; i < fullBuffer.length - frameSize; i += hopSize) {
        try {
            const frame = fullBuffer.subarray(i, i + frameSize);
            const vectorInput = this.essentia.arrayToVector(frame);

            // 1. RMS
            const rmsResult = this.essentia.RMS(vectorInput);
            const currentRms = rmsResult.rms;

            // 2. PitchYin
            const result = this.essentia.PitchYin(
                vectorInput, 
                frameSize, 
                true, 
                5000, 
                40, 
                this.sampleRate,
                tolerance
            );

            const pitch = result.pitch;
            const confidence = result.pitchConfidence;

            // 3. Detection Logic
            if (currentRms > silenceThreshold && confidence > 0.6 && pitch > 0) {
                const note = Tone.Frequency(pitch).toNote();
                const currentTimeMs = (i / this.sampleRate) * 1000;
                
                const isAttack = currentRms > (lastRms * attackThreshold);
                const isNewNote = note !== lastNote;

                // Debounce: 200ms
                if ((isNewNote || isAttack) && (currentTimeMs - lastNoteTime > 200)) {
                    // Add note
                    detectedNotes.push({
                        note: note,
                        time: currentTimeMs / 1000, // seconds
                        duration: 2.0 // Fixed duration as requested
                    });
                    
                    lastNote = note;
                    lastNoteTime = currentTimeMs;
                }
            } else {
                if (currentRms < silenceThreshold) {
                    lastNote = null; // Reset on silence
                }
            }

            lastRms = currentRms;
            vectorInput.delete();
        } catch (e) {
            console.warn("Error processing frame", e);
        }
    }

    console.log(`Processed ${detectedNotes.length} notes.`);
    return detectedNotes;
  }
}
