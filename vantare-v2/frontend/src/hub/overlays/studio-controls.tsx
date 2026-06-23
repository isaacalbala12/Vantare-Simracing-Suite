import type { ReactNode } from "react";

type StudioSectionHeaderProps = {
  title: string;
  hint?: string;
  trailing?: ReactNode;
};

export function StudioSectionHeader({ title, hint, trailing }: StudioSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted">
          {title}
        </h4>
        {hint ? (
          <p className="mt-0.5 text-[10px] text-vantare-textDim">{hint}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

type StudioSettingRowProps = {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  compact?: boolean;
};

export function StudioSettingRow({ label, hint, htmlFor, children, compact }: StudioSettingRowProps) {
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <label
        htmlFor={htmlFor}
        className="flex items-center justify-between gap-2 text-[11px] font-medium text-vantare-textMuted"
      >
        <span className="truncate">{label}</span>
        {hint ? <span className="text-[10px] text-vantare-textDim">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

type StudioSubsectionLabelProps = {
  children: ReactNode;
};

export function StudioSubsectionLabel({ children }: StudioSubsectionLabelProps) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vantare-textDim">
      {children}
    </p>
  );
}