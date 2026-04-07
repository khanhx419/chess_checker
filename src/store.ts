import { create } from 'zustand';
import { Chess, Move } from 'chess.js';

export type AppMode = 'preview' | 'play';
export type PlayerColor = 'w' | 'b';
export type GameOverState = { winner: 'w' | 'b' | 'draw' | null; reason: string } | null;

interface GameState {
  chess: Chess;
  fen: string;
  history: Move[];
  currentMoveIndex: number;
  classifications: string[];
  scores: number[];
  mode: AppMode;
  playerColor: PlayerColor;
  botElo: number;
  gameOver: GameOverState;
  makeMove: (move: { from: string; to: string; promotion?: string }) => boolean;
  resetGame: () => void;
  loadPgn: (pgn: string) => boolean;
  goToMove: (index: number) => void;
  setClassifications: (cls: string[]) => void;
  setScores: (scores: number[]) => void;
  setMode: (mode: AppMode) => void;
  setPlayerColor: (color: PlayerColor) => void;
  setBotElo: (elo: number) => void;
  setGameOver: (state: GameOverState) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  history: [],
  currentMoveIndex: -1,
  classifications: [],
  scores: [],
  mode: 'preview',
  playerColor: 'w',
  botElo: 1500,
  gameOver: null,
  setClassifications: (cls) => set({ classifications: cls }),
  setScores: (scores) => set({ scores }),
  setMode: (mode) => set({ mode }),
  setPlayerColor: (playerColor) => set({ playerColor }),
  setBotElo: (botElo) => set({ botElo }),
  setGameOver: (gameOver) => set({ gameOver }),

  makeMove: (move) => {
    const { currentMoveIndex, history } = get();
    try {
      // Nếu đang xem ở quá khứ mà đi một nước mới, cắt bỏ tương lai (tùy chọn).
      // Ở đây đơn giản load lại ván cờ tới thời điểm hiện tại rồi mới đi.
      let tempChess = new Chess();
      if (currentMoveIndex > -1) tempChess.load(history[currentMoveIndex].after);
      
      const result = tempChess.move(move);
      if (result) {
        // Cắt lịch sử nếu đi nhánh mới
        const newHistory = [...history.slice(0, currentMoveIndex + 1), result];
        
        const mainChess = new Chess();
        newHistory.forEach(m => mainChess.move(m));

        let newGameOver: GameOverState = null;
        if (mainChess.isCheckmate()) {
          newGameOver = { winner: mainChess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
        } else if (mainChess.isDraw()) {
          let reason = 'draw';
          if (mainChess.isStalemate()) reason = 'stalemate';
          else if (mainChess.isThreefoldRepetition()) reason = 'repetition';
          else if (mainChess.isInsufficientMaterial()) reason = 'insufficient material';
          else reason = '50-move rule';
          newGameOver = { winner: 'draw', reason };
        }

        set({ 
          chess: mainChess, 
          fen: tempChess.fen(), 
          history: newHistory,
          currentMoveIndex: newHistory.length - 1,
          gameOver: newGameOver
        });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  resetGame: () => {
    const newChess = new Chess();
    set({ chess: newChess, fen: newChess.fen(), history: [], currentMoveIndex: -1, classifications: [], scores: [], gameOver: null });
  },

  loadPgn: (pgn) => {
    const newChess = new Chess();
    try {
      newChess.loadPgn(pgn);
      const newHistory = newChess.history({ verbose: true }) as Move[];
      set({ 
        chess: newChess, 
        fen: newChess.fen(), 
        history: newHistory,
        currentMoveIndex: newHistory.length - 1,
        classifications: [],
        scores: [],
        gameOver: null
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  goToMove: (index) => {
    const { history } = get();
    if (index >= -1 && index < history.length) {
      const targetFen = index === -1 ? new Chess().fen() : history[index].after;
      set({ currentMoveIndex: index, fen: targetFen });
    }
  }
}));

