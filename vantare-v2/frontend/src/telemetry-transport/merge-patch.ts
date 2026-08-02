import type { JSONObject, JSONValue } from "./contracts";

export function applyMergePatch(
  target: JSONObject,
  patch: JSONObject,
): JSONObject {
  return merge(clone(target), patch) as JSONObject;
}

function merge(target: JSONValue, patch: JSONValue): JSONValue {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return clone(patch);
  }
  const result: JSONObject =
    target !== null && typeof target === "object" && !Array.isArray(target)
      ? clone(target)
      : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = merge(result[key] ?? null, value);
    }
  }
  return result;
}

function clone<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
