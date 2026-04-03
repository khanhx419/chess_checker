import { useState, useEffect, useRef } from 'react';

export interface EngineEval {
  cp?: number;
  mate?: number;
  bestMove?: string;
  depth?: number;
}

export function useEngine(fen: string) {
  const [evaluation, setEvaluation] = useState<EngineEval>({ cp: 0, depth: 0 });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize WebWorker pointing to local stockfish script
    const worker = new Worker('/stockfish/stockfish.js');
    workerRef.current = worker;
    
    worker.onmessage = (e) => {
      const line = e.data;
      if (typeof line !== 'string') return;
      
      // Parse output from engine
      if (line.includes('info depth')) {
        const matchDepth = line.match(/depth (\d+)/);
        const matchCp = line.match(/score cp (-?\d+)/);
        const matchMate = line.match(/score mate (-?\d+)/);
        const matchPv = line.match(/pv (\S+)/);

        const depth = matchDepth ? parseInt(matchDepth[1], 10) : undefined;
        const bestMove = matchPv ? matchPv[1] : undefined;

        if (matchMate) {
          setEvaluation(prev => ({ 
            ...prev, 
            mate: parseInt(matchMate[1], 10), 
            cp: undefined, // Clear cp if mate found
            bestMove: bestMove ?? prev.bestMove,
            depth: depth ?? prev.depth
          }));
        } else if (matchCp) {
          // Adjust cp perspective based on whose turn it is
          // 'info' scores are always from the engine's point of view (which is the side to move).
          // We should convert it to White's point of view for the Eval Bar.
          const isBlackToMove = fen.includes(' b ');
          let cpValue = parseInt(matchCp[1], 10);
          if (isBlackToMove) {
            cpValue = -cpValue;
          }

          setEvaluation(prev => ({ 
            ...prev, 
            cp: cpValue, 
            mate: undefined, // Clear mate if cp found
            bestMove: bestMove ?? prev.bestMove,
            depth: depth ?? prev.depth
          }));
        }
      }
    };
    
    worker.postMessage('uci');
    worker.postMessage('setoption name Threads value 1');

    return () => {
      worker.postMessage('quit');
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage('go depth 16'); // 16 is enough for quick web analysis
    }
  }, [fen]);

  return evaluation;
}
