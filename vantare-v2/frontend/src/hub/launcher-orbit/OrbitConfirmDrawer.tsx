import { Button, Drawer } from "../../ui/orbit";
import "../../styles/orbit-launcher.css";

export type OrbitConfirmDrawerProps = {
  open: boolean;
  title: string;
  /** Cuerpo ya resuelto por quien llama: el kit no traduce. */
  body: string;
  /** Consecuencia o matiz de la acción, cuando el cuerpo no basta. */
  hint?: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  onCancel(): void;
  onConfirm(): void;
  "data-testid"?: string;
};

/**
 * Confirmación destructiva del Launcher sobre el `Drawer` del kit Orbit.
 *
 * No hay `confirm()` nativo en ningún camino de la shell: en Wails se pinta
 * como un cuadro del sistema rotulado «wails.localhost dice», que ni respeta la
 * estética ni puede nombrar lo que está en juego. Este reutiliza el único
 * diálogo que el kit ya tiene (velo, `role="dialog"`, foco atrapado, `Esc`) y
 * solo añade el par de acciones del pie.
 */
export function OrbitConfirmDrawer({
  open,
  title,
  body,
  hint,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onCancel,
  onConfirm,
  "data-testid": testId,
}: OrbitConfirmDrawerProps) {
  return (
    <Drawer
      className="orbit-launcher-confirm"
      closeLabel={closeLabel}
      data-testid={testId}
      footer={
        <>
          <Button data-testid={`${testId}-cancel`} onClick={onCancel} variant="ghost">
            {cancelLabel}
          </Button>
          <Button data-testid={`${testId}-confirm`} onClick={onConfirm} variant="danger">
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onCancel}
      open={open}
      title={title}
    >
      <p className="orbit-launcher-confirm__body">{body}</p>
      {hint ? <p className="orbit-launcher-confirm__hint">{hint}</p> : null}
    </Drawer>
  );
}
