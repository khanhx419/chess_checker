import { useState } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useGameStore } from './store';
import { RefreshCw, ClipboardType } from 'lucide-react';
import { useEngine } from './useEngine';
import { useGameReview } from './useGameReview';
import { EvalBar } from './components/EvalBar';
import { MoveBadge } from './components/MoveBadge';
import { EvalGraph } from './components/EvalGraph';

const Board = Chessboard as any;

function App() {
  const { fen, makeMove, resetGame, history, currentMoveIndex, goToMove, loadPgn, classifications, scores } = useGameStore();
  const evaluation = useEngine(fen);
  const { startReview, isReviewing, progress } = useGameReview();
  const [pgnInput, setPgnInput] = useState('');
  const [showPgnInput, setShowPgnInput] = useState(false);
  const [moveFrom, setMoveFrom] = useState('');
  const [optionSquares, setOptionSquares] = useState({});
  const [showBestMove, setShowBestMove] = useState(false);

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

  function onSquareClick(square: string) {
    if (!moveFrom) {
      const hasMoves = getMoveOptions(square);
      if (hasMoves) setMoveFrom(square);
      return;
    }

    const move = makeMove({
      from: moveFrom,
      to: square,
      promotion: 'q',
    });

    if (move) {
      setMoveFrom('');
      setOptionSquares({});
      return;
    }

    const hasMoves = getMoveOptions(square);
    if (hasMoves) {
      setMoveFrom(square);
    } else {
      setMoveFrom('');
      setOptionSquares({});
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
    if (move) {
      setMoveFrom('');
      setOptionSquares({});
      return true;
    }
    return false;
  }

  const arrows: any[] = [];
  if (showBestMove && evaluation.bestMove) {
    const from = evaluation.bestMove.substring(0, 2);
    const to = evaluation.bestMove.substring(2, 4);
    arrows.push([from, to, 'rgba(16, 185, 129, 0.5)']);
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
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
            Chess Checker Pro
          </h1>
          {evaluation.depth ? (
            <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-400 font-mono">
              Depth: {evaluation.depth}
            </span>
          ) : (
            <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-500 font-mono animate-pulse">
              Engine loading...
            </span>
          )}
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => setShowPgnInput(!showPgnInput)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-500/30"
          >
            <ClipboardType size={16} /> Nhập PGN
          </button>
          <button 
            onClick={startReview}
            disabled={isReviewing || history.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${isReviewing ? 'bg-emerald-900/50 text-emerald-500 border-emerald-800 cursor-wait' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-500/30'} ${history.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isReviewing ? `Đang phân tích... ${progress}%` : '★ Full Review'}
          </button>
          <button 
            onClick={resetGame}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
          >
            <RefreshCw size={16} /> Ván mới
          </button>
        </div>
      </header>

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
          
          {/* Best move suggestion UI */}
          <div className="w-full max-w-[650px] mb-4 flex items-center justify-between bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-2 opacity-90 transition-opacity">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-sm font-medium text-zinc-300">Gợi ý tốt nhất:</span>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded mr-2">
                {evaluation.bestMove || (history.length === 0 ? 'e2e4' : '...')}
              </span>
              <button 
                onClick={() => setShowBestMove(!showBestMove)}
                className={`text-xs px-2 py-1 rounded transition-colors ${showBestMove ? 'bg-emerald-600/30 text-emerald-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'}`}
              >
                {showBestMove ? 'Tắt Gợi ý' : 'Bật Gợi ý Mũi tên'}
              </button>
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              Eval: {evaluation.mate !== undefined ? `M${Math.abs(evaluation.mate)}` : (evaluation.cp ? (evaluation.cp/100).toFixed(2) : '0.00')}
            </div>
          </div>

          <div className="flex gap-4 items-center justify-center w-full max-w-[650px] aspect-square relative">
            <EvalBar evaluation={evaluation} />
            <div className="flex-1 aspect-square drop-shadow-2xl">
              <Board 
                position={fen} 
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={optionSquares}
                customArrows={arrows}
                customDarkSquareStyle={{ backgroundColor: '#648b61' }}
                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                customBoardStyle={{ borderRadius: '8px', overflow: 'hidden' }}
                animationDuration={200}
              />
            </div>
          </div>
        </div>

        {/* Info & Move List Area */}
        <div className="flex flex-col gap-4 bg-zinc-900/80 rounded-3xl border border-zinc-800 p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full translate-x-10 -translate-y-10"></div>
          <h2 className="text-lg font-bold border-b border-zinc-800 pb-3 flex items-center gap-2 relative z-10">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            Lịch sử ván đấu
          </h2>
          
          {/* Đồ thị đánh giá */}
          {scores.length > 0 && (
             <div className="relative z-10 mb-2">
                 <EvalGraph scores={scores} currentIndex={currentMoveIndex} onSelect={(idx) => goToMove(idx)} />
             </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
            <div className="grid grid-cols-[3fr_3fr] gap-x-2 gap-y-1.5 text-sm">
              {Array.from({ length: Math.ceil(history.length / 2) }).map((_, rowIndex) => {
                const whiteIndex = rowIndex * 2;
                const blackIndex = rowIndex * 2 + 1;
                
                const whiteMove = history[whiteIndex];
                const blackMove = history[blackIndex];

                return (
                  <div key={rowIndex} className="contents group">
                    {/* Nước trắng */}
                    <div 
                      onClick={() => goToMove(whiteIndex)}
                      className={`relative py-1 px-3 rounded flex items-center justify-between gap-1 cursor-pointer transition-colors ${currentMoveIndex === whiteIndex ? 'bg-zinc-700 shadow-inner' : 'bg-zinc-800/20 hover:bg-zinc-800/60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 w-4 font-medium text-right text-xs">{rowIndex + 1}.</span>
                        <span className="font-mono font-semibold text-zinc-300">{whiteMove?.san}</span>
                      </div>
                      <MoveBadge type={classifications[whiteIndex] || 'none'} />
                    </div>

                    {/* Nước đen */}
                    {blackMove ? (
                      <div 
                        onClick={() => goToMove(blackIndex)}
                        className={`relative py-1 px-3 rounded flex items-center justify-between cursor-pointer transition-colors font-mono font-semibold text-zinc-300 ${currentMoveIndex === blackIndex ? 'bg-zinc-700 shadow-inner' : 'bg-zinc-800/20 hover:bg-zinc-800/60'}`}
                      >
                        {blackMove.san}
                        <MoveBadge type={classifications[blackIndex] || 'none'} />
                      </div>
                    ) : (
                      <div className="py-1 px-3 rounded bg-transparent flex items-center" />
                    )}
                  </div>
                );
              })}
            </div>
            {history.length === 0 && (
              <div className="text-zinc-500 text-center mt-12 flex flex-col items-center gap-3">
                <span className="text-4xl opacity-20">♔</span>
                <span className="italic">Chưa có nước đi nào.</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800 flex justify-center gap-2">
             <button onClick={() => goToMove(-1)} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;&lt;</button>
             <button onClick={() => goToMove(Math.max(-1, currentMoveIndex - 1))} className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&lt;</button>
             <button onClick={() => goToMove(Math.min(history.length - 1, currentMoveIndex + 1))} className="px-4 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&gt;</button>
             <button onClick={() => goToMove(history.length - 1)} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">&gt;&gt;</button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
