import type { CustomInspectorProps } from "../../core/inspector-control";
import type { WidgetColumnWidthPreset } from "../shared/widget-column";
import { Check, Field, Seg } from "../../../ui/orbit";
import {
  moveRelativeColumn, parseRelativeContent, RELATIVE_COLUMN_TEMPLATES,
  toggleRelativeColumn, updateRelativeColumn, updateRelativeFilters,
} from "./relative-content";

const widths: { value: WidgetColumnWidthPreset; label: string }[] = [
  { value: "xs", label: "Mínima" }, { value: "sm", label: "Estrecha" },
  { value: "md", label: "Media" }, { value: "lg", label: "Ancha" }, { value: "auto", label: "Auto" },
];
const aligns = [{ value: "left", label: "Izquierda" }, { value: "center", label: "Centro" }, { value: "right", label: "Derecha" }] as const;

export function RelativeContentInspector({ widget, disabled, onContentChange }: CustomInspectorProps): React.ReactElement {
  const content = parseRelativeContent(widget.content);
  const publish = (next: ReturnType<typeof parseRelativeContent>) => onContentChange?.(next as Record<string, unknown>);
  return (
    <div className="orbit-studio-ins__body" data-testid="studio-inspector-section-content" data-widget-id={widget.id}>
      <div data-testid="studio-relative-filters">
        <Field label="Clase">
          <Seg label="Clase" value={content.classScope} wide options={[{ value: "all", label: "Todas", disabled }, { value: "sameClass", label: "Misma clase", disabled }]} onChange={value => publish(updateRelativeFilters(content, { classScope: value as "all" | "sameClass" }))} />
        </Field>
        <Field label="Altura de fila">
          <Seg label="Altura de fila" value={content.rowHeightMode} wide options={[{ value: "compact", label: "Compacta", disabled }, { value: "fill", label: "Rellenar", disabled }]} onChange={value => publish(updateRelativeFilters(content, { rowHeightMode: value as "compact" | "fill" }))} />
        </Field>
      </div>
      <ul className="orbit-studio-cols" data-testid="studio-relative-columns">
        {content.columns.map((column, index) => {
          const name = RELATIVE_COLUMN_TEMPLATES.find(t => t.id === column.id)?.label ?? column.id;
          return (
            <li key={column.id} className="orbit-studio-cols__item" data-testid={`studio-relative-column-${column.id}`}>
              <div className="orbit-studio-cols__head">
                <Check checked={column.enabled} disabled={disabled} label={name} onChange={() => publish(toggleRelativeColumn(content, column.id))}>{name}</Check>
                <div className="orbit-studio-cols__order">
                  {(["up", "down"] as const).map(direction => <button key={direction} type="button" className="orbit-icon-btn orbit-icon-btn--28" aria-label={`${direction === "up" ? "Subir" : "Bajar"} · ${name}`} disabled={disabled || (direction === "up" ? index === 0 : index === content.columns.length - 1)} onClick={() => publish(moveRelativeColumn(content, column.id, direction))}>{direction === "up" ? "↑" : "↓"}</button>)}
                </div>
              </div>
              <div className="orbit-studio-cols__controls">
                <Field label={`Ancho · ${name}`}><Seg label={`Ancho · ${name}`} value={column.widthPreset} options={widths.map(option => ({ ...option, disabled }))} onChange={value => publish(updateRelativeColumn(content, column.id, { widthPreset: value as WidgetColumnWidthPreset }))} wide /></Field>
                <Field label={`Alineación · ${name}`}><Seg label={`Alineación · ${name}`} value={column.style?.align ?? "center"} options={aligns.map(option => ({ ...option, disabled }))} onChange={value => publish(updateRelativeColumn(content, column.id, { style: { align: value as "left" | "center" | "right" } }))} wide /></Field>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
