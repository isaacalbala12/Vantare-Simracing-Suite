# ISA-14 — Auditoría para relanzar Vantare V2 desde la carpeta raíz

Fecha de corte: 2026-07-14

Tipo: investigación y planificación, estrictamente read-only sobre producto y estructura existentes

Base auditada: `develop@c49e14aab474ee132c0368e92918f78d66a162c8`

Rama del informe: `vantareapp/isa-14-root-migration-audit-relaunch-20260714`

Destino futuro del PR: `develop`

Merge automático: prohibido
Gate: nada puede entrar en `develop` sin validación manual completa y aprobación explícita.

> Esta es la relanzada válida de ISA-14. No reutiliza ramas, worktrees, commits, matrices ni conclusiones de la ejecución invalidada anterior.

## 1. Veredicto ejecutivo

La recomendación es conservar el repositorio Git actual y ejecutar una promoción interna de `vantare-v2/` a la raíz, pero solo después de cerrar o aislar todo el trabajo activo y crear puntos de recuperación verificables. No se recomienda crear un repositorio nuevo: ambos árboles ya viven en el mismo historial, bajo un único `.git`, y separar V2 ahora añadiría riesgo sin aportar conservación de historia.

La secuencia recomendada combina las opciones 3, 4 y 1 de la issue:

1. mantener temporalmente la estructura mientras se guarda y coordina el trabajo activo;
2. realizar un corte archive-first con refs remotas, tag y bundle verificable;
3. promover V2 dentro del mismo repositorio mediante microcommits;
4. migrar de la madre solo los elementos vigentes y comprobados;
5. validar desde una checkout limpia;
6. retirar legado únicamente con aprobación humana individual por lote.

La raíz madre no es una simple copia de V2. En la base auditada contiene 746 archivos tracked y V2 contiene 937. Solo existen cuatro rutas relativas coincidentes y las cuatro tienen contenido distinto. Tras excluir rutas sensibles y rutas afectadas por trabajo activo, no aparece ningún duplicado por hash entre ambos árboles. Por tanto, no existe una deduplicación automática segura.

La migración no debe empezar mientras existan worktrees con cambios sin commit sobre rutas de V2. La auditoría encontró 110 rutas V2 afectadas en al menos un worktree activo; 26 también son tracked en la base. Todas quedan clasificadas como `KEEP/BLOCKED_ACTIVE_WORK` hasta que sus responsables las guarden, descarten o integren mediante una decisión independiente.

## 2. Confirmación de no mutación

Durante esta auditoría:

- no se movió, borró, renombró, fusionó, limpió, reseteó ni copió masivamente contenido;
- no se ejecutaron comandos de migración o eliminación;
- no se modificaron producto, configuración, scripts, CI, manifests ni documentos existentes;
- no se abrió, leyó, imprimió, parseó ni hasheó contenido sensible;
- no se leyó contenido de diffs sin commit de otros worktrees;
- la única escritura local es este informe;
- las otras escrituras autorizadas se limitan a comentarios y sub-issues de Linear.

## 3. Alcance, convenciones y límites

### 3.1 Árboles auditados

Para evitar exponer rutas personales, el informe usa estas variables:

| Variable | Significado |
|---|---|
| `${PRIMARY_ROOT}` | worktree físico principal que contiene el `.git` común |
| `${AUDIT_ROOT}` | raíz del worktree limpio usado por ISA-14 |
| `${V2}` | `${AUDIT_ROOT}/vantare-v2` |
| `${GIT_COMMON_DIR}` | directorio Git común asociado al worktree principal |

Rutas relativas canónicas:

- árbol madre: todo lo situado en `${AUDIT_ROOT}` excepto `vantare-v2/`;
- árbol V2: `${AUDIT_ROOT}/vantare-v2/`;
- workspace físico: `${PRIMARY_ROOT}`, usado solo para metadatos de ignorados y trabajo activo;
- raíz Git efectiva: `${AUDIT_ROOT}`, no `${V2}`.

### 3.2 Taxonomía

| Estado | Significado |
|---|---|
| `KEEP` | forma parte del producto, historia o gobierno que debe preservarse |
| `MIGRATE_CANDIDATE` | candidato a nueva ubicación o ajuste de ruta; requiere issue propia |
| `ARCHIVE_CANDIDATE` | material histórico potencialmente útil que no debe quedar en la raíz final |
| `DELETE_CANDIDATE` | generado, cache, stale o temporal; no autoriza borrado |
| `SENSITIVE_UNINSPECTED` | contenido deliberadamente opaco; solo se registran metadatos seguros |
| `BLOCKED_ACTIVE_WORK` | ruta solapada con cambios activos; no puede migrarse todavía |

Cuando aplican dos estados, se muestran juntos. `DELETE_CANDIDATE` nunca significa “borrar ahora”.

### 3.3 Fuentes de evidencia

Se leyó desde cero:

- `AGENTS.md`;
- `docs/current-plan.md`, priorizando estado operativo, riesgos, rutas y trabajo activo;
- `docs/agent-workflow.md`;
- issue ISA-14 y todos sus comentarios;
- metadatos Git, manifests, CI, Taskfiles, scripts y estructura del commit base.

Se usaron únicamente comandos read-only para la estructura existente: `git status`, `rev-parse`, `show-ref`, `ls-remote`, `worktree list`, `branch`, `for-each-ref`, `log`, `rev-list`, `ls-files`, `check-ignore`, `git grep`, `rg`, listado de directorios y metadatos de tamaño.

### 3.4 Zonas deliberadamente no inspeccionadas

No se inspeccionó contenido de:

