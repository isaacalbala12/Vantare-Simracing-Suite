import { designSystemRegistry } from "../../../overlay/core/design-system-registry";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { prepareWidgetVisualSettings } from "../../../overlay/core/widget-visual-settings";
import {
  getOfficialDesign,
  listOfficialDesigns,
  migrateRetiredDesignId,
} from "../../../overlay/design-systems/official-designs";

export function isDesignCompatibleWithWidget(design: WidgetDesignV1, widget: WidgetInstanceV3): boolean {
  if (design.widgetType !== widget.type) {
    return false;
  }
  try {
    designSystemRegistry.resolve(design.systemId, design.systemVersion, design.widgetType);
    return true;
  } catch {
    return false;
  }
}

export function partitionApplyAllTargets(
  widgets: readonly WidgetInstanceV3[],
  design: WidgetDesignV1,
): { compatibleIds: string[]; skippedCount: number } {
  const sameType = widgets.filter((widget) => widget.type === design.widgetType);
  const compatibleIds = sameType
    .filter((widget) => isDesignCompatibleWithWidget(design, widget))
    .map((widget) => widget.id);
  return {
    compatibleIds,
    skippedCount: sameType.length - compatibleIds.length,
  };
}

export function buildUserDesignFromWidget(
  widget: WidgetInstanceV3,
  input: { id: string; name: string; includesContent: boolean },
): WidgetDesignV1 {
  const { settings } = prepareWidgetVisualSettings(widget);
  return {
    id: input.id,
    name: input.name,
    widgetType: widget.type,
    systemId: widget.visual.systemId,
    systemVersion: widget.visual.systemVersion,
    configVersion: widget.visual.configVersion,
    visual: structuredClone(settings),
    includesContent: input.includesContent,
    content: input.includesContent ? structuredClone(widget.content) : undefined,
    origin: "user",
  };
}

export function isActiveDesign(widget: WidgetInstanceV3, design: WidgetDesignV1): boolean {
  return widget.visual.provenance?.designId === design.id;
}

/**
 * Diseno que el widget lleva puesto de verdad (`briefing 04 · A3`).
 *
 * `isActiveDesign` mira `visual.provenance.designId`, que solo se escribe al
 * aplicar un diseno a mano. Un widget recien anadido no tiene procedencia
 * —`createDefault` deja `baseSettings: {}`— pero se pinta con algo: el diseno
 * por defecto de su sistema visual. Decir "Sin diseno aplicado" ahi es falso,
 * y es lo que veia el `Select` de la piel Orbit.
 *
 * Solo se cae al por defecto cuando el widget no tiene procedencia Y el
 * catalogo que se consulta es el de SU sistema: si el usuario esta hojeando
 * otro sistema en el desplegable, ahi no hay nada aplicado.
 */
export function resolveEffectiveDesign(
  widget: WidgetInstanceV3,
  catalogue: readonly WidgetDesignV1[],
): WidgetDesignV1 | null {
  const applied = catalogue.find((design) => isActiveDesign(widget, design));
  if (applied) {
    return applied;
  }
  if (widget.visual.provenance?.designId) {
    return null;
  }
  return (
    catalogue.find(
      (design) => design.isDefault === true && design.systemId === widget.visual.systemId,
    ) ?? null
  );
}

// Reescribe un widget cuyo diseno haya sido retirado al sustituto vigente.
//
// No basta con cambiar la procedencia: lo que se renderiza sale de baseSettings
// -- DeltaCrystal elige plantilla con settings.templateId --, asi que dejar los
// ajustes intactos mantendria la variante retirada en pantalla. Se sustituyen
// los ajustes base como haria aplicar el diseno a mano, y se respetan los
// appearanceOverrides, que son del usuario y no del preset.
// Aplica la migracion a todo el documento, en cada layout de sesion. Se llama
// al cargar un perfil: es el unico momento en que un id retirado puede entrar.
export function migrateRetiredDesigns(document: ProfileDocumentV3): ProfileDocumentV3 {
  let changed = false;
  const layouts = {} as ProfileDocumentV3["layouts"];
  for (const [session, layout] of Object.entries(document.layouts)) {
    if (!layout) continue;
    const widgets = layout.widgets.map((widget) => {
      const migrated = migrateRetiredWidgetDesign(widget);
      if (migrated !== widget) changed = true;
      return migrated;
    });
    Object.assign(layouts, { [session]: { ...layout, widgets } });
  }
  return changed ? { ...document, layouts } : document;
}

export function migrateRetiredWidgetDesign(widget: WidgetInstanceV3): WidgetInstanceV3 {
  const current = widget.visual.provenance?.designId;
  if (!current) return widget;
  const replacementId = migrateRetiredDesignId(current);
  if (replacementId === current) return widget;
  const replacement = getOfficialDesign(replacementId);
  if (!replacement || !isDesignCompatibleWithWidget(replacement, widget)) return widget;
  return {
    ...widget,
    visual: {
      ...widget.visual,
      systemVersion: replacement.systemVersion,
      configVersion: replacement.configVersion,
      baseSettings: structuredClone(replacement.visual),
      provenance: {
        designId: replacement.id,
        designName: replacement.name,
        origin: replacement.origin,
        appliedAt: widget.visual.provenance?.appliedAt ?? "",
      },
    },
  };
}

export function getDefaultOfficialDesign(
  widgetType: WidgetInstanceV3["type"],
  systemId: WidgetInstanceV3["visual"]["systemId"],
): WidgetDesignV1 | undefined {
  return listOfficialDesigns(widgetType).find((design) => design.systemId === systemId && design.isDefault);
}
