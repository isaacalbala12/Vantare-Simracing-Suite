import { randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  type ExportStatus,
  type HostError,
  type HostToUi,
  reportExportLimit,
} from "../contract/generated/contract";

// Called only with a path returned by main's own native dialog. Never an IPC argument.
export async function saveReport(path: string, report: string) {
  if (
    !isAbsolute(path) ||
    path.startsWith("\\\\") ||
    path.startsWith("//") ||
    extname(path).toLowerCase() !== ".json" ||
    Buffer.byteLength(report, "utf8") > reportExportLimit
  )
    throw new Error("invalid local report destination");
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx");
  try {
    await file.writeFile(report, "utf8");
    await file.sync();
    await file.close();
    // Exclusive publication: an existing destination, including a symlink, wins.
    await link(temporary, path);
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

type Outcome = { status: ExportStatus } | { error: HostError };
export function reportExportSession(
  pick: () => Promise<string | undefined>,
  save = saveReport,
) {
  let expected: number | undefined;
  let prepared: string | undefined;
  let alive = true;
  let busy = false;
  return {
    expect(id: number) {
      expected = id;
      prepared = undefined;
    },
    observe(message: HostToUi) {
      if (
        (message.kind !== "failure" && message.kind !== "response") ||
        message.id !== expected
      )
        return;
      expected = undefined;
      if (
        message.kind === "response" &&
        message.result.method === "report.localPrepare"
      )
        prepared = message.result.value.report;
    },
    close() {
      alive = false;
      prepared = undefined;
      expected = undefined;
    },
    async export(): Promise<Outcome> {
      if (busy) return { error: { kind: "busy" } };
      if (!alive || prepared === undefined)
        return { error: { kind: "rejected" } };
      const snapshot = prepared;
      busy = true;
      try {
        const path = await pick();
        if (!alive || path === undefined) return { status: "cancelled" };
        await save(path, snapshot);
        return { status: "saved" };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        )
          return { status: "conflict" };
        return { error: { kind: "io" } };
      } finally {
        busy = false;
      }
    },
  };
}
