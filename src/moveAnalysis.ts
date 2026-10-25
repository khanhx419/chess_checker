import { cacheEvaluation, evaluationScore } from './engine';
import type { EngineEval, UciEngine } from './engine';
import { Chess } from 'chess.js';
import { isSacrificeCandidate } from './brilliance';

export const QUICK_SEARCH = { depth: 20, movetime: 900 };
const VERIFY_SEARCH = { depth: 24, movetime: 2000 };

export interface MoveAnalysis {
  before: EngineEval;
  after: EngineEval;
  played: EngineEval;
  alternative?: EngineEval;
  status: 'quick' | 'verified';
  uncertain?: boolean;
}

export function cacheMoveAnalysis(result: MoveAnalysis): MoveAnalysis {
  cacheEvaluation(result.before);
  const after = cacheEvaluation(result.after) ?? result.after;
  return { ...result, after };
}

function unstable(evaluation: EngineEval) {
  if (evaluation.finished && evaluation.depth === 0 && !evaluation.bestMove) return false;
  const previous = evaluation.previous;
  return evaluation.depth < 12 || !!(previous && (
    (previous.mate === undefined) !== (evaluation.mate === undefined) ||
    (previous.cp !== undefined && evaluation.cp !== undefined && Math.abs(previous.cp - evaluation.cp) > 60)
  ));
}

function boardRefutesMove(played: EngineEval, after: EngineEval, side: number) {
  // Material-dependent CP scaling can change magnitudes across FENs, but it
  // cannot explain a playable/winning root turning into a clearly lost board.
  const rootScore = evaluationScore(played) * side;
  const boardScore = evaluationScore(after) * side;
  return (rootScore >= -50 && boardScore <= -200) || (rootScore >= 200 && boardScore <= 0);
}

async function compareMoves(engine: UciEngine, before: EngineEval, playedUci: string, signal: AbortSignal, verify = false) {
  const moves = [before.bestMove!, playedUci];
  const comparison = await engine.analyze(before.fen, {
    signal, searchMoves: moves, multiPv: 2,
    depth: verify ? VERIFY_SEARCH.depth : Math.max(12, before.depth), movetime: verify ? 1800 : 700,
  });
  const variations = comparison.variations;
  const candidate = variations?.find(entry => entry.bestMove === playedUci);
  if (!candidate || variations?.length !== 2 || variations.some(entry => entry.depth !== candidate.depth)) return;
  // This restricted pair includes the unrestricted search's best move. Keep
  // its provenance, so it cannot overwrite the unrestricted board cache.
  return {
    before: { ...variations[0], searchMoves: undefined, comparisonMoves: moves },
    played: { ...candidate, searchMoves: [playedUci], comparisonMoves: moves },
  };
}

// Compare the played move with the best move at the SAME root. Restricted
// searches must never enter the unrestricted position cache.
export async function analyzeMove(
  engine: UciEngine, before: EngineEval, after: EngineEval, playedUci: string,
  signal: AbortSignal, book = false,
): Promise<MoveAnalysis> {
  const side = before.fen.split(' ')[1] === 'w' ? 1 : -1;
  if (book || !before.bestMove) return { before, after, played: before.bestMove === playedUci ? before : after, status: 'quick' };
  const move = new Chess(before.fen).move({ from: playedUci.slice(0, 2), to: playedUci.slice(2, 4), promotion: playedUci[4] });
  const sacrifice = isSacrificeCandidate(move);
  const pair = before.bestMove !== playedUci ? await compareMoves(engine, before, playedUci, signal) : undefined;
  if (pair) before = pair.before;
  let played = pair?.played ?? (before.bestMove === playedUci && !sacrifice ? before : await engine.analyze(before.fen, {
    signal, searchMoves: [playedUci], depth: Math.max(12, before.depth), movetime: 700,
  }));
  const loss = (evaluationScore(before) - evaluationScore(played)) * side;
  // Modern Stockfish normalizes cp by material. After a capture, raw cp from
  // the child FEN need not equal cp from its parent. Grade the same-root pair.
  const needsVerification = sacrifice || boardRefutesMove(played, after, side) ||
    (!pair && before.bestMove !== playedUci) || unstable(before) || unstable(played) ||
    Math.abs(loss) > 70 || (before.mate !== undefined && played.mate === undefined);
  if (!needsVerification) return { before, after, played, status: 'quick' };

  const deeperBefore = await engine.analyze(before.fen, { ...VERIFY_SEARCH, signal });
  before = deeperBefore;
  const deeperPair = before.bestMove !== playedUci ? await compareMoves(engine, before, playedUci, signal, true) : undefined;
  if (deeperPair) before = deeperPair.before;
  const deeperPlayed = deeperPair?.played ?? (before.bestMove === playedUci && !sacrifice ? before : await engine.analyze(before.fen, {
    signal, searchMoves: [playedUci], depth: Math.max(12, before.depth), movetime: 1800,
  }));
  played = deeperPlayed;
  // The bar still evaluates the actual resulting board, including the reply PV.
  const deeperAfter = await engine.analyze(after.fen, { signal, depth: 24, movetime: 1400 });
  if (deeperAfter.depth >= after.depth) after = deeperAfter;
  const alternatives = sacrifice ? new Chess(before.fen).moves({ verbose: true }).map(legal => legal.lan).filter(lan => lan !== playedUci) : [];
  const alternative = alternatives.length ? await engine.analyze(before.fen, {
    signal, searchMoves: alternatives, depth: Math.max(16, before.depth), movetime: 1200,
  }) : undefined;
  const sameMate = before.mate !== undefined && played.mate !== undefined &&
    Math.sign(evaluationScore(before)) === Math.sign(evaluationScore(played));
  const rootContradiction = !sameMate && (evaluationScore(played) - evaluationScore(before)) * side > 100;
  const uncertain = boardRefutesMove(played, after, side) || (!deeperPair && before.bestMove !== playedUci) || rootContradiction ||
    ((before.depth < 12 || played.depth < 12) && before.mate === undefined && played.mate === undefined) ||
    (before.bestMove !== playedUci && (unstable(before) || unstable(played)));
  return { before, after, played, alternative, status: 'verified', uncertain };
}
