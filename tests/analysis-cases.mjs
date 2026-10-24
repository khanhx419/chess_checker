import assert from 'node:assert/strict';

// Run in an isolated Vite harness, without mounting React or touching the UI.
export async function testAnalysis(harnessPage) {
  const results = await harnessPage.evaluate(async () => {
    const { analyzedNode, classifyMove } = await import('/src/analysis.ts');
    const { UciEngine, cacheEvaluation, getCachedEvaluation, evaluationScore, clearCachedEvaluations } = await import('/src/engine.ts');
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const nodeFor = (fen, lan) => {
      const chess = new Chess(fen);
      const move = chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
      return { id: lan, move, classification: 'none', score: null, parentId: null, childrenIds: [] };
    };
    const white = nodeFor('7k/8/8/8/8/8/4P3/4K3 w - - 0 42', 'e2e3');
    const black = nodeFor('4k3/4p3/8/8/8/8/8/7K b - - 0 42', 'e7e6');
    const evaluate = (fen, data = {}) => ({ fen, cp: 0, depth: 18, finished: true, ...data });
    const cases = [];

    // Before/after searches explore different roots. Their score drift must not
    // turn the very move recommended by the first search into an error.
    for (const node of [white, black]) {
      const side = node.move.color === 'w' ? 1 : -1;
      const played = node.move.lan;
      const before = evaluate(node.move.before, { cp: 80 * side, bestMove: played });
      const after = evaluate(node.move.after, { cp: -650 * side });
      check(classifyMove(node, before, after, []) === 'best', `${node.move.color}: engine best was marked as an error`);
      check(analyzedNode(node, before, after, []).moveLossCp === 0, `${node.move.color}: best move retained a false loss`);
    }
    cases.push('Engine best move stays best despite independent score drift, for both colors');

    // A restricted search of the played move shares the original root. It is
    // the comparison score; the after-position score still drives the board.
    for (const node of [white, black]) {
      const side = node.move.color === 'w' ? 1 : -1;
      const alternative = node.move.color === 'w' ? 'e2e4' : 'e7e5';
      const before = evaluate(node.move.before, { cp: 60 * side, bestMove: alternative, pvLine: [alternative] });
      const after = evaluate(node.move.after, { cp: -700 * side, depth: 20 });
      const played = evaluate(node.move.before, { cp: 10 * side, bestMove: node.move.lan, searchMoves: [node.move.lan], depth: 17 });
      const result = analyzedNode(node, before, after, [], played);
      check(result.classification === 'good' && result.moveLossCp === 50, `${node.move.color}: restricted comparison was ignored`);
      check(result.score === -700 * side && result.scoreBefore === 60 * side, `${node.move.color}: board score was replaced with move score`);
      check(result.beforeEvaluation === before && result.moveEvaluation === played && result.positionEvaluation === after,
        `${node.move.color}: comparison and board evaluations were mixed`);
      check(result.engineBestMove === alternative && result.pvLine[0] === alternative && result.reviewDepth === 17,
        `${node.move.color}: alternative/depth metadata was mixed`);
      check(classifyMove(node, before, after, [], { ...played, fen: node.move.after }) === 'none',
        `${node.move.color}: accepted restricted score from a different position`);
      check(classifyMove(node, { ...before, fen: node.move.after }, after, []) === 'none',
        `${node.move.color}: accepted stale before evaluation`);
      check(classifyMove(node, before, { ...after, cp: undefined }, []) === 'none',
        `${node.move.color}: missing engine score became a classification`);
    }
    cases.push('Move grading uses same-root played score, keeps board score separate, and rejects stale FENs');

    for (const node of [white, black]) {
      const side = node.move.color === 'w' ? 1 : -1;
      const alternative = node.move.color === 'w' ? 'e2e4' : 'e7e5';
      const before = evaluate(node.move.before, { cp: undefined, mate: 3 * side, mateWinner: node.move.color, bestMove: alternative });
      const after = evaluate(node.move.after, { cp: 0 });
      const candidate = data => evaluate(node.move.before, { ...data, bestMove: node.move.lan, searchMoves: [node.move.lan] });
      check(classifyMove(node, before, after, [], candidate({ cp: undefined, mate: 9 * side, mateWinner: node.move.color })) === 'excellent',
        `${node.move.color}: preserving a longer forced mate was treated as a cp loss`);
      check(classifyMove(node, before, after, [], candidate({ cp: 0 })) === 'blunder',
        `${node.move.color}: losing a forced mate to equality was missed`);
      const loser = node.move.color === 'w' ? 'b' : 'w';
      const losingBefore = { ...before, mate: -3 * side, mateWinner: loser };
      check(classifyMove(node, losingBefore, after, [], candidate({ cp: undefined, mate: -9 * side, mateWinner: loser })) === 'excellent',
        `${node.move.color}: delaying an existing forced loss was misclassified`);
      check(classifyMove(node, losingBefore, after, [], candidate({ cp: 0 })) === 'excellent',
        `${node.move.color}: escaping a forced mate was misclassified`);
    }
    const mateChess = new Chess();
    for (const san of ['f3', 'e5', 'g4']) mateChess.move(san);
    const mate = nodeFor(mateChess.fen(), 'd8h4');
    const mateBefore = evaluate(mate.move.before, { cp: undefined, mate: -1, mateWinner: 'b', bestMove: 'd8h4' });
    const mateAfter = evaluate(mate.move.after, { cp: undefined, mate: 0, mateWinner: 'b', depth: 0 });
    check(new Chess(mate.move.after).isCheckmate(), 'Checkmate fixture is not checkmate');
    check(classifyMove(mate, mateBefore, mateAfter, []) === 'best' && evaluationScore(mateAfter) === -30000,
      'Checkmate zero lost the winning color');
    cases.push('Mate preservation, loss, escape, and terminal mate scores respect both player colors');

    const opening = nodeFor(new Chess().fen(), 'e2e4');
    check(classifyMove(opening, evaluate(opening.move.before, { bestMove: 'e2e4' }), evaluate(opening.move.after), ['e4']) === 'book',
      'Known standard opening was not recognized');
    const customOpening = nodeFor(white.move.before, 'e2e4');
    check(classifyMove(customOpening, evaluate(customOpening.move.before, { bestMove: 'e2e4' }), evaluate(customOpening.move.after), ['e4']) === 'best',
      'Custom FEN inherited opening label from SAN alone');
    cases.push('Opening labels require the standard opening position, including PGNs with custom FEN');

    const { analyzeMove } = await import('/src/moveAnalysis.ts');
    const parent = evaluate(white.move.before, { cp: 60, bestMove: 'e2e4' });
    const resulting = evaluate(white.move.after, { cp: -700 });
    const searches = [];
    const inconsistentEngine = { analyze: async (fen, options) => {
      searches.push({ fen, options });
      return fen === white.move.after ? resulting : options.searchMoves
        ? evaluate(fen, { cp: 40, previous: { cp: -160, depth: 17 }, bestMove: white.move.lan, searchMoves: options.searchMoves }) : parent;
    } };
    const ambiguous = await analyzeMove(inconsistentEngine, parent, resulting, white.move.lan, new AbortController().signal);
    check(ambiguous.uncertain && ambiguous.status === 'verified', 'Unstable same-root search was presented as a confident label');
    check(searches.some(search => search.options.depth === 24) && searches.every(search => search.options.movetime <= 2000),
      'Ambiguous position was not rechecked within a finite time budget');
    const noSearch = { analyze: async () => { throw Error('Stable best move unnecessarily re-searched'); } };
    const stable = await analyzeMove(noSearch, { ...parent, bestMove: white.move.lan },
      { ...resulting, cp: 1000 }, white.move.lan, new AbortController().signal);
    check(stable.status === 'quick' && !stable.uncertain, 'Stable equivalent move did not use the fast path');
    cases.push('Unstable same-root scores receive a bounded recheck; different-FEN normalized scores do not override a stable verdict');

    const OriginalWorker = window.Worker;
    const workers = [];
    class FakeWorker extends EventTarget {
      commands = [];
      terminated = false;
      constructor() { super(); workers.push(this); }
      emit(line) { this.dispatchEvent(new MessageEvent('message', { data: line })); }
      postMessage(command) {
        this.commands.push(command);
        if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
        if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
        if (command.startsWith('go ')) queueMicrotask(() => {
          this.emit('info depth 18 score cp 32 pv e7e6 e2e3');
          this.emit('bestmove e7e6');
        });
      }
      terminate() { this.terminated = true; }
    }
    let engine;
    window.Worker = FakeWorker;
    try {
      engine = new UciEngine('restricted-test');
      await engine.initialize();
      const fen = black.move.before;
      const baseline = evaluate(fen, { cp: 75, bestMove: 'e7e5' });
      cacheEvaluation(baseline);
      const result = await engine.analyze(fen, { depth: 18, movetime: 250, searchMoves: ['e7e6'] });
      const commands = workers[0].commands;
      check(commands.includes(`position fen ${fen}`), 'Restricted search changed the parent position');
      check(commands.some(command => /^go\b/.test(command) && /\bdepth 18\b/.test(command) && /\bmovetime 250\b/.test(command) && /\bsearchmoves e7e6$/.test(command)),
        `Restricted UCI search was not sent: ${JSON.stringify(commands)}`);
      check(result.fen === fen && result.cp === -32 && result.bestMove === 'e7e6' && result.searchMoves?.join(' ') === 'e7e6',
        'Restricted evaluation lost its parent FEN, color, move, or search scope');
      check(result.finished && result.targetDepth === 18 && result.elapsedMs >= 0 && Number.isFinite(result.analyzedAt),
        'Search completion omitted its actual depth/time metadata');
      cacheEvaluation(result);
      check(getCachedEvaluation(fen) === baseline, 'Restricted move score polluted the unrestricted position cache');
      const deeper = { ...baseline, depth: 22, cp: 100 };
      cacheEvaluation(deeper);
      check(cacheEvaluation(baseline) === deeper && getCachedEvaluation(fen) === deeper, 'Parallel quick result downgraded deeper cache');
      clearCachedEvaluations([fen]);
      check(cacheEvaluation(baseline) === baseline, 'Forced invalidation did not allow a genuinely fresh result');
      const goCount = commands.filter(command => command.startsWith('go ')).length;
      const invalid = await engine.analyze(fen, { searchMoves: ['e2e3'] }).then(() => false, () => true);
      check(invalid && commands.filter(command => command.startsWith('go ')).length === goCount,
        'Illegal root restriction reached the engine');
    } finally {
      engine?.dispose();
      window.Worker = OriginalWorker;
    }
    cases.push('UCI searches the played move from its parent, validates legality, and protects the position cache');
    return cases;
  });
  assert.equal(results.length, 6);
  return results;
}
