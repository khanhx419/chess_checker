import { create } from 'zustand';
import { Chess, Move } from 'chess.js';

export type AppMode = 'preview' | 'play';
export type PlayerColor = 'w' | 'b';
export type GameOverState = { winner: 'w' | 'b' | 'draw' | null; reason: string } | null;

export interface MoveNode {
  id: string; // generated UUID or unique string
  move: Move;
  classification: string;
  score: number | null;
  parentId: string | null;
  childrenIds: string[];
}

interface GameState {
  chess: Chess;
  fen: string;
  nodes: Record<string, MoveNode>;
  rootNodeIds: string[]; // typically just one, but supports multiple starting moves if needed
  currentMoveId: string | null;
  mode: AppMode;
  playerColor: PlayerColor;
  botElo: number;
  gameOver: GameOverState;
  updateNode: (id: string, data: Partial<MoveNode>) => void;
  makeMove: (move: { from: string; to: string; promotion?: string }) => boolean;
  resetGame: (config?: { playerColor?: PlayerColor; botElo?: number }) => void;
  loadPgn: (pgn: string) => boolean;
  goToMove: (id: string | null) => void;
  getActiveLine: () => MoveNode[];
  setMode: (mode: AppMode) => void;
  setPlayerColor: (color: PlayerColor) => void;
  setBotElo: (elo: number) => void;
  setGameOver: (state: GameOverState) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  nodes: {},
  rootNodeIds: [],
  currentMoveId: null,
  mode: 'preview',
  playerColor: 'w',
  botElo: 1500,
  gameOver: null,
  updateNode: (id, data) => {
    const { nodes } = get();
    if (nodes[id]) {
      set({ nodes: { ...nodes, [id]: { ...nodes[id], ...data } } });
    }
  },
  getActiveLine: () => {
    const { nodes, currentMoveId } = get();
    const line: MoveNode[] = [];
    let curr = currentMoveId;
    while (curr && nodes[curr]) {
      line.unshift(nodes[curr]);
      curr = nodes[curr].parentId;
    }
    return line;
  },
  setMode: (mode) => set({ mode }),
  setPlayerColor: (playerColor) => set({ playerColor }),
  setBotElo: (botElo) => set({ botElo }),
  setGameOver: (gameOver) => set({ gameOver }),

  makeMove: (move) => {
    const { currentMoveId, nodes, rootNodeIds } = get();
    try {
      let tempChess = new Chess();
      if (currentMoveId && nodes[currentMoveId]) {
        tempChess.load(nodes[currentMoveId].move.after);
      }
      
      const result = tempChess.move(move);
      if (result) {
        // Evaluate if this move already exists in children
        let existingChildId: string | null = null;
        let parentNode = currentMoveId ? nodes[currentMoveId] : null;
        const childrenToCheck = parentNode ? parentNode.childrenIds : rootNodeIds;
        
        for (const childId of childrenToCheck) {
          if (nodes[childId].move.san === result.san) {
            existingChildId = childId;
            break;
          }
        }

        let newGameOver: GameOverState = null;
        if (tempChess.isCheckmate()) {
          newGameOver = { winner: tempChess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
        } else if (tempChess.isDraw()) {
          let reason = 'draw';
          if (tempChess.isStalemate()) reason = 'stalemate';
          else if (tempChess.isThreefoldRepetition()) reason = 'repetition';
          else if (tempChess.isInsufficientMaterial()) reason = 'insufficient material';
          else reason = '50-move rule';
          newGameOver = { winner: 'draw', reason };
        }

        if (existingChildId) {
          // Move already exists, just navigate to it
          // Wait, making a main line move creates a forward step. It might be a variation.
          // In mode = play, we might want to update game over.
          set({ 
            chess: tempChess, 
            fen: tempChess.fen(), 
            currentMoveId: existingChildId,
            gameOver: newGameOver,
          });
          return true;
        }

        // Create new node
        const newNodeId = Math.random().toString(36).substring(2, 10);
        const newNode: MoveNode = {
          id: newNodeId,
          move: result,
          classification: 'none',
          score: null,
          parentId: currentMoveId,
          childrenIds: [],
        };

        const newNodes = { ...nodes, [newNodeId]: newNode };
        let newRootIds = [...rootNodeIds];

        if (currentMoveId && newNodes[currentMoveId]) {
          newNodes[currentMoveId] = {
            ...newNodes[currentMoveId],
            childrenIds: [...newNodes[currentMoveId].childrenIds, newNodeId],
          };
        } else {
          newRootIds.push(newNodeId);
        }

        set({ 
          chess: tempChess, 
          fen: tempChess.fen(), 
          nodes: newNodes,
          rootNodeIds: newRootIds,
          currentMoveId: newNodeId,
          gameOver: newGameOver,
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('makeMove Error:', e);
      return false;
    }
  },

  resetGame: (config) => {
    const newChess = new Chess();
    set({ 
      chess: newChess, 
      fen: newChess.fen(), 
      nodes: {}, 
      rootNodeIds: [],
      currentMoveId: null, 
      gameOver: null,
      ...(config || {})
    });
  },

  loadPgn: (pgn) => {
    const newChess = new Chess();
    try {
      newChess.loadPgn(pgn);
      const newHistory = newChess.history({ verbose: true }) as Move[];
      
      // Convert linear history to nodes
      const newNodes: Record<string, MoveNode> = {};
      const newRootIds: string[] = [];
      let parentId: string | null = null;
      let lastId: string | null = null;
      
      newHistory.forEach((move, i) => {
        const id = `orig_${i}`;
        newNodes[id] = {
          id,
          move,
          classification: 'none',
          score: null,
          parentId,
          childrenIds: [],
        };
        if (parentId) {
          newNodes[parentId].childrenIds.push(id);
        } else {
          newRootIds.push(id);
        }
        parentId = id;
        lastId = id;
      });

      set({ 
        chess: newChess, 
        fen: newChess.fen(), 
        nodes: newNodes,
        rootNodeIds: newRootIds,
        currentMoveId: lastId,
        gameOver: null
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  goToMove: (id) => {
    const { nodes } = get();
    if (id === null) {
      set({ currentMoveId: null, fen: new Chess().fen() });
    } else if (nodes[id]) {
      set({ currentMoveId: id, fen: nodes[id].move.after });
    }
  }
}));

