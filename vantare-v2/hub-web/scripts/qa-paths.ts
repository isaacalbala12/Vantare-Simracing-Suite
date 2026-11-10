import { isAbsolute, resolve } from "node:path";

export function requiredPath(name: string): string {
  const value = process.env[name];
  if (
    !value ||
    !isAbsolute(value) ||
    value.startsWith("\\\\") ||
    value.startsWith("//")
  )
    throw new Error(`${name} requires an absolute local QA path`);
  return resolve(value);
}
