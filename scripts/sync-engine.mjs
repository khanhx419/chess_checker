import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('node_modules/stockfish/', root);
const target = new URL('public/stockfish/', root);
await mkdir(target, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm',
  'stockfish-19-single.js', 'stockfish-19-single.wasm', 'stockfish-19-asm.js']) {
  await copyFile(new URL(`bin/${file}`, source), new URL(file, target));
}
await copyFile(new URL('Copying.txt', source), new URL('Copying.txt', target));
console.log(`Stockfish 19 assets ready: ${fileURLToPath(target)}`);
