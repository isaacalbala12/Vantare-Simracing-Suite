interface AuroraEffectProps {
  className?: string;
}

export function AuroraEffect({ className = '' }: AuroraEffectProps) {
  return (
    <>
      <div className={`f1-aurora ${className}`} aria-hidden="true" />
      <div className="f1-aurora-glow" aria-hidden="true" />
    </>
  );
}
