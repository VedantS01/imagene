import * as Tone from 'tone';
import type { PianoScript } from '../language/types';

export class PianoPlayer {
  private sampler: Tone.Sampler;
  private waveform: Tone.Waveform;
  private isLoaded: boolean = false;

  constructor() {
    this.waveform = new Tone.Waveform(1024);

    // Using Salamander Grand Piano samples from Tone.js examples
    this.sampler = new Tone.Sampler({
      urls: {
        A0: "A0.mp3",
        C1: "C1.mp3",
        "D#1": "Ds1.mp3",
        "F#1": "Fs1.mp3",
        A1: "A1.mp3",
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C3: "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        A6: "A6.mp3",
        C7: "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        A7: "A7.mp3",
        C8: "C8.mp3"
      },
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    }).connect(this.waveform).toDestination();

    Tone.loaded().then(() => {
      this.isLoaded = true;
      console.log("Piano samples loaded");
    });
  }

  public async ensureLoaded() {
    if (!this.isLoaded) {
      await Tone.loaded();
      this.isLoaded = true;
    }
  }

  public async play(script: PianoScript) {
    await this.ensureLoaded();
    await Tone.start();

    // Stop and clear any previous playback
    this.stop();

    // Schedule notes
    script.forEach((event) => {
      const note = `${event.note}${event.octave}`;
      Tone.Transport.schedule((time) => {
        this.sampler.triggerAttackRelease(note, event.duration, time);
      }, event.startTime);
    });

    // Start the transport
    Tone.Transport.start();
  }

  public pause() {
    Tone.Transport.pause();
  }

  public resume() {
    Tone.Transport.start();
  }

  public seek(seconds: number) {
    Tone.Transport.seconds = seconds;
  }

  public getCurrentTime(): number {
    return Tone.Transport.seconds;
  }

  public getState() {
    return Tone.Transport.state;
  }

  public playNote(note: string, duration: string | number = "8n") {
    if (this.isLoaded) {
      this.sampler.triggerAttackRelease(note, duration);
    }
  }

  public getWaveformData(): Float32Array {
    return this.waveform.getValue();
  }

  public stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.sampler.releaseAll();
  }

  public setVolume(db: number) {
    this.sampler.volume.value = db;
  }
}
