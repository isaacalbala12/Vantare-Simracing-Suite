interface SideStripeProps {
  className?: string;
}

export function SideStripe({ className = '' }: SideStripeProps) {
  return <div className={`f1-side-stripe ${className}`} aria-hidden="true" />;
}
