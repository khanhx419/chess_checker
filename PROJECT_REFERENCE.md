# Chess Checker Pro — Project Reference

> **Mục đích file này**: Tài liệu tham chiếu nhanh toàn bộ dự án. Khi cần chỉnh sửa/phát triển, đọc file này thay vì quét toàn bộ project.
> **Cập nhật lần cuối**: 2026-04-11

---

## 1. Tổng quan dự án

**Chess Checker Pro** là ứng dụng web phân tích cờ vua, cho phép:
- Chơi cờ trực tiếp trên bàn cờ tương tác (click-to-move & drag-and-drop)
- Nhập PGN để phân tích ván đấu
- Đánh giá real-time mỗi nước đi bằng Stockfish (WebWorker), tự động phân loại nước đi khi rẽ nhánh mới
- Full Review — phân tích toàn bộ ván đấu, phân loại từng nước (best, blunder, mistake, ...)
- Hiển thị EvalBar (thanh đánh giá), EvalGraph (đồ thị đánh giá)
- Nút "Rút lại và đi nước tốt nhất" — tự động undo nước sai và chơi nước engine đề xuất
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
│   ├── store.ts                # Zustand store — quản lý state toàn cục (Tree-based)
│   ├── useEngine.ts            # Hook — kết nối Stockfish WebWorker (có stale gate)
│   ├── usePlayEngine.ts        # Hook — Bot engine cho chế độ Play vs AI
│   ├── useGameReview.ts        # Hook — Full Review phân tích toàn bộ ván
│   ├── assets/                 # (trống hoặc static assets)
│   ├── utils/
│   │   └── openings.ts         # Cơ sở dữ liệu khai cuộc (opening name lookup + isBookMove)
│   └── components/
│       ├── EvalBar.tsx          # Thanh đánh giá dọc (trắng/đen)
│       ├── EvalGraph.tsx        # Đồ thị SVG đánh giá theo từng nước
│       ├── MoveBadge.tsx        # Badge phân loại nước đi (★, X, ?, ...)
│       ├── MoveListBranch.tsx   # Danh sách nước đi dạng cây (hỗ trợ biến thể)
│       └── MoveExplanation.tsx  # Component giải thích nước đi + nút "Đi nước tốt nhất"
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

Sử dụng **Zustand** với store duy nhất: `useGameStore`.
**Kiến trúc Tree-based**: Lịch sử nước đi được lưu dưới dạng cây (không phải mảng phẳng), cho phép rẽ nhánh không phá hủy (non-destructive branching).

### Interface `MoveNode`
```typescript
interface MoveNode {
  id: string;                    // ID duy nhất (random 8 ký tự hoặc "orig_N" cho PGN)
  move: Move;                    // chess.js verbose Move object
  classification: string;        // Phân loại nước đi ('best','blunder','none',...)
  score: number | null;          // Điểm CP (centipawns) từ góc Trắng
  parentId: string | null;       // ID nút cha (null = nước đi đầu tiên)
  childrenIds: string[];         // Mảng ID các nút con (childrenIds[0] = mainline)
  engineBestMove?: string;       // Nước tốt nhất engine đề xuất (UCI, vd: "e2e4") — lưu lúc đi nước
}
```

### Interface `GameState`
```typescript
interface GameState {
  chess: Chess;                  // Instance chess.js hiện tại
  fen: string;                   // FEN string đang hiển thị trên bàn cờ
  nodes: Record<string, MoveNode>; // Bản đồ tất cả nút trong cây
  rootNodeIds: string[];         // ID các nút gốc (nước đi đầu tiên)
  currentMoveId: string | null;  // ID nước đi đang xem (null = vị trí ban đầu)
  
  mode: 'preview' | 'play';      // Chế độ chơi với máy hoặc phân tích ván đấu tĩnh
  playerColor: 'w' | 'b';        // Màu người chơi cầm trong chế độ chơi
  botElo: number;                // ELO của máy (Stockfish skill level)
  gameOver: GameOverState;       // Lưu trạng thái thắng thua (ví dụ mat, hòa)

  // Actions
  updateNode(id: string, data: Partial<MoveNode>): void;
  makeMove(move: {from, to, promotion?}, engineBestMove?: string): boolean;
  deleteNode(id: string): void;  // Xóa node + subtree, navigate về parent
  resetGame(config?): void;
  loadPgn(pgn: string): boolean;
  goToMove(id: string | null): void;
  getActiveLine(): MoveNode[];   // Trả về đường đi từ root đến currentMoveId
  setMode(mode): void;
  setPlayerColor(color): void;
  setBotElo(elo): void;
  setGameOver(state): void;
}
```

