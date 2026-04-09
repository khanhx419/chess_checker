# Chess Checker Pro — Project Reference

> **Mục đích file này**: Tài liệu tham chiếu nhanh toàn bộ dự án. Khi cần chỉnh sửa/phát triển, đọc file này thay vì quét toàn bộ project.
> **Cập nhật lần cuối**: 2026-04-09

---

## 1. Tổng quan dự án

**Chess Checker Pro** là ứng dụng web phân tích cờ vua, cho phép:
- Chơi cờ trực tiếp trên bàn cờ tương tác (click-to-move & drag-and-drop)
- Nhập PGN để phân tích ván đấu
- Đánh giá real-time mỗi nước đi bằng Stockfish (WebWorker), tự động phân loại nước đi khi rẽ nhánh mới
- Full Review — phân tích toàn bộ ván đấu, phân loại từng nước (best, blunder, mistake, ...)
- Hiển thị EvalBar (thanh đánh giá), EvalGraph (đồ thị đánh giá), gợi ý nước đi tốt nhất
- Hỗ trợ xoay bàn cờ (Flip board) và hiển thị Icon đánh giá trực tiếp trên ô cờ (chess.com style)

**Tech stack**: React 19 + TypeScript + Vite 8 + TailwindCSS 3 + Zustand 5

---

## 2. Cấu trúc thư mục

```
chess/
├── index.html                  # HTML entry point
├── package.json                # Dependencies & scripts
├── vite.config.ts              # Vite config (plugin React)
├── tailwind.config.js          # TailwindCSS config
├── postcss.config.js           # PostCSS (tailwind + autoprefixer)
├── tsconfig.json               # TS project references
├── tsconfig.app.json           # TS config cho app
├── tsconfig.node.json          # TS config cho node
├── eslint.config.js            # ESLint config
├── public/
│   ├── favicon.svg             # Icon trang
│   ├── icons.svg               # SVG icons
│   └── stockfish/
│       └── stockfish.js        # Stockfish engine (WebWorker script, ~1.5MB)
├── src/
│   ├── main.tsx                # Entry point React (render <App />)
│   ├── index.css               # Global CSS (@tailwind directives)
│   ├── App.css                 # CSS cũ từ Vite template (không dùng)
│   ├── App.tsx                 # Component chính — layout, bàn cờ, move list
│   ├── store.ts                # Zustand store — quản lý state toàn cục
│   ├── useEngine.ts            # Hook — kết nối Stockfish WebWorker
│   ├── useGameReview.ts        # Hook — Full Review phân tích toàn bộ ván
│   ├── assets/                 # (trống hoặc static assets)
│   └── components/
│       ├── EvalBar.tsx          # Thanh đánh giá dọc (trắng/đen)
│       ├── EvalGraph.tsx        # Đồ thị SVG đánh giá theo từng nước
│       └── MoveBadge.tsx        # Badge phân loại nước đi (★, X, ?, ...)
└── dist/                       # Build output
```

---

## 3. Dependencies

### Production
| Package | Version | Mục đích |
|---|---|---|
| `react` | ^19.2.4 | UI framework |
| `react-dom` | ^19.2.4 | React DOM renderer |
| `chess.js` | ^1.4.0 | Logic cờ vua (validate, parse PGN, move gen) |
| `react-chessboard` | ^5.10.0 | Component bàn cờ tương tác |
| `stockfish.js` | ^10.0.2 | Stockfish engine (không dùng trực tiếp, dùng file trong `/public/stockfish/`) |
| `zustand` | ^5.0.12 | State management (lightweight) |
| `lucide-react` | ^1.7.0 | Icon library |
| `clsx` | ^2.1.1 | Conditional className |
| `tailwind-merge` | ^3.5.0 | Merge Tailwind classes |

### Dev
| Package | Version | Mục đích |
|---|---|---|
| `vite` | ^8.0.1 | Build tool |
| `@vitejs/plugin-react` | ^6.0.1 | React plugin cho Vite |
| `typescript` | ~5.9.3 | TypeScript compiler |
| `tailwindcss` | ^3.4.19 | CSS utility framework |
| `postcss` | ^8.5.8 | PostCSS processor |
| `autoprefixer` | ^10.4.27 | Auto vendor prefix |
| `eslint` | ^9.39.4 | Linter |
| `eslint-plugin-react-hooks` | ^7.0.1 | Lint React hooks |
| `eslint-plugin-react-refresh` | ^0.5.2 | Lint React Refresh |
| `globals` | ^17.4.0 | Global variables cho ESLint |
| `typescript-eslint` | ^8.57.0 | TS ESLint parser |
| `@types/react` | ^19.2.14 | Type definitions |
| `@types/react-dom` | ^19.2.3 | Type definitions |
| `@types/node` | ^24.12.0 | Type definitions |

