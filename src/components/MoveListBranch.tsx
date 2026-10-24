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
  if (!rootIds.length || depth > 100) return null;
  const path: MoveNode[] = [];
  const visited = new Set<string>();
  let id: string | undefined = rootIds[0];
  while (id && nodes[id] && !visited.has(id)) {
    visited.add(id);
    path.push(nodes[id]);
    id = nodes[id].childrenIds[0];
  }
  const variations = (ids: string[], key: string) => ids.length ? (
    <div key={key} className="w-full my-1 ml-1 border-l-2 border-zinc-700 bg-zinc-800/30 p-2 rounded-lg" aria-label="Nhánh phụ">
      {ids.map(child => <MoveListBranch key={child} nodes={nodes} rootIds={[child]} currentMoveId={currentMoveId}
        goToMove={goToMove} isMainLine={false} depth={depth + 1} />)}
    </div>
  ) : null;

  return <div className="flex flex-wrap gap-1.5 items-center text-sm">
    {path.flatMap((node, index) => {
      const number = node.move.before.split(' ')[5];
      const prefix = node.move.color === 'w' ? `${number}.` : `${number}...`;
      return [
        <button key={node.id} type="button" data-move-id={node.id} aria-current={currentMoveId === node.id ? 'step' : undefined}
          onClick={() => goToMove(node.id)}
          className={`relative flex items-center justify-between gap-2 rounded px-2 py-1 transition-colors ${isMainLine ? 'grow basis-[45%]' : ''} ${currentMoveId === node.id ? 'bg-zinc-700 text-white' : 'bg-zinc-800/20 text-zinc-300 hover:bg-zinc-800/60'}`}>
          <span className="font-mono"><span className="text-xs text-zinc-500 mr-1">{prefix}</span>{node.move.san}</span>
          <MoveBadge type={node.classification} />
        </button>,
        index === 0 ? variations(rootIds.slice(1), `roots_${node.id}`) : null,
        variations(node.childrenIds.slice(1), `vars_${node.id}`),
      ];
    })}
  </div>;
}
