import * as Tone from 'tone';
import { YIN } from 'pitchfinder';

export class ListeningEngine {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private isListening: boolean = false;
  private detectPitch: ((signal: Float32Array) => number | null) | null = null;
  private onNoteDetected: (note: string) => void;
  private lastNote: string | null = null;
  private lastNoteTime: number = 0;

  constructor(onNoteDetected: (note: string) => void) {
    this.onNoteDetected = onNoteDetected;
  }

  public async start() {
    if (this.isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.audioContext = new window.AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

      // Noise filtering
      const highpass = this.audioContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 80; // Remove low rumble

      const lowpass = this.audioContext.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 4000; // Remove high frequency noise

      this.mediaStreamSource.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(this.analyser);
      
      this.detectPitch = YIN({ sampleRate: this.audioContext.sampleRate });
      
      this.isListening = true;
      this.listenLoop();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }

  public stop() {
    this.isListening = false;
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private listenLoop = () => {
    if (!this.isListening || !this.analyser || !this.detectPitch) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS (Root Mean Square) for volume detection
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);

    // Noise Gate: Ignore sounds below a certain volume threshold
    // 0.01 is roughly -40dB, 0.02 is roughly -34dB
    if (rms < 0.02) {
      requestAnimationFrame(this.listenLoop);
      return;
    }

    const frequency = this.detectPitch(buffer);
    if (frequency && frequency > 0) {
      // Convert frequency to note
      const note = Tone.Frequency(frequency).toNote();
      
      // Simple debounce / stability check
      const now = Date.now();
      // Reduced debounce to 50ms for faster detection (was 200ms)
      if (note !== this.lastNote || (now - this.lastNoteTime > 50)) {
         this.onNoteDetected(note);
         this.lastNote = note;
         this.lastNoteTime = now;
      }
    }

    requestAnimationFrame(this.listenLoop);
  }
}
