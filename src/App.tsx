import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useGameStore } from './store';
import { RefreshCw, ClipboardType, FlipVertical2, Lightbulb, Swords } from 'lucide-react';
import { useEngine } from './useEngine';
import { usePlayEngine } from './usePlayEngine';
import { useGameReview } from './useGameReview';
import { EvalBar } from './components/EvalBar';
import { EvalGraph } from './components/EvalGraph';
import { analyzedNode, isKnownOpening } from './analysis';
import { ENGINE_PROFILES, evaluationScore, getCachedEvaluation } from './engine';
import type { EngineProfile } from './engine';
import { getOpeningName } from './utils/openings';
import { MoveExplanation } from './components/MoveExplanation';
import { MoveListBranch } from './components/MoveListBranch';

const Board = Chessboard;

function App() {
  const { fen, makeMove, resetGame, nodes, rootNodeIds, currentMoveId, goToMove, getActiveLine, updateNode, loadPgn, mode, setMode, playerColor, setPlayerColor, botElo, setBotElo, gameOver, engineProfile, setEngineProfile } = useGameStore();
  const activeLine = useGameStore.getState().getSelectedLine();
  const [engineRetry, setEngineRetry] = useState(0);
  const playError = usePlayEngine(mode === 'play', engineRetry);
  const { startReview, cancelReview, isReviewing, progress, error: reviewError } = useGameReview();
  const [pgnInput, setPgnInput] = useState('');
  const [showPgnInput, setShowPgnInput] = useState(false);
  const [moveFrom, setMoveFrom] = useState('');
  const [optionSquares, setOptionSquares] = useState({});
  const [selectionFen, setSelectionFen] = useState('');
  const selectedFrom = selectionFen === fen ? moveFrom : '';

  const [showPlayConfig, setShowPlayConfig] = useState(false);
  const [userArrows, setUserArrows] = useState<{startSquare: string; endSquare: string; color: string}[]>([]);
  const [rightClickStart, setRightClickStart] = useState<string | null>(null);
  const [tempBotElo, setTempBotElo] = useState(botElo);
  const [tempPlayerColor, setTempPlayerColor] = useState<import('./store').PlayerColor>('w');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showBestMoveArrow, setShowBestMoveArrow] = useState(false);

  const activeEvalNode = currentMoveId ? nodes[currentMoveId] : undefined;
  const needsEngineAnalysis = mode === 'preview' && !isReviewing &&
    (!activeEvalNode?.positionEvaluation || activeEvalNode.classification === 'none');
  const liveEvaluation = useEngine(fen, needsEngineAnalysis, engineRetry,
    activeEvalNode?.move.before, activeEvalNode?.move.lan,
    !!activeEvalNode && isKnownOpening(activeEvalNode, getActiveLine().map(node => node.move.san)));
  const evaluation = activeEvalNode?.positionEvaluation ?? (isReviewing
    ? getCachedEvaluation(fen) ?? { fen, depth: 0, finished: false } : liveEvaluation);
  const engineError = mode === 'play' ? playError : liveEvaluation.error ?? reviewError;

  useEffect(() => {
    if (mode !== 'preview' || isReviewing || !activeEvalNode ||
        !liveEvaluation.finished || liveEvaluation.fen !== activeEvalNode.move.after) return;
    const review = liveEvaluation.moveReview;
    if (review && activeEvalNode.classification === 'none') {
      updateNode(activeEvalNode.id, {
        ...analyzedNode(activeEvalNode, review.before, review.after, getActiveLine().map(node => node.move.san),
          review.played.fen === activeEvalNode.move.before ? review.played : undefined, review.alternative),
        ...(review.uncertain ? { classification: 'uncertain', analysisStatus: 'uncertain' } : { analysisStatus: review.status }),
      });
    } else if (!activeEvalNode.positionEvaluation) {
      updateNode(activeEvalNode.id, { score: evaluationScore(liveEvaluation), positionEvaluation: liveEvaluation });
    }
  }, [activeEvalNode, liveEvaluation, mode, isReviewing, updateNode, getActiveLine]);

  function getMoveOptions(square: string) {
    setSelectionFen(fen);
    const moves = new Chess(fen).moves({
      square: square as import('chess.js').Square,
      verbose: true,
    }) as Move[];
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, CSSProperties> = {};
    moves.map((move) => {
      const targetSquare = move.to as import('chess.js').Square;
      const sourceSquare = square as import('chess.js').Square;
      const targetPiece = new Chess(fen).get(targetSquare);
      const sourcePiece = new Chess(fen).get(sourceSquare);
      const isCapture = targetPiece && sourcePiece && targetPiece.color !== sourcePiece.color;
      newSquares[move.to] = {
        background: isCapture
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)',
    };
    setOptionSquares(newSquares);
    return true;
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) {
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      const activeLine = useGameStore.getState().getSelectedLine();
      const currentMoveId = useGameStore.getState().currentMoveId;
      const nodes = useGameStore.getState().nodes;
      const rootNodeIds = useGameStore.getState().rootNodeIds;

      const idx = activeLine.findIndex(n => n.id === currentMoveId);

      if (e.key === 'ArrowLeft') {
        if (idx > 0) goToMove(activeLine[idx - 1].id);
        else if (idx === 0) goToMove(null);
      } else if (e.key === 'ArrowRight') {
        if (currentMoveId === null && rootNodeIds.length > 0) {
          goToMove(activeLine[0]?.id ?? rootNodeIds[0]);
        } else if (idx >= 0 && currentMoveId) {
           const node = nodes[currentMoveId];
           if (node && node.childrenIds.length > 0) {
             goToMove(activeLine[idx + 1]?.id ?? node.childrenIds[0]);
           }
        }
      } else if (e.key === 'ArrowUp') {
        goToMove(null);
      } else if (e.key === 'ArrowDown') {
        if (activeLine.length > 0) goToMove(activeLine[activeLine.length - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToMove]);

  function clearHighlight() {
    setOptionSquares({});
    setMoveFrom('');
  }

  function onPieceDragBegin({ square }: { square: string }) {
    if (mode === 'play') {
      if (gameOver) return;
      const isPlayerTurn = (playerColor === 'w' && fen.includes(' w ')) || (playerColor === 'b' && fen.includes(' b '));
      if (!isPlayerTurn) return;
    }
    getMoveOptions(square);
  }

  function onSquareRightClick({ square }: { square: string }) {
    if (rightClickStart) {
      if (rightClickStart !== square) {
        setUserArrows([...userArrows, { startSquare: rightClickStart, endSquare: square, color: 'rgba(255, 0, 0, 0.6)' }]);
      } else {
        // Clear arrows if right clicking the same square twice
        setUserArrows([]);
      }
      setRightClickStart(null);
    } else {
      setRightClickStart(square);
    }
  }

  function onSquareClick({ square }: { square: string }) {
    if (mode === 'play') {
      if (gameOver) return;
      const isPlayerTurn = (playerColor === 'w' && fen.includes(' w ')) || (playerColor === 'b' && fen.includes(' b '));
      if (!isPlayerTurn) return;
    }

    if (!selectedFrom) {
      const hasMoves = getMoveOptions(square);
      if (hasMoves) setMoveFrom(square);
      return;
    }

    const currentBestMove = evaluation.bestMove;

    const move = makeMove({
      from: selectedFrom,
      to: square,
      promotion: 'q',
    }, currentBestMove);

    if (move) {
      clearHighlight();
      setUserArrows([]);
      return;
    }

    const hasMoves = getMoveOptions(square);
    if (hasMoves) {
      setMoveFrom(square);
    } else {
      clearHighlight();
    }
  }

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) {
    if (mode === 'play') {
      if (gameOver) {
         return false;
      }
      const isPlayerTurn = (playerColor === 'w' && fen.includes(' w ')) || (playerColor === 'b' && fen.includes(' b '));
      if (!isPlayerTurn) {
         return false;
      }
    }

    const currentBestMove = evaluation.bestMove;

    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    }, currentBestMove);
    if (move) {
      clearHighlight();
      setUserArrows([]);
      return true;
    }
    clearHighlight();
    return false;
  }

  // Build classification overlay icons on the board
  const classificationSquareStyles: Record<string, React.CSSProperties> = {};
  if (mode === 'preview' && currentMoveId && nodes[currentMoveId] && nodes[currentMoveId].classification !== 'none') {
    const lastMoveNd = nodes[currentMoveId]
    if (lastMoveNd) {
      const cls = lastMoveNd.classification;
      const colorMap: Record<string, string> = {
        'brilliant': '#1bada6',
        'best': '#96bc4b',
        'excellent': '#96bc4b',
        'good': '#659b3e',
        'book': '#a88865',
        'inaccuracy': '#f7c631',
        'mistake': '#e58f2a',
        'blunder': '#ca3431',
      };
      const symbolMap: Record<string, string> = {
        'brilliant': '!!',
        'best': '★',
        'excellent': '!',
        'good': '✓',
        'book': '📖',
        'inaccuracy': '?!',
        'mistake': '?',
        'blunder': '??',
      };
      const bgColor = colorMap[cls] || '#666';
      const symbol = symbolMap[cls] || '';
      // Create an SVG data URI for the classification badge
      const svgBadge = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='11' fill='${bgColor}' stroke='white' stroke-width='1.5'/><text x='12' y='16' text-anchor='middle' font-size='${symbol.length > 1 ? 10 : 14}' font-weight='bold' fill='white' font-family='Arial'>${symbol}</text></svg>`;
      const encodedSvg = encodeURIComponent(svgBadge);

      classificationSquareStyles[lastMoveNd.move.to] = {
        position: 'relative',
        backgroundImage: `url("data:image/svg+xml,${encodedSvg}")`,
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '30%',
      };
      // Also highlight the source and target squares
      classificationSquareStyles[lastMoveNd.move.from] = {
        backgroundColor: `${bgColor}44`,
      };
      if (!classificationSquareStyles[lastMoveNd.move.to].backgroundColor) {
        classificationSquareStyles[lastMoveNd.move.to] = {
          ...classificationSquareStyles[lastMoveNd.move.to],
          backgroundColor: `${bgColor}44`,
        };
      }
    }
  }

  // Merge option squares with classification overlay
  const mergedSquareStyles = { ...classificationSquareStyles, ...(selectionFen === fen ? optionSquares : {}) };

  const arrows: { startSquare: string; endSquare: string; color: string }[] = [...userArrows];

  // Show best move arrow on the board when toggled on
  if (showBestMoveArrow && mode === 'preview' && evaluation.bestMove && evaluation.bestMove.length >= 4) {
    const from = evaluation.bestMove.substring(0, 2);
    const to = evaluation.bestMove.substring(2, 4);
    arrows.push({ startSquare: from, endSquare: to, color: 'rgba(50, 205, 50, 0.75)' });
  }

  function handleLoadPgn() {
    if (loadPgn(pgnInput)) {
      cancelReview();
      clearHighlight();
      setUserArrows([]);
      setShowPgnInput(false);
      setPgnInput('');
    } else {
      alert("PGN không hợp lệ");
    }
  }

  return (
    <div className="chess-app bg-zinc-950 text-slate-200">
      <aside className="app-header nav-rail border-r border-zinc-800 bg-zinc-900/70 z-20" aria-label="Điều hướng chính">
        <div className="nav-brand text-emerald-400" title="Chess Checker Pro" aria-label="Chess Checker Pro">♞</div>
        <nav className="mode-switch" aria-label="Chế độ chơi">
          <button
            onClick={() => {
              setTempBotElo(botElo);
              setTempPlayerColor(playerColor);
              setShowPlayConfig(true);
            }}
            title="Chơi vs Máy" aria-label="Chơi vs Máy" aria-pressed={mode === 'play'}
            className={`nav-item ${mode === 'play' ? 'nav-item-active' : ''}`}
          >
            <Swords size={23} /><span className="nav-label">Chơi</span><span className="sr-only">Chơi vs Máy</span>
          </button>
          <button
            onClick={() => setMode('preview')}
            title="Phân tích" aria-label="Phân tích" aria-pressed={mode === 'preview'}
            className={`nav-item ${mode === 'preview' ? 'nav-item-active' : ''}`}
          >
            <Lightbulb size={23} /><span className="nav-label">Phân tích</span>
          </button>
        </nav>
      </aside>

      {engineError && <div role="alert" className="engine-alert rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
        {engineError} <button className="ml-3 underline" onClick={() => { setEngineRetry(value => value + 1); if (reviewError) void startReview(); }}>Thử lại</button>
      </div>}
      {/* PGN Modal Overlay */}
      {showPlayConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="app-modal bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-6">
            <h2 className="text-xl font-bold text-center text-white">Cấu hình Ván chơi</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Độ khó Bot (ELO)</label>
                <select
                   value={tempBotElo}
                   onChange={(e) => setTempBotElo(Number(e.target.value))}
                   className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                 >
                   <option value={800}>800 (Dễ nhất)</option>
                   <option value={1000}>1000 (Dễ)</option>
                   <option value={1200}>1200 (Trung bình)</option>
                   <option value={1500}>1500 (Khá)</option>
                   <option value={1800}>1800 (Khó)</option>
                   <option value={2000}>2000 (Chuyên gia)</option>
                   <option value={2500}>2500 (Kiện tướng)</option>
                   <option value={2850}>2850 (Máy quét)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Bạn cầm quân</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setTempPlayerColor('w')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${tempPlayerColor === 'w' ? 'bg-zinc-200 border-zinc-200 text-zinc-900 font-bold shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
                  >
                    <span className="text-2xl">♔</span> Trắng
                  </button>
                  <button
                    onClick={() => setTempPlayerColor('b')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${tempPlayerColor === 'b' ? 'bg-zinc-800 border-zinc-600 text-white font-bold shadow-[0_0_15px_rgba(0,0,0,0.5)]' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'}`}
                  >
                    <span className="text-2xl">♚</span> Đen
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setShowPlayConfig(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setPlayerColor(tempPlayerColor);
                  setBotElo(tempBotElo);
                  cancelReview();
                  setMode('play');
                  resetGame({ playerColor: tempPlayerColor, botElo: tempBotElo });
                  setUserArrows([]);
                  clearHighlight();
                  setShowPlayConfig(false);
                }}
                className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
              >
                Bắt đầu chơi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PGN Modal Overlay */}
      {showPgnInput && (
        <div className="pgn-modal app-modal p-4 bg-zinc-800 rounded-lg border border-zinc-700 shadow-2xl z-50 flex flex-col gap-2">
          <h3 className="font-bold text-sm">Dán PGN ván đấu:</h3>
          <textarea
            className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs font-mono"
            placeholder="[Event &quot;Live Chess&quot;]..."
            value={pgnInput}
            onChange={(e) => setPgnInput(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setShowPgnInput(false)} className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded">Hủy</button>
            <button onClick={handleLoadPgn} className="px-3 py-1 text-sm bg-emerald-600 hover:bg-emerald-500 rounded font-medium">Phân tích</button>
          </div>
        </div>
      )}

      <main className="app-main">
        {/* Chessboard Area */}
        <div className="board-panel bg-zinc-900/40 border border-zinc-800/80 shadow-2xl relative">
          <div className="board-stage">
          <div className={`board-row ${mode === 'preview' ? 'with-evaluation' : ''}`}>
            {mode === 'preview' && <EvalBar evaluation={evaluation} />}
            <div className="chess-board drop-shadow-2xl">
              <Board
                options={{
                  id: "main-board",
                  position: fen,
                  boardOrientation: (() => {
                    let base: 'white' | 'black' = mode === 'play' ? (playerColor === 'w' ? 'white' : 'black') : 'white';
                    if (isFlipped) base = base === 'white' ? 'black' : 'white';
                    return base;
                  })(),
                  onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop({ sourceSquare, targetSquare: targetSquare ?? '' }),
                  onSquareClick: ({ square }) => onSquareClick({ square }),
                  onPieceDrag: ({ square }) => { if (square) onPieceDragBegin({ square }); },
                  onSquareRightClick: ({ square }) => onSquareRightClick({ square }),
                  allowDragging: mode !== 'play' || (!gameOver && new Chess(fen).turn() === playerColor),
                  squareStyles: mergedSquareStyles,
                  arrows: arrows,
                  darkSquareStyle: { backgroundColor: '#648b61' },
                  lightSquareStyle: { backgroundColor: '#ebecd0' },
                  boardStyle: { borderRadius: '8px', overflow: 'hidden' },
                  animationDurationInMs: 200,
                }}
              />
            </div>
          </div>
          </div>
          {/* Board controls */}
          <div className="board-controls flex justify-center gap-2">
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm font-medium border border-zinc-700 text-zinc-300"
              title="Xoay bàn cờ"
            >
              <FlipVertical2 size={16} /> Xoay bàn cờ
            </button>
            {mode === 'preview' && (
              <button
                onClick={() => setShowBestMoveArrow(!showBestMoveArrow)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors text-sm font-medium border ${
                  showBestMoveArrow
                    ? 'bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                }`}
                title={showBestMoveArrow ? 'Ẩn gợi ý' : 'Hiện nước đi tốt nhất'}
              >
                <Lightbulb size={16} /> {showBestMoveArrow ? 'Ẩn gợi ý' : 'Nước tốt nhất'}
              </button>
            )}
          </div>
        </div>

        {/* Info & Move List Area */}
        <div className="info-panel bg-zinc-900/80 border border-zinc-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>

          <div className="history-heading border-b border-zinc-800 relative z-10 flex flex-col gap-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              {mode === 'play' ? 'Trận đấu' : 'Phân tích ván đấu'}
            </h2>
            {mode === 'preview' && (
              <span className="engine-status text-zinc-500 font-mono" data-analysis-finished={evaluation.finished && !isReviewing}>
                {isReviewing ? `Full Review · ${progress}%` : evaluation.finished ? `Đã phân tích · D${evaluation.depth}` : evaluation.depth ? `D${evaluation.depth} · đang tính` : 'Đang tải engine…'}
              </span>
            )}
            {(() => {
              const currentSanSequence = getActiveLine().map(n => n.move.san);
              const openingName = getOpeningName(currentSanSequence);
              if (openingName) {
                return (
                  <div className="text-sm text-zinc-400 italic flex items-center gap-2">
                    <span className="opacity-50 text-xl">📖</span> {openingName}
                  </div>
                );
              }
              return null;
            })()}
          </div>

        <div className="header-actions sidebar-actions relative z-10">
          {mode === 'preview' && (
            <>
              <button
                onClick={() => setShowPgnInput(!showPgnInput)}
                title="Nhập PGN" aria-label="Nhập PGN"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-500/30"
              >
                <ClipboardType size={16} /> <span>Nhập PGN</span>
              </button>
              <button
                onClick={startReview}
                title="Phân tích lại toàn bộ ván đấu"
                disabled={isReviewing || rootNodeIds.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${isReviewing ? 'bg-emerald-900/50 text-emerald-500 border-emerald-800 cursor-wait' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-500/30'} ${rootNodeIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isReviewing ? `Đang phân tích... ${progress}%` : '★ Full Review'}
              </button>
              {isReviewing && <button onClick={cancelReview} className="px-3 py-2 text-sm bg-zinc-800 rounded-lg">Hủy phân tích</button>}
            </>
          )}
          <button
            onClick={() => {
              setTempBotElo(botElo);
              setTempPlayerColor(playerColor);
              setShowPlayConfig(true);
            }}
            title="Ván mới" aria-label="Ván mới"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
          >
            <RefreshCw size={16} /> <span className={mode === 'preview' ? 'sr-only' : ''}>Ván mới</span>
          </button>
        </div>

          {mode === 'preview' && (
            <label className="engine-choice relative z-10 flex items-center gap-2 text-xs text-zinc-400" title={ENGINE_PROFILES[engineProfile].description}>
              <span>Engine</span>
              <select aria-label="Chọn engine phân tích" value={engineProfile}
                onChange={event => { cancelReview(); setEngineProfile(event.target.value as EngineProfile); }}
                className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-zinc-200">
                <option value="lite">Stockfish 19 Lite · mở nhanh</option>
                <option value="full">Stockfish 19 NNUE · đầy đủ (~99 MB)</option>
              </select>
            </label>
          )}

          {mode === 'play' && (
            <div className="play-status p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 flex flex-col gap-3 z-10 relative">
               <div className="flex justify-between items-center">
                 <span className="text-sm text-zinc-400 font-medium">Độ khó (ELO)</span>
                 <select
                   value={botElo}
                   onChange={(e) => setBotElo(Number(e.target.value))}
                   className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded focus:ring-emerald-500 focus:border-emerald-500 block p-1.5"
                   disabled={rootNodeIds.length > 0 && !gameOver}
                 >
                   <option value={800}>800 (Dễ nhất)</option>
                   <option value={1000}>1000 (Dễ)</option>
                   <option value={1200}>1200 (Trung bình)</option>
                   <option value={1500}>1500 (Khá)</option>
                   <option value={1800}>1800 (Khó)</option>
                   <option value={2000}>2000 (Chuyên gia)</option>
                   <option value={2500}>2500 (Kiện tướng)</option>
                   <option value={2850}>2850 (Máy quét)</option>
                 </select>
               </div>
                <div className="flex justify-between items-center">
                 <span className="text-sm text-zinc-400 font-medium">Bạn cầm quân</span>
                 <div className="flex gap-1">
                   <div className={`px-3 py-1 rounded text-sm font-medium ${playerColor === 'w' ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-300'}`}>
                     {playerColor === 'w' ? '♔ Trắng' : '♚ Đen'}
                   </div>
                 </div>
               </div>

               {gameOver && (
                 <div className="mt-2 p-3 bg-zinc-900/80 border border-zinc-700 rounded text-center">
                   <div className="font-bold text-emerald-400 mb-1">Trận đấu kết thúc!</div>
                   <div className="text-sm text-zinc-300">
                     {gameOver.winner === 'draw' ? 'Hòa' : (gameOver.winner === 'w' ? 'Trắng thắng' : 'Đen thắng')}
                     <span className="text-zinc-500 ml-1">({gameOver.reason})</span>
                   </div>
                   <button onClick={() => {
                     setTempBotElo(botElo);
                     setTempPlayerColor(playerColor);
                     setShowPlayConfig(true);
                   }} className="mt-2 w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors">
                     Chơi ván mới
                   </button>
                 </div>
               )}
            </div>
          )}

          {/* Đồ thị đánh giá */}
          {mode === 'preview' && activeLine.length > 0 && (
             <div className="evaluation-graph relative z-10">
                 <EvalGraph scores={activeLine.map(n => n.score || 0)} currentIndex={activeLine.findIndex(n => n.id === currentMoveId)} onSelect={(idx) => { if (idx >= 0 && idx < activeLine.length) goToMove(activeLine[idx].id) }} />
             </div>
          )}

          <div className="move-history overflow-y-auto custom-scrollbar relative z-10">
            <MoveListBranch
              nodes={nodes}
              rootIds={rootNodeIds}
              currentMoveId={currentMoveId}
              goToMove={goToMove}
            />

            {rootNodeIds.length === 0 && (
              <div className="empty-history text-zinc-500 text-center flex flex-col items-center gap-3">
                <span className="text-4xl opacity-20">♔</span>
                <span className="italic">Chưa có nước đi nào.</span>
              </div>
            )}
          </div>

            {mode === 'preview' && currentMoveId && nodes[currentMoveId] && nodes[currentMoveId].classification !== 'none' && (
              <div className="move-explanation custom-scrollbar relative z-10">
                <MoveExplanation
                  key={currentMoveId}
                  classification={nodes[currentMoveId].classification}
                  move={nodes[currentMoveId].move}
                  engineBestMove={nodes[currentMoveId].engineBestMove}
                  scoreBefore={nodes[currentMoveId].scoreBefore ?? undefined}
                  scoreAfter={nodes[currentMoveId].score ?? undefined}
                  beforeEvaluation={nodes[currentMoveId].beforeEvaluation}
                  positionEvaluation={nodes[currentMoveId].positionEvaluation}
                  moveEvaluation={nodes[currentMoveId].moveEvaluation}
                  alternativeEvaluation={nodes[currentMoveId].alternativeEvaluation}
                  moveLossCp={nodes[currentMoveId].moveLossCp}
                  analysisStatus={nodes[currentMoveId].analysisStatus}
                  reviewDepth={nodes[currentMoveId].reviewDepth}
                  pvLine={nodes[currentMoveId].pvLine}
                  onPlayBestMove={nodes[currentMoveId].engineBestMove ? () => {
                    const nodeId = currentMoveId;
                    const bestMoveUci = nodes[nodeId].engineBestMove!;
                    // Keep the original line and add the recommendation as a variation.
                    goToMove(nodes[nodeId].parentId);
                    makeMove({ from: bestMoveUci.slice(0, 2), to: bestMoveUci.slice(2, 4), promotion: bestMoveUci[4] });
                    clearHighlight();
                  } : undefined}
                />
              </div>
            )}

          <div className="move-navigation border-t border-zinc-800 flex justify-center gap-2">
             <button onClick={() => goToMove(null)} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;&lt;</button>
             <button onClick={() => {
               const idx = activeLine.findIndex(n => n.id === currentMoveId);
               if (idx > 0) goToMove(activeLine[idx - 1].id);
               else if (idx === 0) goToMove(null);
             }} className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;</button>
             <button onClick={() => {
                const idx = activeLine.findIndex(n => n.id === currentMoveId);
                if (currentMoveId === null && rootNodeIds.length > 0) goToMove(activeLine[0]?.id ?? rootNodeIds[0]);
                else if (idx >= 0 && currentMoveId && nodes[currentMoveId]?.childrenIds.length > 0) {
                  goToMove(activeLine[idx + 1]?.id ?? nodes[currentMoveId].childrenIds[0]);
                }
             }} className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&gt;</button>
             <button onClick={() => {
               if (activeLine.length > 0) goToMove(activeLine[activeLine.length - 1].id);
             }} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&gt;&gt;</button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
