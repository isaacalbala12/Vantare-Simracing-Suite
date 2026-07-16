import type { ReactNode, HTMLAttributes } from 'react';

type BronzeCardProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  children: ReactNode;
};

export function BronzeCard({ active = false, className = '', children, ...rest }: BronzeCardProps) {
  return (
    <div className={`bc ${active ? 'bc-active' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="bc-tag" style={{ color: '#C1121F' }}>
      {children}
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="bc-eyebrow">{children}</div>;
}

function Primary({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bc-primary ${className}`}>{children}</div>;
}

function Divider() {
  return <div className="bc-divider" />;
}

function Secondary({ children }: { children: ReactNode }) {
  return <div className="bc-secondary">{children}</div>;
}

function Meta({ children }: { children: ReactNode }) {
  return <div className="bc-meta">{children}</div>;
}

BronzeCard.Tag = Tag;
BronzeCard.Eyebrow = Eyebrow;
BronzeCard.Primary = Primary;
BronzeCard.Divider = Divider;
BronzeCard.Secondary = Secondary;
BronzeCard.Meta = Meta;
