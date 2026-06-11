import { useTheme } from '../hooks/useTheme';
import { F1Card } from './f1/F1Card';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  opacity?: number;
}

export function GlassPanel({ children, className = '', opacity = 0.6 }: GlassPanelProps) {
  const { themeId } = useTheme();

  // When F1 theme is active, render as F1Card (A1 Base card with aurora + stripe)
  if (themeId === 'f1') {
    return (
      <F1Card variant="full" className={`${className}`}>
        {children}
      </F1Card>
    );
  }

  // Default glass styling for other themes
  return (
    <div
      className={`glass-panel ${className}`}
      style={{ background: `rgba(0, 0, 0, ${opacity})` }}
    >
      {children}
    </div>
  );
}
