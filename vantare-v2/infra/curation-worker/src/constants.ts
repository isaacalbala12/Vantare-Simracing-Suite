export const CONTRACT_VERSION = "curationbundle.v1";
export const MAX_COMPRESSED_BYTES = 64 * 1024;
export const MAX_DECOMPRESSED_BYTES = 256 * 1024;
export const MAX_JSON_DEPTH = 5;
export const MAX_JSON_CARDINALITY = 8_192;
export const RETENTION_DAYS = 180;
export const TOMBSTONE_SLA_DAYS = 7;

export const ALLOWED_ENVIRONMENTS = new Set([
  "test",
  "controlled-capture",
  "production-community",
]);
