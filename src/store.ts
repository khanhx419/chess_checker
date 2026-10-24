import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import type { EngineEval } from './engine';
import { getEngineProfile, setEngineProfile as configureEngine } from './engine';
import type { EngineProfile } from './engine';

export type AppMode = 'preview' | 'play';
export type PlayerColor = 'w' | 'b';
export type GameOverState = { winner: 'w' | 'b' | 'draw' | null; reason: string } | null;

export interface MoveNode {
  id: string;
  move: Move;
  classification: string;
  score: number | null;
  scoreBefore?: number | null;
  parentId: string | null;
  childrenIds: string[];
  // Recommendation BEFORE the move, for explaining an alternative.
  engineBestMove?: string;
  pvLine?: string[];
  // Evaluation AFTER the move, for the board and its next-move hint.
  positionEvaluation?: EngineEval;
  beforeEvaluation?: EngineEval;
  moveEvaluation?: EngineEval;
  alternativeEvaluation?: EngineEval;
  moveLossCp?: number;
  analysisStatus?: 'quick' | 'verified' | 'reviewing' | 'uncertain';
  reviewDepth?: number;
}

interface GameState {
  engineProfile: EngineProfile;
  setEngineProfile: (profile: EngineProfile) => void;
  chess: Chess;
  fen: string;
  initialFen: string;
  gameVersion: number;
  nodes: Record<string, MoveNode>;
  rootNodeIds: string[];
  currentMoveId: string | null;
  preferredChildren: Record<string, string>;
  mode: AppMode;
  playerColor: PlayerColor;
  botElo: number;
  gameOver: GameOverState;
  updateNode: (id: string, data: Partial<MoveNode>) => void;
  updateNodes: (updates: Record<string, Partial<MoveNode>>) => void;
  makeMove: (move: { from: string; to: string; promotion?: string }, engineBestMove?: string) => boolean;
  deleteNode: (id: string) => void;
  resetGame: (config?: { playerColor?: PlayerColor; botElo?: number }) => void;
  loadPgn: (pgn: string) => boolean;
  goToMove: (id: string | null) => void;
  getActiveLine: () => MoveNode[];
  getSelectedLine: () => MoveNode[];
  setMode: (mode: AppMode) => void;
  setPlayerColor: (color: PlayerColor) => void;
  setBotElo: (elo: number) => void;
  setGameOver: (state: GameOverState) => void;
}

function ancestors(nodes: Record<string, MoveNode>, id: string | null) {
  const line: MoveNode[] = [];
  const visited = new Set<string>();
  while (id && nodes[id] && !visited.has(id)) {
    visited.add(id);
    line.unshift(nodes[id]);
    id = nodes[id].parentId;
  }
  return line;
}

function gameResult(chess: Chess): GameOverState {
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  if (!chess.isDraw()) return null;
  const reason = chess.isStalemate() ? 'stalemate' : chess.isThreefoldRepetition() ? 'repetition' :
    chess.isInsufficientMaterial() ? 'insufficient material' : '50-move rule';
  return { winner: 'draw', reason };
}

function chessAt(state: Pick<GameState, 'initialFen' | 'nodes'>, id: string | null) {
  const chess = new Chess(state.initialFen);
  for (const node of ancestors(state.nodes, id)) {
    chess.move({ from: node.move.from, to: node.move.to, promotion: node.move.promotion });
  }
  return chess;
}

