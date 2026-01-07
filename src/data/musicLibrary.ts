/**
 * Music Library - Sample pieces from simple tunes to classical masterpieces
 * Now loads from external MusicXML files in /public/library/
 */

export interface LibraryPiece {
  id: string;
  title: string;
  composer: string;
  category: 'beginner' | 'intermediate' | 'advanced' | 'classical' | 'popular';
  difficulty: 1 | 2 | 3 | 4 | 5;
  duration: string;
  description: string;
  filePath: string; // Path to MusicXML file in /public/library/
  musicXML?: string; // Loaded dynamically
}

// Library metadata - files are loaded dynamically
export const MUSIC_LIBRARY: LibraryPiece[] = [
  // ============================================================================
  // Beginner (Difficulty 1-2)
  // ============================================================================
  {
    id: 'twinkle-twinkle',
    title: 'Twinkle Twinkle Little Star',
    composer: 'Traditional',
    category: 'beginner',
    difficulty: 1,
    duration: '1:00',
    description: 'Classic nursery rhyme - 12 measures of the complete song including all verses',
    filePath: '/library/twinkle-twinkle.musicxml',
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    composer: 'Traditional',
    category: 'beginner',
    difficulty: 1,
    duration: '0:40',
    description: 'Simple melody great for first-time players - complete 8-measure song',
    filePath: '/library/mary-had-a-little-lamb.musicxml',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    category: 'beginner',
    difficulty: 2,
    duration: '1:30',
    description: 'Famous theme from Symphony No. 9 - complete 16-measure melody with A and B sections',
    filePath: '/library/ode-to-joy.musicxml',
  },

  // ============================================================================
  // Intermediate (Difficulty 3)
  // ============================================================================
  {
    id: 'minuet-in-g',
    title: 'Minuet in G Major',
    composer: 'Christian Petzold (attr. J.S. Bach)',
    category: 'intermediate',
    difficulty: 3,
    duration: '1:45',
    description: 'Elegant baroque minuet from the Anna Magdalena Notebook - 16 measures',
    filePath: '/library/minuet-in-g.musicxml',
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    category: 'intermediate',
    difficulty: 3,
    duration: '2:30',
    description: 'Beautiful baroque canon with the famous chord progression - 16 measures with variations',
    filePath: '/library/canon-in-d.musicxml',
  },

  // ============================================================================
  // Advanced/Classical (Difficulty 4-5)
  // ============================================================================
  {
    id: 'fur-elise',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    category: 'classical',
    difficulty: 4,
    duration: '2:00',
    description: 'Iconic piano piece - complete A and B sections (20 measures)',
    filePath: '/library/fur-elise.musicxml',
  },
  {
    id: 'moonlight-sonata',
    title: 'Moonlight Sonata - I. Adagio sostenuto',
    composer: 'Ludwig van Beethoven',
    category: 'classical',
    difficulty: 5,
    duration: '2:00',
    description: 'Opening movement with famous arpeggiated triplets - 8 measures of the main theme',
    filePath: '/library/moonlight-sonata.musicxml',
  },
  {
    id: 'prelude-in-c',
    title: 'Prelude in C Major, BWV 846',
    composer: 'Johann Sebastian Bach',
    category: 'classical',
    difficulty: 4,
    duration: '2:00',
    description: 'Opening prelude from The Well-Tempered Clavier - 13 measures of arpeggiated patterns',
    filePath: '/library/prelude-in-c.musicxml',
  },
];

// Cache for loaded MusicXML content
const xmlCache: Map<string, string> = new Map();

/**
 * Load MusicXML content for a library piece
 */
export async function loadMusicXML(piece: LibraryPiece): Promise<string> {
  // Check cache first
  if (xmlCache.has(piece.id)) {
    return xmlCache.get(piece.id)!;
  }

  try {
    console.log(`Loading MusicXML from: ${piece.filePath}`);
    const response = await fetch(piece.filePath);
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xml = await response.text();
    console.log(`Loaded ${xml.length} bytes for ${piece.title}`);
    
    // Validate it looks like XML
    if (!xml.trim().startsWith('<?xml') && !xml.trim().startsWith('<score-partwise')) {
      throw new Error('Response is not valid MusicXML');
    }
    
    xmlCache.set(piece.id, xml);
    return xml;
  } catch (error) {
    console.error(`Error loading MusicXML for ${piece.title}:`, error);
    throw error;
  }
}

/**
 * Get all pieces in a category
 */
export function getPiecesByCategory(category: LibraryPiece['category']): LibraryPiece[] {
  return MUSIC_LIBRARY.filter(piece => piece.category === category);
}

/**
 * Get all pieces up to a difficulty level
 */
export function getPiecesByMaxDifficulty(maxDifficulty: number): LibraryPiece[] {
  return MUSIC_LIBRARY.filter(piece => piece.difficulty <= maxDifficulty);
}

/**
 * Get a specific piece by ID
 */
export function getPieceById(id: string): LibraryPiece | undefined {
  return MUSIC_LIBRARY.find(piece => piece.id === id);
}

/**
 * Search pieces by title or composer
 */
export function searchPieces(query: string): LibraryPiece[] {
  const lowerQuery = query.toLowerCase();
  return MUSIC_LIBRARY.filter(
    piece =>
      piece.title.toLowerCase().includes(lowerQuery) ||
      piece.composer.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get difficulty label
 */
export function getDifficultyLabel(difficulty: number): string {
  switch (difficulty) {
    case 1: return 'Very Easy';
    case 2: return 'Easy';
    case 3: return 'Intermediate';
    case 4: return 'Advanced';
    case 5: return 'Expert';
    default: return 'Unknown';
  }
}

/**
 * Get category label
 */
export function getCategoryLabel(category: LibraryPiece['category']): string {
  switch (category) {
    case 'beginner': return 'Beginner';
    case 'intermediate': return 'Intermediate';
    case 'advanced': return 'Advanced';
    case 'classical': return 'Classical';
    case 'popular': return 'Popular';
    default: return 'Unknown';
  }
}
