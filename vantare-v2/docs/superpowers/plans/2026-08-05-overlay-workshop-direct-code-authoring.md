# Overlay Workshop Direct Code Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Delegation for this issue:** only the root orchestrator may assign one microcorte to a fresh worker. Every assigned worker must use `executing-plans` inline and is forbidden from spawning, delegating or coordinating other agents.

**Goal:** Convertir el Overlay Workshop existente en un bucle de autoría directa sobre el TSX/CSS productivo, con HMR real, catálogo explícito, restauración byte a byte y una guía que permita crear o modificar widgets sin traducción intermedia.

**Architecture:** `WidgetVisualHost`, los manifests y `official-designs.ts` continúan siendo las únicas fronteras productivas; `/workshop` solo selecciona fixtures y superficies para renderizar exactamente esos componentes. Un smoke de desarrollo modifica temporalmente un atributo TSX y una regla CSS del Delta Original, observa ambos cambios mediante un único servidor Vite y restaura siempre los bytes originales. No se introduce DSL, generador, renderer alternativo, segundo catálogo ni conversor HTML.

**Tech Stack:** React 19, TypeScript 6, Vite 8 HMR, Vitest, Node.js `node:test`, Playwright 1.60, CSS productivo, Git y documentación Markdown.

---

## Reglas operativas para todos los workers

