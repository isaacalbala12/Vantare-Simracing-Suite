import type { BundlePayload } from "./contract";

export interface UploadCommand {
  operation: "upload";
  uploadIdRef: string;
  uploadAuthHash: string;
  deleteAuthHash: string;
  contributorHash: string;
  ipHash: string;
  semanticDigest: string;
  storedBytes: number;
  payload: BundlePayload;
}

export interface DeleteCommand {
  operation: "delete";
  uploadIdRef: string;
  deleteAuthHash: string;
}

export interface RotateCommand {
  operation: "rotate";
  uploadIdRef: string;
  uploadAuthHash: string;
  deleteAuthHash: string;
  nextUploadAuthHash: string;
  nextDeleteAuthHash: string;
}

export interface QuotaCommand {
  operation: "quota";
  uploadIdRef: string;
  uploadAuthHash: string;
}

export type CoordinatorCommand = UploadCommand | DeleteCommand | RotateCommand | QuotaCommand;

export interface Usage {
  objects: number;
  bytes: number;
}

export function internalJSON(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
