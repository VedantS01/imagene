/**
 * PlaybackEngine - High-quality piano playback using Tone.js
 * 
 * Uses the Salamander Grand Piano samples for realistic sound
 */

import * as Tone from 'tone';

// Parsed note from MusicXML
export interface PlayableNote {
  pitch: string; // e.g., "C4", "F#5"
  startTime: number; // in seconds
  duration: number; // in seconds
  velocity: number; // 0-1
}

/**
 * Grand Piano Sampler using Tone.js
 * Uses the free Salamander Grand Piano samples
 */
class GrandPianoSampler {
  private sampler: Tone.Sampler | null = null;
  private reverb: Tone.Reverb | null = null;
  private limiter: Tone.Limiter | null = null;
  private volume: Tone.Volume | null = null;
  private isLoaded: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this._initialize();
    return this.loadingPromise;
  }

  private async _initialize(): Promise<void> {
    // Create effects chain
    this.volume = new Tone.Volume(-6).toDestination();
    this.limiter = new Tone.Limiter(-3).connect(this.volume);
    this.reverb = new Tone.Reverb({
      decay: 2.5,
      wet: 0.2,
      preDelay: 0.01,
    }).connect(this.limiter);
    
    await this.reverb.generate();

    // Create sampler with Salamander Grand Piano samples
    // These are hosted by Tone.js on their CDN
    const baseUrl = 'https://tonejs.github.io/audio/salamander/';
    
    this.sampler = new Tone.Sampler({
      urls: {
        A0: 'A0.mp3',
        C1: 'C1.mp3',
        'D#1': 'Ds1.mp3',
        'F#1': 'Fs1.mp3',
        A1: 'A1.mp3',
        C2: 'C2.mp3',
        'D#2': 'Ds2.mp3',
        'F#2': 'Fs2.mp3',
        A2: 'A2.mp3',
        C3: 'C3.mp3',
        'D#3': 'Ds3.mp3',
        'F#3': 'Fs3.mp3',
        A3: 'A3.mp3',
        C4: 'C4.mp3',
        'D#4': 'Ds4.mp3',
        'F#4': 'Fs4.mp3',
        A4: 'A4.mp3',
        C5: 'C5.mp3',
        'D#5': 'Ds5.mp3',
        'F#5': 'Fs5.mp3',
        A5: 'A5.mp3',
        C6: 'C6.mp3',
        'D#6': 'Ds6.mp3',
        'F#6': 'Fs6.mp3',
        A6: 'A6.mp3',
        C7: 'C7.mp3',
        'D#7': 'Ds7.mp3',
        'F#7': 'Fs7.mp3',
        A7: 'A7.mp3',
        C8: 'C8.mp3',
      },
      baseUrl,
      release: 1,
      onload: () => {
        console.log('Piano samples loaded');
        this.isLoaded = true;
      },
    }).connect(this.reverb);

    // Wait for samples to load
    await Tone.loaded();
    this.isLoaded = true;
  }

  /**
   * Play a note immediately
   */
  playNoteNow(
    noteName: string,
    duration: number,
    velocity: number = 0.7
  ): void {
    if (!this.sampler || !this.isLoaded) {
      console.warn('Sampler not loaded yet');
      return;
    }

    // Convert note name to Tone.js format
    const toneNoteName = this.convertNoteName(noteName);
    
    this.sampler.triggerAttackRelease(
      toneNoteName,
      duration,
      Tone.now(),
      velocity
    );
  }

  /**
   * Play a note at a specific time offset
   */
  playNote(
    noteName: string,
    startTime: number,
    duration: number,
    velocity: number = 0.7
  ): void {
    if (!this.sampler || !this.isLoaded) {
      console.warn('Sampler not loaded yet');
      return;
    }

    // Convert note name to Tone.js format
    const toneNoteName = this.convertNoteName(noteName);
    
    // Schedule the note
    const now = Tone.now();
    this.sampler.triggerAttackRelease(
      toneNoteName,
      duration,
      now + startTime,
      velocity
    );
  }

  /**
   * Convert our note format to Tone.js format
   * Our format: C4, F#5, Bb3
   * Tone.js format: C4, F#5, Bb3 (same, but flats need converting)
   */
  private convertNoteName(noteName: string): string {
    // Replace 'b' flat notation with Tone.js style
    // Tone.js uses 'b' for flats which is the same
    return noteName;
  }

  setVolume(vol: number): void {
    if (this.volume) {
      // Convert 0-1 to dB (-60 to 0)
      const db = vol === 0 ? -Infinity : 20 * Math.log10(vol) - 6;
      this.volume.volume.value = db;
    }
  }

  getVolume(): number {
    if (this.volume) {
      const db = this.volume.volume.value;
      if (db === -Infinity) return 0;
      return Math.pow(10, (db + 6) / 20);
    }
    return 0.5;
  }

  async suspend(): Promise<void> {
    Tone.getTransport().stop();
    // Suspend the audio context to save resources
    const ctx = Tone.getContext().rawContext;
    if (ctx.state === 'running') {
      await ctx.suspend(0);
    }
  }

  async resume(): Promise<void> {
    await Tone.start();
    const ctx = Tone.getContext().rawContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  isReady(): boolean {
    return this.isLoaded;
  }

  dispose(): void {
    this.sampler?.dispose();
    this.reverb?.dispose();
    this.limiter?.dispose();
    this.volume?.dispose();
    this.sampler = null;
    this.reverb = null;
    this.limiter = null;
    this.volume = null;
    this.isLoaded = false;
    this.loadingPromise = null;
  }
}

