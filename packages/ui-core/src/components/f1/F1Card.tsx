import type { ReactNode } from 'react';
import { AuroraEffect } from './AuroraEffect';
import { SideStripe } from './SideStripe';

interface F1CardProps {
  children: ReactNode;
  className?: string;
  showAurora?: boolean;
  showStripe?: boolean;
  /** Content area variant: 'body' applies padding, 'full' lets children control layout */
  variant?: 'body' | 'full';
}

export function F1Card({
  children,
  className = '',
  showAurora = true,
  showStripe = true,
  variant = 'body',
}: F1CardProps) {
  return (
    <div className={`f1-card ${className}`}>
      {showAurora && <AuroraEffect />}
      {showStripe && <SideStripe />}
      {variant === 'body' ? (
        <div className="f1-card-body">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