### Scripts
```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

---

## 4. State Management — `src/store.ts`

Sử dụng **Zustand** với store duy nhất: `useGameStore`

### Interface `GameState`
```typescript
interface GameState {
  chess: Chess;                  // Instance chess.js hiện tại
  fen: string;                   // FEN string đang hiển thị trên bàn cờ
  history: Move[];               // Mảng toàn bộ nước đi (verbose Move object)
  currentMoveIndex: number;      // Index nước đi đang xem (-1 = vị trí ban đầu)
  classifications: string[];     // Mảng phân loại mỗi nước ('best','blunder',...)
  scores: number[];              // Mảng điểm CP (centipawns) từ góc Trắng
  
  mode: 'preview' | 'play';      // Chế độ chơi với máy hoặc phân tích ván đấu tĩnh
  playerColor: 'w' | 'b';        // Màu người chơi cầm trong chế độ chơi
  botElo: number;                // ELO của máy (Stockfish skill level)
  gameOver: object | null;       // Lưu trạng thái thắng thua (ví dụ mat, hòa)

  // Actions
  makeMove(move: {from, to, promotion?}): boolean;
  resetGame(): void;
  loadPgn(pgn: string): boolean;
  goToMove(index: number): void;
  setClassifications(cls: string[]): void;
  setScores(scores: number[]): void;
}
```

### Chi tiết actions
| Action | Mô tả |
|---|---|
| `makeMove` | Đi một nước. Nếu đang xem quá khứ → cắt bỏ lịch sử tương lai rồi đi nước mới. Return `true` nếu hợp lệ. |
| `resetGame` | Reset toàn bộ: Chess mới, xóa history, classifications, scores |
| `loadPgn` | Parse PGN string, load toàn bộ history (verbose), đặt vị trí cuối cùng |
| `goToMove` | Nhảy đến nước thứ `index` (-1 = vị trí ban đầu). Chỉ thay `currentMoveIndex` & `fen` |
| `setClassifications` | Cập nhật mảng phân loại (từ Full Review) |
| `setScores` | Cập nhật mảng điểm CP (từ Full Review) |

---

## 5. Custom Hooks

### `useEngine(fen: string)` — `src/useEngine.ts`

**Mục đích**: Kết nối Stockfish WebWorker, trả về đánh giá real-time cho FEN hiện tại.

**Return type**:
```typescript
interface EngineEval {
  cp?: number;       // Centipawns (từ góc Trắng, đã convert)
  mate?: number;     // Số nước chiếu hết (dương = Trắng thắng)
  bestMove?: string; // Nước tốt nhất (UCI format: "e2e4")
  depth?: number;    // Depth hiện tại
}
```

**Cách hoạt động**:
1. Khởi tạo `new Worker('/stockfish/stockfish.js')` (Trực tiếp, không dùng Blob URL vì không cần COEP Header)
2. **UCI Handshake (Bắt buộc)**:
   - Gửi `uci` → đợi phản hồi `uciok`
   - Gửi `isready` → đợi phản hồi `readyok`
3. Sau khi handshake xong, thiết lập `readyRef.current = true`. Lắng nghe sự kiện `onmessage`.
4. Gửi FEN ban đầu: `position fen <fen>` → `go depth 16`
5. Khi `fen` thay đổi (và engine đã ready): gửi `stop` → `position fen <fen>` → `go depth 16`
6. Parse dòng `info depth ...` để lấy `cp`, `mate`, `pv` (bestMove)
7. **Quan trọng**: Nếu Đen đi (`fen` chứa ` b `) → đổi dấu `cp` để quy chiếu về Trắng
8. Cleanup: `quit` + `terminate()` khi unmount

---

### `usePlayEngine(enabled: boolean)` — `src/usePlayEngine.ts`

**Mục đích**: Chịu trách nhiệm cho BOT trong chế độ `Chơi vs Máy`. Chỉ hoạt động khi `enabled = true`.

**Cách hoạt động**:
1. Khởi tạo `Worker` riêng và thực hiện UCI Handshake.
2. Theo dõi `botElo` trong store để gọi `setoption name Skill Level value <0-20>`.
3. Bất cứ khi nào FEN thay đổi, đánh giá lượt đi hiện tại của ai (nếu là máy thì `fen.includes(' <bot_color> ')`).
4. Gửi lệnh `go depth 10`. Khi trả về `bestmove`, tự động dispatch `store.makeMove()` để máy đi cờ.

---

### `useGameReview()` — `src/useGameReview.ts`

**Mục đích**: Phân tích toàn bộ ván đấu, đánh giá từng nước đi.

**Return**:
```typescript
{
  startReview: () => Promise<void>;  // Bắt đầu review
  cancelReview: () => void;          // Hủy review
  isReviewing: boolean;              // Đang review?
  progress: number;                  // Tiến độ 0-100%
}
```

**Classification types**:
```typescript
type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'brilliant' | 'book' | 'none';
```

**Thuật toán phân loại** (dựa trên `delta` — sự thay đổi điểm sau nước đi):
| Delta (cp) | Classification |
|---|---|
| > -20 | `best` |
| > -50 | `excellent` |
| > -100 | `good` |
| > -200 | `inaccuracy` |
| > -300 | `mistake` |
| ≤ -300 | `blunder` |
| \|delta\| > 5000 | Mate detection (`blunder` nếu delta < 0, `best` nếu > 0) |
| 4 nước đầu & delta > -50 | `book` |

**Flow**:
1. Tạo Worker Stockfish riêng (không dùng chung với `useEngine`)
2. Duyệt qua từng nước trong `history[]`
3. Với mỗi nước: đánh giá FEN **trước** và **sau** nước đi (depth 12)
4. **Sửa lỗi treo**: Engine có thể trả về `bestmove` trước khi đạt `depth 12` ở các thế cờ đơn giản. Hàm đánh giá hiện tại sẽ tự động chốt điểm ngay khi có `bestmove` để tránh loop vô tận.
5. Tính `delta` = sự thay đổi điểm từ góc người vừa đi
6. Phân loại theo bảng trên
7. Cập nhật `setClassifications` và `setScores` sau mỗi nước (real-time update UI)
8. Kết thúc: terminate Worker

---

## 6. Components

### `App` — `src/App.tsx` (Component chính)

**State nội bộ**:
| State | Type | Mô tả |
|---|---|---|
| `pgnInput` | `string` | Nội dung textarea nhập PGN |
| `showPgnInput` | `boolean` | Hiện/ẩn modal nhập PGN |
| `moveFrom` | `string` | Ô đang chọn (click-to-move) |
| `optionSquares` | `object` | Custom styles hiện ô có thể đi |
| `showBestMove` | `boolean` | Hiện mũi tên gợi ý nước tốt nhất |
| `isFlipped` | `boolean` | Trạng thái xoay bàn cờ |
| `pendingClassIdx` | `number` | Index nước đi đang chờ engine đánh giá real-time (khi rẽ nhánh) |

**Các hàm chính**:
| Hàm | Mô tả |
|---|---|
| `getMoveOptions(square)` | Tính các nước hợp lệ từ ô, hiện dots trên bàn cờ |
| `onSquareClick(square)` | Xử lý click-to-move (2 click: chọn nguồn → chọn đích) |
| `onDrop(source, target)` | Xử lý drag-and-drop. Auto promote Queen |
| `handleLoadPgn()` | Load PGN từ input, alert nếu không hợp lệ |
| `Real-time Classification` | Khi người dùng đi 1 nước mới (rẽ nhánh), Engine sẽ đánh giá và tự động gán nhãn (Best, Blunder...) ngay lập tức sau khi đạt depth 10. |

**Layout** (2 cột trên desktop):
1. **Cột trái**: Bàn cờ + EvalBar + Gợi ý nước tốt nhất
2. **Cột phải**: Lịch sử ván đấu + EvalGraph + Nút điều hướng (<<, <, >, >>)

**Header**: Logo, Depth indicator, nút "Nhập PGN", "Full Review", "Ván mới"

---

### `EvalBar` — `src/components/EvalBar.tsx`

**Props**: `{ evaluation: EngineEval }`

**Logic**:
- Dùng **logistic function** để convert cp → % chiến thắng:
  `winPercent = 50 + 50 * (2 / (1 + exp(-0.004 * cp)) - 1)`
- Mate > 0 → 100%, Mate < 0 → 0%
- Hiển thị thanh dọc (h-[600px]), phần trắng ở dưới, text hiện điểm

---

### `EvalGraph` — `src/components/EvalGraph.tsx`

**Props**: `{ scores: number[], currentIndex: number, onSelect: (index) => void }`

**Logic**:
- Vẽ SVG graph (viewBox 0 0 100 100) — Trắng ở trên, Đen ở dưới
- `maxScore = 1500cp` (clamp)
- Score → Y%: `50 - (cp / 1500) * 50`
- Đường polyline màu emerald, đường mốc 0 ở giữa
- Current move indicator = đường vàng dọc
- Click/hover trên mỗi segment → gọi `onSelect(index)` để nhảy tới nước đó

---

### `MoveBadge` — `src/components/MoveBadge.tsx`

**Props**: `{ type: string }`

**Badge map**:
| Type | BG Color | Label |
|---|---|---|
| `brilliant` | teal-400 | `!!` |
| `great` | blue-400 | `!` |
| `best` | green-500 | `★` |
| `excellent` | emerald-400 | `✓` |
| `good` | zinc-400 | `👍` |
| `inaccuracy` | yellow-400 | `?` |
| `mistake` | orange-500 | `?!` |
| `blunder` | red-500 | `X` |
| `book` | amber-700 | `📖` |

Hiển thị badge tròn nhỏ (w-4 h-4) ở góc trên phải mỗi nước đi.

---

## 7. Styling

- **Framework**: TailwindCSS 3
- **Theme**: Dark mode (zinc-950 background, slate-200 text)
- **Accent**: Emerald/Cyan gradient cho tiêu đề
- **Board**: Custom colors — dark `#648b61`, light `#ebecd0`, border-radius 8px
- **Global CSS** (`index.css`): `@tailwind base/components/utilities` + body base styles
- **App.css**: CSS cũ từ Vite template (không sử dụng trong app hiện tại)

