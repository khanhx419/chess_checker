import assert from 'node:assert/strict';

// Keep profile checks isolated from the mounted application so no live hook can
// publish a result while a test deliberately switches the selected engine.
export async function testEngineProfiles(harnessPage) {
  const results = await harnessPage.evaluate(async () => {
    const { ENGINE_PROFILES, getEngineProfile, setEngineProfile, createEngine,
      cacheEvaluation, getCachedEvaluation, clearCachedEvaluations } = await import('/src/engine.ts');
    const { useGameStore } = await import('/src/store.ts');
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const originalProfile = getEngineProfile();
    const fen = new Chess().fen();
    const results = [];
    try {
      setEngineProfile('lite');
      clearCachedEvaluations([fen]);
      const lite = { fen, cp: 20, depth: 28, finished: true, engineId: ENGINE_PROFILES.lite.id };
      const full = { fen, cp: 35, depth: 14, finished: true, engineId: ENGINE_PROFILES.full.id };
      cacheEvaluation(lite);
      check(getCachedEvaluation(fen) === lite, 'Selected lite result was not cached');
      setEngineProfile('full');
      check(getCachedEvaluation(fen) === undefined, 'Engine switch retained the lite cache');
      cacheEvaluation(lite);
      check(getCachedEvaluation(fen) === undefined, 'Late lite result polluted the selected full cache');
      cacheEvaluation(full);
      check(getCachedEvaluation(fen) === full, 'Deeper lite result prevented a fresh full-engine result');
      setEngineProfile('lite');
      cacheEvaluation(full);
      check(getCachedEvaluation(fen) === undefined, 'Late full result polluted the selected lite cache');
      results.push('Engine profile switches invalidate cached scores and reject late results from the old engine');

      const store = useGameStore;
      store.getState().setEngineProfile('lite');
      store.getState().loadPgn('1. e4 e5 2. Nf3 Nc6 *');
      const originalLine = store.getState().getSelectedLine();
      store.getState().goToMove(originalLine[0].id);
      store.getState().makeMove({ from: 'c7', to: 'c5' });
      const state = store.getState();
      const ids = Object.keys(state.nodes);
      const selected = state.getSelectedLine().map(node => node.id);
      const beforeVersion = state.gameVersion;
      const selectedId = state.currentMoveId;
      const selectedFen = state.fen;
      for (const id of ids) state.updateNode(id, { classification: 'blunder', score: -999,
        scoreBefore: 999, engineBestMove: 'e2e4', pvLine: ['e2e4'],
        positionEvaluation: lite, beforeEvaluation: lite, moveEvaluation: lite,
        moveLossCp: 999, reviewDepth: 28, analysisStatus: 'verified' });
      store.getState().setEngineProfile('full');
      const switched = store.getState();
      check(switched.engineProfile === 'full' && getEngineProfile() === 'full', 'Store and engine profiles diverged');
      check(switched.gameVersion > beforeVersion, 'Switch did not cancel work tied to the old game version');
      check(switched.currentMoveId === selectedId && switched.fen === selectedFen, 'Switch moved the selected board');
      check(JSON.stringify(Object.keys(switched.nodes)) === JSON.stringify(ids), 'Switch removed variation nodes');
      check(JSON.stringify(switched.getSelectedLine().map(node => node.id)) === JSON.stringify(selected), 'Switch lost the selected variation');
      for (const node of Object.values(switched.nodes)) {
        check(node.classification === 'none' && node.score === null && !node.positionEvaluation &&
          !node.beforeEvaluation && !node.moveEvaluation && !node.engineBestMove && !node.pvLine &&
          node.moveLossCp === undefined && node.reviewDepth === undefined && node.analysisStatus === undefined,
        `Engine switch retained old analysis on node ${node.id}`);
      }
      results.push('Changing the selected engine clears all old move grades while preserving the game tree and selected branch');

      for (const profile of ['lite', 'full']) {
        const engine = await createEngine(undefined, profile);
        try {
          const result = await engine.analyze(fen, { depth: 10, movetime: 200 });
          check(result.finished && result.depth > 0 && Number.isFinite(result.cp), `${profile}: engine returned no score`);
          check(result.engineId === ENGINE_PROFILES[profile].id, `${profile}: evaluation omitted the actual engine identity`);
          const chess = new Chess(fen);
          check(chess.moves({ verbose: true }).some(move => move.lan === result.bestMove), `${profile}: engine returned an illegal move`);
        } finally { engine.dispose(); }
      }
      results.push('Both real Stockfish 19 lite and full single-thread engines initialize and return legal scored moves');
      return results;
    } finally {
      useGameStore.getState().resetGame();
      useGameStore.getState().setEngineProfile(originalProfile);
      setEngineProfile(originalProfile);
      clearCachedEvaluations([fen]);
    }
  });
  assert.equal(results.length, 3);
  return results;
}
