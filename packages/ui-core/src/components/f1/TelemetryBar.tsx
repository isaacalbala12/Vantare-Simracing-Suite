interface TelemetryItem {
  label: string;
  value: string;
  accent?: boolean;
}

interface TelemetryBarProps {
  items: TelemetryItem[];
  className?: string;
}

export function TelemetryBar({ items, className = '' }: TelemetryBarProps) {
  return (
    <div className={`f1-telemetry ${className}`}>
      {items.map((item, i) => (
        <div key={i} className="f1-telemetry-item">
          {item.label} <strong className={item.accent ? 'accent' : ''}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