export const useGameStore = create<GameState>((set, get) => ({
  engineProfile: getEngineProfile(),
  setEngineProfile: profile => {
    if (profile === get().engineProfile) return;
    configureEngine(profile);
    const nodes = Object.fromEntries(Object.entries(get().nodes).map(([id, node]) => [id, {
      ...node, classification: 'none', score: null, scoreBefore: undefined, engineBestMove: undefined,
      pvLine: undefined, positionEvaluation: undefined, beforeEvaluation: undefined, moveEvaluation: undefined, alternativeEvaluation: undefined,
      moveLossCp: undefined, analysisStatus: undefined, reviewDepth: undefined,
    }]));
    set({ engineProfile: profile, nodes, gameVersion: get().gameVersion + 1 });
  },
  chess: new Chess(), fen: new Chess().fen(), initialFen: new Chess().fen(), gameVersion: 0,
  nodes: {}, rootNodeIds: [], currentMoveId: null, preferredChildren: {},
  mode: 'preview', playerColor: 'w', botElo: 1500, gameOver: null,
  updateNode: (id, data) => get().updateNodes({ [id]: data }),
  updateNodes: updates => {
    const nodes = { ...get().nodes };
    let changed = false;
    for (const [id, data] of Object.entries(updates)) {
      if (nodes[id]) { nodes[id] = { ...nodes[id], ...data }; changed = true; }
    }
    if (changed) set({ nodes });
  },
  getActiveLine: () => ancestors(get().nodes, get().currentMoveId),
  getSelectedLine: () => {
    const { nodes, rootNodeIds, preferredChildren } = get();
    const line = get().getActiveLine();
    const visited = new Set(line.map(node => node.id));
    let parent = line.at(-1);
    while (true) {
      const children = parent ? parent.childrenIds : rootNodeIds;
      const preferred = preferredChildren[parent?.id ?? 'root'];
      const id = children.includes(preferred) ? preferred : children[0];
      if (!id || !nodes[id] || visited.has(id)) break;
      parent = nodes[id];
      line.push(parent);
      visited.add(id);
    }
    return line;
  },
  setMode: mode => set({ mode }),
  setPlayerColor: playerColor => set({ playerColor }),
  setBotElo: botElo => set({ botElo }),
  setGameOver: gameOver => set({ gameOver }),
  deleteNode: id => {
    const state = get();
    if (!state.nodes[id]) return;
    const nodes = { ...state.nodes };
    const removed = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const next = pending.pop()!;
      if (removed.has(next) || !nodes[next]) continue;
      removed.add(next);
      pending.push(...nodes[next].childrenIds);
    }
    const parentId = nodes[id].parentId;
    if (parentId) nodes[parentId] = { ...nodes[parentId], childrenIds: nodes[parentId].childrenIds.filter(child => child !== id) };
    removed.forEach(child => delete nodes[child]);
    const currentMoveId = state.currentMoveId && removed.has(state.currentMoveId) ? parentId : state.currentMoveId;
    const preferredChildren = Object.fromEntries(Object.entries(state.preferredChildren).filter(([parent, child]) => !removed.has(parent) && !removed.has(child)));
    const chess = chessAt({ initialFen: state.initialFen, nodes }, currentMoveId);
    set({ nodes, rootNodeIds: state.rootNodeIds.filter(root => root !== id), currentMoveId, preferredChildren,
      chess, fen: chess.fen(), gameOver: gameResult(chess) });
  },
  makeMove: (move, engineBestMove) => {
    const state = get();
    try {
      // Replay ancestors to retain repetition history and custom PGN start FEN.
      const chess = chessAt(state, state.currentMoveId);
      const result = chess.move(move);
      const children = state.currentMoveId ? state.nodes[state.currentMoveId].childrenIds : state.rootNodeIds;
      const existing = children.find(id => state.nodes[id].move.lan === result.lan);
      if (existing) { get().goToMove(existing); return true; }
      const id = crypto.randomUUID();
      const node: MoveNode = { id, move: result, classification: 'none', score: null,
        parentId: state.currentMoveId, childrenIds: [], engineBestMove };
      const nodes = { ...state.nodes, [id]: node };
      if (state.currentMoveId) nodes[state.currentMoveId] = { ...nodes[state.currentMoveId], childrenIds: [...children, id] };
      set({ chess, fen: chess.fen(), nodes, currentMoveId: id, gameOver: gameResult(chess),
        rootNodeIds: state.currentMoveId ? state.rootNodeIds : [...state.rootNodeIds, id],
        preferredChildren: { ...state.preferredChildren, [state.currentMoveId ?? 'root']: id } });
      return true;
    } catch { return false; }
  },
  resetGame: config => {
    const chess = new Chess();
    set({ chess, fen: chess.fen(), initialFen: chess.fen(), gameVersion: get().gameVersion + 1,
      nodes: {}, rootNodeIds: [], currentMoveId: null, preferredChildren: {}, gameOver: null, ...config });
  },
  loadPgn: pgn => {
    if (!pgn.trim()) return false;
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      const initialFen = history[0]?.before ?? chess.fen();
      const nodes: Record<string, MoveNode> = {};
      const rootNodeIds: string[] = [];
      const preferredChildren: Record<string, string> = {};
      let parentId: string | null = null;
      for (const move of history) {
        const id = crypto.randomUUID();
        nodes[id] = { id, move, classification: 'none', score: null, parentId, childrenIds: [] };
        if (parentId) nodes[parentId].childrenIds.push(id);
        else rootNodeIds.push(id);
        preferredChildren[parentId ?? 'root'] = id;
        parentId = id;
      }
      set({ chess, fen: chess.fen(), initialFen, nodes, rootNodeIds, currentMoveId: parentId,
        preferredChildren, gameVersion: get().gameVersion + 1, gameOver: gameResult(chess), mode: 'preview' });
      return true;
    } catch { return false; }
  },
  goToMove: id => {
    const state = get();
    if (id !== null && !state.nodes[id]) return;
    const chess = chessAt(state, id);
    const preferredChildren = { ...state.preferredChildren };
    for (const node of ancestors(state.nodes, id)) preferredChildren[node.parentId ?? 'root'] = node.id;
    set({ currentMoveId: id, chess, fen: chess.fen(), gameOver: gameResult(chess), preferredChildren });
  },
}));
