export interface UnderlineTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  value: T;
  onChange(v: T): void;
  label: string;
  className?: string;
}

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: UnderlineTabsProps<T>) {
  return (
    <div
      aria-label={label}
      className={["orbit-utabs", className].filter(Boolean).join(" ")}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          aria-selected={tab.id === value}
          className="orbit-utabs__tab"
          id={`orbit-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          tabIndex={tab.id === value ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