/**
 * MusicXML Parser for playback
 */
export function parseMusicXMLForPlayback(musicXML: string): PlayableNote[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(musicXML, 'text/xml');
  const notes: PlayableNote[] = [];

  // Get divisions (pulses per quarter note)
  const divisionsElement = doc.querySelector('divisions');
  const divisions = divisionsElement ? parseInt(divisionsElement.textContent || '1', 10) : 1;

  // Get tempo from metronome or sound element
  let bpm = 120;
  
  // Try to find tempo in sound element
  const soundElement = doc.querySelector('sound[tempo]');
  if (soundElement) {
    bpm = parseFloat(soundElement.getAttribute('tempo') || '120');
  }
  
  // Try to find tempo in metronome element
  const metronomeElement = doc.querySelector('metronome per-minute');
  if (metronomeElement && metronomeElement.textContent) {
    bpm = parseFloat(metronomeElement.textContent);
  }

  // Calculate seconds per division
  const secondsPerBeat = 60 / bpm;
  const secondsPerDivision = secondsPerBeat / divisions;

  // Track current time for each measure
  let currentTime = 0;

  // Process all notes
  const noteElements = doc.querySelectorAll('note');
  noteElements.forEach((noteEl) => {
    // Skip grace notes
    if (noteEl.querySelector('grace')) return;

    // Check if it's a rest
    if (noteEl.querySelector('rest')) {
      const durationEl = noteEl.querySelector('duration');
      if (durationEl) {
        const duration = parseInt(durationEl.textContent || '0', 10);
        if (!noteEl.querySelector('chord')) {
          currentTime += duration * secondsPerDivision;
        }
      }
      return;
    }

    // Check if it's a chord (simultaneous with previous note)
    const isChord = noteEl.querySelector('chord') !== null;

    // Get pitch
    const pitchEl = noteEl.querySelector('pitch');
    if (!pitchEl) return;

    const step = pitchEl.querySelector('step')?.textContent || 'C';
    const octave = pitchEl.querySelector('octave')?.textContent || '4';
    const alter = pitchEl.querySelector('alter')?.textContent;

    let noteName = step;
    if (alter === '1') noteName += '#';
    else if (alter === '-1') noteName += 'b';
    noteName += octave;

    // Get duration
    const durationEl = noteEl.querySelector('duration');
    const duration = durationEl
      ? parseInt(durationEl.textContent || '1', 10) * secondsPerDivision
      : secondsPerDivision;

    // Get dynamics/velocity from various sources
    let velocity = 0.7;
    
    // Check for dynamics marking
    const dynamics = noteEl.querySelector('dynamics');
    if (dynamics) {
      if (dynamics.querySelector('ppp')) velocity = 0.2;
      else if (dynamics.querySelector('pp')) velocity = 0.3;
      else if (dynamics.querySelector('p')) velocity = 0.4;
      else if (dynamics.querySelector('mp')) velocity = 0.5;
      else if (dynamics.querySelector('mf')) velocity = 0.6;
      else if (dynamics.querySelector('f')) velocity = 0.75;
      else if (dynamics.querySelector('ff')) velocity = 0.85;
      else if (dynamics.querySelector('fff')) velocity = 0.95;
    }

    // For chords, use the same start time as the previous note
    const startTime = isChord && notes.length > 0 
      ? notes[notes.length - 1].startTime 
      : currentTime;

    notes.push({
      pitch: noteName,
      startTime,
      duration: Math.max(duration, 0.1), // Minimum duration for audibility
      velocity,
    });

    // Update current time (only for non-chord notes)
    if (!isChord) {
      currentTime += duration;
    }
  });

  return notes;
}

