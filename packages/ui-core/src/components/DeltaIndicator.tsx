import { useTheme } from '../hooks/useTheme';

interface DeltaIndicatorProps {
  delta: number;
}

export function DeltaIndicator({ delta }: DeltaIndicatorProps) {
  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';
  const isPositive = delta >= 0;
  const color = isPositive
    ? (isF1 ? '#e63950' : 'text-red-400')
    : (isF1 ? '#22c55e' : 'text-green-400');
  const sign = isPositive ? '+' : '';
  
  if (isF1) {
    return (
      <span
        className="font-mono tabular-nums"
        style={{ color, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.05em' }}
      >
        {sign}{delta.toFixed(3)}
      </span>
    );
  }
  
  return <span className={`font-mono tabular-nums ${color}`}>{sign}{delta.toFixed(3)}</span>;
}
