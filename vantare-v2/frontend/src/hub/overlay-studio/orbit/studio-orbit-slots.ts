import { useEffect, useState } from "react";

/** Ids de los huecos que la shell Orbit reserva para el Studio (briefing 04). */
export const STUDIO_CONTEXT_SLOT_ID = "orbit-studio-context-slot";
export const STUDIO_TOPBAR_SLOT_ID = "orbit-studio-topbar-slot";

/**
 * Nodo donde portar la lista de widgets y los controles de la topbar.
 *
 * Se usa un portal y no un contexto hacia arriba porque los hijos del portal
 * siguen viviendo en el arbol React del Studio: conservan su store, su
 * proveedor de confirmacion y su telemetria, y aun asi se pintan dentro de la
 * columna y de la topbar de la shell.
 */
export function useOrbitSlot(id: string): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const find = () => setNode(document.getElementById(id));
    find();
    // La shell puede montar el hueco despues (la columna se pliega y despliega),
    // asi que se vuelve a mirar cuando el DOM de la shell cambia.
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);

  return node;
}
