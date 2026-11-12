import { useState } from "react";
import { dialogAuditText as text } from "../i18n/dialog-audit";
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
        <Button onClick={() => setOpen(true)}>{text.arguments}</Button>
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
        <Button onClick={() => setOpen(true)}>{text.draft}</Button>
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
        <Button onClick={() => setOpen(true)}>{text.resetArguments}</Button>
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
          title={text.title}
          description={text.description}
          trigger={text.trigger}
          closeLabel={text.cancel}
        >
          <p>{text.body}</p>
        </AlertDialog>
      </div>
    );
  return null;
}
