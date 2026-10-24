import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { analyzedNode, isKnownOpening } from './analysis';
import { analyzeMove, cacheMoveAnalysis, QUICK_SEARCH } from './moveAnalysis';
import { cacheEvaluation, clearCachedEvaluations, createEngine, errorMessage, evaluationScore, isAbortError } from './engine';
import type { EngineEval, UciEngine } from './engine';

export function useGameReview() {
  const [isReviewing, setIsReviewing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; gameVersion: number } | null>(null);
  const runRef = useRef<AbortController | null>(null);
  const { gameVersion, mode } = useGameStore();

  const cancelReview = useCallback(() => {
    runRef.current?.abort();
    runRef.current = null;
    setIsReviewing(false);
  }, []);

  useEffect(() => cancelReview, [gameVersion, mode, cancelReview]);

  const startReview = useCallback(async () => {
    if (runRef.current) return;
    const state = useGameStore.getState();
    const line = state.getSelectedLine();
    if (!line.length || state.mode !== 'preview') return;
    const controller = new AbortController();
    runRef.current = controller;
    setIsReviewing(true);
    setProgress(0);
    setError(null);
    const fens = [...new Set(line.flatMap(node => [node.move.before, node.move.after]))];
    // Full Review means a fresh calculation, including positions already cached.
    // Clear old labels immediately so a stale mistake cannot look like a new verdict.
    clearCachedEvaluations(fens);
    state.updateNodes(Object.fromEntries(line.map(node => [node.id, {
      classification: 'none', score: null, scoreBefore: undefined, engineBestMove: undefined,
      pvLine: undefined, positionEvaluation: undefined, beforeEvaluation: undefined,
      moveEvaluation: undefined, alternativeEvaluation: undefined, moveLossCp: undefined, reviewDepth: undefined, analysisStatus: 'reviewing',
    }])));
    const engines: UciEngine[] = [];
    const stop = () => engines.forEach(engine => engine.dispose());
    controller.signal.addEventListener('abort', stop, { once: true });
    const stillCurrent = () => !controller.signal.aborted && runRef.current === controller &&
      useGameStore.getState().gameVersion === state.gameVersion && useGameStore.getState().mode === 'preview';
    try {
      const fresh = new Map<string, EngineEval>();
      const count = Math.min(state.engineProfile === 'full' ? 1 : 2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1), fens.length);
      await Promise.all(Array.from({ length: count }, async () => {
        const engine = await createEngine(controller.signal, state.engineProfile);
        if (controller.signal.aborted) { engine.dispose(); return; }
        engines.push(engine);
      }));
      let next = 0;
      let completed = 0;
      await Promise.all(engines.map(async engine => {
        while (stillCurrent()) {
          const fen = fens[next++];
          if (!fen) break;
          const result = await engine.analyze(fen, { ...QUICK_SEARCH, signal: controller.signal });
          controller.signal.throwIfAborted();
          fresh.set(fen, result);
          cacheEvaluation(result);
          // Update the bar as fresh positions finish, without premature labels.
          const updates: Parameters<typeof state.updateNodes>[0] = {};
          for (const node of line) {
            if (node.move.after === fen && useGameStore.getState().nodes[node.id]?.move === node.move) {
              updates[node.id] = { score: evaluationScore(result), positionEvaluation: result };
            }
          }
          if (!stillCurrent()) break;
          state.updateNodes(updates);
          setProgress(Math.round(++completed / fens.length * 55));
        }
      }));
      controller.signal.throwIfAborted();
      next = 0;
      completed = 0;
      const histories = line.map((_, index) => line.slice(0, index + 1).map(node => node.move.san));
      await Promise.all(engines.map(async engine => {
        while (stillCurrent()) {
          const index = next++;
          const node = line[index];
          if (!node) break;
          const computed = await analyzeMove(engine, fresh.get(node.move.before)!, fresh.get(node.move.after)!,
            node.move.lan, controller.signal, isKnownOpening(node, histories[index]));
          controller.signal.throwIfAborted();
          if (!stillCurrent()) break;
          const result = cacheMoveAnalysis(computed);
          // A book move may skip the restricted search and use its actual after FEN.
          const played = result.played.fen === node.move.before ? result.played : undefined;
          if (useGameStore.getState().nodes[node.id]?.move === node.move) {
            state.updateNode(node.id, { ...analyzedNode(node, result.before, result.after, histories[index], played, result.alternative),
              ...(result.uncertain ? { classification: 'uncertain', analysisStatus: 'uncertain' } : { analysisStatus: result.status }) });
          }
          setProgress(55 + Math.round(++completed / line.length * 45));
        }
      }));
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) setError({ message: errorMessage(error), gameVersion: state.gameVersion });
    } finally {
      controller.abort();
      const canClear = !runRef.current || runRef.current === controller;
      if (runRef.current === controller) {
        runRef.current = null;
        setIsReviewing(false);
      }
      // Unfinished moves stay unclassified when a review is cancelled or fails.
      if (canClear && useGameStore.getState().gameVersion === state.gameVersion) {
        const unfinished: Parameters<typeof state.updateNodes>[0] = {};
        for (const node of line) {
          if (useGameStore.getState().nodes[node.id]?.analysisStatus === 'reviewing') unfinished[node.id] = { analysisStatus: undefined };
        }
        state.updateNodes(unfinished);
      }
    }
  }, []);

  return { startReview, cancelReview, isReviewing, progress,
    error: mode === 'preview' && error?.gameVersion === gameVersion ? error.message : null };
}
