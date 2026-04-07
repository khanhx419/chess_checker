import { useEffect, useRef } from 'react';
import { useGameStore } from './store';
import type { PlayerColor, GameOverState } from './store';

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

function getSkillLevel(elo: number): number {
  if (elo <= 800) return 0;
  if (elo <= 1000) return 3;
  if (elo <= 1200) return 5;
  if (elo <= 1500) return 8;
  if (elo <= 1800) return 12;
  if (elo <= 2000) return 15;
  if (elo <= 2500) return 18;
  return 20;
}

export function usePlayEngine(enabled: boolean) {
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const { fen, playerColor, botElo, gameOver } = useGameStore();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        const worker = new Worker('/stockfish/stockfish.js');
        if (cancelled) { worker.terminate(); return; }
        workerRef.current = worker;

        worker.onerror = (e) => console.error("Stockfish Play worker error:", e);

        // UCI Handshake
        worker.postMessage('uci');
        await waitForMessage(worker, 'uciok');
        if (cancelled) return;

        worker.postMessage('isready');
        await waitForMessage(worker, 'readyok');
        if (cancelled) return;

        // Engine is ready
        readyRef.current = true;

        worker.onmessage = (e) => {
          const line = e.data;
          if (typeof line !== 'string') return;

          if (line.startsWith('bestmove')) {
            const match = line.match(/^bestmove\s([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (match) {
              const move = match[1];
              const from = move.substring(0, 2);
              const to = move.substring(2, 4);
              const promotion = move.length === 5 ? move[4] : undefined;
              
              // We inject a tiny delay so the move feels a bit more natural, 
              // except if the engine is already taking its time.
              // Actually we just call makeMove immediately here.
              useGameStore.getState().makeMove({ from, to, promotion });
            }
          }
        };

        // We apply the current skill level when engine initializes
        const skill = getSkillLevel(useGameStore.getState().botElo);
        worker.postMessage(`setoption name Skill Level value ${skill}`);
        
        // Check if we need to start moving right away (e.g. user plays Black)
        triggerBotMove(useGameStore.getState().fen, useGameStore.getState().playerColor, useGameStore.getState().gameOver, worker);

      } catch (err) {
        console.error('Failed to initialize Stockfish play worker:', err);
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
  }, [enabled]);

  // When Elo changes, update the skill level if the worker is running
  useEffect(() => {
    if (workerRef.current && readyRef.current) {
      const skill = getSkillLevel(botElo);
      workerRef.current.postMessage(`setoption name Skill Level value ${skill}`);
    }
  }, [botElo]);

  // When fen changes, check if it's the bot's turn
  useEffect(() => {
    if (workerRef.current && readyRef.current && enabled) {
      triggerBotMove(fen, playerColor, gameOver, workerRef.current);
    }
  }, [fen, enabled, playerColor, gameOver]);

  function triggerBotMove(currentFen: string, color: PlayerColor, stateGameOver: GameOverState, worker: Worker) {
    if (stateGameOver) return;
    
    const isBotTurn = (color === 'w' && currentFen.includes(' b ')) || 
                      (color === 'b' && currentFen.includes(' w '));

    if (isBotTurn) {
      worker.postMessage('stop');
      worker.postMessage(`position fen ${currentFen}`);
      // Depth 10 runs normally fast enough but weak enough depending on skill level
      worker.postMessage('go depth 10');
    }
  }
}
