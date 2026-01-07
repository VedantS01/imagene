/**
 * FileUpload - Upload and import MIDI or MusicXML files
 */

import React, { useCallback, useRef, useState } from 'react';

interface FileUploadProps {
  onMusicXMLLoaded: (xml: string, filename: string) => void;
  accept?: string;
}

/**
 * Convert MIDI to MusicXML (simplified conversion)
 * For full MIDI support, consider using a library like midi-json-parser + custom conversion
 */
async function convertMidiToMusicXML(midiData: ArrayBuffer, filename: string): Promise<string> {
  // This is a basic MIDI parser for simple files
  // For production, use a proper MIDI library
  
  const view = new DataView(midiData);
  let offset = 0;

  // Check MIDI header
  const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (header !== 'MThd') {
    throw new Error('Invalid MIDI file');
  }

  offset = 4;
  const headerLength = view.getUint32(offset);
  offset += 4;
  view.getUint16(offset); // format - skip
  offset += 2;
  const numTracks = view.getUint16(offset);
  offset += 2;
  const timeDivision = view.getUint16(offset);
  offset += 2;

  // Parse tracks
  const notes: { pitch: number; start: number; duration: number; velocity: number }[] = [];
  let currentTime = 0;
  const activeNotes = new Map<number, { start: number; velocity: number }>();

  // Helper to read variable-length quantity
  function readVLQ(): number {
    let value = 0;
    let byte: number;
    do {
      byte = view.getUint8(offset++);
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  }

  // Skip header and process tracks
  offset = 8 + headerLength;

  for (let track = 0; track < numTracks && offset < midiData.byteLength; track++) {
    // Check track header
    const trackHeader = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    
    if (trackHeader !== 'MTrk') {
      break;
    }
    
    offset += 4;
    const trackLength = view.getUint32(offset);
    offset += 4;
    const trackEnd = offset + trackLength;
    
    currentTime = 0;
    let runningStatus = 0;

    while (offset < trackEnd) {
      const deltaTime = readVLQ();
      currentTime += deltaTime;

      let status = view.getUint8(offset);
      
      // Running status
      if (status < 0x80) {
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status;
      }

      // const channel = status & 0x0f; // unused
      const messageType = status & 0xf0;

      if (messageType === 0x90) {
        // Note On
        const note = view.getUint8(offset++);
        const velocity = view.getUint8(offset++);
        
        if (velocity > 0) {
          activeNotes.set(note, { start: currentTime, velocity });
        } else {
          // Note Off (velocity 0)
          const active = activeNotes.get(note);
          if (active) {
            notes.push({
              pitch: note,
              start: active.start,
              duration: currentTime - active.start,
              velocity: active.velocity,
            });
            activeNotes.delete(note);
          }
        }
      } else if (messageType === 0x80) {
        // Note Off
        const note = view.getUint8(offset++);
        offset++; // velocity

        const active = activeNotes.get(note);
        if (active) {
          notes.push({
            pitch: note,
            start: active.start,
            duration: currentTime - active.start,
            velocity: active.velocity,
          });
          activeNotes.delete(note);
        }
      } else if (messageType === 0xa0 || messageType === 0xb0 || messageType === 0xe0) {
        // Polyphonic aftertouch, Control change, Pitch bend
        offset += 2;
      } else if (messageType === 0xc0 || messageType === 0xd0) {
        // Program change, Channel aftertouch
        offset++;
      } else if (status === 0xff) {
        // Meta event
        offset++; // skip metaType
        const metaLength = readVLQ();
        offset += metaLength;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        const sysexLength = readVLQ();
        offset += sysexLength;
      }
    }
  }

  // Convert to MusicXML
  return generateMusicXMLFromNotes(notes, filename, timeDivision);
}

function generateMusicXMLFromNotes(
  notes: { pitch: number; start: number; duration: number; velocity: number }[],
  title: string,
  ticksPerBeat: number
): string {
  // Sort notes by start time
  notes.sort((a, b) => a.start - b.start);

  // MIDI note to pitch name
  const NOTE_NAMES = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const ACCIDENTALS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  function midiToPitch(midi: number): { step: string; alter: number; octave: number } {
    const note = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    return {
      step: NOTE_NAMES[note],
      alter: ACCIDENTALS[note],
      octave,
    };
  }

  // Calculate divisions and durations
  const divisions = Math.max(1, Math.floor(ticksPerBeat / 4));
  
  let measures = '<part id="P1">\n';
  let currentMeasure = 1;
  let measureStart = 0;
  const beatsPerMeasure = 4;
  const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;

  // First measure with attributes
  measures += `    <measure number="1">\n`;
  measures += `      <attributes>\n`;
  measures += `        <divisions>${divisions}</divisions>\n`;
  measures += `        <key><fifths>0</fifths></key>\n`;
  measures += `        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>\n`;
  measures += `        <clef><sign>G</sign><line>2</line></clef>\n`;
  measures += `      </attributes>\n`;

  let lastNoteEnd = 0;
  
  notes.forEach((note, _index) => {
    // Check if we need a new measure
    while (note.start >= measureStart + ticksPerMeasure) {
      measures += `    </measure>\n`;
      currentMeasure++;
      measureStart += ticksPerMeasure;
      measures += `    <measure number="${currentMeasure}">\n`;
    }

    // Add rest if there's a gap
    if (note.start > lastNoteEnd) {
      const restDuration = Math.min(note.start - lastNoteEnd, ticksPerMeasure);
      const restDivisions = Math.round(restDuration / (ticksPerBeat / divisions));
      if (restDivisions > 0) {
        measures += `      <note>\n`;
        measures += `        <rest/>\n`;
        measures += `        <duration>${restDivisions}</duration>\n`;
        measures += `        <type>quarter</type>\n`;
        measures += `      </note>\n`;
      }
    }

    // Add the note
    const pitch = midiToPitch(note.pitch);
    const noteDuration = Math.round(note.duration / (ticksPerBeat / divisions));

    measures += `      <note>\n`;
    measures += `        <pitch>\n`;
    measures += `          <step>${pitch.step}</step>\n`;
    if (pitch.alter !== 0) {
      measures += `          <alter>${pitch.alter}</alter>\n`;
    }
    measures += `          <octave>${pitch.octave}</octave>\n`;
    measures += `        </pitch>\n`;
    measures += `        <duration>${Math.max(1, noteDuration)}</duration>\n`;
    measures += `        <type>quarter</type>\n`;
    measures += `      </note>\n`;

    lastNoteEnd = note.start + note.duration;
  });

  measures += `    </measure>\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXML(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">Imported from MIDI</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
${measures}
</score-partwise>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onMusicXMLLoaded,
  accept = '.musicxml,.xml,.mxl,.mid,.midi',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setIsProcessing(true);

    try {
      const filename = file.name.replace(/\.[^/.]+$/, '');
      
      if (file.name.endsWith('.mid') || file.name.endsWith('.midi')) {
        // MIDI file
        const buffer = await file.arrayBuffer();
        const xml = await convertMidiToMusicXML(buffer, filename);
        onMusicXMLLoaded(xml, filename);
      } else {
        // MusicXML file
        const text = await file.text();
        
        // Basic validation
        if (!text.includes('<score-partwise') && !text.includes('<score-timewise')) {
          throw new Error('Invalid MusicXML file');
        }
        
        onMusicXMLLoaded(text, filename);
      }
    } catch (err) {
      console.error('Failed to process file:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  }, [onMusicXMLLoaded]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="file-upload">
      <style>{`
        .file-upload {
          width: 100%;
        }
        
        .upload-zone {
          border: 2px dashed #3d3d5c;
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #16213e;
        }
        
        .upload-zone:hover,
        .upload-zone.dragging {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.1);
        }
        
        .upload-zone.processing {
          opacity: 0.7;
          pointer-events: none;
        }
        
        .upload-icon {
          width: 48px;
          height: 48px;
          margin-bottom: 16px;
          color: #667eea;
        }
        
        .upload-title {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
          margin: 0 0 8px 0;
        }
        
        .upload-subtitle {
          font-size: 14px;
          color: #a0a0b8;
          margin: 0 0 16px 0;
        }
        
        .upload-formats {
          display: flex;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .format-tag {
          font-size: 12px;
          padding: 4px 10px;
          background: #2d2d44;
          color: #a0a0b8;
          border-radius: 4px;
        }
        
        .upload-error {
          margin-top: 12px;
          padding: 10px;
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid #f44336;
          border-radius: 6px;
          color: #f44336;
          font-size: 13px;
        }
        
        .upload-spinner {
          display: inline-block;
          width: 24px;
          height: 24px;
          border: 2px solid #3d3d5c;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .hidden-input {
          display: none;
        }
      `}</style>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden-input"
      />

      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <>
            <div className="upload-spinner" />
            <p className="upload-title">Processing file...</p>
          </>
        ) : (
          <>
            <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="upload-title">Upload Music File</p>
            <p className="upload-subtitle">
              Drag & drop or click to browse
            </p>
            <div className="upload-formats">
              <span className="format-tag">MusicXML</span>
              <span className="format-tag">MIDI</span>
              <span className="format-tag">.mid</span>
              <span className="format-tag">.xml</span>
            </div>
          </>
        )}

        {error && (
          <div className="upload-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
