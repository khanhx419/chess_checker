import { Chess } from 'chess.js';
import { defaultPieces } from 'react-chessboard';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draw a snapshot of the actual board using the app's existing SVG pieces. */
export async function exportBoardPng(fen: string, blackAtBottom: boolean) {
  const chess = new Chess(fen);
  // Load the same piece artwork directly: board animations or a bot reply can
  // remove a DOM piece while a snapshot is being prepared.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const images = new Map<string, Promise<HTMLImageElement>>();
  for (const piece of chess.board().flat()) {
    if (!piece) continue;
    const name = `${piece.color}${piece.type.toUpperCase()}`;
    if (images.has(name)) continue;
    const artwork = renderToStaticMarkup(defaultPieces[name]({ svgStyle: { width: '120px', height: '120px' } }));
    images.set(name, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể tạo hình quân cờ.'));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`;
    }));
  }
  const loaded = new Map(await Promise.all([...images].map(async ([name, promise]) => [name, await promise] as const)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không hỗ trợ xuất ảnh bàn cờ.');
  context.fillStyle = '#18181b';
  context.fillRect(0, 0, 1024, 1024);
  const margin = 32;
  const size = 120;
  const files = blackAtBottom ? 'hgfedcba' : 'abcdefgh';
  const ranks = blackAtBottom ? '12345678' : '87654321';
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const x = margin + column * size;
      const y = margin + row * size;
      context.fillStyle = (row + column) % 2 === 0 ? '#ebecd0' : '#648b61';
      context.fillRect(x, y, size, size);
      const piece = chess.get(`${files[column]}${ranks[row]}` as import('chess.js').Square);
      if (piece) context.drawImage(loaded.get(`${piece.color}${piece.type.toUpperCase()}`)!, x, y, size, size);
    }
  }
  context.fillStyle = '#d4d4d8';
  context.font = '20px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < 8; index++) {
    context.fillText(files[index], margin + (index + .5) * size, 1008);
    context.fillText(ranks[index], 16, margin + (index + .5) * size);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không thể tạo tệp PNG.')), 'image/png'));
  downloadBlob(blob, 'chess-board.png');
}
