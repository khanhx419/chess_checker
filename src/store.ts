import { create } from 'zustand';
import { Chess, Move } from 'chess.js';

interface GameState {
  chess: Chess;
  fen: string;
  history: Move[];
  makeMove: (move: { from: string; to: string; promotion?: string }) => boolean;
  resetGame: () => void;
  loadPgn: (pgn: string) => boolean;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  history: [],
  makeMove: (move) => {
    const { chess } = get();
    try {
      const result = chess.move(move);
      if (result) {
        set({ fen: chess.fen(), history: chess.history({ verbose: true }) as Move[] });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },
  resetGame: () => {
    const newChess = new Chess();
    set({ chess: newChess, fen: newChess.fen(), history: [] });
  },
  loadPgn: (pgn) => {
    const { chess } = get();
    try {
      chess.loadPgn(pgn);
      set({ fen: chess.fen(), history: chess.history({ verbose: true }) as Move[] });
      return true;
    } catch (e) {
      return false;
    }
  }
}));
