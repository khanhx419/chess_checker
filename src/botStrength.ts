import { Chess } from 'chess.js';
import type { EngineEval, SearchOptions } from './engine';

export const MIN_ENGINE_ELO = 1320;

export function botSearchOptions(elo: number): SearchOptions {
  // Use Stockfish's calibrated limiter, rather than treating Skill Level as Elo.
  return { elo: Math.max(MIN_ENGINE_ELO, Math.min(3190, elo)), depth: 24, movetime: 600 };
}

export function chooseBotMove(fen: string, elo: number, evaluation: EngineEval, random = Math.random): string | undefined {
  const legal = new Chess(fen).moves({ verbose: true });
  const selected = evaluation.selectedMove ?? evaluation.bestMove;
  if (!legal.length) return;
  // Stockfish has no calibrated sub-1320 mode. Blend in legal novice moves;
  // these levels are explicitly approximate, not an online rating guarantee.
  const lapseChance = Math.max(0, Math.min(0.65, (MIN_ENGINE_ELO - elo) / 800));
  const alternatives = legal.filter(move => move.lan !== selected);
  if (alternatives.length && random() < lapseChance) {
    return alternatives[Math.min(alternatives.length - 1, Math.floor(random() * alternatives.length))].lan;
  }
  return legal.some(move => move.lan === selected) ? selected : legal[0].lan;
}
