import assert from 'node:assert/strict';
import path from 'node:path';

const VIEWPORTS = [[1366, 768], [1440, 900], [1920, 1080], [390, 844], [375, 667], [844, 390]];
const LONG_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Qc7 13. Be3 Bb7 14. Rc1 Rfe8 15. cxb5 axb5 16. Nxb5 Qb8 17. Nc3 exd4 18. Nxd4 Bf8 19. Nf5 Ne5 20. f4 Ng6';

// Runs against the app page used by regression.mjs; restores its game and viewport.
export async function testLayout(page, { screenshotsDir } = {}) {
  const originalViewport = page.viewport();
  await page.evaluate(pgn => {
    const store = window.__store;
    if (!store) throw Error('Layout tests require window.__store');
    window.__layoutPreviousState = store.getState();
    if (!store.getState().loadPgn(pgn)) throw Error('Invalid layout fixture PGN');
    const state = store.getState();
    state.setMode('preview');
    const node = state.nodes[state.currentMoveId];
    const beforeEvaluation = { fen: node.move.before, cp: 45, depth: 18, finished: true, bestMove: 'e8e7', pv: ['e8e7'] };
    const positionEvaluation = { fen: node.move.after, cp: 5, depth: 18, finished: true, bestMove: 'g1h1', pv: ['g1h1'] };
    state.updateNode(node.id, {
      classification: 'inaccuracy', scoreBefore: 45, score: 5, engineBestMove: 'e8e7', pvLine: ['e8e7'],
      beforeEvaluation, positionEvaluation, moveEvaluation: beforeEvaluation, analysisStatus: 'verified', reviewDepth: 18,
    });
  }, LONG_PGN);

  const visibleBounds = async selector => page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  });
  const assertInViewport = (rect, width, height, label) => {
    assert.ok(rect.width > 0 && rect.height > 0, `${label} has a visible size at ${width}x${height}: ${JSON.stringify(rect)}`);
    assert.ok(rect.x >= -1 && rect.y >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1,
      `${label} must fit ${width}x${height}: ${JSON.stringify(rect)}`);
  };
  const closeModal = async selector => {
    await page.$eval(selector, modal => [...modal.querySelectorAll('button')].find(button => button.textContent.trim() === 'Hủy')?.click());
    await page.waitForSelector(selector, { hidden: true });
  };

  try {
    await page.waitForSelector('.move-explanation h4', { visible: true });
    for (const [width, height] of VIEWPORTS) {
      await page.setViewport({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        historyScroll: document.querySelector('.move-history').scrollHeight,
        historyHeight: document.querySelector('.move-history').clientHeight,
      }));
      assert.ok(metrics.width <= width && metrics.bodyWidth <= width, `No horizontal page scroll at ${width}x${height}`);
      assert.ok(metrics.height <= height && metrics.bodyHeight <= height, `No vertical page scroll at ${width}x${height}`);
      assert.ok(metrics.historyScroll > metrics.historyHeight, `Long move history scrolls internally at ${width}x${height}`);
      const board = await visibleBounds('.chess-board');
      assert.ok(Math.abs(board.width - board.height) <= 1, `Board remains square at ${width}x${height}`);
      assertInViewport(board, width, height, 'Board');
      for (const selector of ['.board-controls', '.move-navigation', '.move-explanation']) {
        assertInViewport(await visibleBounds(selector), width, height, selector);
      }
      const rail = await visibleBounds('.nav-rail');
      assert.ok(rail.x === 0 && rail.y === 0 && rail.width <= 64 && rail.height === height,
        `Navigation stays in a left rail at ${width}x${height}`);
      const headerButtons = await page.$$eval('.app-header button, .sidebar-actions button', buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
      }));
      headerButtons.forEach(rect => assertInViewport(rect, width, height, 'Navigation or sidebar control'));
      if (screenshotsDir && [1366, 390].includes(width)) {
        await page.screenshot({ path: path.join(screenshotsDir, `layout-final-${width}.png`) });
      }

      // Both import and new-game dialogs must keep their fields and actions onscreen.
      await page.click('.header-actions > button:first-child');
      await page.waitForSelector('.pgn-modal');
      assertInViewport(await visibleBounds('.pgn-modal'), width, height, 'PGN dialog');
      assertInViewport(await visibleBounds('.pgn-modal textarea'), width, height, 'PGN input');
      await closeModal('.pgn-modal');
      await page.click('.header-actions > button:last-child');
      await page.waitForSelector('.app-modal');
      assertInViewport(await visibleBounds('.app-modal'), width, height, 'New-game dialog');
      assertInViewport(await visibleBounds('.app-modal select'), width, height, 'Bot difficulty selector');
      await closeModal('.app-modal');
    }
    return VIEWPORTS.length;
  } finally {
    await page.evaluate(() => {
      if (window.__layoutPreviousState) {
        window.__store.setState({ ...window.__layoutPreviousState, gameVersion: window.__store.getState().gameVersion + 1 });
        delete window.__layoutPreviousState;
      }
    });
    if (originalViewport) await page.setViewport(originalViewport);
  }
}
