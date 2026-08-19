import { useEffect, useState } from "react";

/**
 * Nodo de un hueco que la shell Orbit reserva para la pantalla activa.
 *
 * Se usa un portal y no un contexto hacia arriba porque los hijos del portal
 * siguen viviendo en el árbol React de la pantalla: conservan su store, su
 * estado y sus proveedores, y aun así se pintan dentro de la columna o de la
 * topbar de la shell.
 */
export function useOrbitSlot(id: string): HTMLElement | null {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const find = () => setNode(document.getElementById(id));
    find();
    // La shell puede montar el hueco después (la columna se pliega y despliega),
    // así que se vuelve a mirar cuando el DOM de la shell cambia.
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);

  return node;
}
