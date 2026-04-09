import { Move } from 'chess.js';

interface Props {
  classification: string;
  move: Move;
}

export function MoveExplanation({ classification, move }: Props) {
  if (classification === 'none' || !classification) return null;

  let title = '';
  let description = '';
  let color = '';

  const san = move.san;
  const isWhite = move.color === 'w';
  const player = isWhite ? 'Trắng' : 'Đen';

  switch (classification) {
    case 'blunder':
      title = 'Nước đi lỗi (Blunder)';
      description = `Nước đi ${san} của ${player} đánh mất hoàn toàn thế trận. Đây là một sai lầm nghiêm trọng!`;
      color = 'text-red-500 bg-red-500/10 border-red-500/30';
      break;
    case 'mistake':
      title = 'Nước sai lầm (Mistake)';
      description = `${san} là một nước đi không tốt, làm giảm cơ hội chiến thắng của ${player}.`;
      color = 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      break;
    case 'inaccuracy':
      title = 'Nước đi thiếu chính xác (Inaccuracy)';
      description = `${san} tuy không phải lỗi nặng nhưng có những lựa chọn khác tối ưu hơn.`;
      color = 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      break;
    case 'good':
      title = 'Nước đi tốt (Good)';
      description = `${san} là một nước đi ổn định và an toàn.`;
      color = 'text-zinc-300 bg-zinc-400/10 border-zinc-400/30';
      break;
    case 'excellent':
      title = 'Nước đi xuất sắc (Excellent)';
      description = `${san} là một sự lựa chọn rất hay, gây sức ép đáng kể.`;
      color = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      break;
    case 'best':
      title = 'Nước đi tốt nhất (Best)';
      description = `${san} chính là ý tưởng hoàn hảo nhất trong tình huống này.`;
      color = 'text-green-500 bg-green-500/10 border-green-500/30';
      break;
    case 'brilliant':
      title = 'Nước đi thiên tài (Brilliant)';
      description = `Thật tuyệt vời! ${san} là một nước đi chiến thuật xuất sắc hiếm thấy.`;
      color = 'text-teal-400 bg-teal-400/10 border-teal-400/30';
      break;
    case 'book':
      title = 'Nước khai cuộc (Book)';
      description = `${san} là nước đi chuẩn mực theo lý thuyết khai cuộc.`;
      color = 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      break;
    default:
      return null;
  }

  return (
    <div className={`p-4 rounded-lg border flex flex-col gap-1 transition-all animate-in fade-in slide-in-from-bottom-2 ${color}`}>
      <h4 className="font-bold text-sm tracking-wide">{title}</h4>
      <p className="text-sm opacity-90">{description}</p>
    </div>
  );
}
