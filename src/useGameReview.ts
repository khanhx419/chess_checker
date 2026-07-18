import { useState, useRef, useCallback } from 'react';
import { useGameStore } from './store';
import { isBookMove } from './utils/openings';
export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'brilliant' | 'book' | 'none';

/** Maximum number of parallel Stockfish workers for game review. */
const MAX_WORKERS = 4;

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

/** Result of evaluating a single FEN position. */
interface EvalResult {
  cp: number;
  mate?: number;
  bestMove?: string;
}

/**
 * Create and initialise a Stockfish worker with UCI handshake.
 * Returns a ready-to-use worker + an evaluateFen helper bound to it.
 */
async function createEngine(): Promise<{
  worker: Worker;
  evaluateFen: (fen: string, depth?: number) => Promise<EvalResult>;
}> {
  const worker = new Worker('/stockfish/stockfish.js');

  // UCI handshake
  worker.postMessage('uci');
  await waitForMessage(worker, 'uciok');
  worker.postMessage('isready');
  await waitForMessage(worker, 'readyok');

  const evaluateFen = (fen: string, depth = 16): Promise<EvalResult> => {
    return new Promise((resolve) => {
      let lastCp = 0;
      let lastMate: number | undefined = undefined;
      let hasReceivedScore = false; // Track whether we ever got a real score line

      const handler = (e: MessageEvent) => {
        const line = e.data;
        if (typeof line !== 'string') return;

        const matchCp = line.match(/score cp (-?\d+)/);
        const matchMate = line.match(/score mate (-?\d+)/);

        if (matchMate) {
          lastMate = parseInt(matchMate[1], 10);
          lastCp = 0;
          hasReceivedScore = true;
        } else if (matchCp) {
          lastCp = parseInt(matchCp[1], 10);
          lastMate = undefined;
          hasReceivedScore = true;
        }

        if (line.startsWith('bestmove')) {
          const bestMoveMatch = line.match(/bestmove (\S+)/);
          worker.removeEventListener('message', handler);

          // If Stockfish returned bestmove without ever sending a score
          // (e.g. forced move / only 1 legal move), fall back to static eval.
          if (!hasReceivedScore) {
            const staticEvalHandler = (e2: MessageEvent) => {
              const staticLine = e2.data;
              if (typeof staticLine !== 'string') return;
              // Stockfish outputs: "Final evaluation       +0.35 (white side)"
              const staticMatch = staticLine.match(/Final evaluation\s+([+-]?\d+\.?\d*)/);
              if (staticMatch) {
                worker.removeEventListener('message', staticEvalHandler);
                const cpFromStatic = Math.round(parseFloat(staticMatch[1]) * 100);
                resolve({
                  cp: cpFromStatic,
                  mate: undefined,
                  bestMove: bestMoveMatch?.[1],
                });
              }
              // Also handle "Total evaluation: none (in check)" or similar
              if (staticLine.includes('Total evaluation') || staticLine.includes('Final evaluation')) {
                worker.removeEventListener('message', staticEvalHandler);
                resolve({
                  cp: lastCp,
                  mate: lastMate,
                  bestMove: bestMoveMatch?.[1],
                });
              }
            };
            worker.addEventListener('message', staticEvalHandler);
            worker.postMessage('eval');
            return;
          }

          resolve({ cp: lastCp, mate: lastMate, bestMove: bestMoveMatch?.[1] });
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  };

  return { worker, evaluateFen };
}

/** Normalize evaluation score to White's perspective. */
function getWhiteScore(fen: string, evalResult: { cp: number; mate?: number }): number {
  const isBlackToMove = fen.includes(' b ');
  if (evalResult.mate !== undefined) {
    const mateIn = evalResult.mate;
    return isBlackToMove ? -mateIn * 10000 : mateIn * 10000;
  }
  return isBlackToMove ? -evalResult.cp : evalResult.cp;
}

export function useGameReview() {
  const { getActiveLine, updateNode } = useGameStore();
  const [isReviewing, setIsReviewing] = useState(false);
  const [progress, setProgress] = useState(0);
  const workersRef = useRef<Worker[]>([]);

  const startReview = useCallback(async () => {
    let line = getActiveLine();
    if (line.length === 0) {
      // Patch: If at initial position, review the main line (root)
      // Try to find the main/root line from the store
      try {
        // This assumes useGameStore exposes rootNodeIds and nodes
        // @ts-ignore
        const { rootNodeIds, nodes } = require('./store').useGameStore.getState();
        line = rootNodeIds.map((id: string) => nodes[id]).filter(Boolean);
      } catch {}
      if (line.length === 0) return;
    }
    setIsReviewing(true);
    setProgress(0);

    // Clear existing scores for this line
    line.forEach(node => {
      updateNode(node.id, { classification: 'none', score: null, engineBestMove: undefined });
    });

    // Terminate any existing workers
    workersRef.current.forEach(w => w.terminate());
    workersRef.current = [];

    // ---------------------------------------------------------------
    // Phase 1: Collect all unique FENs that need evaluation.
    //   For N moves we need: beforeFen(0), afterFen(0)==beforeFen(1),
    //   afterFen(1)==beforeFen(2), ..., afterFen(N-1).
    //   With caching this is N+1 unique FENs instead of 2N.
    // ---------------------------------------------------------------
    const uniqueFens: string[] = [];
    const fenIndexMap = new Map<string, number>(); // fen -> index in uniqueFens

    for (let i = 0; i < line.length; i++) {
      const beforeFen = line[i].move.before;
      const afterFen = line[i].move.after;

      if (!fenIndexMap.has(beforeFen)) {
        fenIndexMap.set(beforeFen, uniqueFens.length);
        uniqueFens.push(beforeFen);
      }
      if (!fenIndexMap.has(afterFen)) {
        fenIndexMap.set(afterFen, uniqueFens.length);
        uniqueFens.push(afterFen);
      }
    }

    // ---------------------------------------------------------------
    // Phase 2: Evaluate all unique FENs in parallel using a worker pool.
    // ---------------------------------------------------------------
    const numWorkers = Math.min(MAX_WORKERS, uniqueFens.length);
    const engines: Awaited<ReturnType<typeof createEngine>>[] = [];

    for (let w = 0; w < numWorkers; w++) {
      engines.push(await createEngine());
    }
    workersRef.current = engines.map(e => e.worker);

    const evalResults: EvalResult[] = new Array(uniqueFens.length);
    let nextIdx = 0;
    let completedCount = 0;

    // Each worker pulls the next FEN from the shared queue when idle
    const runWorker = async (engineIdx: number) => {
      const engine = engines[engineIdx];
      while (true) {
        const idx = nextIdx++;
        if (idx >= uniqueFens.length) break;

        evalResults[idx] = await engine.evaluateFen(uniqueFens[idx], 12);
        completedCount++;

        // Update progress: FEN evaluation is ~70% of the work, classification is ~30%
        setProgress(Math.round((completedCount / uniqueFens.length) * 70));
      }
    };

    // Launch all workers concurrently
    await Promise.all(
      engines.map((_, idx) => runWorker(idx))
    );

    // ---------------------------------------------------------------
    // Phase 3: Classify each move using the cached evaluation results.
    // ---------------------------------------------------------------
    const sanHistory: string[] = [];

    for (let i = 0; i < line.length; i++) {
      const node = line[i];
      const move = node.move;
      const beforeFen = move.before;
      const afterFen = move.after;

      sanHistory.push(move.san);

      const evalBefore = evalResults[fenIndexMap.get(beforeFen)!];
      const evalAfter = evalResults[fenIndexMap.get(afterFen)!];

      const scoreBefore = getWhiteScore(beforeFen, evalBefore);
      const scoreAfter = getWhiteScore(afterFen, evalAfter);

      // Check if this move sequence is a known book move
      if (isBookMove(sanHistory)) {
        updateNode(node.id, { classification: 'book', score: scoreAfter, engineBestMove: evalBefore.bestMove });
        setProgress(70 + Math.round(((i + 1) / line.length) * 30));
        continue;
      }

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

      updateNode(node.id, { classification: cls, score: scoreAfter, engineBestMove: evalBefore.bestMove });
      setProgress(70 + Math.round(((i + 1) / line.length) * 30));
    }

    // Cleanup workers
    engines.forEach(e => {
      e.worker.postMessage('quit');
      e.worker.terminate();
    });
    workersRef.current = [];

    setIsReviewing(false);

  }, [getActiveLine, updateNode]);

  const cancelReview = useCallback(() => {
    workersRef.current.forEach(w => {
      w.terminate();
    });
    workersRef.current = [];
    setIsReviewing(false);
  }, []);

  return { startReview, cancelReview, isReviewing, progress };
}
