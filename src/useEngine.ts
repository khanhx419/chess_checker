import { useState, useEffect, useRef } from 'react';

export interface MoveDetail {
  bestMove: string;
  cp?: number;
  mate?: number;
}

export interface EngineEval {
  cp?: number;
  mate?: number;
  bestMove?: string;
  depth?: number;
  topMoves?: MoveDetail[];
}

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

export function useEngine(fen: string, enabled: boolean = true) {
  const [evaluation, setEvaluation] = useState<EngineEval>({ cp: 0, depth: 0, topMoves: [] });
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false); // Engine fully handshaked & ready
  const fenRef = useRef(fen);
  fenRef.current = fen;
  // Use a ref to store intermediate multi-pv lines for the current depth to avoid flickering
  const topMovesRef = useRef<MoveDetail[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const worker = new Worker('/stockfish/stockfish.js');
        if (cancelled) { worker.terminate(); return; }
        workerRef.current = worker;

        worker.onerror = (e) => console.error("Stockfish Worker error:", e);

        // --- UCI Handshake ---
        worker.postMessage('uci');
        await waitForMessage(worker, 'uciok');
        if (cancelled) return;

        worker.postMessage('setoption name MultiPV value 3');
        worker.postMessage('isready');
        await waitForMessage(worker, 'readyok');
        if (cancelled) return;

        readyRef.current = true;

        worker.onmessage = (e) => {
          const line = e.data;
          if (typeof line !== 'string') return;

          if (line.includes('info depth')) {
            const matchDepth = line.match(/depth (\d+)/);
            const matchCp    = line.match(/score cp (-?\d+)/);
            const matchMate  = line.match(/score mate (-?\d+)/);
            const matchPv    = line.match(/pv (\S+)/);
            const matchMultiPv = line.match(/multipv (\d+)/);

            const depth    = matchDepth ? parseInt(matchDepth[1], 10) : undefined;
            const bestMove = matchPv ? matchPv[1] : undefined;
            const multiPvIndex = matchMultiPv ? parseInt(matchMultiPv[1], 10) : 1;

            let moveDetails: MoveDetail = { bestMove: bestMove ?? '' };
            const isBlackToMove = fenRef.current.includes(' b ');
            
            if (matchMate) {
              moveDetails.mate = parseInt(matchMate[1], 10);
            } else if (matchCp) {
              let cpValue = parseInt(matchCp[1], 10);
              if (isBlackToMove) cpValue = -cpValue;
              moveDetails.cp = cpValue;
            }

            if (bestMove) {
              // Ensure array has enough capacity
              while (topMovesRef.current.length < multiPvIndex) {
                 topMovesRef.current.push({ bestMove: '' });
              }
              topMovesRef.current[multiPvIndex - 1] = moveDetails;
            }

            // Only update main evaluation when analyzing the primary line (multipv 1)
            if (multiPvIndex === 1) {
              setEvaluation(prev => ({
                ...prev,
                cp: moveDetails.cp !== undefined ? moveDetails.cp : prev.cp,
                mate: moveDetails.mate !== undefined ? moveDetails.mate : prev.mate,
                bestMove: bestMove ?? prev.bestMove,
                depth: depth ?? prev.depth,
                topMoves: [...topMovesRef.current].filter((m) => m && m.bestMove),
              }));
            } else {
               // Just update topMoves array if it's a secondary line
               setEvaluation(prev => ({
                 ...prev,
                 topMoves: [...topMovesRef.current].filter((m) => m && m.bestMove),
               }));
            }
          }
        };

        // --- Start initial analysis ---
        topMovesRef.current = [];
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

  // Re-analyse whenever the FEN changes 
  useEffect(() => {
    if (workerRef.current && readyRef.current && enabled) {
      setEvaluation(prev => ({ ...prev, depth: 0 }));
      topMovesRef.current = [];
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go depth 16');
    }
  }, [fen, enabled]);

  return evaluation;
}
