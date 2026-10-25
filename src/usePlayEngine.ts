import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { createEngine, errorMessage, isAbortError } from './engine';
import type { UciEngine } from './engine';
import { botSearchOptions, chooseBotMove } from './botStrength';

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
          ...botSearchOptions(botElo), signal: controller.signal,
        });
        const move = chooseBotMove(fen, botElo, result);
        const state = useGameStore.getState();
        if (controller.signal.aborted || state.mode !== 'play' || state.fen !== fen ||
            state.gameVersion !== gameVersion || state.currentMoveId !== currentMoveId ||
            state.playerColor !== playerColor || state.botElo !== botElo || state.gameOver || !move) return;
        state.makeMove({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) setError({ message: errorMessage(error), fen });
      }
    })();
    return () => controller.abort();
  }, [fen, enabled, playerColor, botElo, gameOver, gameVersion, currentMoveId, retryKey, engineProfile]);

  return enabled && error?.fen === fen ? error.message : null;
}
