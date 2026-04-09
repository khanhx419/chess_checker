import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Intercept logs
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });
  
  await page.goto('http://localhost:5173');
  
  await page.waitForSelector('button');
  
  // Click 'Chơi vs Máy'
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Chơi vs Máy')) {
      await btn.click();
      break;
    }
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Start the game (White)
  const buttons2 = await page.$$('button');
  for (const btn of buttons2) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Bắt đầu chơi') || text.includes('Ván mới')) {
      await btn.click();
      break;
    }
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Drag e2 to e4
  // We can just simulate onSquareClick for e2 then e4
  console.log('Clicking e2...');
  let e2 = await page.$('[data-square="e2"]');
  if (e2) {
    await e2.click();
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  console.log('Clicking e4...');
  let e4 = await page.$('[data-square="e4"]');
  if (e4) {
    await e4.click();
  }

  await new Promise(r => setTimeout(r, 2000));

  await browser.close();
})();