### Chi tiết actions
| Action | Mô tả |
|---|---|
| `makeMove` | Đi một nước. **Non-destructive**: nếu đang ở giữa ván, tạo nhánh mới thay vì cắt lịch sử. Nếu nước đã tồn tại trong `childrenIds`, chỉ navigate tới. Nhận optional `engineBestMove` UCI string để lưu vào node. Return `true` nếu hợp lệ. |
| `deleteNode` | Xóa node và toàn bộ subtree. Loại khỏi `childrenIds` của parent (hoặc `rootNodeIds`). Nếu `currentMoveId` nằm trong subtree bị xóa, tự navigate về parent. |
| `resetGame` | Reset toàn bộ: Chess mới, xóa nodes, rootNodeIds |
| `loadPgn` | Parse PGN string → convert sang tree nodes (id `orig_0`, `orig_1`, ...) |
| `goToMove` | Nhảy đến nước có `id`. Nếu `null` → vị trí ban đầu. Chỉ thay `currentMoveId` & `fen` |
| `updateNode` | Cập nhật partial data cho 1 node (dùng cho classification, score, engineBestMove) |
| `getActiveLine` | Duyệt từ `currentMoveId` về root, trả về mảng `MoveNode[]` theo thứ tự |

---

## 5. Custom Hooks

### `useEngine(fen: string, enabled: boolean)` — `src/useEngine.ts`

**Mục đích**: Kết nối Stockfish WebWorker, trả về đánh giá real-time cho FEN hiện tại.

**Return type**:
```typescript
interface EngineEval {
  cp?: number;        // Centipawns (từ góc Trắng, đã convert)
  mate?: number;      // Số nước chiếu hết (dương = Trắng thắng)
  bestMove?: string;  // Nước tốt nhất (UCI format: "e2e4")
  depth?: number;     // Depth hiện tại
  topMoves?: MoveDetail[]; // Top 3 nước (MultiPV=3)
}
```

**Cách hoạt động**:
1. Khởi tạo `new Worker('/stockfish/stockfish.js')` (Trực tiếp, không dùng Blob URL vì không cần COEP Header)
2. **UCI Handshake (Bắt buộc)**:
   - Gửi `uci` → đợi phản hồi `uciok`
   - Gửi `setoption name MultiPV value 3` (hiện top 3 nước)
   - Gửi `isready` → đợi phản hồi `readyok`
3. Sau khi handshake xong, thiết lập `readyRef.current = true`. Lắng nghe sự kiện `onmessage`.
4. Gửi FEN ban đầu: `position fen <fen>` → `go depth 16`
5. Khi `fen` thay đổi (và engine đã ready): **Stale Message Gate** → gửi `stop` → `position fen <fen>` → `go depth 16`
6. Parse dòng `info depth ... multipv N ...` để lấy `cp`, `mate`, `pv` (bestMove) cho từng line
7. **Quan trọng**: Nếu Đen đi (`fen` chứa ` b `) → đổi dấu `cp` **và `mate`** để quy chiếu về Trắng
8. Cleanup: `quit` + `terminate()` khi unmount, clear gate timer

**Stale Message Gate** (fix bug "always best move"):
- Khi FEN thay đổi, `useLayoutEffect` set `staleRef = true` + timer 50ms.
- Mọi `info depth` message đến trong 50ms đầu bị discard (vì là tin nhắn cũ từ FEN trước).
- Sau 50ms, gate mở, chỉ nhận message từ analysis mới.
- **Lý do**: Không có gate → stale messages có `depth >= 10` và `cp ≈ preMoveCp` → `delta ≈ 0` → luôn classify là "best".

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
| Matches `isBookMove()` | `book` (ưu tiên cao nhất — ghi đè delta) |

