import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { createEngine, errorMessage, isAbortError } from './engine';
import type { UciEngine } from './engine';

function getSkillLevel(elo: number) {
  if (elo <= 800) return 0;
  if (elo <= 1000) return 3;
  if (elo <= 1200) return 5;
  if (elo <= 1500) return 8;
  if (elo <= 1800) return 12;
  if (elo <= 2000) return 15;
  if (elo <= 2500) return 18;
  return 20;
}

export function usePlayEngine(enabled: boolean, retryKey = 0) {
  const engineRef = useRef<Promise<UciEngine> | null>(null);
  const { fen, playerColor, botElo, gameOver, gameVersion, currentMoveId, engineProfile } = useGameStore();
  const [error, setError] = useState<{ message: string; fen: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const lifetime = new AbortController();
    engineRef.current = createEngine(lifetime.signal, engineProfile);
    void engineRef.current.catch(() => {});
    return () => {
      lifetime.abort();
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.then(worker => worker.dispose()).catch(() => {});
    };
  }, [enabled, retryKey, engineProfile]);

  useEffect(() => {
    if (!enabled || gameOver || fen.split(' ')[1] === playerColor) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const engine = await engineRef.current;
        if (!engine || controller.signal.aborted) return;
        setError(null);
        const result = await engine.analyze(fen, {
          signal: controller.signal, depth: 12, movetime: 600, skill: getSkillLevel(botElo),
        });
        const state = useGameStore.getState();
        if (controller.signal.aborted || state.mode !== 'play' || state.fen !== fen ||
            state.gameVersion !== gameVersion || state.currentMoveId !== currentMoveId ||
            state.playerColor !== playerColor || state.gameOver || !result.bestMove) return;
        state.makeMove({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] });
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) setError({ message: errorMessage(error), fen });
      }
    })();
    return () => controller.abort();
  }, [fen, enabled, playerColor, botElo, gameOver, gameVersion, currentMoveId, retryKey, engineProfile]);

  return enabled && error?.fen === fen ? error.message : null;
}
