# 12 · Contratos de componentes (`frontend/src/ui/orbit/*`)

Interfaces TypeScript del kit. Convenciones: componentes funcionales React 19, `className` siempre aceptado y aplicado al nodo raíz, sin estilos inline salvo variables CSS (`style={{"--c": color}}`), tokens vía clases/`orbit.tokens.css`. Cada componente exporta su tipo de props. Todos los textos visibles llegan por props (i18n fuera del kit).

```ts
// ── primitivos ─────────────────────────────────────────────
export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "reference";
export type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";     // primary = blanco
  size?: Size;                                  // md 39px · sm 34px
  icon?: IconName; iconRight?: IconName;
  loading?: boolean;                            // punto pulsante, deshabilita
  state?: "idle" | "running" | "dirty" | "saved"; // btn-run / btn-save
}
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName; label: string;                // label → aria-label + tooltip
  on?: boolean; tone?: "neutral" | "danger"; size?: 28 | 39;
}
export interface SegProps<T extends string> {
  options: { value: T; label: React.ReactNode; disabled?: boolean; title?: string }[];
  value: T; onChange(v: T): void; wide?: boolean; label: string; // aria-label del grupo
}
export interface ToggleProps { pressed: boolean; onChange(v: boolean): void; label: string; disabled?: boolean; }
export interface FieldProps { label: string; hint?: string; htmlFor?: string; row?: boolean; children: React.ReactNode; }
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { numeric?: boolean; unit?: string; }
export interface SelectProps<T extends string> { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string; width?: number; }
export interface KbdProps { keys: string[]; physical?: boolean; empty?: boolean; conflict?: boolean; } // ["Ctrl","Shift","V"]

// ── estado y metadatos ─────────────────────────────────────
export interface PillProps { children: React.ReactNode; dot?: "ok" | "gold" | "ring" | "ring-gold" | "none"; pulse?: boolean; onClick?(): void; title?: string; }
export interface ChipProps { children: React.ReactNode; tier?: "bronze" | "silver" | "gold"; tone?: Tone; caseNormal?: boolean; icon?: IconName; }
export interface StateChipProps { children: React.ReactNode; state: "ok" | "draft" | "warn"; }
export interface SubtleStatusProps { children: React.ReactNode; tone?: "neutral" | "attn" | "ok"; }
export interface TyreChipProps { compound: "soft" | "medium" | "hard"; }
export interface StatTileProps { label: string; value: React.ReactNode; unit?: string; sub?: string; tone?: "neutral" | "hot" | "ok"; }
export interface NoteProps { title?: string; children: React.ReactNode; } // nota ámbar de fixture/limitación

// ── contenedores ───────────────────────────────────────────
export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  title?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; // cabecera opcional
  as?: "section" | "aside" | "article"; fill?: boolean; // fill: flex column, min-height 0
}
export interface FeaturedProps extends React.HTMLAttributes<HTMLElement> { interactive?: boolean; } // borde degradado
export interface ListRowProps {
  title: React.ReactNode; subtitle?: React.ReactNode;
  leading?: React.ReactNode;                     // punto tier, monograma, grip
  trailing?: React.ReactNode;                    // hora+countdown, chip, ▶, ojo
  selected?: boolean; next?: boolean; onClick?(): void; draggable?: boolean;
  role?: "option" | "button"; ariaSelected?: boolean;
}
export interface MonogramProps { text: string; g1: string; g2: string; size?: 26 | 32 | 39 | 46 | 52 | 60; }
export interface MenuProps { trigger: React.ReactElement; items: { id: string; title: string; description?: string; onSelect(): void }[]; label: string; }
export interface AccordionProps { title: string; summary?: string; open?: boolean; onToggle?(o: boolean): void; children: React.ReactNode; }
export interface UnderlineTabsProps<T extends string> { tabs: { id: T; label: string }[]; value: T; onChange(v: T): void; label: string; }
export interface ToastApi { show(title: string, message?: string): void; }   // contexto; máx 3, 2.6 s
export interface TooltipProps { text: string; side?: "right" | "top"; children: React.ReactElement; } // rail: right

// ── shell ──────────────────────────────────────────────────
export interface RailItem { id: ViewId; icon: IconName; label: string; locked?: { requiredPlan: string; currentPlan: string }; soon?: boolean; }
export interface RailProps { items: RailItem[]; active: ViewId; onNavigate(v: ViewId, target?: string): void; onTogglePalette(): void; onToggleColumn(): void; columnOpen: boolean; columnAvailable: boolean; avatarSrc?: string; planLabel: string; }
export interface ContextColumnProps {
  title: string; version: string; onCollapse(): void;
  context?: React.ReactNode;                     // panel de la sección activa
  blocks: { id: "races" | "profile" | "launcher"; hiddenFor: ViewId[]; content: React.ReactNode }[];
  activeView: ViewId; simStatus: SimStatus; planLabel: string; onOpenAccount(): void;
}
export interface TopbarProps { view: ViewId; eyebrow: string; title: string; children?: React.ReactNode; update?: UpdateState; }
export interface CommandPaletteProps { open: boolean; onClose(): void; destinations: PaletteItem[]; actions: PaletteItem[]; }
export interface PaletteItem { id: string; label: string; meta?: string; icon: IconName; locked?: string; run(): void; }

// ── datos y visualización ──────────────────────────────────
export interface CountdownDialProps { target: Date; intervalMin: number; title: string; meta: string; onOpen(): void; size?: 236 | 200; }
export interface MiniStageProps { widgets: WidgetDoc[]; system: "crystal" | "original" | "endurance"; }  // container-query, sin interacción
export interface HorizontalTimelineProps<Row> {
  rows: Row[]; rowLabel(r: Row): React.ReactNode; start: Date; spanMin: number; tickEveryMin: number;
  blocks(r: Row): { start: Date; durationMin: number; color: string; label?: string; id: string; done?: boolean }[];
  now?: Date; onBlock?(id: string): void; selected?: string; minWidth?: number;
}
export interface DonutProps { slices: { id: string; label: string; value: number; color: string }[]; centerLabel: string; centerValue: string; }
export interface TraceProps { channel: "speed" | "pedals" | "steer" | "delta"; mine: number[]; ref?: number[]; extra?: number[]; bands?: { at: number; label: string }[]; height: number; }
export interface TrackMapProps { path: [number, number][]; segments: { id: string; from: number; to: number; delta: number; label: string }[]; cursor?: number; onSegment?(id: string): void; selected?: string; }
export interface CornerSlotProps { corner: "FL" | "FR" | "RL" | "RR"; tyre?: TyreView; onDrop(id: string): void; onClear(): void; picked?: boolean; }
export interface TyreItemProps { tyre: TyreView; used: { stint: number; corner: string }[]; picked?: boolean; onPick(): void; }
export interface AvailabilityBoardProps { drivers: DriverView[]; ranges: Record<string, AvailRange[]>; from: number; to: number; }
export interface KeycapRowProps { title: string; description: string; keys: string[]; conflict?: boolean; empty?: boolean; }
```

Reglas: `IconName` es la unión de ids del sprite (`"i-inicio" | … | "i-lock"`). `ViewId` = `"inicio"|"studio"|"launcher"|"carreras"|"estrategia"|"ingeniero"|"telemetria"|"roadmap"|"ajustes"|"testing"`. Los tipos de datos (`WidgetDoc`, `TyreView`, `DriverView`, `AvailRange`, `SimStatus`, `UpdateState`) están en `13-modelo-y-algoritmos.md`.
