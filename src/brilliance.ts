import { Chess } from 'chess.js';
import type { Color, Move, PieceSymbol } from 'chess.js';
import { evaluationScore } from './engine';
import type { EngineEval } from './engine';

const MATERIAL: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MIN_SACRIFICE = 150;

export interface BrilliantSacrifice {
  piece: 'n' | 'b' | 'r' | 'q';
  square: string;
  materialDropCp: number;
  line: string[];
}

function material(chess: Chess, color: Color): number {
  return chess.board().flat().reduce((total, piece) =>
    total + (piece ? MATERIAL[piece.type] * (piece.color === color ? 1 : -1) : 0), 0);
}

function isPieceOffer(move: Move) {
  return ['n', 'b', 'r', 'q'].includes(move.piece) && !move.promotion;
}

// A capture followed by an ordinary recapture/exchange is not a sacrifice.
// Check every legal immediate recapture, rather than only the engine's PV.
function canRecoverImmediately(chess: Chess, capture: Move, baseline: number, color: Color): boolean {
  for (const reply of chess.moves({ verbose: true })) {
    if (!reply.captured || reply.to !== capture.to) continue;
    chess.move(reply);
    const recovered = baseline - material(chess, color) < MIN_SACRIFICE;
    chess.undo();
    if (recovered) return true;
  }
  return false;
}

/** Cheap gate for requesting a deeper, restricted search of a possible offer. */
export function isSacrificeCandidate(move: Move): boolean {
  if (!isPieceOffer(move)) return false;
  try {
    const before = new Chess(move.before);
    if (before.moves().length < 2) return false;
    const baseline = material(before, move.color);
    const chess = new Chess(move.after);
    for (const reply of chess.moves({ verbose: true })) {
      if (reply.to !== move.to || reply.captured !== move.piece) continue;
      chess.move(reply);
      const offered = baseline - material(chess, move.color) >= MIN_SACRIFICE &&
        !canRecoverImmediately(chess, reply, baseline, move.color);
      chess.undo();
      if (offered) return true;
    }
  } catch { /* Invalid/stale moves are never candidates. */ }
  return false;
}

function scored(evaluation: EngineEval) {
  return evaluation.finished && !evaluation.error &&
    (Number.isFinite(evaluation.cp) || Number.isFinite(evaluation.mate));
}

function stable(evaluation: EngineEval) {
  const previous = evaluation.previous;
  return !previous || ((previous.mate === undefined) === (evaluation.mate === undefined) &&
    (previous.cp === undefined || evaluation.cp === undefined || Math.abs(previous.cp - evaluation.cp) <= 60));
}

/**
 * App-specific, conservative brilliant heuristic; Stockfish does not emit this
 * label. A deep same-root near-best result must preserve a playable position,
 * and its legal PV must demonstrate an actual non-pawn material sacrifice.
 * Delayed/positional offers which the PV declines intentionally remain Best.
 */
export function brilliantSacrifice(
  move: Move, before: EngineEval, after: EngineEval, played?: EngineEval,
  alternativeEvaluation?: EngineEval,
): BrilliantSacrifice | undefined {
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  if (!isPieceOffer(move) || !played || before.fen !== move.before || after.fen !== move.after ||
    !!before.searchMoves?.length || !!after.searchMoves?.length ||
    played.fen !== move.before || played.searchMoves?.length !== 1 || played.searchMoves[0] !== uci ||
    played.bestMove !== uci || played.pvLine?.[0] !== uci ||
    !scored(before) || !scored(played) || !scored(after) ||
    before.depth < 16 || played.depth < 16 || !stable(before) || !stable(played)) return;

  const side = move.color === 'w' ? 1 : -1;
  const rootScore = evaluationScore(before) * side;
  const playedScore = evaluationScore(played) * side;
  const afterScore = evaluationScore(after) * side;
  // The unrestricted root can already show a forced win precisely BECAUSE of
  // the sacrifice. Check the best alternative with that move excluded before
  // deciding that the position was easily winning without the sacrifice.
  if (alternativeEvaluation) {
    if (alternativeEvaluation.fen !== move.before || !scored(alternativeEvaluation) ||
      alternativeEvaluation.depth < 16 || !stable(alternativeEvaluation) ||
      !alternativeEvaluation.searchMoves?.length || alternativeEvaluation.searchMoves.includes(uci) ||
      evaluationScore(alternativeEvaluation) * side >= 250) return;
  } else if (rootScore >= 250) return;
  // Mate distances are not centipawns: preserving a winning mate is still
  // near-best even if the restricted search finds a longer mating sequence.
  const preservesMate = before.mate !== undefined && played.mate !== undefined && rootScore > 0 && playedScore > 0;
  if (playedScore < -50 || afterScore < -50 || (!preservesMate && rootScore - playedScore > 25)) return;

  try {
    const chess = new Chess(move.before);
    if (chess.moves().length < 2) return;
    if (alternativeEvaluation) {
      const legalAlternatives = chess.moves({ verbose: true }).map(legal => legal.lan).filter(lan => lan !== uci);
      const searched = new Set(alternativeEvaluation.searchMoves);
      if (searched.size !== legalAlternatives.length || legalAlternatives.some(lan => !searched.has(lan))) return;
    }
    const baseline = material(chess, move.color);
    const legalLine: string[] = [];
    let sacrificed = false;
    for (const [index, lan] of played.pvLine.slice(0, 5).entries()) {
      const step = chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
      legalLine.push(lan);
      if (sacrificed) {
        // There must be a legal continuation after accepting the offer, with
        // the material investment still present after the mover's next turn.
        const drop = baseline - material(chess, move.color);
        return drop >= MIN_SACRIFICE ? {
          piece: move.piece as BrilliantSacrifice['piece'], square: move.to,
          materialDropCp: drop, line: legalLine,
        } : undefined;
      }
      if (index % 2 === 1 && step.captured === move.piece && step.to === move.to &&
        baseline - material(chess, move.color) >= MIN_SACRIFICE &&
        !canRecoverImmediately(chess, step, baseline, move.color)) sacrificed = true;
    }
  } catch { /* Only a fully legal proof prefix can earn the label. */ }
  return;
}
