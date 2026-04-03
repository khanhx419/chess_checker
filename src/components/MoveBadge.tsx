interface MoveBadgeProps {
  type: string;
}

export function MoveBadge({ type }: MoveBadgeProps) {
  if (!type || type === 'none') return null;

  const badges: Record<string, { bg: string, text: string, label: string }> = {
    'brilliant': { bg: 'bg-teal-400', text: 'text-teal-950', label: '!!' },
    'great': { bg: 'bg-blue-400', text: 'text-blue-950', label: '!' },
    'best': { bg: 'bg-green-500', text: 'text-green-950', label: '★' },
    'excellent': { bg: 'bg-emerald-400', text: 'text-emerald-950', label: '✓' },
    'good': { bg: 'bg-zinc-400', text: 'text-zinc-950', label: '👍' },
    'inaccuracy': { bg: 'bg-yellow-400', text: 'text-yellow-950', label: '?' },
    'mistake': { bg: 'bg-orange-500', text: 'text-orange-950', label: '?!' },
    'blunder': { bg: 'bg-red-500', text: 'text-red-950', label: 'X' },
    'book': { bg: 'bg-amber-700', text: 'text-amber-50', label: '📖' },
  };

  const badge = badges[type] || badges['good'];

  return (
    <span 
      className={`absolute -top-2 -right-2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-sm ${badge.bg} ${badge.text}`}
      title={type}
    >
      {badge.label}
    </span>
  );
}
