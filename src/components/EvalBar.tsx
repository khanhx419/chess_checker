import type { EngineEval } from '../useEngine';

interface EvalBarProps {
  evaluation: EngineEval;
}

export function EvalBar({ evaluation }: EvalBarProps) {
  let whiteWinPercent = 50;

  if (evaluation.mate !== undefined) {
    whiteWinPercent = (evaluation.mateWinner === 'w' || (!evaluation.mateWinner && evaluation.mate > 0)) ? 100 : 0;
  } else if (evaluation.cp !== undefined) {
    const cp = evaluation.cp;
    // Logistic function: Win% = 50 + 50 * (2 / (1 + exp(-0.004 * cp)) - 1)
    whiteWinPercent = 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
  }

  whiteWinPercent = Math.max(0, Math.min(100, whiteWinPercent));

  let scoreText = '';
  if (evaluation.mate !== undefined) {
    scoreText = `M${Math.abs(evaluation.mate)}`;
  } else if (evaluation.cp !== undefined) {
    const cp = evaluation.cp / 100;
    scoreText = cp > 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);
    if (cp === 0) scoreText = '0.0';
  }

  return (
    <div className="w-8 shrink-0 self-stretch bg-zinc-800 rounded-lg overflow-hidden flex flex-col justify-end relative shadow-inner border border-zinc-700/50">
      <div 
        className="w-full bg-slate-100 transition-all duration-300 ease-out flex justify-center"
        style={{ height: `${whiteWinPercent}%` }}
      ></div>
      
      {/* Dynamic text positioning based on who is leading */}
      <div className={`absolute w-full text-center text-xs font-bold py-1 z-10 transition-colors
        ${whiteWinPercent >= 50 ? 'bottom-0 text-zinc-600' : 'top-0 text-zinc-300'}`}>
        {scoreText}
      </div>
    </div>
  );
}
