interface EvalGraphProps {
  scores: number[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function EvalGraph({ scores, currentIndex, onSelect }: EvalGraphProps) {
  if (scores.length === 0) return (
    <div className="w-full h-16 bg-zinc-800 rounded-lg flex items-center justify-center text-xs opacity-50">
       Không có dữ liệu
    </div>
  );

  const maxScore = 1500; // Cap at +/- 1500 cp
  
  // Convert score to Y coordinate (0 is top, 100 is bottom)
  // +1500 -> 0%
  // 0 -> 50%
  // -1500 -> 100%
  const getPoint = (score: number, index: number) => {
    let cp = Math.max(-maxScore, Math.min(maxScore, score));
    // Dữ liệu scores này đôi khi mang số siêu bự if Mate (10000). Clamp nó lại.
    const yPercent = 50 - (cp / maxScore) * 50;
    const xPercent = (index / Math.max(1, scores.length - 1)) * 100;
    return `${xPercent},${yPercent}`;
  };

  const points = scores.map((s, i) => getPoint(s, i)).join(' ');
  // Create an area path that fills down to bottom (y=100)
  const pathData = `M0,100 L${points} L100,100 Z`;
  const pathDataWhite = `M0,0 L${points} L100,0 Z`;

  return (
    <div className="relative w-full h-16 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 select-none">
      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d={pathData} fill="#1e1e1e" /> {/* Phần của Đen (đen ở nửa dưới) */}
        <path d={pathDataWhite} fill="#f1f5f9" /> {/* Phần của Trắng (trắng ở nửa trên) */}
        
        {/* Đường mốc 0 */}
        <line x1="0" y1="50" x2="100" y2="50" stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="2" />
        
        {/* Đường vẽ theo các điểm */}
        <polyline
          points={points}
          fill="none"
          stroke="#10b981"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Current move indicator */}
        {currentIndex >= 0 && currentIndex < scores.length && (
          <line 
            x1={(currentIndex / Math.max(1, scores.length - 1)) * 100}
            y1="0"
            x2={(currentIndex / Math.max(1, scores.length - 1)) * 100}
            y2="100"
            stroke="#f59e0b"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      
      {/* Click interaction layer */}
      <div className="absolute inset-0 flex">
        {scores.map((_, i) => (
          <div 
            key={i} 
            className="flex-1 h-full hover:bg-white/10 cursor-pointer"
            onMouseEnter={() => onSelect(i)}
            onClick={() => onSelect(i)}
          />
        ))}
      </div>
    </div>
  );
}
