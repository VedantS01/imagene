/**
 * Music module exports
 */

export { 
  NoteQuantizer, 
  BeatDetector, 
  getQuantizer, 
  resetQuantizer 
} from './Quantizer';
export type { QuantizerConfig } from './Quantizer';

export { 
  MusicXMLGenerator, 
  getMusicXMLGenerator, 
  resetMusicXMLGenerator,
  generateMusicXML 
} from './MusicXMLGenerator';
export type { MusicXMLOptions } from './MusicXMLGenerator';
