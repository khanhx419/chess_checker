export const OPENING_NAMES: Record<string, string> = {
  "e4": "King's Pawn Game",
  "d4": "Queen's Pawn Game",
  "c4": "English Opening",
  "Nf3": "Réti Opening",
  "e4 e5": "Open Game",
  "e4 c5": "Sicilian Defense",
  "e4 e6": "French Defense",
  "e4 c6": "Caro-Kann Defense",
  "e4 d6": "Pirc Defense",
  "e4 d5": "Scandinavian Defense",
  "d4 d5": "Queen's Pawn Game",
  "d4 Nf6": "Indian Defense",
  "d4 f5": "Dutch Defense",
  "e4 e5 Nf3": "King's Knight Opening",
  "e4 e5 Nf3 Nc6": "King's Knight Opening",
  "e4 e5 Nf3 Nc6 Bb5": "Ruy Lopez (Spanish Opening)",
  "e4 e5 Nf3 Nc6 Bc4": "Italian Game",
  "e4 e5 Nf3 Nc6 Bc4 Bc5": "Giuoco Piano",
  "e4 e5 Nf3 Nc6 Bc4 Nf6": "Two Knights Defense",
  "e4 e5 Nf3 Nc6 d4": "Scotch Game",
  "e4 e5 f4": "King's Gambit",
  "e4 c5 Nf3": "Sicilian Defense",
  "e4 c5 Nf3 d6": "Sicilian Defense: Modern Variations",
  "e4 c5 Nf3 d6 d4": "Sicilian Defense: Open",
  "e4 c5 Nf3 Nc6": "Sicilian Defense: Old Sicilian",
  "e4 c5 Nf3 e6": "Sicilian Defense: French Variation",
  "d4 d5 c4": "Queen's Gambit",
  "d4 d5 c4 dxc4": "Queen's Gambit Accepted",
  "d4 d5 c4 e6": "Queen's Gambit Declined",
  "d4 d5 c4 c6": "Slav Defense",
  "d4 Nf6 c4 e6": "Indian Defense",
  "d4 Nf6 c4 e6 Nc3 Bb4": "Nimzo-Indian Defense",
  "d4 Nf6 c4 e6 Nf3 b6": "Queen's Indian Defense",
  "d4 Nf6 c4 g6": "King's Indian Defense",
  "d4 Nf6 c4 g6 Nc3 Bg7": "King's Indian Defense",
  "d4 Nf6 c4 g6 Nc3 d5": "Grünfeld Defense",
  "e4 e6 d4 d5": "French Defense",
  "e4 c6 d4 d5": "Caro-Kann Defense",
};

/**
 * Returns the most specific opening name matched by the sequence of moves.
 * e.g., if history is ["e4", "e5", "Nf3", "Nc6", "Bb5"], it looks for:
 * "e4 e5 Nf3 Nc6 Bb5" -> "Ruy Lopez"
 * if not found, tries "e4 e5 Nf3 Nc6" -> "King's Knight Opening", etc.
 */
export function getOpeningName(sanHistory: string[]): string | null {
  for (let i = sanHistory.length; i > 0; i--) {
    const sequence = sanHistory.slice(0, i).join(' ');
    if (OPENING_NAMES[sequence]) {
      return OPENING_NAMES[sequence];
    }
  }
  return null;
}
