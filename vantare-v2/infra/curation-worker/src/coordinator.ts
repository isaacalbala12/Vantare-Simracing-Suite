import { DurableObject } from "cloudflare:workers";
import { RETENTION_DAYS, TOMBSTONE_SLA_DAYS } from "./constants";
import type { CurationBundleV1 } from "./contract";
import { quotaConfig, type Env, type QuotaConfig } from "./env";
import {
  internalJSON,
  type CoordinatorCommand,
  type DeleteCommand,
  type QuotaCommand,
  type RotateCommand,
  type UploadCommand,
  type Usage,
} from "./protocol";

interface CredentialRecord {
  uploadAuthHash: string;
  deleteAuthHash: string;
  contributorHash: string;
  revoked: boolean;
  tombstone?: TombstoneReservation;
}

interface DedupeRecord {
  state: "pending" | "stored";
  objectKey: string;
  acceptedAt: string;
  expiresAt: string;
}

interface TombstoneReservation {
  key: string;
  requestedAt: string;
  applyBy: string;
}

interface QuotaEntry {
  key: string;
  maximumObjects: number;
  maximumBytes: number;
}

const encoder = new TextEncoder();
const retentionMilliseconds = RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const tombstoneMilliseconds = TOMBSTONE_SLA_DAYS * 24 * 60 * 60 * 1_000;

