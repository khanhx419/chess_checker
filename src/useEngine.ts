import { useState, useEffect, useRef } from 'react';

export interface EngineEval {
  cp?: number;
  mate?: number;
  bestMove?: string;
  depth?: number;
}

// Helper removed

/**
 * Wait for a specific response from the worker (e.g. "uciok", "readyok").
 * Returns a promise that resolves when the worker posts a message containing
 * the target string.
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

export function useEngine(fen: string, enabled: boolean = true) {
  const [evaluation, setEvaluation] = useState<EngineEval>({ cp: 0, depth: 0 });
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false); // Engine fully handshaked & ready
  const fenRef = useRef(fen);
  fenRef.current = fen;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const worker = new Worker('/stockfish/stockfish.js');
        if (cancelled) { worker.terminate(); return; }
        workerRef.current = worker;

        // Ensure we catch early errors
        worker.onerror = (e) => console.error("Stockfish Worker error:", e);

        // --- UCI Handshake ---
        worker.postMessage('uci');
        await waitForMessage(worker, 'uciok');
        if (cancelled) return;

        worker.postMessage('isready');
        await waitForMessage(worker, 'readyok');
        if (cancelled) return;

        // --- Engine is ready, attach the analysis listener ---
        readyRef.current = true;

        worker.onmessage = (e) => {
          const line = e.data;
          if (typeof line !== 'string') return;

          if (line.includes('info depth')) {
            const matchDepth = line.match(/depth (\d+)/);
            const matchCp    = line.match(/score cp (-?\d+)/);
            const matchMate  = line.match(/score mate (-?\d+)/);
            const matchPv    = line.match(/pv (\S+)/);

            const depth    = matchDepth ? parseInt(matchDepth[1], 10) : undefined;
            const bestMove = matchPv ? matchPv[1] : undefined;

            if (matchMate) {
              setEvaluation(prev => ({
                ...prev,
                mate: parseInt(matchMate[1], 10),
                cp: undefined,
                bestMove: bestMove ?? prev.bestMove,
                depth: depth ?? prev.depth,
              }));
            } else if (matchCp) {
              const isBlackToMove = fenRef.current.includes(' b ');
              let cpValue = parseInt(matchCp[1], 10);
              if (isBlackToMove) cpValue = -cpValue;

              setEvaluation(prev => ({
                ...prev,
                cp: cpValue,
                mate: undefined,
                bestMove: bestMove ?? prev.bestMove,
                depth: depth ?? prev.depth,
              }));
            }
          }
        };

        worker.onerror = (e) => {
          console.error('Stockfish Worker error:', e);
        };

        // --- Start initial analysis ---
        worker.postMessage(`position fen ${fenRef.current}`);
        worker.postMessage('go depth 16');
      } catch (err) {
        console.error('Failed to initialise Stockfish worker:', err);
      }
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (workerRef.current) {
        workerRef.current.postMessage('quit');
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Re-analyse whenever the FEN changes (only if engine is ready and enabled)
  useEffect(() => {
    if (workerRef.current && readyRef.current && enabled) {
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go depth 16');
    }
  }, [fen, enabled]);

  return evaluation;
}