- `.env*` en cualquier árbol;
- nombres que contengan `secret`, `credential`, `token`, `password`, `private-key`, `service-role` o `license-cache`;
- claves y certificados (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.crt`, `*.cer`);
- scripts locales de aplicación de secretos;
- resultados locales de búsquedas de tokens;
- diffs sin commit de otros worktrees;
- caches de dependencias y outputs generados, salvo nombres, conteos agregados y metadatos seguros.

Estas zonas se clasifican `SENSITIVE_UNINSPECTED` o `BLOCKED_ACTIVE_WORK`. No se infiere su contenido.

## 4. Línea base Git

| Campo | Evidencia |
|---|---|
| HEAD de auditoría | `c49e14aab474ee132c0368e92918f78d66a162c8` |
| `develop` local | mismo commit que HEAD al iniciar |
| `origin/develop` | 61 commits por detrás de `develop` local |
| Rama de auditoría | nombre exacto exigido por ISA-14 |
| Estado inicial/final previo al informe | limpio |
| Remotes | un remote `origin`; endpoint omitido/sanitizado |
| Default remote observado | `origin/HEAD` apunta a `origin/master`, no a `develop` |
| Git común | único `.git` común, fuera del subárbol V2 |
| Worktrees registrados | 17 |
| Worktrees en rama | 15 |
| Worktrees detached | 2 |
| Worktrees prunable/locked | 0 / 0 |
| Ramas locales | 20 |
| Refs remotas | 17 |
| Tags | 35 |

### 4.1 Límite Git

Solo se encontró un marcador `.git`: el de la raíz madre. `vantare-v2/` no contiene `.git`, no es submódulo y no es un repositorio independiente. Tampoco hay symlinks o submódulos tracked en el commit auditado.

Consecuencia: los commits históricos que tocaron `vantare-v2/` seguirán accesibles tras un `git mv`. Git no “guarda renames” como entidad, pero puede seguir el historial por similitud y los commits anteriores permanecen íntegros. Un repositorio nuevo perdería continuidad de refs, PRs, tags y contexto salvo un trasplante más complejo.

### 4.2 Historia por árbol

| Árbol | Primer commit que lo toca | Último commit en la base | Commits que lo tocan hasta la base |
|---|---|---:|---:|
| Madre, excluido V2 | `631557c` — 2026-06-03 | `3e20e0b` — 2026-07-10 | 112 |
| `vantare-v2/` | `5586c80` — 2026-06-11 | `c49e14a` — 2026-07-12 | 467 |

Los identificadores de commit se incluyen para trazabilidad; no son conclusiones heredadas de una auditoría anterior.

### 4.3 Riesgos Git críticos

1. `develop` local está 61 commits por delante de `origin/develop`. Una migración basada en el remote actual retrocedería trabajo.
2. `origin/HEAD` apunta a `master`, mientras la issue exige PR a `develop`. Scripts que usen el default implícito pueden apuntar al destino incorrecto.
3. El `.git` común pertenece al worktree físico principal. Borrar o mover ese directorio rompería todos los worktrees.
4. Hay numerosas ramas y tags históricos. Ninguna limpieza de refs forma parte de la migración de archivos.
5. Varios worktrees están sucios; no es seguro rebasear, eliminar worktrees o hacer una promoción masiva mientras sigan así.

## 5. Inventario tracked de ambos árboles

### 5.1 Totales

| Árbol | Archivos tracked | Bytes aproximados del checkout limpio |
|---|---:|---:|
| Madre, excluido `vantare-v2/` | 746 | 11.494.116 |
| V2 | 937 | 9.752.283 |
| Total | 1.683 | 21.246.399 |

Los tamaños son metadatos del checkout limpio, no del historial Git ni de caches ignoradas.

### 5.2 V2 por ruta superior

| Ruta relativa bajo `vantare-v2/` | Archivos | Bytes aprox. | Clasificación primaria |
|---|---:|---:|---|
| `frontend/` | 427 | 2.203.817 | `KEEP/MIGRATE_CANDIDATE` |
| `internal/` | 202 | 1.019.991 | `KEEP/MIGRATE_CANDIDATE` |
| `docs/` | 179 | 3.271.734 | `KEEP/MIGRATE_CANDIDATE` |
| `build/` | 77 | 2.666.147 | `KEEP/MIGRATE_CANDIDATE` |
| `cmd/` | 9 | 129.410 | `KEEP/MIGRATE_CANDIDATE` |
| `configs/` | 9 | 24.867 | `KEEP/MIGRATE_CANDIDATE`, con excepciones sensibles |
| `tools/` | 7 | 18.927 | `KEEP/MIGRATE_CANDIDATE` |
| `pkg/` | 7 | 32.873 | `KEEP/MIGRATE_CANDIDATE` |
| `mcps/` | 6 | 6.035 | `KEEP/MIGRATE_CANDIDATE` |
| `testdata/` | 4 | 339.317 | `KEEP/MIGRATE_CANDIDATE` |
| `.agents/` | 1 | 6.547 | `ARCHIVE_CANDIDATE`; no usar como fuente de verdad |
| `release-package/` | 1 | 1.618 | `ARCHIVE_CANDIDATE`; separar de binarios ignorados |
| archivos raíz de V2 | 9 | 32.618 aprox. | mezcla `KEEP`, colisiones y migración |

Los 427 archivos frontend se reparten principalmente entre TypeScript/React y tests. Los 225 archivos Go del conjunto V2 confirman que `go.mod`, `go.sum`, `cmd/`, `internal/` y `pkg/` forman un módulo cohesionado.

### 5.3 Madre por bloques

| Ruta madre | Archivos | Bytes aprox. | Función observada | Clasificación |
|---|---:|---:|---|---|
| `apps/` | 229 | 5.879.003 | aplicación Electron/TypeScript legacy y Storybook generado tracked | `ARCHIVE_CANDIDATE` |
| `packages/` | 176 | 463.027 | monorepo legacy (`auth`, `sim-core`, `types`, `ui-core`) | `ARCHIVE_CANDIDATE` |
| `.omo/` | 103 | 1.217.033 | planes/evidencia de agentes | `ARCHIVE_CANDIDATE` |
| `docs/` | 71 | 1.308.803 | documentación histórica y V1/V2 | revisión individual: `KEEP` o `ARCHIVE_CANDIDATE` |
| `supabase/` | 42 | 222.824 | schema/functions de auth, billing y licensing usados por V2 en runtime | `KEEP/MIGRATE_CANDIDATE` |
| `.swarm/` | 35 | 1.190.335 | sesiones/evidencia de agentes | `ARCHIVE_CANDIDATE` |
| `shared/` | 22 | 13.735 | package legacy compartido | `ARCHIVE_CANDIDATE` |
| `.sisyphus/` | 14 | 163.817 | planes/evidencia de agentes | `ARCHIVE_CANDIDATE` |
| `.github/` | 5 | 43.304 | CI/release/Discord vigentes con rutas V2 hardcodeadas | `KEEP/MIGRATE_CANDIDATE` |
| `tools/` | 4 | 33.646 | tooling de telemetría/sidecar, una ruta V2 hardcodeada | revisión individual |
| `.aider-desk/`, `.kilo/` | 5 | 67.897 | estado/herramientas de agentes | `ARCHIVE_CANDIDATE` |
| HTML de prototipo en raíz | 17 | ~300 KiB | mockups y variaciones antiguas | `ARCHIVE_CANDIDATE` |
| manifests/locks raíz | 6 | ~374 KiB | monorepo pnpm/Turbo legacy que incluye V2 frontend | `MIGRATE_CANDIDATE` o `ARCHIVE_CANDIDATE` por archivo |
| archivos temporales (`temp.ts`, `vite-output.txt`, SQL vacío) | 3 | ~6 KiB | scratch/output | `DELETE_CANDIDATE` tras aprobación |

## 6. Archivos exclusivos y duplicados por hash

### 6.1 Mismo path relativo

Solo cuatro rutas existen en ambos árboles con el mismo path relativo:

| Ruta relativa | Resultado |
|---|---|
| `.gitignore` | distinta |
| `README.md` | distinta |
| `docs/ARCHITECTURE.md` | distinta |
| `docs/CHANGELOG.md` | distinta |

No deben sobrescribirse. Cada colisión requiere resolución semántica:

- `.gitignore`: construir una unión revisada y comprobar ignores;
- `README.md`: V2 debe ser el README principal; el legacy se archiva con nombre explícito;
- `docs/ARCHITECTURE.md`: elegir documento canónico y preservar el histórico fuera del flujo operativo;
- `docs/CHANGELOG.md`: no confundir changelog legacy con el changelog público V2.

### 6.2 Exclusividad

- Madre: 742 archivos exclusivos por ruta relativa.
- V2: 933 archivos exclusivos por ruta relativa.
- Los principales exclusivos madre son `apps/`, `packages/`, `.omo/`, `docs/`, `supabase/`, `.swarm/` y `shared/`.
- Los principales exclusivos V2 son `frontend/`, `internal/`, `docs/`, `build/`, `cmd/`, `configs/`, `tools/`, `pkg/` y `mcps/`.

### 6.3 Comparación segura por hash

La comparación usó IDs de blob del índice Git y excluyó:

- 7 rutas tracked sensibles por nombre;
- 27 intersecciones tracked con trabajo activo (una madre y 26 V2; una ruta puede coincidir con otra exclusión);
- todas las rutas untracked/ignored;
- todo contenido de otros worktrees.

Resultado elegible:

| Árbol | Total tracked | Sensibles excluidos | Activos excluidos | Elegibles |
|---|---:|---:|---:|---:|
| Madre | 746 | 4 | 1 | 741 |
| V2 | 937 | 3 | 26 | 908 |

Duplicados cross-tree elegibles: **0 grupos / 0 paths**.

Esto no demuestra que no haya conceptos duplicados; demuestra que no hay archivos byte-a-byte idénticos dentro del conjunto seguro.

## 7. Worktrees y trabajo activo

### 7.1 Resumen

Se observaron 17 worktrees registrados. Al menos estos flujos tienen cambios sin commit o material untracked:

| Flujo | Paths observados | Zonas principales | Estado de migración |
|---|---:|---|---|
| raíz principal/refactor | 48 | Overlay Studio, configs, docs, snapshots | `KEEP/BLOCKED_ACTIVE_WORK` |
| mono legibility | 5 | frontend/docs | `KEEP/BLOCKED_ACTIVE_WORK` |
| billing | 1 | alcance sensible no inspeccionado | `SENSITIVE_UNINSPECTED/BLOCKED_ACTIVE_WORK` |
| Launcher | 9 | Launcher/docs | `KEEP/BLOCKED_ACTIVE_WORK` |
| worktree alternativo | 2 | docs/prototipo | `KEEP/BLOCKED_ACTIVE_WORK` |
| Engineer | 2.556 | data local, scripts, docs, Engineer/licensing | `KEEP/BLOCKED_ACTIVE_WORK`; gran volumen untracked |
| `develop` | 21 | Layout Studio, build, configs, docs | `KEEP/BLOCKED_ACTIVE_WORK` |
| lanzamiento | 1 | ignore rules | `KEEP/BLOCKED_ACTIVE_WORK` |
| Launcher audit | 6 | configs/docs/planes | `KEEP/BLOCKED_ACTIVE_WORK` |
| Strategy | 21 | frontend, Go, docs | `KEEP/BLOCKED_ACTIVE_WORK` |

El agregado de paths únicos es 2.668: 110 bajo `vantare-v2/` y 2.558 en otras rutas, dominadas por data local de un worktree. Este conteo incluye untracked y no implica que todos los archivos existan en el commit base.

### 7.2 Regla de ownership operativo

No existe `CODEOWNERS`. El ownership verificable se deriva de:

1. rama/worktree activo;
2. subsistema indicado por la ruta;
3. issue o plan que originó el trabajo;
4. revisión humana antes de cualquier rescate.

Los autores Git se anonimizaron en esta auditoría. Históricamente, la madre registra dos identidades contribuidoras y V2 tres. La identidad dominante concentra la mayoría de commits; esto no sustituye ownership por subsistema.

### 7.3 Gate obligatorio

Antes de cualquier promoción:

- cada worktree sucio debe tener decisión documentada: commit + push, PR, export seguro, abandono aprobado o continuidad fuera de la ventana;
- debe generarse nuevamente el inventario de paths activos;
- el resultado debe ser cero solapes con el lote a migrar;
- no se permite usar `stash` global como estrategia de coordinación;
- no se permite leer o copiar cambios de otro worker para “rescatarlos” sin ownership explícito.

## 8. Rutas sensibles y secretos — inventario opaco

No se inspeccionó contenido ni se calcularon hashes. Los tamaños son metadatos aproximados del workspace físico y no se consideran prueba del tipo de secreto.

| Ruta relativa sanitizada | Existe | Estado | Tamaño aprox. | Clasificación |
|---|---:|---|---:|---|
| `.env` | sí | ignored | 677 B | `SENSITIVE_UNINSPECTED` |
| `apps/desktop/.env` | sí | ignored | 654 B | `SENSITIVE_UNINSPECTED` |
| `vantare-v2/frontend/.env.local` | sí | ignored | 316 B | `SENSITIVE_UNINSPECTED` |
| `supabase/.temp/<production-secrets-script>` | sí | ignored | 3.350 B | `SENSITIVE_UNINSPECTED` |
| `_lmu-sr-dr-investigation/<token-findings>` | sí | ignored | 2.844 B | `SENSITIVE_UNINSPECTED` |
| `_lmu-sr-dr-investigation/<token-scan-result>` | sí | ignored | 54.350 B | `SENSITIVE_UNINSPECTED` |
| `vantare-v2/configs/license-cache.json` | sí | tracked y modificado en otro worktree | 114 B | `SENSITIVE_UNINSPECTED/BLOCKED_ACTIVE_WORK` |
| `vantare-v2/frontend/.env.example` | sí | tracked | 242 B | `SENSITIVE_UNINSPECTED` |
| `vantare-v2/frontend/.env.calendar-harness` | sí | tracked | 67 B | `SENSITIVE_UNINSPECTED` |
| `.env.example` | sí | tracked | 360 B | `SENSITIVE_UNINSPECTED` |
| `apps/desktop/.env.example` | sí | tracked | 361 B | `SENSITIVE_UNINSPECTED` |

Nombres de variables operativas detectados, sin valores: familias de Supabase, Discord, GitHub, runtime Wails/Vite y flags de test. El plan debe conservar contratos de nombres, pero los valores deben reinyectarse desde un gestor externo y verificarse fuera de logs.

### 8.1 Tratamiento futuro

- Las `.env` ignored no se migran con Git ni se copian masivamente.
- Los valores se reconstruyen desde la fuente de secretos autorizada.
- El script local de producción requiere revisión humana de seguridad; nunca debe entrar en el commit de migración.
- Los resultados de búsqueda de tokens requieren decisión de rotación/archivo seguro por el propietario.
- `license-cache.json` requiere una issue específica: está tracked y además modificado en trabajo activo. No debe moverse ni conservarse automáticamente sin decidir si es fixture, cache local o dato sensible.
- Los `.env.example` y harnesses se revisan solo por un responsable autorizado en una issue de seguridad; esta auditoría no valida su contenido.

## 9. Caches, builds, binarios y outputs

### 9.1 Workspace físico

Se inventariaron 218.033 rutas ignored. El cálculo completo de bytes se detuvo tras 60 segundos porque `node_modules` contiene rutas que exceden límites habituales de Windows. No se forzó otro recorrido.

Principales buckets ignored por número de paths:

| Bucket | Paths aprox. | Clasificación |
|---|---:|---|
| `node_modules/.pnpm/` | 157.718 | `DELETE_CANDIDATE` regenerable |
| `apps/desktop/` ignored | 25.554 | mezcla caches/builds/sensible; revisar por subtipo |
| `packages/ui-core/` ignored | 8.479 | `DELETE_CANDIDATE` regenerable |
| `packages/types/` ignored | 7.737 | `DELETE_CANDIDATE` regenerable |
| `vantare-v2/frontend/` ignored | 4.680 | `DELETE_CANDIDATE`, salvo `.env.local` sensible |
| `packages/sim-core/` ignored | 3.535 | `DELETE_CANDIDATE` regenerable |
| `.kilo/node_modules/` | 3.445 | `DELETE_CANDIDATE` regenerable |
| `packages/auth/` ignored | 3.421 | `DELETE_CANDIDATE` regenerable |
| `.turbo/cache/` | 927 | `DELETE_CANDIDATE` regenerable |

También existen binarios instalador, ejecutables stale, logs, capturas, outputs de QA, audio de prueba, investigaciones locales y carpetas `bin/`/`release-package/` ignoradas. Ninguno debe copiarse a la nueva raíz. Los artefactos oficiales deben regenerarse desde un commit y verificarse por checksum.

### 9.2 `build/` V2 no es una cache

`vantare-v2/build/` contiene 77 archivos tracked de configuración y fuentes de packaging para Android, iOS, Windows, Linux, macOS y Docker. Incluye Taskfiles, manifests, scripts, iconos fuente y tests. Debe clasificarse `KEEP/MIGRATE_CANDIDATE`, no eliminarse por llamarse `build`.

### 9.3 Binarios tracked

El commit base contiene 27 archivos binary-like tracked, principalmente:

- iconos y assets de packaging V2;
- fixture binaria LMU de test;
- imagen hero frontend;
- fuentes e imágenes de Storybook legacy en `apps/desktop/storybook-static/`.

Los assets de V2 y fixtures de test son `KEEP`. El Storybook precompilado legacy es `ARCHIVE_CANDIDATE` y después `DELETE_CANDIDATE` si se demuestra reproducible.

## 10. Manifests, workspaces, Go, pnpm y CI

### 10.1 Estado actual

La madre es un monorepo pnpm/Turbo con:

- `apps/desktop` (`@vantare/desktop`);
- `packages/auth`;
- `packages/sim-core`;
- `packages/types`;
- `packages/ui-core`;
- `shared/types`;
- `vantare-v2/frontend` como workspace adicional.

V2 es simultáneamente:

- módulo Go `github.com/vantare/overlays/v2`, Go 1.25;
- app Wails con Taskfiles por plataforma;
- frontend pnpm con React/Vite/Vitest/Playwright;
- consumidor del `pnpm-lock.yaml` de la raíz, porque no tiene lockfile propio.

No existe `go.work`.

### 10.2 Independencia del legacy

No se encontraron imports de código desde V2 hacia `apps/desktop`, `packages/*` o `shared/types`. Solo tres documentos V2 mencionan esas rutas. Esto sugiere independencia de compilación, pero debe confirmarse con build/test desde una checkout limpia tras retirar el monorepo legacy.

V2 sí depende funcionalmente del `supabase/` raíz: el frontend llama funciones de billing y el backend Go consume contratos de auth/licensing. `supabase/` no es legado descartable.

### 10.3 Lockfiles

| Elemento | Estado | Decisión futura |
|---|---|---|
| `pnpm-lock.yaml` raíz | existe y contiene importer `vantare-v2/frontend` | `MIGRATE_CANDIDATE`; regenerar importer para `frontend` |
| `vantare-v2/frontend/pnpm-lock.yaml` | no existe | no inventar uno sin decidir workspace final |
| `package-lock.json` raíz | existe | `ARCHIVE_CANDIDATE`; CI no usa npm |
| `pnpm-workspace.yaml` | incluye legacy + V2 | reescribir en microcorte de paths |
| `turbo.json` | gobierna monorepo legacy | archivar si V2 final no usa Turbo |

### 10.4 CI y rutas hardcodeadas

Hay cinco workflows tracked. Once referencias operativas dependen literalmente de `vantare-v2/`:

- triggers y lectura de `docs/current-plan.md` y `docs/roadmap-execution-board.md`;
- URLs de known issues;
- changelog de releases;
- `VANTARE_DIR: "vantare-v2"` en el workflow de build;
- paths de `pnpm-workspace.yaml`;
- output default del generador de offsets LMU.

Además, 14 archivos operativos contienen referencias absolutas o supuestos de máquina, entre workflows, scripts visuales, tooling de build y Turbo. Deben revisarse archivo por archivo y sustituirse por rutas derivadas del repo, `${PWD}`, `git rev-parse --show-toplevel` o APIs de path del lenguaje.

La CI usa pnpm, no npm. El `package-lock.json` no tiene consumidor CI observado.

## 11. Ownership, licencia y gobierno

- No existe `CODEOWNERS`.
- `AGENTS.md` V2 gobierna el trabajo dentro del subárbol, pero después de la promoción deberá existir en la raíz.
- `WidgetStudio` y `LayoutStudio` mantienen responsabilidades separadas durante cualquier resolución de conflictos.
- El archivo `LICENSE` raíz declara licencia propietaria y V2 no tiene licencia propia. Debe conservarse en la raíz final, sujeto a revisión legal humana.
- La historia Git muestra pocos contribuidores y alta concentración; aun así, ownership debe asignarse por subsistema, no solo por autor de commits.
- `.agents/skills/vantare-core` no se usa en esta auditoría y no debe convertirse automáticamente en fuente de verdad tras la migración.

## 12. Matriz de clasificación consolidada

### 12.1 Raíz madre

| Ruta/lote | Clasificación | Razón | Condición antes de actuar |
|---|---|---|---|
| `.git` común | `KEEP` | contiene todos los refs/worktrees/historia | nunca mover/borrar como parte del producto |
| `.github/` | `KEEP/MIGRATE_CANDIDATE` | release y anuncios activos | actualizar paths y probar workflow |
| `supabase/` | `KEEP/MIGRATE_CANDIDATE` | backend cloud usado por V2 | tests Deno + revisión de secrets externa |
| `LICENSE` | `KEEP` | licencia propietaria raíz | revisión legal humana |
| `tools/generate-lmu-offsets.py` | `MIGRATE_CANDIDATE` | apunta a V2 | actualizar output y testear |
| resto de `tools/` | revisión individual | tooling potencialmente útil | demostrar consumidor V2 |
| `docs/` | mezcla `KEEP/ARCHIVE_CANDIDATE` | docs operativos e históricos | inventario documental por autoridad/fecha |
| `apps/desktop/` | `ARCHIVE_CANDIDATE` | aplicación Electron legacy | tag/bundle + confirmar no consumidor |
| `packages/` | `ARCHIVE_CANDIDATE` | paquetes legacy sin imports V2 | build limpio V2 independiente |
| `shared/` | `ARCHIVE_CANDIDATE` | tipos legacy | build limpio V2 independiente |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `MIGRATE_CANDIDATE` | hoy sostienen workspace V2 y legacy | definir layout pnpm final |
| `package-lock.json`, `turbo.json`, `tsconfig.base.json`, `.prettierrc` | `ARCHIVE_CANDIDATE` | asociados al monorepo legacy | demostrar que V2 no los consume |
| `.omo/`, `.swarm/`, `.sisyphus/`, `.aider-desk/`, `.kilo/` | `ARCHIVE_CANDIDATE` | evidencia/estado de agentes | exportar referencia Git; no llevar a raíz final |
| HTML/mockups raíz | `ARCHIVE_CANDIDATE` | prototipos históricos | revisión visual humana |
| `temp.ts`, `vite-output.txt`, SQL vacío | `DELETE_CANDIDATE` | scratch/output | aprobación humana individual |
| `.env*` y rutas sensibles | `SENSITIVE_UNINSPECTED` | contenido opaco | responsable de seguridad |
| caches/outputs ignored | `DELETE_CANDIDATE` | regenerables | reproducibilidad verificada + aprobación |

### 12.2 V2

| Ruta/lote | Clasificación | Nota |
|---|---|---|
| `go.mod`, `go.sum`, `cmd/`, `internal/`, `pkg/` | `KEEP/MIGRATE_CANDIDATE` | núcleo Go; mover a raíz |
| `frontend/` | `KEEP/MIGRATE_CANDIDATE` | app frontend; mover a raíz |
| `build/`, `Taskfile.yml`, `VERSION` | `KEEP/MIGRATE_CANDIDATE` | build/release canónico |
| `configs/` | `KEEP/MIGRATE_CANDIDATE` | excepto sensible/activo |
| `docs/` | `KEEP/MIGRATE_CANDIDATE` | documentación viva canónica, resolver colisiones |
| `testdata/` | `KEEP/MIGRATE_CANDIDATE` | fixtures reales |
| `tools/`, `mcps/` | `KEEP/MIGRATE_CANDIDATE` | tooling V2 |
| `.gitattributes` | `KEEP/MIGRATE_CANDIDATE` | llevar a raíz |
| `.gitignore` | `MIGRATE_CANDIDATE` | fusionar reglas, no sobrescribir |
| `AGENTS.md` | `KEEP/MIGRATE_CANDIDATE` | debe gobernar la raíz final |
| `README.md` | `KEEP/MIGRATE_CANDIDATE` | candidato a README principal |
| `.agents/` | `ARCHIVE_CANDIDATE` | no promover sin aprobación |
| `release-package/` tracked | `ARCHIVE_CANDIDATE` | sustituir por docs oficiales si procede |
| `license-cache.json` | `SENSITIVE_UNINSPECTED/BLOCKED_ACTIVE_WORK` | decisión específica obligatoria |
| cualquier path activo | `KEEP/BLOCKED_ACTIVE_WORK` | excluir de todo lote hasta resolver ownership |

## 13. Evaluación de las cuatro opciones

| Opción | Integridad Git | Reversibilidad | Riesgo operativo | Veredicto |
|---|---|---|---|---|
| 1. Promover V2 y migrar assets seleccionados | alta si se hace en el mismo repo | alta con tag/bundle/microcommits | media-alta hoy por trabajo activo | recomendada después de preparación |
| 2. Crear raíz/repositorio limpio | exige trasplante de historia/refs | media | alta; duplica decisiones Git | no recomendada |
| 3. Mantener estructura hasta cerrar trabajo activo | máxima a corto plazo | máxima | baja | obligatoria como fase 0 |
| 4. Archive-first | alta | máxima | baja-media | obligatoria antes de cleanup |

## 14. Secuencia de microcortes propuesta

Todos los comandos de esta sección son **propuestos y NO ejecutados**. Cada microcorte debe tener issue, rama/worktree propios, review y aprobación. No se deben copiar como un script único.

### MC-00 — Congelar la ventana y resolver ownership

Objetivo: conseguir cero solapes activos con el lote inicial.

Dependencias: ninguna.

Aceptación:

- inventario de todos los worktrees actualizado;
- cada worktree sucio tiene propietario y decisión;
- cero rutas activas dentro del lote que vaya a migrarse;
- `develop` exacto y divergencia con remote documentados.

Comandos read-only propuestos:

```powershell
git worktree list --porcelain
git status --short --branch
git for-each-ref --sort=-committerdate refs/heads refs/remotes/origin
git rev-list --left-right --count origin/develop...develop
```

Stop: cualquier trabajo sin propietario, ruta sensible que requiera lectura o `develop` diferente de la base aprobada.

Rollback: no aplica; no hay mutación.

### MC-01 — Backup archive-first verificable

Objetivo: crear recuperación fuera del árbol de trabajo antes de mover paths.

Dependencias: MC-00 y aprobación de ubicación externa segura.

Comandos propuestos, no ejecutados:

```powershell
git status --short
git tag -a pre-isa14-root-migration-YYYYMMDD -m "archive before ISA-14 root migration"
git push origin pre-isa14-root-migration-YYYYMMDD
git bundle create <approved-external-path>\vantare-pre-isa14.bundle --all
git bundle verify <approved-external-path>\vantare-pre-isa14.bundle
```

Aceptación: tag visible en remote, bundle verificado y checksum almacenado por el responsable sin exponer secretos.

Stop: bundle no verificable, remote incorrecto, working tree sucio o falta de aprobación del path externo.

Rollback: borrar refs o bundles solo mediante issue separada y aprobación; conservarlos no afecta runtime.

### MC-02 — Seguridad y regenerabilidad

Objetivo: separar secretos, caches y artefactos antes de cualquier traslado.

Dependencias: MC-01.

Aceptación:

- fuente externa de secretos confirmada;
- ninguna `.env` depende de copia manual desde la carpeta antigua;
- lockfile instala en checkout limpia;
- artefactos oficiales se regeneran;
- `license-cache.json` tiene decisión explícita.

No se proponen comandos de lectura de secretos. La eliminación de caches queda fuera de este corte.

### MC-03 — Archivar legado por referencia, sin cleanup físico

Objetivo: dejar una rama/tag remota que señale el legado completo antes de retirarlo de la rama de migración.

Dependencias: MC-01 y MC-02.

Aceptación:

- ref archive apuntando al commit exacto pre-migración;
- inventario de `apps/`, `packages/`, `shared/`, docs y prototipos revisado;
- ningún consumidor V2 de legacy confirmado por build/test.

Comandos propuestos, no ejecutados:

```powershell
git branch archive/pre-isa14-root-layout <approved-pre-migration-sha>
git push origin archive/pre-isa14-root-layout
git ls-tree -r --name-only archive/pre-isa14-root-layout
```

No se borra nada en este microcorte.

### MC-04 — Promover núcleo Go sin resolver docs/tools todavía

Objetivo: mover el núcleo sin colisiones a la raíz.

Dependencias: MC-03 y cero trabajo activo en esos paths.

Lote propuesto:

- `vantare-v2/go.mod`, `go.sum`, `VERSION`, `Taskfile.yml`, `.gitattributes`;
- `vantare-v2/cmd/`;
- `vantare-v2/internal/`;
- `vantare-v2/pkg/`;
- `vantare-v2/testdata/`;
- `vantare-v2/build/`.

Ejemplo propuesto, no ejecutado:

```powershell
git mv vantare-v2/go.mod .
git mv vantare-v2/go.sum .
git mv vantare-v2/VERSION .
git mv vantare-v2/Taskfile.yml .
git mv vantare-v2/.gitattributes .
git mv vantare-v2/cmd .
git mv vantare-v2/internal .
git mv vantare-v2/pkg .
git mv vantare-v2/testdata .
git mv vantare-v2/build .
gofmt -w <only-if-needed-by-a-separate-approved-change>
go test ./...
```

`gofmt` no debería producir cambios en un puro move; si los produce, parar y separar formatting.

Commit sugerido: `chore(repo): promote Go and build roots`.

Rollback publicado: `git revert <commit-del-microcorte>`.

### MC-05 — Promover frontend

Objetivo: mover `vantare-v2/frontend/` a `frontend/` sin cambiar comportamiento.

Dependencias: MC-04, lockfile planificado y cero trabajo frontend activo.

Comandos propuestos, no ejecutados:

```powershell
git mv vantare-v2/frontend frontend
pnpm install --lockfile-only
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
```

Stop: lockfile cambia dependencias/versiones además del importer, tests/build fallan o aparece diferencia funcional.

Commit sugerido: `chore(repo): promote frontend to root`.

Rollback publicado: `git revert <commit-del-microcorte>` y reinstalación desde lockfile previo.

### MC-06 — Resolver manifests y retirar acoplamiento legacy

Objetivo: definir un único layout pnpm coherente.

Dependencias: MC-05.

Decisión recomendada: conservar pnpm, hacer que el importer sea `frontend`, y retirar Turbo/paquetes legacy solo después de probar que no son consumidores.

Aceptación:

- `pnpm install --frozen-lockfile` en checkout limpia;
- un solo package manager documentado;
- ningún importer `vantare-v2/frontend`;
- no se introducen versiones nuevas accidentalmente.

Los cambios de manifests requieren issue separada porque son configuración.

### MC-07 — Migrar CI, scripts y rutas

Objetivo: eliminar el supuesto `vantare-v2/` de workflows y tooling.

Dependencias: MC-04 a MC-06.

Lote:

- cinco workflows;
- `pnpm-workspace.yaml`/lockfile;
- generador de offsets;
- Taskfiles y scripts visuales;
- referencias absolutas operativas.

Verificación:

```powershell
git grep -n -F "vantare-v2" -- .github tools frontend build Taskfile.yml pnpm-workspace.yaml pnpm-lock.yaml
git grep -Il -E "[A-Za-z]:[\\/]" -- .github tools frontend build
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

El primer grep solo puede dejar referencias históricas en docs archivadas, no rutas operativas.

### MC-08 — Integrar Supabase y tooling válido de la madre

Objetivo: conservar los servicios externos y herramientas todavía consumidos por V2.

Dependencias: MC-07 y revisión de seguridad.

Aceptación:

- `supabase/` permanece en raíz;
- tests Deno aplicables pasan;
- contratos de billing/auth/licensing permanecen;
- secretos solo por entorno/gestor externo;
- tooling madre se conserva solo si tiene consumidor probado.

No autoriza deploy ni cambio de secretos.

### MC-09 — Consolidar documentación y gobierno

Objetivo: establecer documentos canónicos en la raíz final.

Dependencias: layout funcional estable.

Prioridad:

1. `AGENTS.md` V2 como guía raíz;
2. `README.md` V2 como entrada principal;
3. `docs/current-plan.md` y `docs/agent-workflow.md` V2;
4. arquitectura/changelog canónicos;
5. documentación madre válida migrada selectivamente;
6. históricos fuera del flujo operativo.

Stop: contradicción entre docs, pérdida de atribución/licencia o mezcla de changelogs.

### MC-10 — Validación de checkout limpia

Objetivo: demostrar que la nueva raíz funciona sin caches ni archivos locales.

Dependencias: MC-04 a MC-09.

Checks mínimos:

```powershell
git status --short
pnpm install --frozen-lockfile
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
go test ./...
go build ./...
wails3 task release:artifacts
git diff --check
```

Además:

- smoke manual Wails;
- OAuth/licensing con entorno controlado;
- Launcher, Calendar, Strategy, Engineer y overlays;
- `WidgetStudio` solo apariencia/datos;
- `LayoutStudio` solo posición/tamaño;
- release artifacts y checksums;
- workflows en dry-run o rama no productiva;
- prueba manual completa por Isaac.

Stop: cualquier check desconocido, secreto ausente sin fuente segura, artefacto no reproducible o diferencia visual/funcional no explicada.

### MC-11 — Cleanup humano por lotes

Objetivo: retirar legado y generados únicamente después del gate completo.

Dependencias: MC-10 aprobado manualmente y refs archive verificadas.

Cada lote necesita aprobación independiente. Ejemplos propuestos, **no ejecutados**:

```powershell
# SOLO tras aprobación individual del lote legacy
git rm -r apps packages shared

# SOLO tras validar que Turbo/package-lock ya no tienen consumidor
git rm package-lock.json turbo.json tsconfig.base.json
```

Las caches ignored se limpian con comandos nativos de PowerShell únicamente después de validar rutas absolutas y nunca mediante una lista enviada a otra shell. No se incluye un comando de borrado genérico en este informe para evitar una ejecución accidental.

## 15. Rollback completo

### 15.1 Antes de publicar commits

1. Parar el microcorte.
2. No resetear ni limpiar.
3. Registrar `git status --short` y el SHA actual.
4. Conservar el worktree fallido para análisis.
5. Abrir una checkout nueva desde el tag pre-migración si hace falta continuar.
6. Abandonar/eliminar la rama o worktree solo con aprobación explícita.

### 15.2 Después de publicar commits, antes de merge

1. No force-push.
2. Revertir solo el microcommit defectuoso con `git revert` en la rama.
3. Ejecutar los checks del microcorte y `git diff --check`.
4. Mantener abierto el PR como evidencia o cerrarlo sin merge.

### 15.3 Después de un merge autorizado

1. Crear rama de rollback desde `develop`.
2. Revertir los commits de migración en orden inverso, preferentemente uno por microcorte.
3. No restaurar caches ni secretos desde Git.
4. Reinyectar secretos desde el gestor autorizado.
5. Regenerar dependencias y artefactos desde lockfiles.
6. Ejecutar el gate completo y smoke manual.
7. Si el revert no es viable, crear un hotfix que restaure el layout desde el tag pre-migración; no reescribir historia compartida.

### 15.4 Recuperación extrema

El bundle verificado y la ref archive son la última línea de recuperación. Deben probarse en un directorio vacío y no reemplazar el `.git` común existente mientras haya worktrees registrados.

## 16. Lista de borrado que requiere aprobación humana

Ningún elemento de esta lista está autorizado para borrar.

| Lote | Candidato | Precondición |
|---|---|---|
| D-01 | `apps/desktop/` legacy | archive ref + build V2 limpio + revisión visual |
| D-02 | `packages/` legacy | cero imports/consumidores + tests V2 |
| D-03 | `shared/` legacy | cero imports/consumidores |
| D-04 | Storybook precompilado tracked | regenerabilidad comprobada |
| D-05 | `package-lock.json` | pnpm único confirmado |
| D-06 | `turbo.json`, `tsconfig.base.json`, config legacy | V2 independiente confirmado |
| D-07 | HTML/mockups raíz | revisión humana y archive ref |
| D-08 | `.omo/`, `.swarm/`, `.sisyphus/`, `.aider-desk/`, `.kilo/` tracked | export histórico y confirmación de no uso |
| D-09 | `temp.ts`, `vite-output.txt`, SQL vacío | propietario confirma scratch |
| D-10 | `node_modules`, `.turbo/cache`, `dist`, coverage y outputs ignored | checkout limpia reproducible |
| D-11 | binarios stale, instaladores locales, logs, capturas y audio de prueba | artefactos oficiales verificados |
| D-12 | investigaciones locales de LMU | owner revisa valor histórico y sensibilidad |
| D-13 | `release-package/` legacy/ignored | runbook y release artifacts canónicos |
| D-14 | `vantare-v2/` vacío tras promoción | todos los microcortes y greps de rutas pasan |

Rutas `SENSITIVE_UNINSPECTED` no pertenecen a un lote de borrado general. Su disposición corresponde a seguridad y puede exigir rotación antes de eliminación.

## 17. Stop conditions para la ejecución futura

Parar inmediatamente si:

- una rama/base no coincide con el SHA aprobado;
- aparece una rama objetivo existente inesperada;
- `develop` remoto/local cambia durante la ventana;
- un worktree activo toca un path del lote;
- se requiere abrir/copiar una ruta sensible;
- aparece un segundo límite Git o submódulo no inventariado;
- `git mv` encuentra una colisión no documentada;
- un lockfile actualiza versiones además de paths/importers;
- hace falta una dependencia nueva;
- un test/build/lint falla por causa no entendida;
- CI necesita cambio de permisos, secrets o arquitectura no aprobado;
- el bundle/tag/remote de rollback no se verifica;
- el diff contiene archivos fuera del lote;
- el borrado no tiene aprobación humana individual;
- no existe una verificación manual clara;
- los documentos canónicos se contradicen.

## 18. Sub-issues propuestas

1. **ISA-14A — Congelar y resolver worktrees activos.** Ownership, guardado y cero solapes.
2. **ISA-14B — Preparar archive ref, tag y bundle de rollback.** Recuperación verificada antes de mover paths.
3. **ISA-14C — Resolver secretos, caches y `license-cache`.** Sin leer valores; fuente externa y regenerabilidad.
4. **ISA-14D — Promover núcleo Go/build de V2 a raíz.** Puro move con tests Go.
5. **ISA-14E — Promover frontend y normalizar pnpm/lockfile.** Puro move seguido de ajuste mínimo de importer.
6. **ISA-14F — Actualizar CI, scripts y referencias de ruta.** Eliminar supuestos `vantare-v2/` y absolutos operativos.
7. **ISA-14G — Consolidar Supabase, docs, governance y assets válidos de la madre.** Migración selectiva, no cleanup.
8. **ISA-14H — Validar checkout limpia, build/release y smoke completo.** Gate técnico + validación manual.
9. **ISA-14I — Archivar y limpiar legado por aprobación humana.** Issues/lotes de borrado independientes.

Orden: A → B → C → D → E → F → G → H → I. H no puede aprobarse sin revisión humana completa. I no autoriza borrados por existir; cada lote D-01…D-14 requiere aprobación.

## 19. Evidencia reproducible y verificación manual del informe

Comandos read-only para revisar este informe y la base:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff -- vantare-v2/docs/analysis/isa-14-root-migration-audit-relaunch-20260714.md
git diff --check
git worktree list --porcelain
git rev-list --left-right --count origin/develop...develop
git ls-files -s
```

Verificación manual recomendada:

1. confirmar que el diff contiene solo este informe;
2. comprobar que no aparecen rutas personales, emails, valores de secretos o hashes de rutas sensibles;
3. revisar la tabla `BLOCKED_ACTIVE_WORK` con responsables de cada rama;
4. aprobar o corregir la recomendación “mismo repo + archive-first + promoción por microcortes”;
5. revisar individualmente los lotes D-01…D-14;
6. crear/aceptar las sub-issues antes de cualquier cambio estructural;
7. no hacer merge del PR de auditoría hasta la validación manual completa.

## 20. Riesgos restantes y nivel de confianza

| Hallazgo | Confianza | Gap restante |
|---|---|---|
| un solo repositorio/límite Git | alta | ninguno en el commit base |
| V2 puede conservar historia al promoverse | alta | validar `--follow` tras moves reales |
| no hay duplicados seguros por hash | alta para tracked elegible | sensibles, ignored y activos excluidos |
| V2 no importa código legacy | media-alta | build limpio posterior es obligatorio |
| `supabase/` madre sigue siendo necesario | alta | revisar deploy/config en issue propia |
| caches no deben migrarse | alta | tamaño total no medido por límites Windows |
| lista de legado puede retirarse | media | requiere archive, build y revisión humana |
| worktrees activos bloquean la migración actual | alta | ownership/estado puede cambiar después del corte |
| rutas sensibles están seguras | no evaluado | contenido deliberadamente no inspeccionado |

Conclusión final: ISA-14 habilita planificación, no ejecución. La promoción es viable, pero hoy es **NO-GO para mover o borrar** hasta cerrar A/B/C y obtener aprobación humana. La única acción segura inmediata es revisar este informe y sus sub-issues.