export class IngestCoordinator extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    try {
      const command = await request.json<CoordinatorCommand>();
      return await this.ctx.blockConcurrencyWhile(async () => {
        switch (command.operation) {
          case "upload":
            return this.upload(command);
          case "delete":
            return this.delete(command);
          case "rotate":
            return this.rotate(command);
          case "quota":
            return this.quota(command);
          default:
            return internalJSON(400, { error: "invalid_operation" });
        }
      });
    } catch {
      return internalJSON(503, { error: "security_state_unavailable" });
    }
  }

  private async upload(command: UploadCommand): Promise<Response> {
    const limits = quotaConfig(this.env);
    const credentialKey = `credential:${command.uploadIdRef}`;
    let credential = await this.ctx.storage.get<CredentialRecord>(credentialKey);
    const isNew = credential === undefined;
    if (credential === undefined) {
      if (!(await this.authenticationHashesAreUnused(command))) {
        return internalJSON(403, { error: "proof_failed" });
      }
      credential = {
        uploadAuthHash: command.uploadAuthHash,
        deleteAuthHash: command.deleteAuthHash,
        contributorHash: command.contributorHash,
        revoked: false,
      };
    } else if (
      credential.revoked ||
      credential.uploadAuthHash !== command.uploadAuthHash ||
      credential.deleteAuthHash !== command.deleteAuthHash ||
      credential.contributorHash !== command.contributorHash
    ) {
      return internalJSON(403, { error: "proof_failed" });
    }

    const dedupeKey = `dedupe:${command.uploadIdRef}:${command.semanticDigest}`;
    const existing = await this.ctx.storage.get<DedupeRecord>(dedupeKey);
    if (existing !== undefined) {
      const object = await this.env.CURATION_BUCKET.head(existing.objectKey);
      if (object !== null && existing.state === "pending") {
        await this.ctx.storage.put(dedupeKey, { ...existing, state: "stored" } satisfies DedupeRecord);
      }
      if (object !== null) {
        return internalJSON(200, this.receipt("replay", command.semanticDigest, existing));
      }
      if (Date.parse(existing.expiresAt) > Date.now()) {
        return this.writeReservedUpload(command, credential, existing, dedupeKey);
      }
      await this.ctx.storage.delete([
        dedupeKey,
        `owner:${command.uploadIdRef}:${command.semanticDigest}`,
      ]);
    }

    const now = new Date();
    const acceptedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + retentionMilliseconds).toISOString();
    const objectKey = bundleObjectKey(now, credential.contributorHash, command.semanticDigest);
    const reservation: DedupeRecord = { state: "pending", objectKey, acceptedAt, expiresAt };
    const stored = storedBundle(credential.contributorHash, command);
    const storedBytes = encoder.encode(JSON.stringify(stored)).byteLength;
    const quotaEntries = quotaEntriesFor(command, limits, now);
    const current = await this.readUsage(quotaEntries);
    if (exceedsQuota(current, quotaEntries, storedBytes)) {
      return internalJSON(429, { error: "quota_exceeded" });
    }

    const writes: Record<string, unknown> = {
      [dedupeKey]: reservation,
      [`owner:${command.uploadIdRef}:${command.semanticDigest}`]: objectKey,
      ...incrementedUsage(current, quotaEntries, storedBytes),
    };
    if (isNew) {
      writes[credentialKey] = credential;
      writes[`auth-upload:${command.uploadAuthHash}`] = command.uploadIdRef;
      writes[`auth-delete:${command.deleteAuthHash}`] = command.uploadIdRef;
    }
    await this.ctx.storage.put(writes);
    this.maybeLogBudgetAlert(current, quotaEntries, storedBytes);
    return this.writeReservedUpload(command, credential, reservation, dedupeKey, stored);
  }

  private async writeReservedUpload(
    command: UploadCommand,
    credential: CredentialRecord,
    reservation: DedupeRecord,
    dedupeKey: string,
    prepared?: CurationBundleV1,
  ): Promise<Response> {
    const stored = prepared ?? storedBundle(credential.contributorHash, command);
    try {
      await this.env.CURATION_BUCKET.put(reservation.objectKey, JSON.stringify(stored), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          environment: this.env.CURATION_ENV,
          contributorRef: credential.contributorHash.slice(0, 12),
          semanticDigest: command.semanticDigest,
          acceptedAt: reservation.acceptedAt,
          expiresAt: reservation.expiresAt,
        },
      });
      await this.ctx.storage.put(dedupeKey, { ...reservation, state: "stored" } satisfies DedupeRecord);
    } catch {
      return internalJSON(503, { error: "storage_unavailable" });
    }
    securityLog("bundle_accepted", this.env.CURATION_ENV, command.uploadIdRef, command.semanticDigest);
    return internalJSON(201, this.receipt("accepted", command.semanticDigest, reservation));
  }

  private async delete(command: DeleteCommand): Promise<Response> {
    const credentialKey = `credential:${command.uploadIdRef}`;
    const credential = await this.ctx.storage.get<CredentialRecord>(credentialKey);
    if (credential === undefined || credential.deleteAuthHash !== command.deleteAuthHash) {
      return internalJSON(403, { error: "proof_failed" });
    }
    if (credential.revoked && credential.tombstone === undefined) {
      return internalJSON(403, { error: "proof_failed" });
    }

    let reservation = credential.tombstone;
    let status = 200;
    if (reservation === undefined) {
      const requested = new Date();
      reservation = {
        key: `tombstones/${credential.contributorHash}/${requested.getTime()}.json`,
        requestedAt: requested.toISOString(),
        applyBy: new Date(requested.getTime() + tombstoneMilliseconds).toISOString(),
      };
      credential.revoked = true;
      credential.tombstone = reservation;
      await this.ctx.storage.put(credentialKey, credential);
      status = 201;
    }

    const owned = await this.ctx.storage.list<string>({ prefix: `owner:${command.uploadIdRef}:` });
    const body = {
      contractVersion: "vantare.curation.tombstone.v1",
      environment: this.env.CURATION_ENV,
      subjectHash: credential.contributorHash,
      requestedAt: reservation.requestedAt,
      applyBy: reservation.applyBy,
      bundleObjectKeys: Array.from(owned.values()).sort(),
    };
    try {
      await this.env.CURATION_BUCKET.put(reservation.key, JSON.stringify(body), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          environment: this.env.CURATION_ENV,
          contributorRef: credential.contributorHash.slice(0, 12),
          applyBy: reservation.applyBy,
        },
      });
    } catch {
      return internalJSON(503, { error: "storage_unavailable" });
    }
    securityLog("tombstone_accepted", this.env.CURATION_ENV, command.uploadIdRef);
    return internalJSON(status, {
      status: status === 201 ? "accepted" : "replay",
      tombstoneRef: reservation.key.split("/").at(-1)?.replace(".json", ""),
      applyWithinDays: TOMBSTONE_SLA_DAYS,
    });
  }

  private async rotate(command: RotateCommand): Promise<Response> {
    const key = `credential:${command.uploadIdRef}`;
    const credential = await this.ctx.storage.get<CredentialRecord>(key);
    if (
      credential === undefined ||
      credential.revoked ||
      credential.uploadAuthHash !== command.uploadAuthHash ||
      credential.deleteAuthHash !== command.deleteAuthHash
    ) {
      return internalJSON(403, { error: "proof_failed" });
    }
    const nextUploadOwner = await this.ctx.storage.get<string>(`auth-upload:${command.nextUploadAuthHash}`);
    const nextDeleteOwner = await this.ctx.storage.get<string>(`auth-delete:${command.nextDeleteAuthHash}`);
    if (
      (nextUploadOwner !== undefined && nextUploadOwner !== command.uploadIdRef) ||
      (nextDeleteOwner !== undefined && nextDeleteOwner !== command.uploadIdRef)
    ) {
      return internalJSON(409, { error: "credential_already_used" });
    }
    await this.ctx.storage.transaction(async (transaction) => {
      await transaction.delete([
        `auth-upload:${credential.uploadAuthHash}`,
        `auth-delete:${credential.deleteAuthHash}`,
      ]);
      credential.uploadAuthHash = command.nextUploadAuthHash;
      credential.deleteAuthHash = command.nextDeleteAuthHash;
      await transaction.put({
        [key]: credential,
        [`auth-upload:${credential.uploadAuthHash}`]: command.uploadIdRef,
        [`auth-delete:${credential.deleteAuthHash}`]: command.uploadIdRef,
      });
    });
    securityLog("credentials_rotated", this.env.CURATION_ENV, command.uploadIdRef);
    return internalJSON(200, { status: "rotated" });
  }

  private async quota(command: QuotaCommand): Promise<Response> {
    const credential = await this.ctx.storage.get<CredentialRecord>(`credential:${command.uploadIdRef}`);
    if (
      credential === undefined ||
      credential.revoked ||
      credential.uploadAuthHash !== command.uploadAuthHash
    ) {
      return internalJSON(403, { error: "proof_failed" });
    }
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const [daily, monthly] = await Promise.all([
      this.ctx.storage.get<Usage>(`quota:credential:${command.uploadIdRef}:day:${day}`),
      this.ctx.storage.get<Usage>(`quota:credential:${command.uploadIdRef}:month:${month}`),
    ]);
    const limits = quotaConfig(this.env);
    return internalJSON(200, {
      daily: daily ?? emptyUsage(),
      monthly: monthly ?? emptyUsage(),
      limits: {
        daily: { objects: limits.credentialDayObjects, bytes: limits.credentialDayBytes },
        monthly: { objects: limits.credentialMonthObjects, bytes: limits.credentialMonthBytes },
      },
    });
  }

  private async authenticationHashesAreUnused(command: UploadCommand): Promise<boolean> {
    const [uploadOwner, deleteOwner] = await Promise.all([
      this.ctx.storage.get<string>(`auth-upload:${command.uploadAuthHash}`),
      this.ctx.storage.get<string>(`auth-delete:${command.deleteAuthHash}`),
    ]);
    return (
      (uploadOwner === undefined || uploadOwner === command.uploadIdRef) &&
      (deleteOwner === undefined || deleteOwner === command.uploadIdRef)
    );
  }

  private async readUsage(entries: QuotaEntry[]): Promise<Map<string, Usage>> {
    const stored = await this.ctx.storage.get<Usage>(entries.map((entry) => entry.key));
    const result = new Map<string, Usage>();
    for (const entry of entries) result.set(entry.key, stored.get(entry.key) ?? emptyUsage());
    return result;
  }

  private receipt(status: string, digest: string, record: DedupeRecord): Record<string, unknown> {
    return {
      status,
      semanticDigest: digest,
      acceptedAt: record.acceptedAt,
      expiresAt: record.expiresAt,
      retentionDays: RETENTION_DAYS,
    };
  }

  private maybeLogBudgetAlert(current: Map<string, Usage>, entries: QuotaEntry[], bytes: number): void {
    for (const entry of entries.filter((candidate) => candidate.key.startsWith("quota:global:"))) {
      const usage = current.get(entry.key) ?? emptyUsage();
      if (
        (usage.objects + 1) / entry.maximumObjects >= 0.8 ||
        (usage.bytes + bytes) / entry.maximumBytes >= 0.8
      ) {
        console.warn(JSON.stringify({ event: "global_budget_threshold", environment: this.env.CURATION_ENV }));
        return;
      }
    }
  }
}

