import { useTheme } from '../hooks/useTheme';

interface PositionBadgeProps {
  position: number;
  total?: number;
}

export function PositionBadge({ position, total }: PositionBadgeProps) {
  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';
  
  let color: string;
  if (isF1) {
    color = position === 1 ? '#fbbf24' : position <= 3 ? '#c42040' : '#f4f4f5';
  } else {
    color = position === 1 ? 'text-yellow-400' : position <= 3 ? 'text-orange-400' : 'text-white';
  }
  
  const fontFamily = isF1 ? "'Space Grotesk', sans-serif" : undefined;
  
  return (
    <span
      className={`font-bold tabular-nums`}
      style={{ color, fontFamily }}
    >
      {position}{total ? `/${total}` : ''}
    </span>
  );
}
