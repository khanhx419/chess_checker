import { useState, useEffect, useMemo } from 'react';
import { Chess, Move } from 'chess.js';

interface Props {
  classification: string;
  move: Move;
  engineBestMove?: string;
  onPlayBestMove?: () => void;
}

const CLASSIFICATION_CONFIG: Record<string, { title: string; descFn: (san: string, player: string) => string; color: string; emoji: string }> = {
  blunder: {
    title: 'Nước đi lỗi (Blunder)',
    descFn: (san, player) => `Nước đi ${san} của ${player} đánh mất hoàn toàn thế trận. Đây là một sai lầm nghiêm trọng!`,
    color: 'border-red-500/30 bg-red-500/10 text-red-400',
    emoji: '??',
  },
  mistake: {
    title: 'Nước sai lầm (Mistake)',
    descFn: (san, player) => `${san} là một nước đi không tốt, làm giảm cơ hội chiến thắng của ${player}.`,
    color: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    emoji: '?',
  },
  inaccuracy: {
    title: 'Nước đi thiếu chính xác (Inaccuracy)',
    descFn: (san) => `${san} tuy không phải lỗi nặng nhưng có những lựa chọn khác tối ưu hơn.`,
    color: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400',
    emoji: '?!',
  },
  good: {
    title: 'Nước đi tốt (Good)',
    descFn: (san) => `${san} là một nước đi ổn định và an toàn.`,
    color: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300',
    emoji: '',
  },
  excellent: {
    title: 'Nước đi xuất sắc (Excellent)',
    descFn: (san) => `${san} là một sự lựa chọn rất hay, gây sức ép đáng kể.`,
    color: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
    emoji: '!',
  },
  best: {
    title: 'Nước đi tốt nhất (Best)',
    descFn: (san) => `${san} chính là ý tưởng hoàn hảo nhất trong tình huống này.`,
    color: 'border-green-500/30 bg-green-500/10 text-green-400',
    emoji: '★',
  },
  brilliant: {
    title: 'Nước đi thiên tài (Brilliant)',
    descFn: (san) => `Thật tuyệt vời! ${san} là một nước đi chiến thuật xuất sắc hiếm thấy.`,
    color: 'border-teal-400/30 bg-teal-400/10 text-teal-400',
    emoji: '!!',
  },
  book: {
    title: 'Nước khai cuộc (Book)',
    descFn: (san) => `${san} là nước đi chuẩn mực theo lý thuyết khai cuộc.`,
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    emoji: '📖',
  },
};

/** Classifications that are sub-optimal — user should see the best move option */
const SUB_OPTIMAL = new Set(['blunder', 'mistake', 'inaccuracy', 'good']);

/** Convert a UCI move string (e.g. "e2e4") to SAN (e.g. "e4") given a FEN */
function uciToSan(uci: string, fen: string): string {
  try {
    const tempChess = new Chess(fen);
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const result = tempChess.move({ from, to, promotion });
    return result ? result.san : uci;
  } catch {
    return uci;
  }
}

export function MoveExplanation({ classification, move, engineBestMove, onPlayBestMove }: Props) {
  const [showingBestMove, setShowingBestMove] = useState(false);

  // Reset reveal state whenever the viewed move changes
  useEffect(() => {
    setShowingBestMove(false);
  }, [move.san, move.before]);

  if (classification === 'none' || !classification) return null;

  const config = CLASSIFICATION_CONFIG[classification];
  if (!config) return null;

  const san = move.san;
  const player = move.color === 'w' ? 'Trắng' : 'Đen';
  const title = config.title;
  const description = config.descFn(san, player);

  const isSubOptimal = SUB_OPTIMAL.has(classification);
  const canShowBestMove = isSubOptimal && !!engineBestMove;

  // Convert UCI best move to human-readable SAN — memoize to avoid recalculating
  const bestMoveSan = useMemo(() => {
    if (!engineBestMove) return '';
    return uciToSan(engineBestMove, move.before);
  }, [engineBestMove, move.before]);

  return (
    <div
      className={`p-4 rounded-lg border flex flex-col gap-2 transition-all ${config.color}`}
      style={{ animation: 'moveExplFadeIn 0.25s ease-out' }}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm tracking-wide flex items-center gap-2">
          {config.emoji && <span className="text-xs opacity-70">{config.emoji}</span>}
          {title}
        </h4>
        {/* Sub-optimal moves: show "reveal best move" button top right */}
        {canShowBestMove && !showingBestMove && (
          <button
            onClick={() => setShowingBestMove(true)}
            className="ml-2 flex items-center gap-2 text-xs px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-lg font-semibold"
            style={{ minWidth: 0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Xem nước đi tốt nhất
          </button>
        )}
      </div>
      <p className="text-sm opacity-90">{description}</p>

      {/* Revealed best move + undo button */}
      {canShowBestMove && showingBestMove && (
        <div
          className="flex flex-col gap-2.5 mt-1 p-3 rounded-lg border border-emerald-500/25 bg-emerald-950/30"
          style={{ animation: 'moveExplSlideIn 0.2s ease-out' }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Nước tốt nhất:</span>
            <span className="inline-flex items-center bg-emerald-500 text-zinc-950 px-2.5 py-0.5 rounded font-mono font-bold text-xs tracking-wider">
              {bestMoveSan}
            </span>
          </div>

          {onPlayBestMove && (
            <button
              onClick={onPlayBestMove}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-sm font-bold transition-all
                bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400/60
                shadow-[0_0_12px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]
                active:scale-[0.98] cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Rút lại và đi nước tốt nhất
            </button>
          )}
        </div>
      )}

      {/* Optimal moves: congratulatory message (best, excellent, brilliant) */}
      {!isSubOptimal && ['best', 'brilliant'].includes(classification) && (
        <p className="text-xs opacity-60 italic mt-1">
          ✅ Bạn đã đi đúng nước tốt nhất!
        </p>
      )}

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes moveExplFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes moveExplSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
