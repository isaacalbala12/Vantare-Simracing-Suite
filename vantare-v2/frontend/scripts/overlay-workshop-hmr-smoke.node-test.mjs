import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertGitClean,
  assertExactlyOne,
  buildCssMutation,
  buildTsxMutation,
  closeWithTimeout,
  listenWorkshopServer,
  mutateFileTemporarily,
  sha256,
} from './overlay-workshop-hmr-smoke.mjs';

test('assertExactlyOne replaces one anchor and rejects missing or repeated anchors', () => {
  assert.equal(assertExactlyOne('before ANCHOR after', 'ANCHOR', 'MARKER'), 'before MARKER after');
  assert.throws(() => assertExactlyOne('plain', 'ANCHOR', 'MARKER'), /expected exactly one anchor, found 0/);
  assert.throws(() => assertExactlyOne('ANCHOR ANCHOR', 'ANCHOR', 'MARKER'), /expected exactly one anchor, found 2/);
});

test('sha256 changes with bytes and is stable for equal input', () => {
  assert.equal(sha256(Buffer.from('same')), sha256(Buffer.from('same')));
  assert.notEqual(sha256(Buffer.from('same')), sha256(Buffer.from('other')));
});

const markerMutation = (original) => ({
  mutated: Buffer.concat([original, Buffer.from('OWN_MARKER\n')]),
  removeOwnMarker: (observed) => Buffer.from(
    assertExactlyOne(observed.toString('utf8'), 'OWN_MARKER\n', ''),
  ),
});

test('mutateFileTemporarily restores exact bytes after success', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vantare-hmr-'));
  const file = path.join(directory, 'sample.tsx');
  const original = Buffer.from('alpha\r\nbeta\r\n');
  try {
    await writeFile(file, original);
    await mutateFileTemporarily({ file, buildMutation: markerMutation, verify: async () => {
      assert.match(await readFile(file, 'utf8'), /OWN_MARKER/);
    }});
    assert.deepEqual(await readFile(file), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('mutateFileTemporarily restores exact bytes when verification throws', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vantare-hmr-'));
  const file = path.join(directory, 'sample.css');
  const original = Buffer.from('.root { color: red; }\n');
  try {
    await writeFile(file, original);
    await assert.rejects(
      mutateFileTemporarily({ file, buildMutation: markerMutation, verify: async () => {
        throw new Error('verification failed');
      }}),
      /verification failed/,
    );
    assert.deepEqual(await readFile(file), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent edits survive while the owned marker is removed and evidence is written', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vantare-hmr-'));
  const file = path.join(directory, 'sample.tsx');
  const recoveryDirectory = path.join(directory, 'recovery');
  try {
    await writeFile(file, 'ORIGINAL\n');
    await assert.rejects(
      mutateFileTemporarily({
        file,
        buildMutation: markerMutation,
        recoveryDirectory,
        verify: async () => writeFile(file, 'ORIGINAL\nEXTERNAL_EDIT\nOWN_MARKER\n'),
      }),
      /concurrent drift/,
    );
    assert.equal(await readFile(file, 'utf8'), 'ORIGINAL\nEXTERNAL_EDIT\n');
    assert.deepEqual((await readdir(recoveryDirectory)).sort(), [
      'cleaned.bin', 'manifest.json', 'observed.bin', 'original.bin',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown drift is never overwritten when the owned marker disappeared', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vantare-hmr-'));
  const file = path.join(directory, 'sample.tsx');
  const recoveryDirectory = path.join(directory, 'recovery');
  try {
    await writeFile(file, 'ORIGINAL\n');
    await assert.rejects(mutateFileTemporarily({
      file,
      buildMutation: markerMutation,
      recoveryDirectory,
      verify: async () => writeFile(file, 'EXTERNAL_WITHOUT_MARKER\n'),
    }), /own marker could not be isolated/);
    assert.equal(await readFile(file, 'utf8'), 'EXTERNAL_WITHOUT_MARKER\n');
    assert.ok((await readdir(recoveryDirectory)).includes('manifest.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('assertGitClean accepts clean output and rejects modified and untracked output', () => {
  let receivedPaths;
  assert.doesNotThrow(() => assertGitClean(['one.tsx'], (paths) => {
    receivedPaths = paths;
    return '';
  }));
  assert.deepEqual(receivedPaths, ['one.tsx']);
  assert.throws(() => assertGitClean(['one.tsx'], () => ' M one.tsx'), /must be clean/);
  assert.throws(() => assertGitClean(['one.tsx'], () => '?? one.tsx'), /must be clean/);
});

test('abort during verification restores exact bytes before propagating cancellation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vantare-hmr-'));
  const file = path.join(directory, 'sample.tsx');
  const controller = new AbortController();
  try {
    await writeFile(file, 'ORIGINAL\n');
    await assert.rejects(mutateFileTemporarily({
      file,
      buildMutation: markerMutation,
      signal: controller.signal,
      verify: async () => controller.abort(new Error('SIGINT requested')),
    }), /SIGINT requested/);
    assert.equal(await readFile(file, 'utf8'), 'ORIGINAL\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`buildTsxMutation preserves ${name} and removes only its own attribute`, () => {
    const source = Buffer.from(`      data-tone={model.tone}${newline}      className="vo-delta"${newline}`);
    const mutation = buildTsxMutation(source);

    assert.match(mutation.mutated.toString('utf8'), /data-overlay-workshop-hmr-tsx="active"/);
    assert.deepEqual(mutation.removeOwnMarker(mutation.mutated), source);
  });
}

test('buildTsxMutation preserves a UTF-8 BOM and final newline', () => {
  const source = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('      data-tone={model.tone}\n      className="vo-delta"\n'),
  ]);
  const mutation = buildTsxMutation(source);

  assert.deepEqual(mutation.removeOwnMarker(mutation.mutated), source);
});

test('buildCssMutation appends one scoped custom property', () => {
  const source = Buffer.from('.vo-delta {}\n');
  const mutation = buildCssMutation(source);

  assert.match(mutation.mutated.toString('utf8'), /\.vo-delta\[data-overlay-workshop-hmr-tsx="active"\]/);
  assert.match(mutation.mutated.toString('utf8'), /--overlay-workshop-hmr-css: 17px/);
  assert.deepEqual(mutation.removeOwnMarker(mutation.mutated), source);
});

test('closeWithTimeout resolves a completed cleanup and rejects a blocked cleanup', async () => {
  await assert.doesNotReject(closeWithTimeout('fast close', async () => {}, 20));
  await assert.rejects(
    closeWithTimeout('blocked close', () => new Promise(() => {}), 10),
    /blocked close timed out after 10ms/,
  );
});

test('listenWorkshopServer closes its own handle before propagating listen failure', async () => {
  let closeCalls = 0;
  const server = {
    listen: async () => { throw new Error('listen failed'); },
    close: async () => { closeCalls += 1; },
  };

  await assert.rejects(listenWorkshopServer(server), /listen failed/);
  assert.equal(closeCalls, 1);
});
