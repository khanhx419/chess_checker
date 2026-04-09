import { useState, useRef, useCallback } from 'react';
import { useGameStore } from './store';
export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'brilliant' | 'book' | 'none';

// Helper removed

/**
 * Wait for a specific response from the worker (e.g. "uciok", "readyok").
 */
function waitForMessage(worker: Worker, target: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (typeof e.data === 'string' && e.data.includes(target)) {
        worker.removeEventListener('message', handler);
        resolve();
      }
    };
    worker.addEventListener('message', handler);
  });
}

export function useGameReview() {
  const { getActiveLine, updateNode } = useGameStore();
  const [isReviewing, setIsReviewing] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const startReview = useCallback(async () => {
    const line = getActiveLine();
    if (line.length === 0) return;
    setIsReviewing(true);
    setProgress(0);
    
    // Clear existing scores for this line
    line.forEach(node => {
      updateNode(node.id, { classification: 'none', score: null });
    });

    if (workerRef.current) workerRef.current.terminate();
    
    // Create worker directly (COEP headers removed, safe now)
    const worker = new Worker('/stockfish/stockfish.js');
    workerRef.current = worker;

    // --- UCI Handshake ---
    worker.postMessage('uci');
    await waitForMessage(worker, 'uciok');

    worker.postMessage('isready');
    await waitForMessage(worker, 'readyok');

    // Hàm trả về Promise đánh giá 1 FEN
    const evaluateFen = (fen: string, depth = 12): Promise<{ cp: number, mate?: number }> => {
      return new Promise((resolve) => {
        let lastCp = 0;
        let lastMate: number | undefined = undefined;

        const handler = (e: MessageEvent) => {
          const line = e.data;
          if (typeof line !== 'string') return;

          const matchCp = line.match(/score cp (-?\d+)/);
          const matchMate = line.match(/score mate (-?\d+)/);
          
          if (matchMate) {
            lastMate = parseInt(matchMate[1], 10);
            lastCp = 0;
          } else if (matchCp) {
            lastCp = parseInt(matchCp[1], 10);
            lastMate = undefined;
          }

          if (line.includes('bestmove')) {
            worker.removeEventListener('message', handler);
            resolve({ cp: lastCp, mate: lastMate });
          }
        };
        worker.addEventListener('message', handler);
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go depth ${depth}`);
      });
    };

    // Chuẩn hóa điểm về hệ quy chiếu của Trắng
    const getWhiteScore = (fen: string, evalResult: { cp: number, mate?: number }) => {
      const isBlackToMove = fen.includes(' b ');
      if (evalResult.mate !== undefined) {
        const mateIn = evalResult.mate;
        return isBlackToMove ? -mateIn * 10000 : mateIn * 10000;
      }
      return isBlackToMove ? -evalResult.cp : evalResult.cp;
    };

    // Duyệt qua từng nước đi
    for (let i = 0; i < line.length; i++) {
        await new Promise(r => setTimeout(r, 10));

        const node = line[i];
        const move = node.move;
        const beforeFen = move.before;
        const afterFen = move.after;

        const evalBefore = await evaluateFen(beforeFen, 12);
        const scoreBefore = getWhiteScore(beforeFen, evalBefore);

        const evalAfter = await evaluateFen(afterFen, 12);
        const scoreAfter = getWhiteScore(afterFen, evalAfter);

        const isWhiteMove = move.color === 'w';
        const delta = isWhiteMove ? (scoreAfter - scoreBefore) : (scoreBefore - scoreAfter);

        let cls: Classification = 'none';
        
        if (Math.abs(delta) > 5000) {
            cls = delta < 0 ? 'blunder' : 'best';
        } else {
            if (delta > -20) cls = 'best';
            else if (delta > -50) cls = 'excellent';
            else if (delta > -100) cls = 'good';
            else if (delta > -200) cls = 'inaccuracy';
            else if (delta > -300) cls = 'mistake';
            else cls = 'blunder';
        }

        if (i < 8 && delta > -50) cls = 'book';

        updateNode(node.id, { classification: cls, score: scoreAfter });
        setProgress(Math.round(((i + 1) / line.length) * 100));
    }

    setIsReviewing(false);
    worker.postMessage('quit');
    worker.terminate();

  }, [getActiveLine, updateNode]);

  const cancelReview = useCallback(() => {
    if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
    }
    setIsReviewing(false);
  }, []);

  return { startReview, cancelReview, isReviewing, progress };
}
