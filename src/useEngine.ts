import { useEffect, useRef, useState } from 'react';
import { cacheEvaluation, createEngine, ENGINE_PROFILES, errorMessage, getCachedEvaluation, isAbortError } from './engine';
import { useGameStore } from './store';
import { analyzeMove, cacheMoveAnalysis, QUICK_SEARCH } from './moveAnalysis';
import type { MoveAnalysis } from './moveAnalysis';
import type { EngineEval, UciEngine } from './engine';
export type { EngineEval } from './engine';

type LiveEvaluation = EngineEval & { moveReview?: MoveAnalysis };

export function useEngine(fen: string, enabled = true, retryKey = 0, beforeFen?: string, playedUci?: string, book = false) {
  const [evaluation, setEvaluation] = useState<LiveEvaluation>({ fen, depth: 0, finished: false });
  const engineRef = useRef<Promise<UciEngine> | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const profile = useGameStore(state => state.engineProfile);
  const engineId = ENGINE_PROFILES[profile].id;

  useEffect(() => {
    lifetime.current = new AbortController();
    return () => {
      lifetime.current?.abort();
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.then(worker => worker.dispose()).catch(() => {});
    };
  }, [profile]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let after = getCachedEvaluation(fen);
          engineRef.current ??= createEngine(lifetime.current?.signal, profile);
          const engine = await engineRef.current;
          if (controller.signal.aborted) return;
          if (!after) {
            after = await engine.analyze(fen, {
              ...QUICK_SEARCH, signal: controller.signal,
              onInfo: info => { if (!controller.signal.aborted) setEvaluation(info); },
            });
            if (controller.signal.aborted) return;
            cacheEvaluation(after);
            setEvaluation(after);
          }
          if (beforeFen && playedUci) {
            const before = getCachedEvaluation(beforeFen) ?? await engine.analyze(beforeFen, { ...QUICK_SEARCH, signal: controller.signal });
            controller.signal.throwIfAborted();
            const result = await analyzeMove(engine, before, after, playedUci, controller.signal, book);
            controller.signal.throwIfAborted();
            const moveReview = cacheMoveAnalysis(result);
            setEvaluation({ ...moveReview.after, moveReview });
          } else if (!controller.signal.aborted) setEvaluation(after);
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return;
          const failed = engineRef.current;
          engineRef.current = null;
          if (failed) void failed.then(engine => engine.dispose()).catch(() => {});
          setEvaluation({ fen, engineId, depth: 0, finished: false, error: errorMessage(error) });
        }
      })();
    }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fen, enabled, retryKey, beforeFen, playedUci, book, profile, engineId]);

  const current = evaluation.fen === fen && (!evaluation.engineId || evaluation.engineId === engineId) ? evaluation : undefined;
  if (current?.error) return current;
  const cached = getCachedEvaluation(fen);
  // A forced review can replace or evict a result while this hook is idle.
  // Do not resurrect that old finished result after cancellation or completion.
  const selected = cached ?? (current?.finished ? undefined : current);
  return { ...(selected ?? { fen, depth: 0, finished: false }),
    moveReview: cached && current?.moveReview?.after === cached ? current.moveReview : undefined };
}
