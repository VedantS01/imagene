import { useState, useRef, useEffect } from 'react'
import './App.css'
import { Piano } from './components/Piano/Piano'
import { WaveformVisualizer } from './components/Visualizer/WaveformVisualizer'
import { PianoPlayer } from './lib/audio'
import { ListeningEngineEssentia } from './lib/audio/listening-essentia'
import { parsePianoScript } from './lib/language'
import type { PianoScript } from './lib/language'
import { 
  Play, Pause, Square, Mic, MicOff, 
  Circle, StopCircle, Upload, Download, Music 
} from 'lucide-react';

// Initialize player outside component to persist across re-renders
const player = new PianoPlayer();

const SAMPLE_TUNES = {
  "Twinkle Twinkle": `C4 @ 0.0s for 0.5s
C4 @ 0.5s for 0.5s
G4 @ 1.0s for 0.5s
G4 @ 1.5s for 0.5s
A4 @ 2.0s for 0.5s
A4 @ 2.5s for 0.5s
G4 @ 3.0s for 1.0s`,
  "C Major Scale": `C4 @ 0.0s for 0.4s
D4 @ 0.4s for 0.4s
E4 @ 0.8s for 0.4s
F4 @ 1.2s for 0.4s
G4 @ 1.6s for 0.4s
A4 @ 2.0s for 0.4s
B4 @ 2.4s for 0.4s
C5 @ 2.8s for 0.4s`,
  "Chords": `C4 @ 0.0s for 1.0s
E4 @ 0.0s for 1.0s
G4 @ 0.0s for 1.0s
F4 @ 1.0s for 1.0s
A4 @ 1.0s for 1.0s
C5 @ 1.0s for 1.0s`
};

