import type { MoveNode } from '../store';
import { MoveBadge } from './MoveBadge';

interface Props {
  nodes: Record<string, MoveNode>;
  rootIds: string[];
  currentMoveId: string | null;
  goToMove: (id: string | null) => void;
  isMainLine?: boolean;
  depth?: number;
}

export function MoveListBranch({ nodes, rootIds, currentMoveId, goToMove, isMainLine = true, depth = 0 }: Props) {
  if (rootIds.length === 0 || depth > 20) return null;

  // Flatten the primary branch path
  const branchPath: MoveNode[] = [];
  let currId: string | undefined = rootIds[0];
  let safeCounter1 = 0;
  
  while (currId && nodes[currId] && safeCounter1 < 1000) {
    branchPath.push(nodes[currId]);
    currId = nodes[currId].childrenIds[0];
    safeCounter1++;
  }
  if (safeCounter1 >= 1000) console.error("Infinite loop detected in MoveListBranch flattening!");

  // Find variations (alternative children) at each step
  // and pair the branchPath into turns
  const turns = [];
  for (let i = 0; i < branchPath.length; i += 2) {
    turns.push({
      white: branchPath[i],
      black: branchPath[i + 1] || null
    });
  }

  return (
    <div className={`flex flex-col ${!isMainLine ? 'pl-2 border-l-2 border-zinc-700/50 my-1 ml-1' : ''}`}>
      {isMainLine ? (
        <div className="grid grid-cols-[3fr_3fr] gap-x-2 gap-y-1.5 text-sm">
           {turns.map((turn, tIdx) => (
             <div key={tIdx} className="contents">
                <TurnCell node={turn.white} currentMoveId={currentMoveId} goToMove={goToMove} turnNumber={Math.floor(branchPath.indexOf(turn.white)/2)+1} />
                <TurnCell node={turn.black} currentMoveId={currentMoveId} goToMove={goToMove} />
             </div>
           ))}
        </div>
      ) : (
        <div className="text-sm font-mono flex flex-wrap gap-1 items-center">
          {branchPath.map(node => (
            <span 
              key={node.id} 
              onClick={(e) => { e.stopPropagation(); goToMove(node.id); }}
              className={`px-1 rounded cursor-pointer ${currentMoveId === node.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {node.move.color === 'w' ? `${Math.floor(branchPath.indexOf(node)/2)+1}. ` : ''}{node.move.san}
            </span>
          ))}
        </div>
      )}

      {/* Render Sub Variations recursively */}
      {branchPath.map((node) => {
        if (node.childrenIds.length > 1) {
          return (
            <div key={`vars_${node.id}`} className="mt-1 mb-2 bg-zinc-800/30 p-2 rounded-lg">
              {node.childrenIds.slice(1).map(childId => (
                <MoveListBranch 
                  key={childId}
                  nodes={nodes}
                  rootIds={[childId]}
                  currentMoveId={currentMoveId}
                  goToMove={goToMove}
                  isMainLine={false}
                  depth={depth + 1}
                />
              ))}
            </div>
          )
        }
        return null;
      })}
    </div>
  );
}

function TurnCell({ node, currentMoveId, goToMove, turnNumber }: { node: MoveNode | null, currentMoveId: string | null, goToMove: (id: string | null) => void, turnNumber?: number }) {
  if (!node) return <div className="py-1 px-3 rounded bg-transparent flex items-center" />;
  
  return (
    <div 
      onClick={() => goToMove(node.id)}
      className={`relative py-1 px-3 rounded flex items-center justify-between gap-1 cursor-pointer transition-colors ${currentMoveId === node.id ? 'bg-zinc-700 shadow-inner' : 'bg-zinc-800/20 hover:bg-zinc-800/60'}`}
    >
      <div className="flex items-center gap-2">
        {turnNumber ? <span className="text-zinc-500 w-4 font-medium text-right text-xs">{turnNumber}.</span> : null}
        <span className="font-mono font-semibold text-zinc-300">{node.move.san}</span>
      </div>
      <MoveBadge type={node.classification} />
    </div>
  );
}
