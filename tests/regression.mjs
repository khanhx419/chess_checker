import assert from 'node:assert/strict';
import { createServer, build, preview } from 'vite';
import puppeteer from 'puppeteer';
import { testAnalysis } from './analysis-cases.mjs';
import { testLayout } from './layout-cases.mjs';
import { testEngineProfiles } from './engine-profile-cases.mjs';
import { testBrilliance } from './brilliance-cases.mjs';
import { testPostGame } from './post-game-cases.mjs';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  plugins: [{ name: 'regression-harness', configureServer(server) {
    server.middlewares.use('/__test_harness', (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<html><head></head><body>Engine regression tests</body></html>');
    });
  } }],
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
let production;
const passed = [];
const pass = name => { passed.push(name); console.log(`PASS ${name}`); };
try {
  browser = await puppeteer.launch({ headless: true });
  const harness = await browser.newPage();
  await harness.goto(`${base}/__test_harness`);
  const protocol = await harness.evaluate(async () => {
    const { UciEngine } = await import('/src/engine.ts');
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
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
      }
      terminate() { this.terminated = true; }
    }
    window.Worker = FakeWorker;
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    let engine;
    try {
      engine = new UciEngine('fake');
      await engine.initialize();
      const worker = workers[0];
      const chess = new Chess();
      const firstFen = chess.fen();
      chess.move('e4');
      const nextFen = chess.fen();
      const controller = new AbortController();
      let staleInfo = 0;
      const first = engine.analyze(firstFen, { signal: controller.signal, onInfo: () => staleInfo++ }).catch(error => error.name);
      await tick();
      controller.abort();
      const second = engine.analyze(nextFen);
      await tick();
      if (worker.commands.includes(`position fen ${nextFen}`)) throw Error('New search started before old bestmove');
      worker.emit('info depth 16 score cp 999 pv d2d4');
      worker.emit('bestmove d2d4');
      await tick();
      if (!worker.commands.includes(`position fen ${nextFen}`)) throw Error('Queued search never started');
      worker.emit('info depth 8 score cp 34 pv e7e5 g1f3');
      worker.emit('bestmove e7e5');
      const result = await second;
      if (await first !== 'AbortError' || staleInfo !== 0 || result.cp !== -34 || result.fen !== nextFen || result.bestMove !== 'e7e5') {
        throw Error(`Stale result or perspective error: ${JSON.stringify(result)}`);
      }
      const waiting = engine.analyze(firstFen).catch(error => error.name);
      await tick();
      engine.dispose();
      if (await waiting !== 'AbortError' || !worker.terminated) throw Error('Dispose left a search pending');
      const originalTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay >= 10000 ? 20 : delay, ...args);
      try {
        engine = new UciEngine('search-timeout');
        await engine.initialize();
        const timedOut = await engine.analyze(firstFen).catch(error => error.message);
        if (!timedOut.includes('không phản hồi') || !workers.at(-1).terminated) throw Error('Search timeout did not settle');
        FakeWorker.prototype.postMessage = function(command) { this.commands.push(command); };
        engine = new UciEngine('startup-timeout');
        const startup = await engine.initialize().catch(error => error.message);
        if (!startup.includes('khởi động quá lâu') || !workers.at(-1).terminated) throw Error(`Initialization timeout did not settle: ${JSON.stringify({ startup, workers: workers.map(worker => ({ commands: worker.commands, terminated: worker.terminated })) })}`);
      } finally { window.setTimeout = originalTimeout; }
      return true;
    } finally { engine?.dispose(); window.Worker = OriginalWorker; }
  });
  assert.equal(protocol, true);
  pass('UCI cancellation drains stale output, serializes searches, normalizes Black scores, and settles disposal/timeouts');
  for (const name of await testAnalysis(harness)) pass(name);
  for (const name of await testBrilliance(harness)) pass(name);
  for (const name of await testEngineProfiles(harness)) pass(name);

  const terminals = await harness.evaluate(async () => {
    const { createEngine, evaluationScore } = await import('/src/engine.ts');
    const engine = await createEngine();
    try {
      const mate = await engine.analyze('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
      const draw = await engine.analyze('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      const single = await engine.analyze('7k/8/6K1/8/8/8/8/R7 b - - 0 1', { movetime: 150 });
      return { mate, score: evaluationScore(mate), draw, single };
    } finally { engine.dispose(); }
  });
  assert.equal(terminals.mate.mate, 0);
  assert.equal(terminals.mate.mateWinner, 'b');
  assert.equal(terminals.score, -30000);
  assert.equal(terminals.draw.cp, 0);
  assert.equal(terminals.single.finished, true);
  pass('Real WebAssembly engine handles checkmate, stalemate, and forced legal replies');

  await harness.setRequestInterception(true);
  const blockWasm = request => request.url().endsWith('/stockfish-19-lite-single.js') ? request.abort() : request.continue();
  harness.on('request', blockWasm);
  const fallback = await harness.evaluate(async () => {
    const { createEngine } = await import('/src/engine.ts');
    const engine = await createEngine();
    try { return await engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { movetime: 150 }); }
    finally { engine.dispose(); }
  });
  assert.equal(fallback.finished, true);
  assert.ok(fallback.bestMove);
  await harness.setRequestInterception(false);
  harness.off('request', blockWasm);
  pass('JavaScript engine fallback works when WebAssembly worker fails to load');

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const started = Date.now();
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    window.__store = (await import('/src/store.ts')).useGameStore;
    window.__engine = await import('/src/engine.ts');
  });
  await page.waitForFunction(() => window.__engine.getCachedEvaluation(window.__store.getState().fen)?.finished, { timeout: 15000 });
  pass(`Initial analysis completes (${Date.now() - started} ms including page load)`);

  await page.select('.engine-choice select', 'full');
  await page.waitForFunction(() => window.__engine.getCachedEvaluation(window.__store.getState().fen)?.engineId === window.__engine.ENGINE_PROFILES.full.id, { timeout: 45000 });
  assert.equal(await page.evaluate(() => window.__store.getState().engineProfile), 'full');
  await page.select('.engine-choice select', 'lite');
  await page.waitForFunction(() => window.__engine.getCachedEvaluation(window.__store.getState().fen)?.engineId === window.__engine.ENGINE_PROFILES.lite.id, { timeout: 15000 });
  pass('The engine selector replaces a live lite worker with the full NNUE model and can return to lite without stale output');

  const storeResults = await page.evaluate(() => {
    const store = window.__store;
    const check = (value, message) => { if (!value) throw Error(message); };
    store.getState().resetGame();
    const move = lan => check(store.getState().makeMove({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] }), `Illegal ${lan}`);
    move('e2e4');
    const e4 = store.getState().currentMoveId;
    move('e7e5');
    const e5 = store.getState().currentMoveId;
    move('g1f3');
    store.getState().goToMove(e4);
    move('c7c5');
    const c5 = store.getState().currentMoveId;
    move('g1f3');
    const sicilianLeaf = store.getState().currentMoveId;
    store.getState().goToMove(null);
    check(store.getState().getSelectedLine().map(node => node.move.san).join(' ') === 'e4 c5 Nf3', 'Selected branch lost at root');
    store.getState().goToMove(e5);
    check(store.getState().getSelectedLine().map(node => node.move.san).join(' ') === 'e4 e5 Nf3', 'Main branch not restored');
    store.getState().deleteNode(e5);
    check(store.getState().currentMoveId === e4 && store.getState().chess.fen() === store.getState().fen, 'Deletion desynchronized board');
    check(store.getState().nodes[c5] && store.getState().nodes[sicilianLeaf], 'Deletion removed sibling');
    store.getState().goToMove(null);
    move('d2d4');
    const d4 = store.getState().currentMoveId;
    store.getState().resetGame();
    for (let i = 0; i < 2; i++) for (const lan of ['g1f3','g8f6','f3g1','f6g8']) move(lan);
    check(store.getState().gameOver?.reason === 'repetition', 'Repetition history lost');
    store.getState().goToMove(null);
    check(store.getState().gameOver === null && store.getState().chess.fen() === store.getState().fen, 'Navigation kept terminal state');
    const custom = '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/4P3/4K3 w - - 0 42"]\n\n42. e4 *';
    check(store.getState().loadPgn(custom), 'Custom FEN PGN rejected');
    const initial = store.getState().initialFen;
    store.getState().goToMove(null);
    check(store.getState().fen === initial, 'Root lost custom FEN');
    move('e2e3');
    check(store.getState().nodes[store.getState().currentMoveId].move.before === initial, 'Branch started from standard FEN');
    check(!store.getState().loadPgn('not a PGN'), 'Invalid PGN accepted');
    store.getState().resetGame();
    move('e2e4');
    const firstRoot = store.getState().currentMoveId;
    store.getState().goToMove(null);
    move('d2d4');
    return { firstRoot, secondRoot: store.getState().currentMoveId, oldRoot: d4 };
  });
  assert.notEqual(storeResults.oldRoot, storeResults.secondRoot);
  await page.waitForSelector(`[data-move-id="${storeResults.firstRoot}"]`);
  await page.waitForSelector(`[data-move-id="${storeResults.secondRoot}"]`);
  pass('Branches, root variations, deletion, selected continuation, repetition, and custom FEN PGN stay consistent');

  // Let incomplete searches race while creating an uncached variation.
  const liveBranch = await page.evaluate(() => {
    const state = window.__store.getState();
    state.resetGame();
    state.makeMove({ from: 'b1', to: 'c3' });
    const first = window.__store.getState().currentMoveId;
    state.goToMove(null);
    state.makeMove({ from: 'g1', to: 'f3' });
    return { first, second: window.__store.getState().currentMoveId };
  });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(id => window.__store.getState().goToMove(id), i % 2 ? liveBranch.first : liveBranch.second);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  await page.waitForFunction(id => window.__store.getState().nodes[id].classification !== 'none', { timeout: 15000 }, liveBranch.first);
  await page.evaluate(id => window.__store.getState().goToMove(id), liveBranch.second);
  await page.waitForFunction(id => window.__store.getState().nodes[id].classification !== 'none', { timeout: 15000 }, liveBranch.second);
  const legalHints = await page.evaluate(async () => {
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    return Object.values(window.__store.getState().nodes).every(node =>
      node.positionEvaluation.fen === node.move.after &&
      new Chess(node.move.before).moves({ verbose: true }).some(move => move.lan === node.engineBestMove) &&
      new Chess(node.move.after).moves({ verbose: true }).some(move => move.lan === node.positionEvaluation.bestMove));
  });
  assert.equal(legalHints, true);
  pass('Uncached branch switching completes live classification and preserves legal hints on both sides');

  // Exercise PGN loading through the actual interface.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Nhập PGN')).click());
  await page.waitForSelector('textarea');
  await page.type('textarea', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Phân tích' && button.closest('.pgn-modal')).click());
  await page.waitForFunction(() => window.__store.getState().getActiveLine().length === 8);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Full Review')).click());
  await page.waitForFunction(() => Object.values(window.__store.getState().nodes).every(node => node.classification !== 'none'), { timeout: 25000 });
  const review = await page.evaluate(() => {
    const state = window.__store.getState();
    return Object.values(state.nodes).map(node => ({
      before: node.move.before, after: node.move.after,
      evaluationFen: node.positionEvaluation?.fen,
      best: node.engineBestMove, pv: node.pvLine,
      afterBest: node.positionEvaluation?.bestMove,
    }));
  });
  assert.ok(review.every(node => node.evaluationFen === node.after && node.best === node.pv?.[0]));
  pass('PGN import and full review complete; before/after recommendations are kept separately');

  // Poison a completely cached line to reproduce the reported "review does nothing" bug.
  const cleared = await page.evaluate(() => {
    const state = window.__store.getState();
    for (const node of Object.values(state.nodes)) {
      window.__engine.cacheEvaluation({ fen: node.move.before, cp: 123456, depth: 16, finished: true, analyzedAt: 1 });
      window.__engine.cacheEvaluation({ fen: node.move.after, cp: 123456, depth: 16, finished: true, analyzedAt: 1 });
      state.updateNode(node.id, { classification: 'blunder', score: 123456, analysisStatus: 'quick' });
    }
    [...document.querySelectorAll('button')].find(button => button.textContent.includes('Full Review')).click();
    return Object.values(window.__store.getState().nodes).every(node =>
      node.classification === 'none' && node.score === null && !node.positionEvaluation && node.analysisStatus === 'reviewing');
  });
  assert.equal(cleared, true, 'Full Review must clear cached labels and scores synchronously');
  await page.waitForFunction(() => Object.values(window.__store.getState().nodes).every(node => node.classification !== 'none'), { timeout: 45000 });
  const freshReview = await page.evaluate(() => Object.values(window.__store.getState().nodes).every(node =>
    node.score !== 123456 && node.positionEvaluation.analyzedAt > 1 && node.beforeEvaluation.analyzedAt > 1));
  assert.equal(freshReview, true);
  pass('Full Review discards wrong cached scores/labels immediately and recalculates the complete line');

  const tactical = await harness.evaluate(async () => {
    const { createEngine } = await import('/src/engine.ts');
    const { analyzeMove } = await import('/src/moveAnalysis.ts');
    const { analyzedNode } = await import('/src/analysis.ts');
    const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
    const chess = new Chess();
    chess.move('f3'); chess.move('e5');
    const move = chess.move('g4');
    const node = { id: 'g4', move, classification: 'none', score: null, childrenIds: [], parentId: null };
    const engine = await createEngine();
    try {
      const before = await engine.analyze(move.before, { depth: 16, movetime: 150 });
      const after = await engine.analyze(move.after, { depth: 16, movetime: 150 });
      const result = await analyzeMove(engine, before, after, move.lan, new AbortController().signal);
      const patch = analyzedNode(node, result.before, result.after, [], result.played);
      return { classification: patch.classification, status: result.status,
        restricted: result.played.searchMoves, target: result.before.targetDepth,
        whiteMate: result.after.mateWinner, score: patch.score };
    } finally { engine.dispose(); }
  });
  assert.equal(tactical.classification, 'blunder');
  assert.equal(tactical.status, 'verified');
  assert.deepEqual(tactical.restricted, ['g2g4']);
  assert.equal(tactical.target, 24);
  assert.equal(tactical.whiteMate, 'b');
  pass('A real tactical blunder receives a bounded deeper recheck and agrees with the board evaluation');

  await page.evaluate(() => {
    const state = window.__store.getState();
    for (let i = 0; i < 20; i++) state.goToMove(state.getSelectedLine()[i % 8].id);
    state.goToMove(null);
  });
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__store.getState().getActiveLine().length === 8);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__store.getState().getActiveLine().length === 1);
  pass('Rapid navigation and keyboard first/last/next preserve the chosen branch');

  await page.evaluate(() => {
    const state = window.__store.getState();
    state.loadPgn('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O *');
  });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Full Review')).click());
  await page.waitForFunction(() => document.body.textContent.includes('Hủy phân tích'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Hủy phân tích').click());
  await page.waitForFunction(() => !document.body.textContent.includes('Hủy phân tích'));
  await page.evaluate(() => {
    const state = window.__store.getState();
    state.resetGame();
    state.setMode('play');
    state.makeMove({ from: 'e2', to: 'e4' });
  });
  await page.waitForFunction(() => window.__store.getState().getActiveLine().length === 2, { timeout: 15000 });
  const count = await page.evaluate(() => window.__store.getState().getActiveLine().length);
  assert.equal(count, 2);
  await page.evaluate(() => {
    const state = window.__store.getState();
    state.makeMove({ from: 'g1', to: 'f3' });
    state.setMode('preview');
    state.resetGame();
  });
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.equal(await page.evaluate(() => Object.keys(window.__store.getState().nodes).length), 0);
  pass('Review cancellation, bot response, and mode/reset cancellation leave no stale moves');

  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await page.waitForFunction(() => window.__store.getState().getActiveLine().at(-1)?.move.san === 'e4');
  pass('Clicking source/destination squares makes a legal move');

  const originalLine = await page.evaluate(() => {
    const state = window.__store.getState();
    state.loadPgn('1. f3 e5 2. g4 Qh4# *');
    const line = window.__store.getState().getActiveLine();
    state.goToMove(line[2].id);
    state.updateNode(line[2].id, { classification: 'blunder', engineBestMove: 'g1h3', pvLine: ['g1h3'] });
    return line.map(node => node.id);
  });
  await page.waitForFunction(() => document.body.textContent.includes('Xem nước đi tốt nhất'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Xem nước đi tốt nhất')).click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Thử nước tốt nhất')).click());
  const alternative = await page.evaluate(ids => {
    const state = window.__store.getState();
    return { preserved: ids.every(id => state.nodes[id]), san: state.nodes[state.currentMoveId].move.san,
      siblings: state.nodes[ids[1]].childrenIds.length, gameOver: state.gameOver };
  }, originalLine);
  assert.deepEqual(alternative, { preserved: true, san: 'Nh3', siblings: 2, gameOver: null });
  pass('Trying the recommended move preserves the original game and creates a legal variation');

  // A real forced-mate sacrifice, including best-other-move search and UI card.
  await page.evaluate(() => {
    window.__store.getState().loadPgn('[SetUp "1"]\n[FEN "q4r1k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1"]\n\n1. Qg8+ *');
  });
  await page.waitForFunction(() => {
    const state = window.__store.getState();
    return state.nodes[state.currentMoveId]?.classification === 'brilliant';
  }, { timeout: 20000 });
  const brilliant = await page.evaluate(() => {
    const state = window.__store.getState();
    const node = state.nodes[state.currentMoveId];
    return { status: node.analysisStatus, depth: node.reviewDepth, played: node.moveEvaluation.searchMoves,
      alternatives: node.alternativeEvaluation.searchMoves, proof: document.querySelector('.move-explanation').textContent };
  });
  assert.equal(brilliant.status, 'verified');
  assert.ok(brilliant.depth >= 16);
  assert.deepEqual(brilliant.played, ['e6g8']);
  assert.ok(brilliant.alternatives.length > 1 && !brilliant.alternatives.includes('e6g8'));
  assert.ok(brilliant.proof.includes('thiên tài') && brilliant.proof.includes('Rxg8') && brilliant.proof.includes('Nf7#'));
  pass('Real Stockfish 19 confirms Qg8+!! Rxg8 Nf7# and the UI explains the verified queen sacrifice');

  for (const name of await testPostGame(page)) pass(name);
  const viewportCount = await testLayout(page);
  pass(`Single-viewport board, history, explanation and dialogs fit ${viewportCount} desktop/mobile sizes`);

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  pass('No browser runtime errors');
  const failurePage = await browser.newPage();
  await failurePage.setRequestInterception(true);
  const blockEngine = request => /stockfish-19.*\.js$/.test(request.url()) ? request.abort() : request.continue();
  failurePage.on('request', blockEngine);
  await failurePage.goto(base);
  await failurePage.waitForSelector('[role="alert"]', { timeout: 15000 });
  await failurePage.setRequestInterception(false);
  failurePage.off('request', blockEngine);
  await failurePage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Thử lại').click());
  await failurePage.waitForFunction(() => document.body.textContent.includes('Đã phân tích') && !document.querySelector('[role="alert"]'), { timeout: 15000 });
  await failurePage.close();
  pass('Engine load failures surface an error and recover with Retry');

  await build({ base: '/chess/', build: { outDir: 'node_modules/.tmp/regression-dist' }, logLevel: 'error' });
  production = await preview({ base: '/chess/', build: { outDir: 'node_modules/.tmp/regression-dist' }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  const productionPage = await browser.newPage();
  const productionErrors = [];
  const requests = [];
  productionPage.on('pageerror', error => productionErrors.push(error.message));
  productionPage.on('response', response => { if (response.url().includes('/stockfish/')) requests.push({ url: response.url(), status: response.status() }); });
  await productionPage.setViewport({ width: 1440, height: 1000 });
  await productionPage.goto(`http://127.0.0.1:${production.httpServer.address().port}/chess/`);
  await productionPage.waitForFunction(() => document.body.textContent.includes('Đã phân tích'), { timeout: 15000 });
  assert.ok(requests.some(request => request.url.endsWith('/chess/stockfish/stockfish-19-lite-single.wasm') && request.status === 200));
  assert.ok(!requests.some(request => request.url.endsWith('/stockfish-19-single.wasm')), 'Default page must not download the full model');
  assert.deepEqual(productionErrors, []);
  await productionPage.screenshot({ path: 'node_modules/.tmp/regression.png', fullPage: true });
  pass('Production build loads WebAssembly correctly under /chess/');
  console.log(`\n${passed.length} regression checks passed.`);
} finally {
  await browser?.close();
  await server.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
}
