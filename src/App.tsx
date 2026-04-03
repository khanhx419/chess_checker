import { Chessboard } from 'react-chessboard';
import { useGameStore } from './store';
import { RefreshCw } from 'lucide-react';
import { useEngine } from './useEngine';
import { EvalBar } from './components/EvalBar';

function App() {
  const { fen, makeMove, resetGame, history } = useGameStore();
  const evaluation = useEngine(fen);

  function onDrop(sourceSquare: string, targetSquare: string) {
    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // Auto-promote to queen for MVP
    });
    return move;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200 flex flex-col">
      <header className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
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
        <button 
          onClick={resetGame}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700/80 rounded-lg transition-colors text-sm font-medium border border-zinc-700"
        >
          <RefreshCw size={16} /> Ván mới
        </button>
      </header>

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 max-w-7xl mx-auto w-full">
        {/* Chessboard Area */}
        <div className="flex items-center justify-center bg-zinc-900/40 rounded-3xl p-8 border border-zinc-800/80 shadow-2xl relative">
          <div className="flex gap-4 items-center justify-center w-full max-w-[650px] aspect-square relative">
            <EvalBar evaluation={evaluation} />
            <div className="flex-1 aspect-square drop-shadow-2xl">
              <Chessboard 
                position={fen} 
                onPieceDrop={onDrop}
                customDarkSquareStyle={{ backgroundColor: '#648b61' }}
                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                customBoardStyle={{ borderRadius: '8px', overflow: 'hidden' }}
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
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
            <div className="grid grid-cols-[3fr_3fr] gap-x-2 gap-y-1.5 text-sm">
              {Array.from({ length: Math.ceil(history.length / 2) }).map((_, rowIndex) => {
                const whiteMove = history[rowIndex * 2];
                const blackMove = history[rowIndex * 2 + 1];

                return (
                  <div key={rowIndex} className="contents group">
                    <div className="py-1 px-3 rounded flex items-center gap-2 bg-zinc-800/20 hover:bg-zinc-800/60 transition-colors">
                      <span className="text-zinc-500 w-4 font-medium text-right">{rowIndex + 1}.</span>
                      <span className="font-mono font-semibold text-zinc-300">{whiteMove?.san}</span>
                    </div>
                    {blackMove ? (
                      <div className="py-1 px-3 rounded flex items-center gap-2 bg-zinc-800/20 hover:bg-zinc-800/60 transition-colors font-mono font-semibold text-zinc-300">
                        {blackMove.san}
                      </div>
                    ) : <div className="py-1 px-3 rounded bg-zinc-800/5 flex items-center" />}
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
        </div>
      </main>
    </div>
  );
}

export default App;