**Flow**:
1. Tạo Worker Stockfish riêng (không dùng chung với `useEngine`)
2. Duyệt qua từng nước trong `getActiveLine()`
3. Với mỗi nước: đánh giá FEN **trước** và **sau** nước đi (depth 12)
4. **Extract `bestmove`**: Hàm `evaluateFen` trả về cả `bestMove` UCI string từ Stockfish output
5. **Book detection**: Kiểm tra `isBookMove(sanHistory)` — nếu chuỗi SAN khớp opening dictionary → classify `book` ngay, skip delta
6. Tính `delta` = sự thay đổi điểm từ góc người vừa đi
7. Phân loại theo bảng trên
8. **Lưu `engineBestMove`**: Gọi `updateNode(id, { classification, score, engineBestMove })` để cung cấp cho nút "Đi nước tốt nhất"
9. Kết thúc: terminate Worker

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
| `isFlipped` | `boolean` | Trạng thái xoay bàn cờ |
| `showPlayConfig` | `boolean` | Hiện modal cấu hình Play vs AI |
| `userArrows` | `array` | Mũi tên vẽ bởi user (right-click drag) |
| `pendingClassId` | `string | null` | ID node đang chờ engine đánh giá real-time |
| `preMoveCpRef` | `Ref<number>` | CP trước nước đi (dùng tính delta) |

**Các hàm chính**:
| Hàm | Mô tả |
|---|---|
| `getMoveOptions(square)` | Tính các nước hợp lệ từ ô, hiện dots trên bàn cờ |
| `onSquareClick(square)` | Xử lý click-to-move (2 click: chọn nguồn → chọn đích) |
| `onDrop(source, target)` | Xử lý drag-and-drop. Auto promote Queen |
| `handleLoadPgn()` | Load PGN từ input, alert nếu không hợp lệ |
| `Real-time Classification` | Khi người dùng đi 1 nước mới, capture `preMoveCp` + `evaluation.bestMove`, đợi engine depth ≥ 10 trên FEN mới, tính delta để classify. Dùng `isBookMove()` thay vì heuristic để detect book moves. |
| `onPlayBestMove` callback | Truyền vào `MoveExplanation`. Gọi `deleteNode(currentMoveId)` → `setTimeout` → `makeMove(engineBestMove)` để undo nước sai và tự động đi nước tốt nhất. |

**Layout** (2 cột trên desktop):
1. **Cột trái**: Bàn cờ + EvalBar
2. **Cột phải**: Lịch sử ván đấu (MoveListBranch) + EvalGraph + MoveExplanation (có nút "Đi nước tốt nhất") + Nút điều hướng

**Header**: Logo, Mode switcher (Chơi vs Máy / Phân tích), Depth indicator, nút "Nhập PGN", "Full Review", "Ván mới"

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

### `MoveListBranch` — `src/components/MoveListBranch.tsx`

**Props**: `{ nodes, rootIds, currentMoveId, goToMove, isMainLine? }`

**Logic**:
- Nhận toàn bộ tree `nodes` và array `rootIds` để render
- **Main line**: hiển thị dạng grid 2 cột (Trắng | Đen) với số thứ tự lượt
- **Variations**: hiển thị dạng inline flex-wrap, indent và border-left
- **Đệ quy**: Duyệt `childrenIds` — phần tử đầu ([0]) là mainline, các phần tử sau ([1+]) là variations, render đệ quy `MoveListBranch` với `isMainLine=false`
- Mỗi nước hiển thị `MoveBadge` bên cạnh SAN notation
- Click nước đi → `goToMove(node.id)`

---

### `MoveExplanation` — `src/components/MoveExplanation.tsx`

**Props**: `{ classification: string, move: Move, engineBestMove?: string, onPlayBestMove?: () => void }`

**Logic**:
- Hiển thị giải thích bằng tiếng Việt cho nước đi dựa trên classification
- Mỗi loại có `title`, `description`, và `color` riêng
- Classification types: `blunder`, `mistake`, `inaccuracy`, `good`, `excellent`, `best`, `brilliant`, `book`
- Render dưới danh sách nước đi khi user click vào nước có classification ≠ 'none'
- Có animation fade-in slide-up khi xuất hiện
- **Nút "Rút lại và đi nước tốt nhất"**: Hiển thị khi `engineBestMove` có giá trị và classification là `blunder`, `mistake`, `inaccuracy`, hoặc `good`. Click → gọi `onPlayBestMove()` để xóa nước sai, lùi về parent, và tự đi nước engine đề xuất.

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
    → Cập nhật: fen, nodes (tree), currentMoveId
      → useLayoutEffect: stale gate ON → 50ms → gate OFF
      → useEngine(fen)  →  Stockfish Worker  →  evaluation (cp, bestMove, topMoves)
      → UI re-render: Chessboard, EvalBar, MoveListBranch, MoveExplanation