---

## 8. Cấu hình quan trọng

### Vite (`vite.config.ts`)
```typescript
export default defineConfig({
  plugins: [react()],
})
```
- Không có custom base path (mặc định `/`)
- Stockfish load từ `/stockfish/stockfish.js` (thư mục `public/`)

### Tailwind (`tailwind.config.js`)
```javascript
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
// Không custom theme hay plugins
```

### TypeScript
- Project references: `tsconfig.app.json` + `tsconfig.node.json`
- Strict mode, ESNext target

---

## 9. Luồng dữ liệu chính

```
User Action (click/drag/PGN)
  → store.makeMove() / store.loadPgn()
    → Cập nhật: fen, history, currentMoveIndex
      → useEngine(fen)  →  Stockfish Worker  →  evaluation (cp, bestMove)
      → UI re-render: Chessboard, EvalBar, gợi ý

User click "Full Review"
  → useGameReview.startReview()
    → Worker Stockfish riêng, duyệt từng nước
      → Cập nhật: classifications[], scores[] (real-time)
        → UI: MoveBadge trên mỗi nước, EvalGraph hiện đồ thị
```

---

## 10. Ghi chú phát triển

- **Stockfish Worker**: File `public/stockfish/stockfish.js` (~1.5MB) — load qua `new Worker('/stockfish/stockfish.js')`
- **Auto-promote**: Luôn promote Queen (`promotion: 'q'`)
- **Depth**: Real-time eval dùng depth 16, Full Review dùng depth 12
- **FEN perspective**: Score từ Stockfish luôn từ góc "side to move" → cần đổi dấu khi Đen đi
- **Real-time Branch Eval**: Khi rẽ nhánh, code sẽ capture điểm `cp` TRƯỚC nước đi, đợi Engine đạt depth 10 ở FEN SAU nước đi rồi mới tính Delta để phân loại (tránh race condition). Khi FEN thay đổi, bắt buộc phải reset `depth` cục bộ về 0 trong `useEngine` để tránh `useEffect` kích hoạt đo lường rác do lấy nhầm depth của FEN cũ.
- **SVG Overlay**: Icon đánh giá (Best, Blunder...) được inject vào bàn cờ thông qua `customSquareStyles` sử dụng SVG Data URI, đặt ở góc `top right` của ô cờ.
- **React-Chessboard Props**: Các tham số như `position`, `customArrows`, `customSquareStyles`, `onPieceDrop`, `onSquareClick`... phải nằm ở cấp cao nhất của prop (top-level) thay vì bao bọc bởi `options={{...}}` như một số phiên bản cũ hay cấu trúc tùy chỉnh, nếu không chức năng render UI (mũi tên, tô màu ô cờ) sẽ không hoạt động.
- **App.css**: File CSS template cũ, không ảnh hưởng UI hiện tại — có thể xóa
- **`clsx` và `tailwind-merge`**: Đã install nhưng chưa sử dụng trong code hiện tại

