import { create } from 'zustand';
import { Chess, Move } from 'chess.js';

interface GameState {
  chess: Chess;
  fen: string;
  history: Move[];
  currentMoveIndex: number;
  makeMove: (move: { from: string; to: string; promotion?: string }) => boolean;
  resetGame: () => void;
  loadPgn: (pgn: string) => boolean;
  goToMove: (index: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  history: [],
  currentMoveIndex: -1,

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

        set({ 
          chess: mainChess, 
          fen: tempChess.fen(), 
          history: newHistory,
          currentMoveIndex: newHistory.length - 1
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
    set({ chess: newChess, fen: newChess.fen(), history: [], currentMoveIndex: -1 });
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
        currentMoveIndex: newHistory.length - 1
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

