import type { ProfileDocumentV3, WidgetInstanceV3, WidgetLayoutV3 } from "./profile-document";
import { widgetTypeRegistry } from "./widget-registry";

// Un tipo con supportsAspectUnlock:false declara que su proporcion no es
// negociable: el editor ni siquiera ofrece desbloquearla. Los perfiles
// heredados, en cambio, guardaban ancho y alto libres y la migracion los copio
// tal cual, produciendo geometrias que la propia interfaz no permite crear.
//
// El sintoma es un widget recortado: el contenido se maqueta al ancho base del
// tipo y se escala solo por anchura, asi que una caja mas apaisada de la cuenta
// deja menos alto util del que el diseno necesita. Se vio en delta -- 488x122,
// proporcion 4,0 frente a la natural 2,92 -- con la barra de Crystal cortada.
//
// Se conserva el ancho, que es lo que el usuario coloco de forma deliberada, y
// se deriva el alto. Solo si el alto resultante quedara por debajo del minimo
// del tipo se recalcula al reves.
export function conformAspectLockedLayout(widget: WidgetInstanceV3): WidgetInstanceV3 {
  let capabilities;
  try {
    capabilities = widgetTypeRegistry.get(widget.type).capabilities;
  } catch {
    // Tipo legado o no registrado: se preserva intacto, igual que hace el resto
    // del Studio con los widgets que ya no conoce.
    return widget;
  }
  if (capabilities.supportsAspectUnlock) {
    return widget;
  }
  const conformed = conformSize(widget.layout, capabilities.defaultSize, capabilities.minimumSize);
  if (conformed.w === widget.layout.w && conformed.h === widget.layout.h) {
    return widget;
  }
  return { ...widget, layout: { ...widget.layout, w: conformed.w, h: conformed.h } };
}

function conformSize(
  layout: WidgetLayoutV3,
  defaultSize: { width: number; height: number },
  minimumSize: { width: number; height: number },
): { w: number; h: number } {
  const ratio = defaultSize.width / defaultSize.height;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { w: layout.w, h: layout.h };
  }
  const width = Math.max(layout.w, minimumSize.width);
  const height = Math.round(width / ratio);
  if (height >= minimumSize.height) {
    return { w: Math.round(width), h: height };
  }
  // minimumSize no siempre respeta la proporcion natural -- delta declara
  // 120x48, que es 2,5 frente a 2,92 -- asi que cuando el minimo de alto manda,
  // el ancho se recalcula desde el para no volver a romperla.
  return { w: Math.round(minimumSize.height * ratio), h: minimumSize.height };
}

export function conformAspectLockedLayouts(document: ProfileDocumentV3): ProfileDocumentV3 {
  let changed = false;
  const layouts = {} as ProfileDocumentV3["layouts"];
  for (const [session, layout] of Object.entries(document.layouts)) {
    if (!layout) continue;
    const widgets = layout.widgets.map((widget) => {
      const conformed = conformAspectLockedLayout(widget);
      if (conformed !== widget) changed = true;
      return conformed;
    });
    Object.assign(layouts, { [session]: { ...layout, widgets } });
  }
  return changed ? { ...document, layouts } : document;
}
