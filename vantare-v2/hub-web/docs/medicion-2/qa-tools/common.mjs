import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, relative } from 'node:path';

export const root = resolve(process.env.VANTARE_HUB_QA_ROOT ?? 'D:/VantareServer/qa/isa-1995-measure-2');
assert.equal(root.toLowerCase(), resolve('D:/VantareServer/qa/isa-1995-measure-2').toLowerCase());
export const evidence = resolve(process.env.VANTARE_HUB_EVIDENCE ?? 'D:/VantareServer/evidence/hub-web/medicion-2');
export const code = resolve(process.env.VANTARE_MEASURE_SOURCE ?? 'D:/VantareServer/worktrees/isa-1995-medicion-2/vantare-v2/hub-web');
export const require = createRequire(join(code, 'package.json'));
export const sourceGeneration = 'D:/VantareServer/qa/isa-1995-measure-1/paired-4b60bc7058e6445c/generations/d9044dff2c4db874687078424f1588f1';
export const uiSource = '9401501ea38f2e8fe65584511f27844c7efd157a';
export function owned(path) {
  const item = resolve(path), part = relative(root, item);
  assert.ok(part && part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !/^[A-Z]:/i.test(part), `Outside QA ownership: ${item}`);
  return item;
}
export async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export async function until(check, timeout, label) {
  const end = performance.now() + timeout;
  do {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (performance.now() < end);
  throw new Error(`Timed out: ${label}`);
}
export const experiments = ['hardware-off', 'hardware-off-no-gpu', 'renderer-limit', 'media-router-off', 'media-keys-off', 'trace'];