- Rama única de ejecución: `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`.
- Base aprobada: ISA-265 en `54088b2e5ad25d9a897cb89187ee9684b75c645f`.
- Worktree: `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
- Cada worker ejecuta solo la tarea que recibe y **no puede delegar, lanzar subagentes ni ampliar el alcance**.
- Antes de editar: ejecutar `git status --short` y detenerse si hay cambios ajenos al corte asignado.
- Staging siempre por rutas explícitas; queda prohibido `git add .`.
- No añadir dependencias, no cambiar píxeles permanentes, no migrar los 41 diseños y no tocar Billing, canvas, LMU, Wails/SSE, perfiles o baselines.
- El smoke HMR es una herramienta reversible. Si un archivo objetivo ya está modificado, debe fallar antes de escribir.
- Esta issue puede quedar técnicamente lista, pero no entra en `nightly` sin aprobación expresa de Isaac.

## Mapa de archivos

| Ruta | Responsabilidad única | Acción |
|---|---|---|
| `frontend/scripts/overlay-workshop-hmr-smoke.mjs` | Pilotar un único Vite+Chromium, mutar dos archivos productivos y restaurarlos | Crear |
| `frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs` | Probar inyección exacta, rechazo, cleanup y guard de worktree | Crear |
| `frontend/package.json` | Exponer el smoke y su test con nombres estables | Modificar |
| `frontend/src/overlay/core/overlay-workshop-characterization.test.ts` | Declarar Workshop como consumidor real del host y bloquear bypasses | Modificar |
| `frontend/src/overlay/design-systems/official-designs.test.ts` | Proteger unicidad/defaults del catálogo completo | Modificar |
| `docs/overlays-studio/overlay-workshop-authoring-guide.md` | Recetas ejecutables de restyle, composición, tipo y sistema | Crear |
| `docs/overlays-studio/os-09-overlay-workshop-contract.md` | Sustituir el enfoque declarativo descartado por autoría directa | Modificar |
| `docs/current-plan.md` | Registrar resultado, evidencia y siguiente corte | Modificar al cierre |
| `docs/vantare-program/handoffs/overlays-launcher-hub.md` | Permitir continuidad desde otro chat sin historial | Modificar al cierre |

Los archivos productivos `DeltaOriginal.tsx` y `vantare-original/tokens.css` solo se modifican temporalmente durante el smoke. Sus hashes y su estado Git deben terminar exactamente como empezaron.

## Microcorte D0 — Preflight reproducible

### Task 0: preparar el worktree sin alterar dependencias

**Files:**
- Verify: `frontend/pnpm-lock.yaml`
- Generated ignored: `frontend/node_modules/**`

- [ ] **Step 1: verificar checkout y toolchain**

Run:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
node --version
corepack pnpm --version
```

Expected: rama exacta ISA-291, `HEAD` incluye los commits aprobados de spec/plan, worktree limpio, Node y pnpm responden.

- [ ] **Step 2: instalar solo si falta Vitest local**

Run:

```powershell
$lockBefore = (Get-FileHash frontend/pnpm-lock.yaml -Algorithm SHA256).Hash
if (-not (Test-Path frontend/node_modules/.bin/vitest.cmd)) {
  corepack pnpm --dir frontend install --frozen-lockfile
}
$lockAfter = (Get-FileHash frontend/pnpm-lock.yaml -Algorithm SHA256).Hash
if ($lockBefore -ne $lockAfter) { throw 'pnpm-lock.yaml changed during frozen install' }
git status --short
```

Expected: instalación PASS, lockfile idéntico y worktree limpio. `node_modules` permanece ignorado.

- [ ] **Step 3: verificar ejecutables locales**

Run:

```powershell
corepack pnpm --dir frontend exec vitest --version
corepack pnpm --dir frontend exec vite --version
corepack pnpm --dir frontend exec node -e "import('playwright').then(() => console.log('playwright: available'))"
```

Expected: los tres componentes responden. Si Playwright no encuentra navegador, Task 4 utilizará el Chrome del sistema antes de escribir archivos.

## Microcorte D1 — Contratos de host y catálogo

### Task 1: Workshop como consumidor protegido del host real

Este es un guard estático complementario: la prueba renderizada de `OverlayWorkshopDevRoute.test.tsx` sigue siendo la evidencia dinámica. Ninguno de los dos sustituye al otro.

**Files:**
- Modify: `frontend/src/overlay/core/overlay-workshop-characterization.test.ts`
- Test: `frontend/src/overlay/core/overlay-workshop-characterization.test.ts`

- [ ] **Step 1: ampliar el contrato de consumidores**

Añadir la ruta del Workshop al array existente, sin crear otro array o excepción:

```ts
const hostConsumers = [
  "hub/overlay-studio/canvas/StudioWidgetFrame.tsx",
  "overlay/runtime/RuntimeWidgetFrame.tsx",
  "hub/overlays/ProfilePreview.tsx",
  "overlay/authoring/OverlayWorkshopDevRoute.tsx",
] as const;
```

Renombrar el test para que describa todas las superficies cubiertas:

```ts
it("keeps Studio, runtime, profile preview and Workshop on the sole WidgetVisualHost boundary", () => {
```

- [ ] **Step 2: ejecutar la caracterización focal**

Run:

```powershell
corepack pnpm --dir frontend exec vitest run src/overlay/core/overlay-workshop-characterization.test.ts
```

Expected: `3 tests passed`. Si el Workshop importase un renderer concreto o dejase de usar `WidgetVisualHost`, debe fallar con la ruta ofensora.

- [ ] **Step 3: comprobar formato y commit pequeño**

Run:

```powershell
git diff --check -- frontend/src/overlay/core/overlay-workshop-characterization.test.ts
git add frontend/src/overlay/core/overlay-workshop-characterization.test.ts
git commit -m "test(overlay): guard Workshop host boundary"
```

Expected: diff limpio y un commit que toca un solo archivo.

### Task 2: invariantes completas del catálogo oficial

**Files:**
- Modify: `frontend/src/overlay/design-systems/official-designs.test.ts`
- Test: `frontend/src/overlay/design-systems/official-designs.test.ts`

- [ ] **Step 1: escribir primero los invariantes que faltan**

Sustituir el test limitado a cuatro tipos por estos dos tests:

```ts
it("uses a unique stable ID for every official design", () => {
  const ids = listOfficialDesigns().map((design) => design.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("marks exactly one default design for every registered widget/system pair", () => {
  const expectedPairs = designSystemRegistry.list().flatMap((system) =>
    system.widgets.map((widget) => [widget.widgetType, system.id] as const),
  );

  for (const [widgetType, systemId] of expectedPairs) {
    expect(
      listOfficialDesigns(widgetType).filter(
        (design) => design.systemId === systemId && design.isDefault,
      ),
      `${widgetType}:${systemId} must have exactly one default design`,
    ).toHaveLength(1);
  }
});
```

No introducir orden sintético ni `catalogPosition`: el array explícito sigue siendo la decisión de producto.

- [ ] **Step 2: ejecutar el test y corregir solo datos reales si falla**

Run:

```powershell
corepack pnpm --dir frontend exec vitest run src/overlay/design-systems/official-designs.test.ts
```

Expected: todos los tests pasan con el catálogo actual. Si aparece un ID duplicado o falta un default, detener la tarea, registrar la evidencia en ISA-291 y abrir una issue de corrección de catálogo separada. ISA-291 no modifica `official-designs.ts` para fabricar una demostración verde.

- [ ] **Step 3: ejecutar ambos contratos juntos**

Run:

```powershell
corepack pnpm --dir frontend exec vitest run src/overlay/core/overlay-workshop-characterization.test.ts src/overlay/design-systems/official-designs.test.ts
```

Expected: ambos archivos y todos sus tests pasan.

- [ ] **Step 4: commit del contrato de catálogo**

Run:

```powershell
git diff --check -- frontend/src/overlay/design-systems/official-designs.test.ts
git add frontend/src/overlay/design-systems/official-designs.test.ts
git commit -m "test(overlay): enforce official design invariants"
```

Expected: solo el test entra en el commit; `official-designs.ts` permanece intacto.

## Microcorte D2 — Piloto de mutaciones reversibles

### Task 3: helpers fail-closed y restauración byte a byte

**Files:**
- Create: `frontend/scripts/overlay-workshop-hmr-smoke.mjs`
- Create: `frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs`

- [ ] **Step 1: escribir el test antes del piloto**

Crear `frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs` con este contenido:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertGitClean,
  assertExactlyOne,
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
    });
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
      'cleaned.bin', 'manifest.json', 'original.bin', 'observed.bin',
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
```

- [ ] **Step 2: comprobar que el test falla por módulo ausente**

Run:

```powershell
node --test frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs
```

Expected: FAIL con `ERR_MODULE_NOT_FOUND` para `overlay-workshop-hmr-smoke.mjs`.

- [ ] **Step 3: implementar el núcleo reversible mínimo**

Crear `frontend/scripts/overlay-workshop-hmr-smoke.mjs` inicialmente con:

```js
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
```

No incluir aún Vite o Playwright: este paso demuestra restauración exacta cuando no hay drift y conservación de ediciones externas cuando sí lo hay. La evidencia no contiene rutas personales.

- [ ] **Step 4: ejecutar el test hasta PASS**

Run:

```powershell
node --test frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs
```

Añadir este caso:

```js
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
```

Expected: `8 tests`, `8 pass`, `0 fail`. Un test concurrente conserva `EXTERNAL_EDIT` y elimina solo `OWN_MARKER`; el segundo demuestra que, si el marcador ya no puede aislarse, se preservan todos los bytes observados y se escribe evidencia; el último demuestra cleanup exacto bajo cancelación.

- [ ] **Step 5: commit del piloto reversible**

Run:

```powershell
git diff --check -- frontend/scripts/overlay-workshop-hmr-smoke.mjs frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs
git add frontend/scripts/overlay-workshop-hmr-smoke.mjs frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs
git commit -m "test(overlay): add reversible HMR pilot"
```

Expected: commit con exactamente los dos scripts.

## Microcorte D3 — Smoke HMR real en un único servidor

### Task 4: observar TSX y CSS productivos sin reiniciar

**Files:**
- Modify: `frontend/scripts/overlay-workshop-hmr-smoke.mjs`
- Modify: `frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: añadir tests de las mutaciones contractuales**

Ampliar el import del test con `buildCssMutation`, `buildTsxMutation`, `closeWithTimeout` y `listenWorkshopServer`, y añadir:

```js
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
```

Run:

```powershell
node --test frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs
```

Expected: FAIL porque las dos funciones todavía no están exportadas.

- [ ] **Step 2: implementar mutaciones mínimas y exactas**

Añadir al script:

```js
const TSX_ANCHOR = '      data-tone={model.tone}\r\n      className="vo-delta"';
const TSX_MARKER = '      data-overlay-workshop-hmr-tsx="active"\r\n';
const CSS_MARKER = `\r\n[data-widget-system="vantare-original"].vo-delta[data-overlay-workshop-hmr-tsx="active"] {\r\n  --overlay-workshop-hmr-css: 17px;\r\n}\r\n`;

export function buildTsxMutation(bytes) {
  const source = bytes.toString('utf8');
  const anchor = source.includes(TSX_ANCHOR) ? TSX_ANCHOR : TSX_ANCHOR.replaceAll('\r\n', '\n');
  const newline = source.includes(TSX_ANCHOR) ? '\r\n' : '\n';
  const marker = TSX_MARKER.replaceAll('\r\n', newline);
  const replacement = anchor.replace(`      className`, `${marker}      className`);
  return {
    mutated: Buffer.from(assertExactlyOne(source, anchor, replacement)),
    removeOwnMarker: (observed) => Buffer.from(assertExactlyOne(observed.toString('utf8'), marker, '')),
  };
}

export function buildCssMutation(bytes) {
  const source = bytes.toString('utf8');
  if (source.includes('--overlay-workshop-hmr-css')) {
    throw new Error('temporary HMR CSS marker already exists');
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const marker = CSS_MARKER.replaceAll('\r\n', newline);
  return {
    mutated: Buffer.from(`${source}${marker}`),
    removeOwnMarker: (observed) => Buffer.from(assertExactlyOne(observed.toString('utf8'), marker, '')),
  };
}
```

Run de nuevo el test Node. Expected: `14 pass`; cancelación, LF, CRLF, BOM, newline final, cleanup acotado y fallo parcial de `listen()` quedan cubiertos.

- [ ] **Step 3: añadir servidor, navegador y errores observables**

Añadir los imports:

```js
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
```

Añadir estas funciones:

```js
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function progress(phase) {
  process.stdout.write(`[overlay-workshop-hmr] ${phase}\n`);
}

export async function closeWithTimeout(label, close, timeoutMs = 5000) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(close),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function listenWorkshopServer(server) {
  try {
    await server.listen();
  } catch (listenError) {
    try {
      await closeWithTimeout('Vite cleanup after failed listen', () => server.close());
    } catch (closeError) {
      throw new AggregateError([listenError, closeError], 'Vite listen and cleanup failed');
    }
    throw listenError;
  }
}

async function startWorkshopServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: frontendRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5183, strictPort: false },
  });
  await listenWorkshopServer(server);
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5183;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function installSignalCancellation(controller) {
  let requestedExitCode = 0;
  const onSigint = () => {
    requestedExitCode = 130;
    if (!controller.signal.aborted) controller.abort(new Error('SIGINT requested'));
  };
  const onSigterm = () => {
    requestedExitCode = 143;
    if (!controller.signal.aborted) controller.abort(new Error('SIGTERM requested'));
  };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return {
    exitCode: () => requestedExitCode,
    dispose: () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}

function workshopUrl(baseUrl) {
  const query = new URLSearchParams({
    widget: 'delta',
    system: 'vantare-original',
    design: 'delta-original-base',
    state: 'ready',
    surface: 'studio',
    variant: 'default',
    session: 'race',
    location: 'track',
    background: 'transparent',
    scale: '1',
    preset: '1080p',
  });
  return `${baseUrl}/workshop?${query}`;
}

async function waitForComputedProperty(page, expected) {
  await page.waitForFunction((value) => {
    const root = document.querySelector('[data-widget-renderer="delta"]');
    return root && getComputedStyle(root).getPropertyValue('--overlay-workshop-hmr-css').trim() === value;
  }, expected);
}

async function assertNoReload(page, sentinel, navigationCount, phase) {
  const current = await page.evaluate(() => window.__vantareWorkshopHmrSentinel);
  if (current !== sentinel) throw new Error(`${phase}: page sentinel changed; HMR became a reload`);
  if (navigationCount() !== 0) throw new Error(`${phase}: main frame navigated during HMR`);
}

async function assertEndpointClosed(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal });
    throw new Error(`Vite endpoint still responds after cleanup: ${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Vite endpoint still responds')) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Vite endpoint did not close before timeout');
    }
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: implementar el escenario completo con cleanup anidado**

Añadir `main` y el guard de ejecución directa:

```js
async function main() {
  const relativeTsx = 'vantare-v2/frontend/src/overlay/design-systems/vantare-original/delta/DeltaOriginal.tsx';
  const relativeCss = 'vantare-v2/frontend/src/overlay/design-systems/vantare-original/tokens.css';
  const tsxFile = path.join(repositoryRoot, relativeTsx);
  const cssFile = path.join(repositoryRoot, relativeCss);
  const recoveryRoot = path.join(frontendRoot, '.tmp', 'overlay-workshop-hmr-smoke');
  assertGitClean(['vantare-v2']);

  const originalTsx = await readFile(tsxFile);
  const originalCss = await readFile(cssFile);
  let server;
  let baseUrl;
  let browser;
  let operationError;
  const cleanupErrors = [];
  const consoleErrors = [];
  const pageErrors = [];
  const cancellationController = new AbortController();
  const signalCancellation = installSignalCancellation(cancellationController);
  try {
    const started = await startWorkshopServer();
    server = started.server;
    baseUrl = started.baseUrl;
    if (cancellationController.signal.aborted) throw cancellationController.signal.reason;
    const executablePath = process.platform === 'win32' && existsSync(chromeExecutable)
      ? chromeExecutable
      : undefined;
    try {
      browser = await chromium.launch({ headless: true, executablePath, timeout: 15_000 });
    } catch (error) {
      throw new Error(
        `No usable Chromium was found. Install Playwright Chromium or Google Chrome at ${chromeExecutable}. ${error instanceof Error ? error.message : error}`,
      );
    }
    if (cancellationController.signal.aborted) throw cancellationController.signal.reason;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    let navigationCount = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationCount += 1;
    });
    await page.goto(workshopUrl(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-widget-renderer="delta"]').waitFor();
    navigationCount = 0;
    const sentinel = `hmr-${Date.now()}-${Math.random()}`;
    await page.evaluate((value) => { window.__vantareWorkshopHmrSentinel = value; }, sentinel);
    await page.waitForFunction(() => !document.querySelector('[data-overlay-workshop-hmr-tsx="active"]'));
    await waitForComputedProperty(page, '');

    await mutateFileTemporarily({
      file: tsxFile,
      buildMutation: buildTsxMutation,
      recoveryDirectory: path.join(recoveryRoot, 'tsx'),
      signal: cancellationController.signal,
      verify: async () => {
      await page.locator('[data-widget-renderer="delta"][data-overlay-workshop-hmr-tsx="active"]').waitFor();
      await waitForComputedProperty(page, '');
      await assertNoReload(page, sentinel, () => navigationCount, 'tsx apply');
      progress('tsx transition observed without navigation');
      await mutateFileTemporarily({
        file: cssFile,
        buildMutation: buildCssMutation,
        recoveryDirectory: path.join(recoveryRoot, 'css'),
        signal: cancellationController.signal,
        verify: async () => {
          await waitForComputedProperty(page, '17px');
          await assertNoReload(page, sentinel, () => navigationCount, 'css apply');
          progress('css transition observed without navigation');
        },
      });
      await waitForComputedProperty(page, '');
      await assertNoReload(page, sentinel, () => navigationCount, 'css restore');
      progress('css restoration observed without navigation');
      },
    });
    await page.waitForFunction(() => !document.querySelector('[data-overlay-workshop-hmr-tsx="active"]'));
    await assertNoReload(page, sentinel, () => navigationCount, 'tsx restore');
    progress('tsx restoration observed without navigation');

    if (!(await readFile(tsxFile)).equals(originalTsx)) throw new Error('TSX restoration mismatch');
    if (!(await readFile(cssFile)).equals(originalCss)) throw new Error('CSS restoration mismatch');
    assertGitClean(['vantare-v2']);
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }
  } catch (error) {
    operationError = error;
  } finally {
    const cleanupResults = await Promise.allSettled([
      browser ? closeWithTimeout('browser close', () => browser.close()) : Promise.resolve(),
      server ? closeWithTimeout('Vite close', () => server.close()) : Promise.resolve(),
    ]);
    for (const result of cleanupResults) {
      if (result.status === 'rejected') cleanupErrors.push(result.reason);
    }
    const requestedExitCode = signalCancellation.exitCode();
    signalCancellation.dispose();
    if (requestedExitCode) {
      process.exitCode = requestedExitCode;
      operationError ??= new Error(`signal cancellation completed with exit code ${requestedExitCode}`);
    }
  }
  if (browser?.isConnected()) cleanupErrors.push(new Error('browser remains connected'));
  if (baseUrl) await assertEndpointClosed(baseUrl).catch((error) => cleanupErrors.push(error));
  if (operationError || cleanupErrors.length) {
    throw new AggregateError(
      [operationError, ...cleanupErrors].filter(Boolean),
      'overlay-workshop-hmr-smoke failed',
    );
  }
  process.stdout.write('overlay-workshop-hmr-smoke: PASS (tsx + css + byte restoration + resource cleanup)\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    if (!process.exitCode) process.exitCode = 1;
  });
}
```

Las mutaciones restauran o retiran su propio marcador **antes** de cerrar navegador y servidor. SIGINT/SIGTERM desactivan la salida inmediata de Node, marcan cancelación y dejan terminar la operación Playwright acotada en curso; al volver de ella se lanza el error, se recorren los `finally` y solo después se asigna 130/143. No se utiliza `Promise.race` para startup, por lo que nunca se pierde la referencia a un Vite o Chromium que resuelva tarde; Playwright usa su timeout nativo de launch. Si `server.listen()` falla, su propio helper cierra el handle antes de propagar. Los timeouts solo envuelven cierres cuyos handles siguen en memoria; si vencen, los gates de conexión/puerto aún se ejecutan y fallan de forma visible. Un kill forzado o corte eléctrico no puede ejecutar cleanup: la siguiente ejecución falla en el guard Git y exige restaurar/revisar el marcador antes de continuar.

- [ ] **Step 5: exponer comandos estables**

Añadir a `frontend/package.json` después de `visual:overlay-workshop`:

```json
"test:overlay-workshop-hmr": "node --test scripts/overlay-workshop-hmr-smoke.node-test.mjs",
"smoke:overlay-workshop-hmr": "node scripts/overlay-workshop-hmr-smoke.mjs",
```

- [ ] **Step 6: ejecutar unit tests y lint antes del commit**

Run:

```powershell
corepack pnpm --dir frontend test:overlay-workshop-hmr
corepack pnpm --dir frontend exec eslint scripts/overlay-workshop-hmr-smoke.mjs scripts/overlay-workshop-hmr-smoke.node-test.mjs
git diff --check -- frontend/scripts/overlay-workshop-hmr-smoke.mjs frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs frontend/package.json
```

Expected:

```text
14 tests passed
```

ESLint y `git diff --check` también terminan sin errores.

- [ ] **Step 7: commit del smoke antes de ejecutarlo sobre producto**

Run:

```powershell
git add frontend/scripts/overlay-workshop-hmr-smoke.mjs frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs frontend/package.json
git commit -m "test(overlay): verify direct code HMR"
git status --short
```

Expected: commit limitado a tres archivos y árbol completamente limpio. El smoke no se ejecuta sobre cambios sin commit.

- [ ] **Step 8: ejecutar el smoke real sobre `HEAD` limpio**

Run:

```powershell
corepack pnpm --dir frontend smoke:overlay-workshop-hmr
git check-ignore frontend/.tmp/overlay-workshop-hmr-smoke
git status --short
```

Expected:

```text
overlay-workshop-hmr-smoke: PASS (tsx + css + byte restoration + resource cleanup)
```

`git check-ignore` imprime la ruta temporal; `git status` no imprime nada, el navegador queda desconectado y el puerto Vite ya no responde. Si el smoke falla, corregir script/test en un commit `fix(overlay): harden direct code HMR`, volver a dejar el árbol limpio y repetir este paso; no esconder el fallo ni borrar evidencia de recuperación.

## Microcorte D4 — Guía ejecutable de autoría

### Task 5: documentar los cuatro flujos sin capa intermedia

**Files:**
- Create: `docs/overlays-studio/overlay-workshop-authoring-guide.md`
- Modify: `docs/overlays-studio/os-09-overlay-workshop-contract.md`

- [ ] **Step 1: crear la guía canónica**

La guía debe contener exactamente estas secciones y decisiones:

```md
# Overlay Workshop — guía de autoría directa

## Regla de oro
Se edita el TSX/CSS productivo. Workshop no convierte, exporta ni copia nada.
La URL `/workshop` renderiza ese mismo código mediante `WidgetVisualHost`.

## Abrir el bucle rápido
1. Verifica rama y worktree.
2. Ejecuta `corepack pnpm --dir frontend dev`.
3. Abre una URL reproducible de `/workshop`.
4. Edita el renderer o CSS de producto.
5. Vite actualiza el root sin reiniciar.
6. Ejecuta `corepack pnpm --dir frontend smoke:overlay-workshop-hmr` antes de entregar cambios de tooling.

## Restyle de un diseño existente
- Localiza el diseño en `official-designs.ts`.
- Sigue `systemId` y `widgetType` hasta su manifest y renderer.
- Cambia el CSS/TSX final más pequeño posible.
- No añadas otro renderer, host o catálogo.

## Nueva composición del mismo widget y sistema
- Añade un `templateId` literal al archivo de settings específico del renderer.
- Valídalo con su parser y define un fallback explícito.
- Renderiza la composición dentro del renderer del sistema existente.
- Registra el diseño en `official-designs.ts`.
- Delta Crystal (`delta-bar`/`delta-simple`) es la referencia concreta.

Ejemplo mínimo real:
```ts
export const DELTA_TEMPLATE_IDS = ["delta-bar", "delta-simple"] as const;
export type DeltaTemplateId = (typeof DELTA_TEMPLATE_IDS)[number];
```
Un valor desconocido nunca crea una rama implícita; pasa por
`parseDeltaSettings` y su fallback declarado.

## Nuevo tipo funcional
- Define el tipo y ViewModel puro.
- Regístralo en `widget-registry`.
- Implementa un renderer por sistema soportado.
- Registra manifests y diseños oficiales.
- Añade fixture neutral y tests.

## Nuevo sistema visual
- Define tokens y reglas visuales del sistema.
- Añade manifest versionado.
- Registra solo widgets realmente implementados.
- No fuerces una abstracción común sobre composiciones diferentes.

## HTML de referencia
Un HTML puede fijar píxeles, proporciones y estados visuales. No es código fuente,
no se compila y no crea una segunda implementación.

## Escalera de checks
- Durante edición: HMR, consola limpia y estado/superficie afectados.
- Antes de commit: Vitest focal, ESLint focal, `git diff --check` y build si cambia producto.
- Entrega visual: estados, fondos, superficies y protocolo visual focal.
- Programa: compile-out Stable, protocolo completo, handoff y aprobación de Isaac.

## Prohibiciones
- DSL universal o JSON renderer.
- Conversor HTML a producción.
- `import.meta.glob`, generated barrel, scaffolder obligatorio o `catalogPosition`.
- Imports de renderers concretos desde Workshop.
- Fixtures live, Wails/SSE o persistencia dentro de authoring.
- Regenerar baselines para ocultar diferencias.
```

Añadir después ejemplos de URL para Delta Original y Delta Crystal Simple, y una tabla `cambio → archivos habituales → checks focales` usando rutas reales del repositorio.

- [ ] **Step 2: corregir el contrato OS-09**

En `os-09-overlay-workshop-contract.md`, sustituir el punto antiguo:

```md
4. Autoría declarativa y scaffolder; catálogo solo por consumidores cero y su issue.
```

por:

```md
4. ISA-291: autoría directa sobre TSX/CSS productivo, smoke HMR reversible y guía ejecutable. No existe conversión Workshop→app ni scaffolder obligatorio.
```

Añadir un párrafo de autoridad:

```md
La especificación aprobada para ISA-291 es
`docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`.
Un HTML puede seguir siendo referencia visual, pero la única fuente de verdad
ejecutable es el renderer productivo registrado y su CSS.
```

- [ ] **Step 3: validar que la documentación no conserva el enfoque descartado**

Run:

```powershell
rg -n "autoría declarativa|scaffolder obligatorio|catalogPosition|import\.meta\.glob" docs/overlays-studio/overlay-workshop-authoring-guide.md docs/overlays-studio/os-09-overlay-workshop-contract.md
```

Expected: las coincidencias solo aparecen en la sección de prohibiciones o como enfoque explícitamente descartado; ninguna instrucción ordena implementarlas.

- [ ] **Step 4: commit de documentación operativa**

Run:

```powershell
git diff --check -- docs/overlays-studio/overlay-workshop-authoring-guide.md docs/overlays-studio/os-09-overlay-workshop-contract.md
git add docs/overlays-studio/overlay-workshop-authoring-guide.md docs/overlays-studio/os-09-overlay-workshop-contract.md
git commit -m "docs(overlay): document direct Workshop authoring"
```

Expected: dos archivos Markdown; cero cambio de producto.

## Microcorte D5 — Gates acumulativos y continuidad

### Task 6: validación técnica completa de ISA-291

**Files:**
- Test: todos los archivos tocados en Tasks 1–5
- Generated only: `frontend/.tmp/overlay-workshop-visual-protocol/**` (no versionar)

- [ ] **Step 1: ejecutar la suite focal rápida**

Run:

```powershell
corepack pnpm --dir frontend test:overlay-workshop-hmr
corepack pnpm --dir frontend smoke:overlay-workshop-hmr
corepack pnpm --dir frontend exec vitest run src/overlay/core/overlay-workshop-characterization.test.ts src/overlay/design-systems/official-designs.test.ts src/overlay/authoring/OverlayWorkshopDevRoute.test.tsx src/overlay/authoring/overlay-workshop-query.test.ts
corepack pnpm --dir frontend test
```

Expected: tests focales y suite frontend completa PASS, smoke TSX+CSS PASS y cero archivo productivo dirty. Si la suite completa descubre deuda heredada, registrar el test y error exactos; no ocultarlo ni reducir cobertura.

- [ ] **Step 2: ejecutar lint focal y contrato de diseño**

Run:

```powershell
corepack pnpm --dir frontend exec eslint scripts/overlay-workshop-hmr-smoke.mjs scripts/overlay-workshop-hmr-smoke.node-test.mjs src/overlay/core/overlay-workshop-characterization.test.ts src/overlay/design-systems/official-designs.test.ts
corepack pnpm --dir frontend design-system:check
```

Expected: ambos comandos PASS. No usar el lint global heredado como excusa para omitir el lint focal.

- [ ] **Step 3: construir y probar compile-out Stable**

Run:

```powershell
corepack pnpm --dir frontend build
$hits = rg -n "overlay-workshop|Overlay Workshop|DEV ONLY" frontend/dist -g "*.js" -g "*.css"; if ($LASTEXITCODE -eq 0) { $hits; throw 'Workshop authoring leaked into production build' } elseif ($LASTEXITCODE -ne 1) { throw 'sentinel scan failed' }
```

Expected: build PASS y cero sentinels dentro de `frontend/dist`.

- [ ] **Step 4: ejecutar el protocolo visual real sobre un HEAD limpio**

Primero confirmar:

```powershell
git status --short
```

Expected: vacío. Después:

```powershell
corepack pnpm --dir frontend visual:overlay-workshop -- --widget=delta --system=vantare-original --design=delta-original-base --surface=all --viewport=1280x720
```

Expected: 16 escenarios PASS, `sha` igual a `git rev-parse HEAD`, `dirty=false`, root contractual aislado y sin contaminación del stage. El tiempo esperado es 5–8 minutos; no bajar timeouts ni umbrales para acelerarlo.

- [ ] **Step 5: verificar artefactos y ausencia de cambios temporales**

Run:

```powershell
$report = Get-Content frontend/.tmp/overlay-workshop-visual-protocol/report.json -Raw | ConvertFrom-Json
if (-not $report.pass -or $report.dirty) { throw 'visual protocol did not close cleanly' }
if ($report.sha -ne (git rev-parse HEAD)) { throw 'visual provenance does not match HEAD' }
git status --short
```

Expected: ninguna excepción y worktree limpio. Los PNG y JSON de `.tmp` permanecen ignorados y no se añaden al commit.

### Task 7: handoff, Linear y cierre técnico

**Files:**
- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/overlays-launcher-hub.md`

- [ ] **Step 1: registrar una nota factual en `current-plan.md`**

Añadir al final una sección `Nota ISA-291 / OS-09G2` que incluya:

```md
- Autoría directa: TSX/CSS productivo es la única fuente de verdad; Workshop no convierte ni copia.
- El Workshop continúa renderizando por `WidgetVisualHost` y catálogo explícito.
- Smoke HMR: un Vite+Chromium, cambio TSX y CSS observable, restauración byte a byte y guard de archivos clean.
- Contratos: Workshop añadido a consumidores del host; IDs únicos y un default por pareja registrada.
- Exclusiones: sin DSL, scaffolder, catálogo paralelo, migración masiva, dependencia o cambio visual.
- Evidencia: comandos, número de tests, build, compile-out y reporte visual con SHA/dirty.
- Estado Git/Linear: rama, commits, push/PR si existen y ausencia de promoción a nightly.
- Próxima acción: revisión adversarial y aprobación explícita de Isaac antes de cualquier promoción.
```

Sustituir cada descripción genérica por los resultados exactos obtenidos en Task 6.

- [ ] **Step 2: actualizar el handoff vivo**

Añadir una sección `ISA-291 — autoría directa` con:

```md
1. Decisión aprobada y enlace a spec/plan/guía.
2. Rama, base exacta, worktree y commits.
3. Arquitectura conservada: Host → registry/manifest → renderer productivo.
4. Cómo abrir Workshop y ejecutar el smoke HMR.
5. Qué demostró cada test y protocolo.
6. Riesgos restantes y qué queda fuera del corte.
7. Próxima acción exacta para un chat nuevo.
```

No copiar secretos, rutas de `.env.local` ni datos personales.

- [ ] **Step 3: validar docs y commit de cierre**

Run:

```powershell
git diff --check -- docs/current-plan.md docs/vantare-program/handoffs/overlays-launcher-hub.md
git add docs/current-plan.md docs/vantare-program/handoffs/overlays-launcher-hub.md
git commit -m "docs(overlay): close ISA-291 handoff"
git status --short
```

Expected: commit documental y worktree vacío.

- [ ] **Step 4: actualizar Linear sin promover la rama**

En ISA-291 registrar:

```md
Resultado técnico
- Rama y base exactas.
- Commits creados.
- Archivos modificados.
- Tests/checks ejecutados y resultados.
- Checks omitidos y motivo.
- Riesgos restantes.
- Guía manual: URL y comando HMR.
- Confirmación: no se promovió a nightly/testers/master.
```

Mover ISA-291 a `In Review` solo si no queda ningún P0/P1/P2 ni P3 razonable. Mantener ISA-279 e ISA-280 bloqueadas por ISA-291 hasta la revisión adversarial y la aprobación humana.

## Revisión independiente obligatoria tras la implementación

El orquestador debe asignar a un único revisor nuevo, sin permisos de delegación, una revisión read-only con este contrato:

```text
Revisa ISA-291 contra AGENTS.md, la issue de Linear, la especificación aprobada y
este plan. No edites archivos, no actualices Linear y no lances subagentes.
Busca overengineering, una segunda fuente de verdad, imports directos de renderers,
mutaciones no reversibles, falsos positivos de HMR, compile-out incompleto,
comandos imposibles, tests complacientes, drift del catálogo y cambios fuera de
alcance. Clasifica hallazgos P0/P1/P2/P3 con archivo y línea. Confirma también
qué gates pasaron realmente y cuáles no. Si no hay hallazgos, dilo explícitamente.
```

Todo P0/P1/P2 y P3 razonable se devuelve al worker correspondiente, se corrige con test de regresión y se revisa de nuevo antes de solicitar aprobación a Isaac.

## Verificación manual final para Isaac

Realizar esta prueba con un único operador, autosave y formatter desactivados para los dos archivos objetivo, y sin ningún smoke automatizado ejecutándose en paralelo.

1. Desde el worktree de ISA-291, ejecutar `corepack pnpm --dir frontend dev`.
2. Abrir el Delta Original en `/workshop` y dejar la ventana visible.
3. Cambiar temporalmente un texto o propiedad CSS del renderer objetivo.
4. Confirmar que cambia sin reiniciar Vite y que Studio no usa otra implementación.
5. Deshacer el cambio y confirmar restauración visual.
6. Ejecutar `corepack pnpm --dir frontend smoke:overlay-workshop-hmr`.
7. Confirmar que termina PASS y que `git status --short` queda vacío.
8. Pedir después «crea X overlay»: el worker debe editar los archivos finales descritos por la guía, no HTML ni una representación intermedia.

## Condición de cierre

ISA-291 está lista para aprobación cuando el bucle directo TSX/CSS→HMR→mismo renderer productivo queda demostrado de forma automática y manual, la restauración es byte a byte, Stable no contiene authoring, el catálogo sigue explícito, la guía permite ejecutar los cuatro flujos y la revisión independiente no deja hallazgos abiertos razonables.