function storedBundle(contributorHash: string, command: UploadCommand): CurationBundleV1 {
  return {
    admin: { uploadId: contributorHash, deleteHash: contributorHash },
    payload: command.payload,
  };
}

function bundleObjectKey(now: Date, contributorHash: string, semanticDigest: string): string {
  const [year, month] = now.toISOString().slice(0, 7).split("-");
  return `bundles/${year}/${month}/${contributorHash}/${semanticDigest}.json`;
}

function quotaEntriesFor(command: UploadCommand, limits: QuotaConfig, now: Date): QuotaEntry[] {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  return [
    entry(`quota:credential:${command.uploadIdRef}:day:${day}`, limits.credentialDayObjects, limits.credentialDayBytes),
    entry(`quota:credential:${command.uploadIdRef}:month:${month}`, limits.credentialMonthObjects, limits.credentialMonthBytes),
    entry(`quota:ip:${command.ipHash}:day:${day}`, limits.ipDayObjects, limits.ipDayBytes),
    entry(`quota:ip:${command.ipHash}:month:${month}`, limits.ipMonthObjects, limits.ipMonthBytes),
    entry("quota:global:day:" + day, limits.globalDayObjects, limits.globalDayBytes),
    entry("quota:global:month:" + month, limits.globalMonthObjects, limits.globalMonthBytes),
    entry(
      `quota:combination:${command.uploadIdRef}:${command.payload.combinationId}:month:${month}`,
      limits.credentialCombinationMonthObjects,
      Number.MAX_SAFE_INTEGER,
    ),
  ];
}

function entry(key: string, maximumObjects: number, maximumBytes: number): QuotaEntry {
  return { key, maximumObjects, maximumBytes };
}

function exceedsQuota(current: Map<string, Usage>, entries: QuotaEntry[], bytes: number): boolean {
  return entries.some((entry) => {
    const usage = current.get(entry.key) ?? emptyUsage();
    return usage.objects + 1 > entry.maximumObjects || usage.bytes + bytes > entry.maximumBytes;
  });
}

function incrementedUsage(
  current: Map<string, Usage>,
  entries: QuotaEntry[],
  bytes: number,
): Record<string, Usage> {
  const result: Record<string, Usage> = {};
  for (const entry of entries) {
    const usage = current.get(entry.key) ?? emptyUsage();
    result[entry.key] = { objects: usage.objects + 1, bytes: usage.bytes + bytes };
  }
  return result;
}

function emptyUsage(): Usage {
  return { objects: 0, bytes: 0 };
}

function securityLog(event: string, environment: string, identity: string, digest?: string): void {
  console.log(
    JSON.stringify({
      event,
      environment,
      identityRef: identity.slice(0, 12),
      ...(digest === undefined ? {} : { digestRef: digest.slice(0, 12) }),
    }),
  );
}
