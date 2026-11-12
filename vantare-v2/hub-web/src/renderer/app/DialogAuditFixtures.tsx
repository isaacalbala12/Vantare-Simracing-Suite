import { useState } from "react";
import { Button } from "../ui/Button";
import {
  CloseUnsavedReportDialog,
  DiscardReportDialog,
} from "../ui/DiscardReportDialog";
import { AlertDialog } from "../ui/Layers";
import { ApplicationArgumentReset } from "../ui/launcher/Applications";
import { ArgumentLossDialog } from "../ui/launcher/ProfileEditor";
import "./dialog-audit.css";

/** QA-only: exercise the real confirmation without invoking an OS file picker. */
export default function DialogAuditFixtures() {
  const kind = new URLSearchParams(location.search).get("dialog-fixture");
  const [open, setOpen] = useState(false);
  if (kind === "profile-arguments")
    return (
      <div className="v-dialog-audit-fixture">
        <Button onClick={() => setOpen(true)}>Confirmar argumentos</Button>
        <ArgumentLossDialog
          count={open ? 2 : 0}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </div>
    );
  if (kind === "report-discard" || kind === "report-close") {
    const Confirmation =
      kind === "report-close" ? CloseUnsavedReportDialog : DiscardReportDialog;
    return (
      <div className="v-dialog-audit-fixture">
        <Button onClick={() => setOpen(true)}>Confirmar borrador</Button>
        <Confirmation
          open={open}
          disabled={false}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </div>
    );
  }
  if (kind === "app-arguments")
    return (
      <div className="v-dialog-audit-fixture">
        <Button onClick={() => setOpen(true)}>Restablecer argumentos</Button>
        <ApplicationArgumentReset
          open={open}
          profiles={2}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </div>
    );
  if (kind === "alert")
    return (
      <div className="v-dialog-audit-fixture">
        <AlertDialog
          title="Confirmación de prueba"
          description="Solo datos locales de QA."
          trigger="Abrir confirmación"
          closeLabel="Cancelar"
        >
          <p>Esta escena no ejecuta acciones.</p>
        </AlertDialog>
      </div>
    );
  return null;
}
