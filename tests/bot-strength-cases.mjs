import assert from 'node:assert/strict';

export async function testBotStrength(page) {
  const results = await page.evaluate(async () => {
    const { botSearchOptions, chooseBotMove } = await import('/src/botStrength.ts');
    const { UciEngine, cacheEvaluation, getCachedEvaluation, clearCachedEvaluations } = await import('/src/engine.ts');
    const { analyzeMove } = await import('/src/moveAnalysis.ts');
    const { analyzedNode } = await import('/src/analysis.ts');
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const cases = [];
    const fen = new Chess().fen();
    const evaluation = { fen, cp: 100, depth: 18, finished: true, bestMove: 'e2e4', selectedMove: 'd2d4' };
    for (const elo of [1500, 1800, 2000, 2500, 2850]) {
      const options = botSearchOptions(elo);
      check(options.elo === elo && options.skill === undefined, `${elo}: rating was replaced with an arbitrary skill`);
      check(chooseBotMove(fen, elo, evaluation, () => 0) === 'd2d4', `${elo}: bot ignored the handicap move`);
    }
    for (const elo of [800, 1000, 1200]) {
      check(botSearchOptions(elo).elo === 1320, 'Sub-floor level was sent to the engine');
      const move = chooseBotMove(fen, elo, evaluation, () => 0);
      check(move !== 'd2d4' && new Chess(fen).moves({ verbose: true }).some(legal => legal.lan === move), 'Novice lapse is missing or illegal');
      check(chooseBotMove(fen, elo, evaluation, () => 0.999) === 'd2d4', 'Novice level never uses its engine move');
    }
    const forced = '7k/8/6K1/8/8/8/8/R7 b - - 0 1';
    check(new Chess(forced).moves().length === 1 && chooseBotMove(forced, 800, { ...evaluation, selectedMove: undefined }, () => 0) === 'h8g8', 'Novice mode lost a forced reply');
    cases.push('Bot uses native Elo limits, plays the handicap move, and adds legal lapses only below the engine floor');

    const OriginalWorker = window.Worker;
    const workers = [];
    class FakeWorker extends EventTarget {
      commands = [];
      emit(line) { this.dispatchEvent(new MessageEvent('message', { data: line })); }
      constructor() { super(); workers.push(this); }
      terminate() {}
      postMessage(command) {
        this.commands.push(command);
        if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
        if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
        if (command.startsWith('go ')) queueMicrotask(() => {
          this.emit('info depth 17 multipv 1 score cp 60 pv e2e4 e7e5');
          this.emit('info depth 17 multipv 2 score cp 40 pv d2d4 d7d5');
          // Interrupted next iteration must not replace the complete pair.
          this.emit('info depth 18 multipv 1 score cp 300 pv e2e4 e7e5');
          this.emit('bestmove d2d4');
        });
      }
    }
    window.Worker = FakeWorker;
    let engine;
    clearCachedEvaluations([fen]);
    try {
      engine = new UciEngine('strength-test');
      await engine.initialize();
      const bot = await engine.analyze(fen, botSearchOptions(1500));
      check(bot.selectedMove === 'd2d4' && bot.bestMove === 'e2e4' && bot.cp === 300, 'Handicap move corrupted the PV score');
      cacheEvaluation(bot);
      check(!getCachedEvaluation(fen), 'Handicapped bot evaluation polluted the review cache');
      const commands = workers[0].commands;
      check(commands.includes('setoption name UCI_LimitStrength value true') && commands.includes('setoption name UCI_Elo value 1500'), 'Bot limiter was not enabled');
      const result = await engine.analyze(fen, { searchMoves: ['e2e4', 'd2d4'], multiPv: 2 });
      check(commands.at(-5) === 'setoption name UCI_LimitStrength value false' && commands.includes('setoption name Skill Level value 20'), 'Analysis inherited the bot handicap');
      check(result.variations?.length === 2 && result.variations.every(entry => entry.depth === 17) && result.cp === 60, 'MultiPV mixed an incomplete depth with completed scores');
      check(result.variations[1].cp === 40 && result.variations[1].bestMove === 'd2d4', 'Candidate score/PV was mixed');
      const unrestricted = await engine.analyze(fen);
      check(!unrestricted.strengthLimited && unrestricted.cp === 300 && unrestricted.bestMove === 'e2e4', 'Unrestricted analysis used another MultiPV rank');
    } finally { engine?.dispose(); window.Worker = OriginalWorker; }
    cases.push('UCI separates handicap moves from PV scores, resets analysis strength, and retains only complete MultiPV iterations');

    for (const [root, lan, best] of [
      ['7k/8/8/8/8/8/4P3/4K3 w - - 0 42', 'e2e3', 'e2e4'],
      ['4k3/4p3/8/8/8/8/8/7K b - - 0 42', 'e7e6', 'e7e5'],
    ]) {
      const move = new Chess(root).move({ from: lan.slice(0, 2), to: lan.slice(2, 4) });
      const side = move.color === 'w' ? 1 : -1;
      const before = { fen: root, cp: 250 * side, depth: 18, bestMove: best, finished: true };
      const after = { fen: move.after, cp: 900 * side, depth: 18, finished: true };
      const searches = [];
      const mock = { analyze: async (fen, options) => {
        searches.push(options);
        return { fen, variations: [
          { ...before, cp: 60 * side, searchMoves: options.searchMoves },
          { ...before, cp: 40 * side, bestMove: lan, searchMoves: options.searchMoves },
        ] };
      } };
      const result = await analyzeMove(mock, before, after, lan, new AbortController().signal);
      const node = { move };
      const patch = analyzedNode(node, result.before, result.after, [], result.played);
      check(searches.length === 1 && searches[0].multiPv === 2 && patch.classification === 'excellent' && patch.moveLossCp === 20,
        `${move.color}: independent score drift caused a false mistake`);
      check(patch.score === 900 * side && patch.positionEvaluation === after, 'Comparison replaced the board score');
      cacheEvaluation(result.before);
      check(getCachedEvaluation(root) !== result.before, 'Restricted pair overwrote the unrestricted cache');
    }
    cases.push('Both colors are graded using a simultaneous same-depth pair, while board evaluations stay separate');

    for (const [root, lan, alternative] of [
      ['7k/8/8/8/8/8/4P3/4K3 w - - 0 42', 'e2e3', 'e2e4'],
      ['4k3/4p3/8/8/8/8/8/7K b - - 0 42', 'e7e6', 'e7e5'],
    ]) {
      const move = new Chess(root).move({ from: lan.slice(0, 2), to: lan.slice(2, 4) });
      const side = move.color === 'w' ? 1 : -1;
      const before = { fen: root, cp: 50 * side, depth: 18, bestMove: lan, finished: true };
      const after = { fen: move.after, cp: -600 * side, depth: 20, finished: true };
      const revised = { ...before, bestMove: alternative, depth: 22 };
      const mock = { analyze: async (fen, options) => fen === move.after ? after : options.multiPv ? {
        ...revised, variations: [revised, { ...revised, cp: -600 * side, bestMove: lan }],
      } : revised };
      const result = await analyzeMove(mock, before, after, lan, new AbortController().signal);
      check(result.status === 'verified' && !result.uncertain && result.before.bestMove === alternative &&
        analyzedNode({ move }, result.before, result.after, [], result.played).classification === 'blunder',
      `${move.color}: stale best-move label survived a refuted board evaluation`);
      const unresolved = { analyze: async fen => fen === move.after ? after : before };
      const ambiguous = await analyzeMove(unresolved, before, after, lan, new AbortController().signal);
      check(ambiguous.uncertain, 'Contradictory best-move verdict was presented as certain');
    }
    cases.push('A refuted board evaluation rechecks an old best move and replaces its label or marks the unresolved conflict');
    return cases;
  });
  assert.equal(results.length, 4);
  return results;
}
