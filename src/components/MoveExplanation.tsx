import { useState, useMemo } from 'react';
import { Chess, Move } from 'chess.js';
import type { EngineEval } from '../engine';
import { brilliantSacrifice } from '../brilliance';
import type { BrilliantSacrifice } from '../brilliance';

interface Props {
  classification: string;
  move: Move;
  engineBestMove?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  beforeEvaluation?: EngineEval;
  positionEvaluation?: EngineEval;
  moveEvaluation?: EngineEval;
  alternativeEvaluation?: EngineEval;
  moveLossCp?: number;
  analysisStatus?: 'quick' | 'verified' | 'reviewing' | 'uncertain';
  reviewDepth?: number;
  pvLine?: string[];
  onPlayBestMove?: () => void;
}

const CLASSIFICATION_CONFIG: Record<string, { title: string; color: string; emoji: string }> = {
  uncertain: { title: 'Chưa đủ chắc chắn', color: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300', emoji: '…' },
  blunder: { title: 'Lỗi nghiêm trọng (Blunder)', color: 'border-red-500/30 bg-red-500/10 text-red-400', emoji: '??' },
  mistake: { title: 'Sai lầm (Mistake)', color: 'border-orange-500/30 bg-orange-500/10 text-orange-400', emoji: '?' },
  inaccuracy: { title: 'Thiếu chính xác (Inaccuracy)', color: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400', emoji: '?!' },
  good: { title: 'Nước tốt (Good)', color: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300', emoji: '' },
  excellent: { title: 'Nước rất tốt (Excellent)', color: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400', emoji: '!' },
  best: { title: 'Nước tốt nhất (Best)', color: 'border-green-500/30 bg-green-500/10 text-green-400', emoji: '★' },
  brilliant: { title: 'Nước thiên tài (Brilliant)', color: 'border-teal-400/30 bg-teal-400/10 text-teal-400', emoji: '!!' },
  book: { title: 'Nước khai cuộc (Book)', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400', emoji: '📖' },
};

const SUB_OPTIMAL = new Set(['blunder', 'mistake', 'inaccuracy', 'good']);

function uciToSan(uci: string, fen: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? uci;
  } catch { return uci; }
}

function pvToSanSequence(pvMoves: string[], startFen: string): string[] {
  const sans: string[] = [];
  const chess = new Chess(startFen);
  try {
    for (const uci of pvMoves.slice(0, 6)) {
      sans.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    }
  } catch { /* Keep only the legal prefix. */ }
  return sans;
}

function formatScore(cp: number, evaluation?: EngineEval): string {
  if (evaluation?.mate !== undefined) {
    const whiteWins = evaluation.mateWinner ? evaluation.mateWinner === 'w' : evaluation.mate > 0;
    return `${whiteWins ? '+' : '−'}M${Math.abs(evaluation.mate)}`;
  }
  if (Math.abs(cp) >= 10000) return cp > 0 ? '+M' : '−M';
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}

function describeMove({ classification, move, beforeEvaluation, moveEvaluation, positionEvaluation }: Props, sacrifice?: BrilliantSacrifice): string {
  if (classification === 'uncertain') return 'Kết quả chưa ổn định trong thời gian kiểm tra. Chưa gán nhãn tốt/xấu cho nước này.';
  const candidate = moveEvaluation ?? positionEvaluation;
  const side = move.color === 'w' ? 'w' : 'b';
  const mateWinner = (evaluation?: EngineEval) => evaluation?.mate === undefined ? undefined :
    evaluation.mateWinner ?? (evaluation.mate > 0 ? 'w' : 'b');
  if (classification === 'book') return `${move.san} nằm trong danh sách khai cuộc của ứng dụng.`;
  if (classification === 'brilliant' && sacrifice) {
    const name = { n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu' }[sacrifice.piece];
    return `${move.san} thí ${name} tại ${sacrifice.square} mà vẫn giữ kết quả gần nước tốt nhất. Biến máy tính bên dưới nhận quân thí. Nhãn thiên tài là quy tắc của ứng dụng, dựa trên điểm và biến Stockfish.`;
  }
  if (classification === 'best') return `${move.san} trùng nước ưu tiên của engine trong lượt phân tích này.`;
  if (candidate?.mate !== undefined) {
    return mateWinner(candidate) === side
      ? `Với ${move.san}, engine vẫn tìm thấy chuỗi chiếu hết cho bên vừa đi.`
      : `Sau ${move.san}, engine tìm thấy chuỗi chiếu hết cho đối phương. Nhãn đánh giá so sánh với lựa chọn trước nước đi.`;
  }
  if (mateWinner(beforeEvaluation) === side) {
    return `Ở nhánh ưu tiên trước ${move.san}, engine tìm thấy chiếu hết; tìm kiếm nước đã đi chưa tìm lại được chuỗi đó.`;
  }
  switch (classification) {
    case 'excellent': return `${move.san} có kết quả gần lựa chọn ưu tiên của engine trong lượt tìm kiếm này.`;
    case 'good': return `${move.san} giảm một ít điểm đánh giá so với lựa chọn ưu tiên của engine.`;
    case 'inaccuracy': return `${move.san} làm giảm điểm đánh giá của bên vừa đi so với lựa chọn ưu tiên.`;
    case 'mistake': return `${move.san} làm giảm đáng kể điểm đánh giá của bên vừa đi.`;
    case 'blunder': return `${move.san} có chênh lệch điểm đánh giá lớn so với lựa chọn ưu tiên của engine.`;
    default: return `${move.san} — kết quả theo lượt phân tích hiện tại.`;
  }
}

export function MoveExplanation(props: Props) {
  const { classification, move, engineBestMove, scoreBefore, scoreAfter, beforeEvaluation,
    positionEvaluation, moveEvaluation, alternativeEvaluation, moveLossCp, analysisStatus, reviewDepth, pvLine, onPlayBestMove } = props;
  // Tie reveal state to the position so navigation does not reveal another node.
  const [revealedPosition, setRevealedPosition] = useState<string | null>(null);
  const showingBestMove = revealedPosition === move.after;
  const config = CLASSIFICATION_CONFIG[classification];
  const bestMoveSan = useMemo(() => engineBestMove ? uciToSan(engineBestMove, move.before) : '', [engineBestMove, move.before]);
  const pvSanSequence = useMemo(() => pvLine?.length ? pvToSanSequence(pvLine, move.before) : [], [pvLine, move.before]);
  const sacrifice = useMemo(() => classification === 'brilliant' && beforeEvaluation && positionEvaluation
    ? brilliantSacrifice(move, beforeEvaluation, positionEvaluation, moveEvaluation, alternativeEvaluation) : undefined,
  [classification, move, beforeEvaluation, positionEvaluation, moveEvaluation, alternativeEvaluation]);
  const sacrificeLine = useMemo(() => sacrifice ? pvToSanSequence(sacrifice.line, move.before) : [], [sacrifice, move.before]);
  const played = `${move.from}${move.to}${move.promotion ?? ''}`;
  const canShowBestMove = SUB_OPTIMAL.has(classification) && !!engineBestMove && played !== engineBestMove;
  const comparableCp = beforeEvaluation?.mate === undefined && (moveEvaluation ?? positionEvaluation)?.mate === undefined;
  const status = analysisStatus === 'uncertain' ? 'Cần kiểm tra thêm' : analysisStatus === 'verified' ? 'Đã kiểm tra lại' : analysisStatus === 'reviewing' ? 'Đang kiểm tra lại' : 'Phân tích nhanh';
  if (!config || classification === 'none') return null;

  return (
    <div className={`p-3 rounded-lg border flex flex-col gap-2 ${config.color}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-sm flex items-center gap-2">
          {config.emoji && <span className="text-xs opacity-70">{config.emoji}</span>}
          {config.title}
        </h4>
        <span className="text-[10px] text-zinc-400">
          {status}{reviewDepth !== undefined && reviewDepth > 0 ? ` · D${reviewDepth}` : ''}
        </span>
      </div>
      <p className="text-xs opacity-90 leading-relaxed">{describeMove(props, sacrifice)}</p>
      {sacrificeLine.length > 0 && (
        <p className="text-xs text-teal-200/90">Biến nhận quân thí: <span className="font-mono">{sacrificeLine.join(' → ')}</span></p>
      )}
      {scoreAfter !== undefined && (
        <div className="text-xs text-zinc-300">
          <span className="text-zinc-500">Điểm Trắng (như thanh đánh giá): </span>
          {scoreBefore !== undefined && <><span className="font-mono">{formatScore(scoreBefore, beforeEvaluation)}</span><span className="text-zinc-500"> → </span></>}
          <span className="font-mono font-semibold">{formatScore(scoreAfter, positionEvaluation)}</span>
        </div>
      )}
      {comparableCp && moveLossCp !== undefined && !['book', 'uncertain'].includes(classification) && (
        <p className="text-[11px] text-zinc-400">
          Chênh lệch so với nước ưu tiên: {(moveLossCp / 100).toFixed(2)} tốt.
          {moveEvaluation ? ' So sánh hai nước từ cùng thế cờ.' : ' Kết quả nhanh từ hai thế cờ liên tiếp.'}
        </p>
      )}
      {analysisStatus !== 'verified' && (
        <p className="text-[10px] text-zinc-500">Full Review kiểm tra lại kết quả; nhãn có thể thay đổi khi engine tìm sâu hơn.</p>
      )}
      {canShowBestMove && !showingBestMove && (
        <button onClick={() => setRevealedPosition(move.after)}
          className="self-start text-xs px-2.5 py-1.5 rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30">
          Xem nước đi tốt nhất
        </button>
      )}
      {canShowBestMove && showingBestMove && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-emerald-500/25 bg-emerald-950/30">
          <div className="text-xs font-semibold text-emerald-400">
            Nước máy ưu tiên: <span className="font-mono text-emerald-200">{bestMoveSan}</span>
          </div>
          {pvSanSequence.length > 1 && (
            <p className="text-xs text-zinc-400">Biến máy tính: <span className="font-mono text-emerald-300/80">{pvSanSequence.join(' → ')}</span></p>
          )}
          {onPlayBestMove && (
            <button onClick={onPlayBestMove} className="w-full py-2 rounded-md text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40">
              Thử nước tốt nhất
            </button>
          )}
        </div>
      )}
    </div>
  );
}
