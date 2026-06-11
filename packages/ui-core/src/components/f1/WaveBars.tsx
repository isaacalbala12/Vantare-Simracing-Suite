interface WaveBarsProps {
  barCount?: number;
  className?: string;
}

export function WaveBars({ barCount = 12, className = '' }: WaveBarsProps) {
  return (
    <div className={`f1-wave ${className}`} aria-hidden="true">
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} className="bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}