User đi nước mới (rẽ nhánh, preview mode)
  → Capture preMoveCp → makeMove() → tạo MoveNode mới trong tree
    → Đợi engine depth ≥ 10 (stale gate đảm bảo data mới)
      → Tính delta → classify → updateNode(classification, score)
        → UI: MoveBadge, MoveExplanation, SVG overlay trên bàn cờ

User click "Full Review"
  → useGameReview.startReview()
    → Worker Stockfish riêng, duyệt getActiveLine()
      → Cập nhật: node.classification, node.score (real-time qua updateNode)
        → UI: MoveBadge trên mỗi nước, EvalGraph hiện đồ thị
```

---

## 10. Ghi chú phát triển

- **Stockfish Worker**: File `public/stockfish/stockfish.js` (~1.5MB) — load qua `new Worker('/stockfish/stockfish.js')`
- **Auto-promote**: Luôn promote Queen (`promotion: 'q'`)
- **Depth**: Real-time eval dùng depth 16 (MultiPV=3), Full Review dùng depth 12
- **FEN perspective**: Score từ Stockfish luôn từ góc "side to move" → cần đổi dấu **cả `cp` lẫn `mate`** khi Đen đi
- **Tree-based History**: Lịch sử nước đi dùng cấu trúc cây (`MoveNode` với `parentId`/`childrenIds`). Khi rẽ nhánh, nước mới được thêm vào `childrenIds` của node hiện tại thay vì cắt bỏ lịch sử. `childrenIds[0]` luôn là mainline.
- **Stale Message Gate (QUAN TRỌNG)**: Khi FEN thay đổi, `useLayoutEffect` trong `useEngine` set `staleRef = true` trong 50ms để discard tin nhắn cũ từ analysis trước. Không có gate → stale messages có `depth ≥ 10` với `cp` của FEN cũ khiến classification luôn ra "best" (vì `delta ≈ 0`). **Phải dùng `useLayoutEffect`** (không phải `useEffect`) để đảm bảo gate được set trước khi bất kỳ macrotask nào (worker onmessage) chạy.
- **Real-time Branch Eval**: Khi rẽ nhánh, code capture `preMoveCp` + `evaluation.bestMove` TRƯỚC nước đi, đợi Engine đạt depth ≥ 10 ở FEN SAU nước đi (qua stale gate) rồi tính Delta để classify. Dùng `isBookMove()` cho book detection thay vì heuristic.
- **SVG Overlay**: Icon đánh giá (Best, Blunder...) được inject vào bàn cờ thông qua `customSquareStyles` sử dụng SVG Data URI, đặt ở góc `top right` của ô cờ.
- **React-Chessboard Props**: Các tham số như `position`, `customArrows`, `customSquareStyles`, `onPieceDrop`, `onSquareClick`... phải nằm ở cấp cao nhất của prop (top-level) thay vì bao bọc bởi `options={{...}}`.
- **MoveListBranch**: Component đệ quy render cây nước đi. Mainline = grid, variations = inline nested. Dùng `isMainLine` prop để phân biệt.
- **MoveExplanation**: Hiển thị giải thích tiếng Việt cho nước đi + nút "Rút lại và đi nước tốt nhất". Nút hiện khi `engineBestMove` có giá trị và classification thuộc `blunder|mistake|inaccuracy|good`. Callback `onPlayBestMove` thực hiện: `deleteNode()` → `setTimeout(50ms)` → `makeMove(bestMove)`.
- **Opening Detection**: `utils/openings.ts` chứa database khai cuộc. `getOpeningName(sanSequence)` cho tên khai cuộc, `isBookMove(sanHistory)` cho phân loại book move chính xác (check prefix match).
- **deleteNode**: Xóa node + toàn bộ subtree đệ quy. Loại khỏi parent.childrenIds hoặc rootNodeIds. Auto-navigate về parent nếu currentMoveId nằm trong subtree bị xóa.
- **App.css**: File CSS template cũ, không ảnh hưởng UI hiện tại — có thể xóa
- **`clsx` và `tailwind-merge`**: Đã install nhưng chưa sử dụng trong code hiện tại

