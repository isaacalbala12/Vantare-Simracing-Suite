interface LiveDotProps {
  className?: string;
}

export function LiveDot({ className = '' }: LiveDotProps) {
  return <span className={`f1-live ${className}`}>Live</span>;
}
