import { useState, useEffect, useRef } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useGameStore } from './store';
import { RefreshCw, ClipboardType, FlipVertical2, Lightbulb } from 'lucide-react';
import { useEngine } from './useEngine';
import { usePlayEngine } from './usePlayEngine';
import { useGameReview } from './useGameReview';
import { EvalBar } from './components/EvalBar';
import { EvalGraph } from './components/EvalGraph';
import { getOpeningName, isBookMove } from './utils/openings';
import { MoveExplanation } from './components/MoveExplanation';
import { MoveListBranch } from './components/MoveListBranch';

const Board = Chessboard as any;

function App() {
  const { fen, makeMove, resetGame, nodes, rootNodeIds, currentMoveId, goToMove, getActiveLine, updateNode, loadPgn, mode, setMode, playerColor, setPlayerColor, botElo, setBotElo, gameOver, deleteNode } = useGameStore();
  const activeLine = getActiveLine();
  usePlayEngine(mode === 'play');
  const { startReview, isReviewing, progress } = useGameReview();
  const [pgnInput, setPgnInput] = useState('');
  const [showPgnInput, setShowPgnInput] = useState(false);
  const [moveFrom, setMoveFrom] = useState('');
  const [optionSquares, setOptionSquares] = useState({});

  const [showPlayConfig, setShowPlayConfig] = useState(false);
  const [userArrows, setUserArrows] = useState<{startSquare: string; endSquare: string; color: string}[]>([]);
  const [rightClickStart, setRightClickStart] = useState<string | null>(null);
  const [tempBotElo, setTempBotElo] = useState(botElo);
  const [tempPlayerColor, setTempPlayerColor] = useState<import('./store').PlayerColor>('w');
  const [isFlipped, setIsFlipped] = useState(false);
  const preMoveCpRef = useRef<number | null>(null);
  const [pendingClassId, setPendingClassId] = useState<string | null>(null);
  const [showBestMoveArrow, setShowBestMoveArrow] = useState(false);

  const evaluation = useEngine(fen, mode === 'preview');
  function getMoveOptions(square: string) {
    const moves = new Chess(fen).moves({
      square: square as import('chess.js').Square,
      verbose: true,
    }) as Move[];
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const activeLine = useGameStore.getState().getActiveLine();
      const currentMoveId = useGameStore.getState().currentMoveId;
      const nodes = useGameStore.getState().nodes;
      const rootNodeIds = useGameStore.getState().rootNodeIds;

      const idx = activeLine.findIndex(n => n.id === currentMoveId);

      if (e.key === 'ArrowLeft') {
        if (idx > 0) goToMove(activeLine[idx - 1].id);
        else if (idx === 0) goToMove(null);
      } else if (e.key === 'ArrowRight') {
        if (currentMoveId === null && rootNodeIds.length > 0) {
          goToMove(rootNodeIds[0]);
        } else if (idx >= 0 && currentMoveId) {
           const node = nodes[currentMoveId];
           if (node && node.childrenIds.length > 0) {
             goToMove(node.childrenIds[0]);
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

  function onPieceDragBegin({ piece: _piece, square }: { piece: string; square: string }) {
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

  const getIntegratedScore = (evalObj: { cp?: number; mate?: number }) => {
    if (evalObj.mate !== undefined) {
      return evalObj.mate > 0 ? 30000 - evalObj.mate * 10 : -30000 - evalObj.mate * 10;
    }
    return evalObj.cp ?? 0;
  };

  function onSquareClick({ square }: { square: string }) {
    console.log('[onSquareClick]', { square, mode, playerColor, fen: fen.substring(fen.indexOf(' ')), gameOver, moveFrom });
    if (mode === 'play') {
      if (gameOver) { console.log('[onSquareClick] rejected: gameOver'); return; }
      const isPlayerTurn = (playerColor === 'w' && fen.includes(' w ')) || (playerColor === 'b' && fen.includes(' b '));
      console.log('[onSquareClick] isPlayerTurn:', isPlayerTurn);
      if (!isPlayerTurn) return;
    }

    if (!moveFrom) {
      console.log('[onSquareClick] no moveFrom, getting options for', square);
      const hasMoves = getMoveOptions(square);
      console.log('[onSquareClick] hasMoves:', hasMoves);
      if (hasMoves) setMoveFrom(square);
      return;
    }

    console.log('[onSquareClick] attempting move:', moveFrom, '->', square);
    // Capture eval before the move for real-time classification
    if (mode === 'preview') preMoveCpRef.current = getIntegratedScore(evaluation);
    const currentBestMove = evaluation.bestMove;

    const move = makeMove({
      from: moveFrom,
      to: square,
      promotion: 'q',
    }, currentBestMove);
    console.log('[onSquareClick] makeMove result:', move);

    if (move) {
      if (mode === 'preview') setPendingClassId(useGameStore.getState().currentMoveId);
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

  function onDrop({ sourceSquare, targetSquare, piece: _piece }: { sourceSquare: string; targetSquare: string; piece: string }) {
    console.log('onDrop called with:', sourceSquare, targetSquare);
    if (mode === 'play') {
      if (gameOver) {
         console.log('onDrop rejected: gameOver');
         return false;
      }
      const isPlayerTurn = (playerColor === 'w' && fen.includes(' w ')) || (playerColor === 'b' && fen.includes(' b '));
      if (!isPlayerTurn) {
         console.log('onDrop rejected: not player turn (', playerColor, 'fen:', fen, ')');
         return false;
      }
    }

    // Capture eval before the move for real-time classification
    if (mode === 'preview') preMoveCpRef.current = getIntegratedScore(evaluation);
    const currentBestMove = evaluation.bestMove;

    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    }, currentBestMove);
    if (move) {
      if (mode === 'preview') setPendingClassId(useGameStore.getState().currentMoveId);
      clearHighlight();
      setUserArrows([]);
      return true;
    }
    clearHighlight();
    return false;
  }

  // Real-time classification: wait for engine depth >= 12 on new position
  useEffect(() => {
    if (pendingClassId === null || mode !== 'preview') return;
    // If user navigated away from the pending move, cancel
    if (pendingClassId !== currentMoveId) {
      setPendingClassId(null);
      return;
    }
    // Wait for engine to reach sufficient depth on the NEW position.
    // Depth 12 provides much more stable evaluations for classification.
    if (!evaluation.depth || evaluation.depth < 12) return;

    const currentMoveNode = nodes[pendingClassId];
    if (!currentMoveNode) {
      setPendingClassId(null);
      return;
    }

    // Use parent node's stored score as baseline (reliable, not stale).
    // Fall back to preMoveCpRef only if parent has no score yet (first move of game).
    const parentId = currentMoveNode.parentId;
    const parentNode = parentId ? nodes[parentId] : null;
    const hasParentScore = parentNode?.score !== null && parentNode?.score !== undefined;
    const hasPreMoveScore = preMoveCpRef.current !== null;

    // CRITICAL: If BOTH scores are unavailable, we cannot classify reliably.
    // Skip classification to avoid false "best" labels from delta ≈ 0.
    if (!hasParentScore && !hasPreMoveScore) {
      // Store the post-move score for future reference but don't classify
      const scoreAfter = getIntegratedScore(evaluation);
      updateNode(pendingClassId, { score: scoreAfter });
      setPendingClassId(null);
      preMoveCpRef.current = null;
      return;
    }

    const scoreBefore = hasParentScore
      ? parentNode!.score!
      : preMoveCpRef.current!;

    const scoreAfter = getIntegratedScore(evaluation);
    const isWhiteMove = currentMoveNode.move.color === 'w';
    // For white: positive delta = good for white. For black: eval drop = good for black.
    const delta = isWhiteMove ? (scoreAfter - scoreBefore) : (scoreBefore - scoreAfter);

    let cls = 'none';
    if (Math.abs(delta) > 5000) {
      cls = delta < 0 ? 'blunder' : 'best';
    } else {
      if (delta > -20) cls = 'best';
      else if (delta > -50) cls = 'excellent';
      else if (delta > -100) cls = 'good';
      else if (delta > -200) cls = 'inaccuracy';
      else if (delta > -300) cls = 'mistake';
      else cls = 'blunder';
    }

    // Use dictionary-based book detection instead of heuristic
    const currentSanHistory = activeLine.map(n => n.move.san);
    if (isBookMove(currentSanHistory)) cls = 'book';

    updateNode(pendingClassId, { classification: cls, score: scoreAfter });

    setPendingClassId(null);
    preMoveCpRef.current = null;
  }, [evaluation.depth, evaluation.cp, evaluation.mate, pendingClassId, currentMoveId, mode]);

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
  const mergedSquareStyles = { ...classificationSquareStyles, ...optionSquares };

  const arrows: any[] = [...userArrows];

  // Show best move arrow on the board when toggled on
  if (showBestMoveArrow && mode === 'preview' && evaluation.bestMove && evaluation.bestMove.length >= 4) {
    const from = evaluation.bestMove.substring(0, 2);
    const to = evaluation.bestMove.substring(2, 4);
    arrows.push({ startSquare: from, endSquare: to, color: 'rgba(50, 205, 50, 0.75)' });
  }

  function handleLoadPgn() {
    if (loadPgn(pgnInput)) {
      setShowPgnInput(false);
      setPgnInput('');
    } else {
      alert("PGN không hợp lệ");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200 flex flex-col">
      <header className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center z-20">
        <div className="flex gap-4 items-center">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 lg:mr-4 shrink-0">
            Chess Checker Pro
          </h1>

          <div className="flex bg-zinc-800 rounded-lg p-1">
             <button
               onClick={() => {
                 if (mode !== 'play') {
                   setMode('play');
                 }
                 setTempBotElo(botElo);
                 setTempPlayerColor(playerColor);
                 setShowPlayConfig(true);
               }}
               className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${mode === 'play' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
            >
              Chơi vs Máy
            </button>
            <button
               onClick={() => setMode('preview')}
               className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${mode === 'preview' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'}`}
            >
              Phân tích
            </button>
          </div>

          {mode === 'preview' && (evaluation.depth ? (
            <span className="hidden sm:inline-block text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-400 font-mono">
              Depth: {evaluation.depth}
            </span>
          ) : (
            <span className="hidden sm:inline-block text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-500 font-mono animate-pulse">
              Engine loading...
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {mode === 'preview' && (
            <>
              <button 
                onClick={() => setShowPgnInput(!showPgnInput)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-500/30"
              >
                <ClipboardType size={16} /> <span className="hidden sm:inline">Nhập PGN</span>
              </button>
              <button 
                onClick={startReview}
                disabled={isReviewing || rootNodeIds.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${isReviewing ? 'bg-emerald-900/50 text-emerald-500 border-emerald-800 cursor-wait' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-500/30'} ${rootNodeIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isReviewing ? `Đang phân tích... ${progress}%` : '★ Full Review'}
              </button>
            </>
          )}
          <button 
            onClick={() => {
              setTempBotElo(botElo);
              setTempPlayerColor(playerColor);
              setShowPlayConfig(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
          >
            <RefreshCw size={16} /> Ván mới
          </button>
        </div>
      </header>

      {/* PGN Modal Overlay */}
      {showPlayConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-6">
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
        <div className="absolute top-16 right-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700 shadow-2xl z-50 w-96 flex flex-col gap-2">
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

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 max-w-7xl mx-auto w-full">
        {/* Chessboard Area */}
        <div className="flex flex-col items-center justify-center bg-zinc-900/40 rounded-3xl p-8 border border-zinc-800/80 shadow-2xl relative">
          


          <div className="flex gap-4 items-center justify-center w-full max-w-[650px] aspect-square relative">
            {mode === 'preview' && <EvalBar evaluation={evaluation} />}
            <div className="flex-1 aspect-square drop-shadow-2xl">
              <Board 
                options={{
                  id: "main-board",
                  position: fen,
                  boardOrientation: (() => {
                    let base: 'white' | 'black' = mode === 'play' ? (playerColor === 'w' ? 'white' : 'black') : 'white';
                    if (isFlipped) base = base === 'white' ? 'black' : 'white';
                    return base;
                  })(),
                  onPieceDrop: ({ piece, sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string }) => onDrop({ sourceSquare, targetSquare: targetSquare ?? '', piece: piece?.pieceType ?? piece }),
                  onSquareClick: ({ square }: { piece: any; square: string }) => onSquareClick({ square }),
                  onPieceDrag: ({ piece, square }: { isSparePiece: boolean; piece: any; square: string | null }) => { if (square) onPieceDragBegin({ piece: piece?.pieceType ?? piece, square }); },
                  onSquareRightClick: ({ square }: { piece: any; square: string }) => onSquareRightClick({ square }),
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
          {/* Board controls */}
          <div className="w-full max-w-[650px] mt-2 flex justify-center gap-2">
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
        <div className="flex flex-col gap-4 bg-zinc-900/80 rounded-3xl border border-zinc-800 p-6 shadow-xl relative overflow-hidden lg:h-[calc(100vh-6rem)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>
          
          <div className="border-b border-zinc-800 pb-3 relative z-10 flex flex-col gap-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              {mode === 'play' ? 'Trận đấu' : 'Lịch sử ván đấu'}
            </h2>
            {(() => {
              const currentSanSequence = activeLine.map(n => n.move.san);
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
          
          {mode === 'play' && (
            <div className="p-4 bg-zinc-800/50 rounded-xl mb-2 border border-zinc-700/50 flex flex-col gap-3 z-10 relative">
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
             <div className="relative z-10 mb-2">
                 <EvalGraph scores={activeLine.map(n => n.score || 0)} currentIndex={activeLine.findIndex(n => n.id === currentMoveId)} onSelect={(idx) => { if (idx >= 0 && idx < activeLine.length) goToMove(activeLine[idx].id) }} />
             </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
            <MoveListBranch 
              nodes={nodes}
              rootIds={rootNodeIds}
              currentMoveId={currentMoveId}
              goToMove={goToMove}
            />

            {rootNodeIds.length === 0 && (
              <div className="text-zinc-500 text-center mt-12 flex flex-col items-center gap-3">
                <span className="text-4xl opacity-20">♔</span>
                <span className="italic">Chưa có nước đi nào.</span>
              </div>
            )}
            
            {mode === 'preview' && currentMoveId && nodes[currentMoveId] && nodes[currentMoveId].classification !== 'none' && (
              <div className="mt-4">
                <MoveExplanation 
                  classification={nodes[currentMoveId].classification} 
                  move={nodes[currentMoveId].move}
                  engineBestMove={nodes[currentMoveId].engineBestMove}
                  onPlayBestMove={nodes[currentMoveId].engineBestMove ? () => {
                    const nodeId = currentMoveId;
                    const bestMoveUci = nodes[nodeId].engineBestMove!;
                    // Delete the current (bad) node — this also navigates back to parent
                    deleteNode(nodeId);
                    // Now play the engine's best move from the restored position
                    setTimeout(() => {
                      const from = bestMoveUci.substring(0, 2);
                      const to = bestMoveUci.substring(2, 4);
                      const promo = bestMoveUci.length > 4 ? bestMoveUci[4] : 'q';
                      makeMove({ from, to, promotion: promo });
                    }, 50);
                  } : undefined}
                />
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800 flex justify-center gap-2">
             <button onClick={() => goToMove(null)} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;&lt;</button>
             <button onClick={() => {
               const idx = activeLine.findIndex(n => n.id === currentMoveId);
               if (idx > 0) goToMove(activeLine[idx - 1].id);
               else if (idx === 0) goToMove(null);
             }} className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;</button>
             <button onClick={() => {
                const idx = activeLine.findIndex(n => n.id === currentMoveId);
                if (currentMoveId === null && rootNodeIds.length > 0) goToMove(rootNodeIds[0]);
                else if (idx >= 0 && currentMoveId && nodes[currentMoveId]?.childrenIds.length > 0) {
                  goToMove(nodes[currentMoveId].childrenIds[0]);
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