function App() {
  const [script, setScript] = useState<string>(SAMPLE_TUNES["Twinkle Twinkle"]);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  
  // States
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  
  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [parsedEvents, setParsedEvents] = useState<PianoScript>([]);
  
  // Refs
  // const listeningEngineRef = useRef<ListeningEngine | null>(null);
  const listeningEngineRef = useRef<ListeningEngineEssentia | null>(null);
  const startTimeRef = useRef<number>(0); // For Listening/Recording relative time
  const recordingNotesRef = useRef<Map<string, number>>(new Map());
  const requestRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Animation Loop
  useEffect(() => {
    const animate = () => {
      if (player.getState() === 'started') {
        const time = player.getCurrentTime();
        setCurrentTime(time);

        // Update active notes based on playback
        const active = new Set<string>();
        parsedEvents.forEach(event => {
          if (time >= event.startTime && time < event.startTime + event.duration) {
            active.add(`${event.note}${event.octave}`);
          }
        });
        setActiveNotes(active);
      } else if (isPlaying) {
        setIsPlaying(false);
        setActiveNotes(new Set());
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, parsedEvents]);

  // Listening Engine Setup
  useEffect(() => {
    listeningEngineRef.current = new ListeningEngineEssentia((note) => {
      // Visual feedback
      setActiveNotes(prev => {
        const next = new Set(prev);
        next.add(note);
        setTimeout(() => {
          setActiveNotes(current => {
            const updated = new Set(current);
            updated.delete(note);
            return updated;
          });
        }, 200);
        return next;
      });

      // Append to script if listening
      if (startTimeRef.current === 0) startTimeRef.current = Date.now();
      const time = (Date.now() - startTimeRef.current) / 1000;
      setScript(prev => `${prev}\n${note} @ ${time.toFixed(2)}s for 0.2s`);
    });

    return () => {
      listeningEngineRef.current?.stop();
    };
  }, []);

  // Handlers
  const handlePlay = async () => {
    if (currentTime > 0 && currentTime < duration && parsedEvents.length > 0) {
      player.resume();
      setIsPlaying(true);
      return;
    }

    const events = parsePianoScript(script);
    setParsedEvents(events);
    
    const lastEvent = events[events.length - 1];
    const dur = lastEvent ? lastEvent.startTime + lastEvent.duration : 0;
    setDuration(dur);

    await player.play(events);
    setIsPlaying(true);
  };

  const handlePause = () => {
    player.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    player.stop();
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveNotes(new Set());
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    player.seek(time);
  };

  const toggleListening = async () => {
    if (!listeningEngineRef.current) return;

    if (isListening) {
      console.log("App: Stopping listening...");
      setIsListening(false);
      
      // Use setTimeout to allow UI to update (button toggle) before heavy processing
      setTimeout(async () => {
        try {
            if (!listeningEngineRef.current) return;
            const notes = await listeningEngineRef.current.stopAndProcess();
            console.log("App: Processed notes:", notes);
            
            if (notes.length > 0) {
                setScript(prev => {
                    // Calculate current duration to append at the end
                    const events = parsePianoScript(prev);
                    const lastEvent = events[events.length - 1];
                    const currentDuration = lastEvent ? lastEvent.startTime + lastEvent.duration : 0;
                    
                    const offset = currentDuration; 
                    const additions = notes.map(n => {
                        return `${n.note} @ ${(n.time + offset).toFixed(2)}s for ${n.duration}s`;
                    }).join('\n');
                    
                    const prefix = (prev && prev.length > 0 && !prev.endsWith('\n')) ? '\n' : '';
                    return `${prev}${prefix}${additions}`;
                });
            }
        } catch (e) {
            console.error("App: Error processing audio", e);
        }
      }, 50);

    } else {
      console.log("App: Starting listening...");
      try {
        await listeningEngineRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("App: Error starting listening", e);
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      startTimeRef.current = Date.now();
      setIsRecording(true);
    }
  };

  const handleNoteDown = (note: string, octave: number) => {
    const noteId = `${note}${octave}`;
    setActiveNotes(prev => new Set(prev).add(noteId));
    player.playNote(noteId);

    if (isRecording) {
      if (startTimeRef.current === 0) startTimeRef.current = Date.now();
      const time = (Date.now() - startTimeRef.current) / 1000;
      recordingNotesRef.current.set(noteId, time);
    }
  };

  const handleNoteUp = (note: string, octave: number) => {
    const noteId = `${note}${octave}`;
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });

    if (isRecording) {
        const startTime = recordingNotesRef.current.get(noteId);
        if (startTime !== undefined) {
            const endTime = (Date.now() - startTimeRef.current) / 1000;
            const duration = Math.max(0.1, endTime - startTime);
            setScript(prev => {
                const prefix = (prev && !prev.endsWith('\n')) ? '\n' : '';
                return `${prev}${prefix}${noteId} @ ${startTime.toFixed(2)}s for ${duration.toFixed(2)}s`;
            });
            recordingNotesRef.current.delete(noteId);
        }
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          setScript(text);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleExport = () => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'piano-script.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Toolbar */}
      <div className="h-14 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 flex items-center px-6 gap-4 z-20">
        <div className="flex items-center gap-3 mr-8">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20">I</div>
          <span className="font-bold text-lg tracking-tight text-gray-100">Imagene</span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1 bg-gray-800/50 p-1 rounded-lg border border-gray-700/50">
          {!isPlaying ? (
            <button onClick={handlePlay} className="p-2 hover:bg-gray-700 rounded-md text-green-400 transition-colors" title="Play">
              <Play size={18} fill="currentColor" />
            </button>
          ) : (
            <button onClick={handlePause} className="p-2 hover:bg-gray-700 rounded-md text-yellow-400 transition-colors" title="Pause">
              <Pause size={18} fill="currentColor" />
            </button>
          )}
          <button onClick={handleStop} className="p-2 hover:bg-gray-700 rounded-md text-red-400 transition-colors" title="Stop">
            <Square size={18} fill="currentColor" />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-800 mx-2" />

        {/* Recording Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleListening} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
              isListening 
                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
            title="Microphone Listening"
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            <span className="text-sm font-medium">Listen</span>
          </button>

          <button 
            onClick={toggleRecording} 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
              isRecording 
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 animate-pulse' 
                : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
            title="Record Keyboard"
          >
            {isRecording ? <StopCircle size={16} /> : <Circle size={16} />}
            <span className="text-sm font-medium">Record</span>
          </button>
        </div>

        <div className="flex-1" />

        {/* File Operations */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button 
              onClick={() => setShowSamples(!showSamples)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-gray-400 hover:text-gray-200 transition-colors ${showSamples ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
            >
              <Music size={16} />
              <span className="text-sm">Samples</span>
            </button>
            {showSamples && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                {Object.entries(SAMPLE_TUNES).map(([name, code]) => (
                  <button 
                    key={name}
                    onClick={() => {
                      setScript(code);
                      setShowSamples(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-800 text-sm text-gray-300 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded-md text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">
            <Upload size={16} />
            <span className="text-sm">Import</span>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImport}
              accept=".txt"
              className="hidden" 
            />
          </label>

          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded-md text-gray-400 hover:text-gray-200 transition-colors">
            <Download size={16} />
            <span className="text-sm">Export</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Section: Visualizer & Editor */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Editor */}
          <div className="w-80 lg:w-96 border-r border-gray-800 flex flex-col bg-gray-900/50 backdrop-blur-sm">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Script Editor</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                <div className="w-2 h-2 rounded-full bg-green-500/20"></div>
              </div>
            </div>
            <textarea
              className="flex-1 bg-transparent text-gray-300 font-mono p-4 outline-none resize-none text-sm leading-relaxed selection:bg-blue-500/30"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              spellCheck={false}
              placeholder="// Enter your piano script here..."
            />
          </div>

          {/* Right: Visualizer & Timeline */}
          <div className="flex-1 flex flex-col bg-gray-950 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
              <Music size={400} />
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8 z-10">
              <div className="w-full max-w-3xl bg-gray-900/40 p-8 rounded-2xl border border-gray-800/50 backdrop-blur-sm shadow-2xl">
                <WaveformVisualizer player={player} />
              </div>

              {/* Timeline Slider */}
              <div className="w-full max-w-3xl flex items-center gap-4 px-6 py-4 bg-gray-900/60 rounded-xl border border-gray-800/50 backdrop-blur-md shadow-lg">
                <span className="font-mono text-xs w-12 text-right text-blue-400">{currentTime.toFixed(1)}s</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 10}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                />
                <span className="font-mono text-xs w-12 text-gray-600">{duration.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Piano */}
        <div className="h-64 bg-gray-900 border-t border-gray-800 flex flex-col shadow-[0_-4px_30px_rgba(0,0,0,0.5)] z-20 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 text-gray-400 text-[10px] px-3 py-1 rounded-full border border-gray-700 shadow-lg">
            Interactive Piano
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
            <Piano 
              activeNotes={activeNotes}
              onNoteDown={handleNoteDown}
              onNoteUp={handleNoteUp}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
