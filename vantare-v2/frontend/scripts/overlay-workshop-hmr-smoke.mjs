import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
export const frontendRoot = path.resolve(scriptDirectory, '..');
export const repositoryRoot = path.resolve(frontendRoot, '..', '..');

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertExactlyOne(source, anchor, replacement) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`expected exactly one anchor, found ${count}`);
  return source.replace(anchor, replacement);
}

export function readGitStatus(paths) {
  return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function assertGitClean(paths, readStatus = readGitStatus) {
  const output = readStatus(paths);
  if (output) throw new Error(`HMR smoke target files must be clean:\n${output}`);
}

async function writeRecoveryEvidence(directory, { original, observed, cleaned }) {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, 'original.bin'), original),
    writeFile(path.join(directory, 'observed.bin'), observed),
    writeFile(path.join(directory, 'cleaned.bin'), cleaned),
    writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify({
      originalSha256: sha256(original),
      observedSha256: sha256(observed),
      cleanedSha256: sha256(cleaned),
    }, null, 2)}\n`),
  ]);
}

export async function mutateFileTemporarily({
  file,
  buildMutation,
  verify,
  recoveryDirectory,
  signal,
}) {
  const original = await readFile(file);
  const mutation = buildMutation(original);
  let verificationError;
  let cleanupError;
  try {
    if (signal?.aborted) throw signal.reason ?? new Error('operation aborted');
    await writeFile(file, mutation.mutated);
    await verify();
    if (signal?.aborted) throw signal.reason ?? new Error('operation aborted');
  } catch (error) {
    verificationError = error;
  } finally {
    const observed = await readFile(file);
    if (observed.equals(mutation.mutated)) {
      await writeFile(file, original);
    } else {
      let cleaned = observed;
      let markerRemovalError;
      try {
        cleaned = mutation.removeOwnMarker(observed);
      } catch (error) {
        markerRemovalError = error;
      }
      if (!cleaned.equals(observed)) await writeFile(file, cleaned);
      if (recoveryDirectory) {
        await writeRecoveryEvidence(recoveryDirectory, { original, observed, cleaned });
      }
      cleanupError = markerRemovalError
        ? new AggregateError(
            [markerRemovalError],
            'concurrent drift detected; own marker could not be isolated and observed bytes were preserved',
          )
        : new Error('concurrent drift detected; external bytes preserved and recovery evidence written');
    }
  }
  if (cleanupError && verificationError) {
    throw new AggregateError([verificationError, cleanupError], 'verification and cleanup both failed');
  }
  if (cleanupError) throw cleanupError;
  if (verificationError) throw verificationError;
  const restored = await readFile(file);
  if (!restored.equals(original)) throw new Error('restoration was not byte-for-byte');
}