/**
 * Playback Controller
 */
export class PlaybackEngine {
  private piano: GrandPianoSampler;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private playbackStartTime: number = 0;
  private pausedAt: number = 0;
  private currentNotes: PlayableNote[] = [];
  private scheduledNotes: Set<number> = new Set();
  private animationFrame: number | null = null;
  private onProgressCallback: ((time: number, duration: number) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    this.piano = new GrandPianoSampler();
  }

  async initialize(): Promise<void> {
    await this.piano.initialize();
  }

  /**
   * Check if the engine is ready
   */
  isReady(): boolean {
    return this.piano.isReady();
  }

  /**
   * Load MusicXML for playback
   */
  loadMusicXML(musicXML: string): void {
    this.stop();
    this.currentNotes = parseMusicXMLForPlayback(musicXML);
    console.log(`Loaded ${this.currentNotes.length} notes for playback`);
  }

  /**
   * Get total duration of loaded music
   */
  getDuration(): number {
    if (this.currentNotes.length === 0) return 0;
    return Math.max(...this.currentNotes.map((n) => n.startTime + n.duration));
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    if (this.currentNotes.length === 0) return;
    if (this.isPlaying && !this.isPaused) return;

    // Ensure Tone.js context is running
    await Tone.start();
    await this.piano.resume();

    if (this.isPaused) {
      // Resume from paused position
      this.playbackStartTime = performance.now() - this.pausedAt * 1000;
      this.isPaused = false;
    } else {
      // Start from beginning
      this.playbackStartTime = performance.now();
      this.scheduledNotes.clear();
    }

    this.isPlaying = true;
    this.scheduleNotes();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.isPlaying) return;

    this.isPaused = true;
    this.isPlaying = false;
    this.pausedAt = (performance.now() - this.playbackStartTime) / 1000;
    await this.piano.suspend();

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Stop playback and reset
   */
  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedAt = 0;
    this.scheduledNotes.clear();

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    const wasPlaying = this.isPlaying && !this.isPaused;
    this.stop();
    this.pausedAt = Math.max(0, Math.min(time, this.getDuration()));
    this.isPaused = true;

    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.piano.setVolume(volume);
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.piano.getVolume();
  }

  /**
   * Check if playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying && !this.isPaused;
  }

  /**
   * Check if paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Set progress callback
   */
  onProgress(callback: (time: number, duration: number) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * Set end callback
   */
  onEnd(callback: () => void): void {
    this.onEndCallback = callback;
  }

  /**
   * Play a single note (for preview/testing)
   */
  playNote(noteName: string, duration: number = 0.5, velocity: number = 0.7): void {
    this.piano.playNoteNow(noteName, duration, velocity);
  }

  /**
   * Schedule and play notes
   */
  private scheduleNotes(): void {
    if (!this.isPlaying || this.isPaused) return;

    const currentTime = (performance.now() - this.playbackStartTime) / 1000;
    const lookAhead = 0.3; // Schedule 300ms ahead for smoother playback
    const duration = this.getDuration();

    // Schedule notes within the look-ahead window
    this.currentNotes.forEach((note, index) => {
      if (this.scheduledNotes.has(index)) return;

      if (note.startTime >= currentTime && note.startTime < currentTime + lookAhead) {
        const delay = note.startTime - currentTime;
        this.piano.playNote(note.pitch, delay, note.duration, note.velocity);
        this.scheduledNotes.add(index);
      }
    });

    // Update progress
    if (this.onProgressCallback) {
      this.onProgressCallback(currentTime, duration);
    }

    // Check if playback is complete
    if (currentTime >= duration) {
      this.stop();
      if (this.onEndCallback) {
        this.onEndCallback();
      }
      return;
    }

    // Continue scheduling
    this.animationFrame = requestAnimationFrame(() => this.scheduleNotes());
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    this.piano.dispose();
  }
}

// Singleton instance
let playbackEngineInstance: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!playbackEngineInstance) {
    playbackEngineInstance = new PlaybackEngine();
  }
  return playbackEngineInstance;
}
