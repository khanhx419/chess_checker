import { Chess } from 'chess.js';
import type { MoveNode } from './store';
import { evaluationScore } from './engine';
import type { EngineEval } from './engine';
import { isBookMove } from './utils/openings';
import { brilliantSacrifice } from './brilliance';

export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'brilliant' | 'book' | 'none' | 'uncertain';
function hasScore(evaluation: EngineEval) {
  return !evaluation.error && (Number.isFinite(evaluation.cp) || Number.isFinite(evaluation.mate));
}

export function isKnownOpening(node: MoveNode, sanHistory: string[]) {
  if (!isBookMove(sanHistory)) return false;
  // A custom PGN start must not inherit opening labels from SAN alone.
  try {
    const chess = new Chess();
    for (const san of sanHistory) chess.move(san);
    return chess.fen() === node.move.after;
  } catch { return false; }
}

/** A centipawn heuristic, not a calibrated winning probability. */
export function moveLoss(node: MoveNode, before: EngineEval, after: EngineEval, playedEvaluation?: EngineEval): number {
  const candidate = playedEvaluation ?? after;
  const side = node.move.color === 'w' ? 1 : -1;
  const played = `${node.move.from}${node.move.to}${node.move.promotion ?? ''}`;
  if (played === before.bestMove && !playedEvaluation) return 0;
  // Mate distance changes are not centipawn losses. Classification handles a
  // change of winner separately; a longer forced mate is still winning.
  if (before.mate !== undefined || candidate.mate !== undefined) return 0;
  return Math.max(0, (evaluationScore(before) - evaluationScore(candidate)) * side);
}

export function classifyMove(node: MoveNode, before: EngineEval, after: EngineEval, sanHistory: string[], playedEvaluation?: EngineEval, alternativeEvaluation?: EngineEval): Classification {
  if (before.fen !== node.move.before || after.fen !== node.move.after ||
    (playedEvaluation && playedEvaluation.fen !== node.move.before) ||
    !hasScore(before) || !hasScore(after) || (playedEvaluation && !hasScore(playedEvaluation))) return 'none';
  if (isKnownOpening(node, sanHistory)) return 'book';
  if (brilliantSacrifice(node.move, before, after, playedEvaluation, alternativeEvaluation)) return 'brilliant';
  const played = `${node.move.from}${node.move.to}${node.move.promotion ?? ''}`;
  // An after-position search can see deeper tactics. Never call the root
  // search's own best move a mistake because the independent scores drifted.
  if (played === before.bestMove && (!playedEvaluation || playedEvaluation === before ||
      (playedEvaluation.mate === before.mate && Math.abs(evaluationScore(playedEvaluation) - evaluationScore(before)) <= 25))) return 'best';

  const candidate = playedEvaluation ?? after;
  const side = node.move.color === 'w' ? 1 : -1;
  const mateSide = (evaluation: EngineEval) => evaluation.mate === undefined ? 0 : Math.sign(evaluationScore(evaluation) * side);
  const mateBefore = mateSide(before);
  const mateAfter = mateSide(candidate);
  if (mateAfter > 0) return 'excellent';
  if (mateBefore < 0 && mateAfter < 0) return 'excellent';
  if (mateBefore > 0) {
    // Losing a forced mate while retaining a large advantage is different from
    // turning that win into a level/lost position.
    return mateAfter < 0 || evaluationScore(candidate) * side < 200 ? 'blunder' : 'mistake';
  }
  if (mateAfter < 0) return 'blunder';
  if (mateBefore < 0) return 'excellent';

  const loss = moveLoss(node, before, after, playedEvaluation);
  // Small centipawn changes are normal search noise. Keep near-equivalent
  // continuations out of the error categories.
  return loss <= 25 ? 'excellent' : loss <= 70 ? 'good' : loss <= 150 ? 'inaccuracy' : loss <= 300 ? 'mistake' : 'blunder';
}

export function analyzedNode(node: MoveNode, before: EngineEval, after: EngineEval, sanHistory: string[], playedEvaluation?: EngineEval, alternativeEvaluation?: EngineEval): Partial<MoveNode> {
  return {
    classification: classifyMove(node, before, after, sanHistory, playedEvaluation, alternativeEvaluation),
    score: evaluationScore(after), scoreBefore: evaluationScore(before),
    engineBestMove: before.bestMove, pvLine: before.pvLine,
    positionEvaluation: after, beforeEvaluation: before, moveEvaluation: playedEvaluation, alternativeEvaluation,
    moveLossCp: moveLoss(node, before, after, playedEvaluation),
    reviewDepth: Math.min(before.depth, playedEvaluation?.depth ?? after.depth),
    analysisStatus: 'quick',
  };
}
