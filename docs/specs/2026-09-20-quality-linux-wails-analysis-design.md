# Diseño · Quality Linux con dependencias nativas de Wails

Estado: aprobado por Isaac el 2026-09-20; pendiente de plan de implementación.

- Tarea: [VAN-733](https://app.notion.com/p/3e1e51695c65819fbf23edeb5957cbcd)
- Puente técnico: [GitHub #1296](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1296)
- Base: `origin/nightly@8a0620e8abe75914efed41de4117490f3e47a3b4`
- Decisión de roadmap: `milestones:quality-linux-analysis`

## Problema demostrado

El workflow `vantare-quality` ejecuta `govet` y `deadcode` en
`ubuntu-latest`. Ambos alcanzan paquetes internos que importan Wails v3. El
runner no dispone de los metadatos `pkg-config` de `gtk4` y
`webkitgtk-6.0`, por lo que los analizadores terminan en `ERROR` antes de
completar el grafo.

La ejecución afectada fue la
[35482318507](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35482318507):
el ratchet encontró cero hallazgos `NEW`, pero falló correctamente por
integridad. Los demás gates de la PR #1295 pasaron.

La exclusión vigente de `cmd/vantare` no resuelve este caso. Paquetes en
`internal/app` también importan Wails y sí forman parte de la cobertura Linux
declarada. Excluirlos reduciría cobertura y contradiría `scope.json`.

## Objetivo observable

Los jobs Linux del workflow de calidad preparan las dependencias de desarrollo
del stack Wails real antes de ejecutar los analizadores. `govet` y `deadcode`
completan su análisis sin errores por GTK/WebKitGTK, y un hallazgo nuevo real
continúa bloqueando exactamente como antes.

## Decisión

Se instalarán desde los repositorios del runner:

- `libgtk-4-dev`
- `libwebkitgtk-6.0-dev`

La preparación se aplicará tanto a `quality-check` como a `quality-audit`.
Después de instalar, el workflow verificará de forma explícita
`pkg-config --exists gtk4 webkitgtk-6.0`. Si la instalación o la comprobación
fallan, el job termina con error antes de presentar el análisis como válido.

Esta opción conserva la cobertura actual y coincide con el stack Linux que
Wails v3 usa por defecto. El repositorio ya declara los mismos paquetes en su
imagen de cross-build Linux.

## Alternativas descartadas

### Excluir todos los paquetes que alcanzan Wails

Evitaría las bibliotecas del sistema, pero dejaría sin análisis Linux parte de
`internal/app`. La variante Windows no sustituye todas las condiciones del host
Linux. Se descarta por pérdida de cobertura.

### Forzar la variante GTK3

También exigiría bibliotecas nativas y analizaría una ruta heredada diferente
de la configuración productiva actual. Se descarta por falta de paridad con el
runtime objetivo.

### Aceptar el fallo mediante baseline o excepción

Un analizador que no termina no produce un hallazgo aceptable: es un error de
integridad. Se descarta porque ocultaría la ausencia de análisis y rompería el
comportamiento fail-closed.

## Superficie y límites

La implementación queda limitada a:

- `.github/workflows/quality.yml` para preparar y comprobar las dependencias en
  los dos jobs Linux;
- documentación viva de diseño, ejecución, roadmap y handoff;
- pruebas de contrato existentes y ejecución real del workflow.

No se modificarán:

- `tools/quality/baseline/**`;
- `tools/quality/versions.json` ni las versiones de los analizadores;
- `HOST_NONCOMPILING`, la selección de paquetes o la semántica del ratchet;
- código de producto, Engineer o Telemetría;
- tags de compilación de Wails.

No se añade ninguna dependencia al producto. Son paquetes efímeros del runner
de CI.

## Secuencia del workflow

En cada job Linux:

1. Checkout y toolchains permanecen fijados como ahora.
2. Un paso específico actualiza el índice APT e instala ambos paquetes con
   `--no-install-recommends`.
3. El mismo paso comprueba que `pkg-config` resuelve `gtk4` y
   `webkitgtk-6.0`.
4. El frontend se construye para satisfacer `go:embed`, como ya exige el
   workflow.
5. Las suites, `doctor` y los analizadores se ejecutan sin relajar sus códigos
   de salida.

No se introducen cachés de paquetes del sistema ni una action externa para una
operación de dos paquetes.

## Fallos y comportamiento fail-closed

- Si APT no puede descargar o instalar, el job falla.
- Si los archivos `.pc` no son visibles, `pkg-config` falla y el job se detiene.
- Si `govet` o `deadcode` no pueden analizar después de preparar el entorno,
  conservan estado `ERROR`; no se transforman en `PASS` ni en excepción.
- Si aparece un hallazgo `NEW` bloqueante, el ratchet conserva `FAIL`.
- No se escribe ni recalibra ningún baseline automáticamente.

## Verificación y estados esperados

La comprobación se hará en dos etapas porque el sistema distingue una
corrección válida de política de una ejecución ordinaria:

1. **PR asociada a la issue #1296:** suites ratchet/negative y `doctor` pasan;
   `govet/linux-dev` y `deadcode/linux-dev` terminan sin `ERROR` de
   GTK/WebKitGTK. El agregado debe ser `REVIEW_REQUIRED`, no `PASS`, porque el
   PR modifica el propio workflow y requiere revisión externa.
2. **Tras una integración expresamente autorizada:** se reejecuta la PR #1295,
   que no cambia política. Con cero hallazgos nuevos y todos los analizadores
   completos, `quality-check (ratchet)` debe alcanzar `PASS`.

También se comprobarán:

- sintaxis y diff del workflow;
- `python3 -B tools/quality/tests/test_ratchet.py`;
- `python3 -B tools/quality/tests/test_negative.py`;
- `python3 tools/quality/vantare_quality.py doctor` con la toolchain fijada;
- contrato de roadmap y artefacto regenerado.

La instalación de GTK/WebKitGTK no convierte una ejecución local macOS en
prueba Linux. La evidencia determinante será el job remoto de Ubuntu.

## Roadmap, revisión y rollback

El mismo PR añadirá el hito `quality-linux-analysis` como corrección de
plataforma y regenerará `roadmap.json` desde la base confiable. La rama no se
presentará como integrada antes de la promoción autorizada.

El cambio es reversible retirando únicamente el paso de preparación APT. No
hay migración de datos, modificación de artefactos de producto ni estado
persistente que revertir.

La PR se abrirá en draft y permanecerá sin merge hasta revisión externa y
autorización específica de Isaac para integrarla en `nightly`.
