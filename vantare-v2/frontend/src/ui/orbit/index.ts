/* Índice del kit Orbit (`docs/design/orbit-v03/12-contratos-componentes.md`).
   Las páginas importan de aquí y no escriben CSS propio para estos elementos. */
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";

// primitivos
export { Icon } from "./Icon";
export { Button } from "./Button";
export { IconButton } from "./IconButton";
export { Seg, SegMulti } from "./Seg";
export { Toggle } from "./Toggle";
export { Check } from "./Check";
export { Field } from "./Field";
export { Input } from "./Input";
export { Select } from "./Select";
export { Textarea } from "./Textarea";
export { Kbd } from "./Kbd";

// estado y metadatos
export { Pill } from "./Pill";
export { Chip } from "./Chip";
export { StateChip } from "./StateChip";
export { SubtleStatus } from "./SubtleStatus";
export { TyreChip } from "./TyreChip";
export { StatTile, StatRow } from "./StatTile";
export { Note } from "./Note";
export { Dot } from "./Dot";

// contenedores
export { Surface } from "./Surface";
export { Featured } from "./Featured";
export { ListRow } from "./ListRow";
export { Monogram, type MonogramProps } from "./Monogram";
export { Chain, ChainStep, type ChainStepProps, type ChainStepStatus } from "./ChainStep";
export { Menu } from "./Menu";
export { Drawer } from "./Drawer";
export { ConfirmDialog } from "./ConfirmDialog";
export { Accordion } from "./Accordion";
export { UnderlineTabs } from "./UnderlineTabs";
export { ToastProvider } from "./Toast";
export { useToast } from "./toast-context";
export { Tooltip } from "./Tooltip";

// visualización
export { NextRaceCard } from "./NextRaceCard";
export { MiniStage } from "./MiniStage";
export { HorizontalTimeline, type TimelineBlock } from "./HorizontalTimeline";
export { Donut, type DonutSlice } from "./Donut";
export { Trace } from "./Trace";
export { TrackMap, type TrackSegment } from "./TrackMap";
export { CornerSlot } from "./CornerSlot";
export { TyreItem } from "./TyreItem";
export { AvailabilityBoard } from "./AvailabilityBoard";
export { KeycapRow } from "./KeycapRow";
export { Fader } from "./Fader";
export {
  formatCountdown,
  segmentTone,
  type AvailRange,
  type DriverView,
  type TyreView,
  type WidgetDoc,
} from "./viz-types";
