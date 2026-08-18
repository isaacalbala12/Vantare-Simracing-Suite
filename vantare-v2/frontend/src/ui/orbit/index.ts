/* Índice del kit Orbit (`docs/design/orbit-v03/12-contratos-componentes.md`).
   Las páginas importan de aquí y no escriben CSS propio para estos elementos. */
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";

// primitivos
export { Icon, type IconName, type IconProps } from "./Icon";
export { Button, type ButtonProps, type Size, type Tone } from "./Button";
export { IconButton, type IconButtonProps } from "./IconButton";
export { Seg, type SegProps, type SegOption } from "./Seg";
export { Toggle, type ToggleProps } from "./Toggle";
export { Field, type FieldProps } from "./Field";
export { Input, type InputProps } from "./Input";
export { Select, type SelectProps } from "./Select";
export { Textarea, type TextareaProps } from "./Textarea";
export { Kbd, type KbdProps } from "./Kbd";

// estado y metadatos
export { Pill, type PillProps } from "./Pill";
export { Chip, type ChipProps } from "./Chip";
export { StateChip, type StateChipProps } from "./StateChip";
export { SubtleStatus, type SubtleStatusProps } from "./SubtleStatus";
export { TyreChip, type TyreChipProps } from "./TyreChip";
export { StatTile, StatRow, type StatTileProps, type StatRowProps } from "./StatTile";
export { Note, type NoteProps } from "./Note";
export { Dot, type DotProps } from "./Dot";

// contenedores
export { Surface, type SurfaceProps } from "./Surface";
export { Featured, type FeaturedProps } from "./Featured";
export { ListRow, type ListRowProps } from "./ListRow";
export { Monogram, type MonogramProps } from "./Monogram";
export { Menu, type MenuProps, type MenuItem } from "./Menu";
export { Accordion, type AccordionProps } from "./Accordion";
export { UnderlineTabs, type UnderlineTabsProps } from "./UnderlineTabs";
export { ToastProvider, ToastRegion } from "./Toast";
export {
  useToast,
  TOAST_MAX,
  TOAST_TTL_MS,
  type ToastApi,
  type ToastEntry,
} from "./toast-context";
export { Tooltip, type TooltipProps } from "./Tooltip";
