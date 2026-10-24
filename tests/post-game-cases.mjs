import assert from 'node:assert/strict';

export async function testPostGame(page) {
  await page.evaluate(() => {
    const state = window.__store.getState();
    window.__postGamePrevious = state;
    state.loadPgn('[Event "PostGameTest"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    const loaded = window.__store.getState();
    const line = loaded.getActiveLine();
    loaded.goToMove(line[0].id);
    const pgn = loaded.exportPgn();
    window.__postGameExportFromEarlier = pgn;
    loaded.goToMove(line.at(-1).id);
    loaded.setMode('play');
    window.__postGameIds = line.map(node => node.id);
    window.__postGameFen = window.__store.getState().fen;
    window.__exportedFiles = [];
    window.__originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      window.__exportedFiles.push(blob);
      return window.__originalCreateObjectURL.call(URL, blob);
    };
    window.__blockTestDownload = event => { if (event.target.closest('a[download]')) event.preventDefault(); };
    document.addEventListener('click', window.__blockTestDownload, true);
  });
  try {
    await page.waitForFunction(() => window.__store.getState().mode === 'play');
    await page.click('.export-actions summary');
    await page.evaluate(() => [...document.querySelectorAll('.export-menu button')].find(button => button.textContent.includes('.pgn')).click());
    const exported = await page.evaluate(async () => {
      const { Chess } = await import('/node_modules/.vite/deps/chess__js.js');
      const blob = window.__exportedFiles.find(blob => blob.type.startsWith('application/x-chess-pgn'));
      const pgn = await blob.text();
      const chess = new Chess(); chess.loadPgn(pgn);
      const earlier = new Chess(); earlier.loadPgn(window.__postGameExportFromEarlier);
      return { pgn, length: chess.history().length, fen: chess.fen(), result: chess.getHeaders().Result,
        event: chess.getHeaders().Event, earlierLength: earlier.history().length, expectedFen: window.__postGameFen };
    });
    assert.equal(exported.length, 4);
    assert.equal(exported.earlierLength, 4, 'Export includes the selected continuation beyond the displayed move');
    assert.equal(exported.fen, exported.expectedFen);
    assert.equal(exported.result, '0-1');
    assert.equal(exported.event, 'PostGameTest');

    await page.click('.export-actions summary');
    await page.evaluate(() => [...document.querySelectorAll('.export-menu button')].find(button => button.textContent.includes('.png')).click());
    await page.waitForFunction(() => window.__exportedFiles.some(blob => blob.type === 'image/png') || document.querySelector('[role="alert"]'));
    const exportError = await page.$eval('body', body => body.querySelector('[role="alert"]')?.textContent);
    assert.ok(!exportError, exportError);
    const png = await page.evaluate(async () => {
      const blob = window.__exportedFiles.find(blob => blob.type === 'image/png');
      const bytes = [...new Uint8Array(await blob.arrayBuffer()).slice(0, 8)];
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(512, 32, 120, 120).data;
      let darkPixels = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50) darkPixels++;
      return { bytes, width: image.width, height: image.height, darkPixels };
    });
    assert.deepEqual(png.bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.width, 1024); assert.equal(png.height, 1024);
    assert.ok(png.darkPixels > 50, 'PNG includes actual piece artwork');

    await page.click('[data-testid="review-game"]');
    await page.waitForFunction(() => window.__store.getState().mode === 'preview');
    await page.waitForFunction(() => Object.values(window.__store.getState().nodes).every(node => node.classification !== 'none'), { timeout: 45000 });
    const reviewed = await page.evaluate(() => {
      const state = window.__store.getState();
      return { ids: Object.keys(state.nodes), expected: window.__postGameIds, fen: state.fen, expectedFen: window.__postGameFen };
    });
    assert.deepEqual(reviewed.ids, reviewed.expected);
    assert.equal(reviewed.fen, reviewed.expectedFen);

    // Review must also work before the bot's pending reply arrives.
    await page.evaluate(() => {
      const state = window.__store.getState();
      state.resetGame(); state.setMode('play');
      state.makeMove({ from: 'e2', to: 'e4' });
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="review-game"]').textContent.includes('Review ván đấu'));
    await page.click('[data-testid="review-game"]');
    await page.waitForFunction(() => window.__store.getState().mode === 'preview' &&
      Object.values(window.__store.getState().nodes).every(node => node.classification !== 'none'), { timeout: 20000 });
    assert.equal(await page.evaluate(() => Object.keys(window.__store.getState().nodes).length), 1, 'Pending bot reply must not alter a reviewed game');
    return ['Played games export complete PGN and a valid PNG with pieces',
      'Review is available in play mode, preserves finished games, and cancels pending bot replies'];
  } finally {
    await page.evaluate(() => {
      URL.createObjectURL = window.__originalCreateObjectURL;
      document.removeEventListener('click', window.__blockTestDownload, true);
      window.__store.setState({ ...window.__postGamePrevious, gameVersion: window.__store.getState().gameVersion + 1 });
    });
  }
}
