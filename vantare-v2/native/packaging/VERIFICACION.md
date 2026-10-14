# Entrega local — fase 7 / ISA-1432

Fecha: 2026-09-30. Worker Codex, revisión pendiente de Claude Opus 5.5.
Proyecto: arquitectura Rust nativa, ADR 0099.
Referencia [GitHub #1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432).
Notion no disponible por el encargo; excepción explícita de Isaac. No hay URL/ID
de tarea Notion, estado ni última escritura verificados. Lectura pública de
GitHub falló por Cache miss; no se inventa actualización remota de la issue.

## Estado y alcance

Candidato técnico **local** empaquetado, instalable por usuario, portable y
reversible. Fase 7 completa **bloqueada** por paridad de servicios, conversión
funcional de datos, distribución final y pruebas físicas. Ver
[matriz de servicios](PARIDAD-SERVICIOS.md) y
[microplan](../../docs/superpowers/plans/2026-09-30-fase-7-empaquetado.md).

No se modifica ningún archivo de producto Rust/Go/frontend, Cargo.toml/lock,
workflow o worktree ajeno. No hay nuevas dependencias, push, PR, merge, tags,
release, red de actualización, secretos ni datos reales del usuario. Las
únicas lecturas de red fueron el intento público de lectura de la referencia.
Cargo trabaja offline/locked, con dos jobs como máximo.

## Git y commits locales

- Worktree raíz Git: `C:/tmp/vf-fase7`; aplicación: `vantare-v2`.
- Rama: `vantareapp/isa-1432-fase7-empaquetado`.
- Base asignada: `c9606a287672936689d6d48db1445956267c2a48`.
- Snapshot local de origin/nightly: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`;
  merge-base `5838de5a4abee3e99d9d50aebd5dc20609c53611`. Sin fetch por la
  restricción de red del encargo; no declarar esa referencia como actual remota.
- Código final del tooling: `8e10053cdb46b11adf9e6fe2b959a0710c0f8b43`.
- Fuente exacta del paquete Release, incluyendo corrección documental:
  `82ce7e128dc32cbea6d4cd5fea5d221c03d190f6`, checkout limpio.
- El commit de este informe añade evidencia; no cambia el código empaquetado.
- CI remoto no ejecutado/consultado; promoción alcanzada: **rama local de issue**.

| Hito | SHA |
| --- | --- |
| Inventario | `ba2c32c6fb2e56ba5d03097e35b1ffb8ded6ad23` |
| Microplan antes de implementación | `277be234626abfe3d959cda6a9f2a5db8be56741` |
| Paquete, instalación y portable | `684b50de17e827919438af246511b48fb88c95c5` |
| Actualización y rollback | `015499f69ce4620c7b6126725f5e58c68edffa56` |
| Archivo de perfiles, arranque temporal y matriz | `8e10053cdb46b11adf9e6fe2b959a0710c0f8b43` |
| Recuento correcto de pruebas físicas | `82ce7e128dc32cbea6d4cd5fea5d221c03d190f6` |

Todos llevan `(ISA-1432)` y trailer `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`.

## Artefactos finales

Directorio local `native/target/phase7-final-release/`, sin versionar binarios.
Versión de candidato `0.0.0-fase7`, canal `nightly`, arquitectura Windows x64,
perfil **Release**, `source_dirty=false`. No es un tag/release del producto.

| Artefacto | Bytes | SHA-256 |
| --- | ---: | --- |
| `vantare-native-amd64-package.zip` | 11877764 | `24997c0c3884c55e9f99602957e8913f16f23d6c4a258331848544744cd89300` |
| `vantare-native-portable-amd64.zip` | 11886845 | `c03ad4c22c489cb3c9274042421e8c907ace60a8d50518dadf2c7b083eaebca0` |
| `vantare-native-installer.ps1` | 27874 | `a5ce176ca4c8504f5a5126c77e17c880070a7e99c0ff9100aa05645841517e76` |

Cada uno tiene sidecar `.sha256`. El manifiesto incluye hash/tamaño de los
seis exe, script, README con matriz, licencia Inter y catálogo Cargo.
Los seis exe son **NotSigned** (Get-AuthenticodeSignature). No descargar ni
instalar redistribuibles/firma sin el corte de distribución revisado.

## Verificación ejecutada

| Comprobación final | Resultado |
| --- | --- |
| `cargo fmt --check` | PASS, exit 0 |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS offline, exit 0 |
| `cargo test --workspace -j 2` | PASS offline, exit 0: 377 tests estándar + 7 escenarios lifecycle; 0 fallos, 4 entradas ignored |
| `tests.ps1` sobre artefactos Release finales | 74 comprobaciones PASS, exit 0 |
| Instalador generado invocado por CLI | PASS, exit 0; instalación en `native/target/phase7-final-user-install` |
| SHA externo y sidecars del paquete, portable e instalador | Los tres coinciden |
| `git diff --check` | PASS |

Salida final del test de empaquetado: `74 comprobaciones PASS. Sin pruebas
físicas ni red.` Los gates se ejecutaron antes de cada commit; estos son los
últimos gates previos al commit documental de entrega.

Tamaño del cambio ejecutable: 437 líneas de tooling PowerShell y 292 de pruebas,
sin líneas de producto Rust modificadas ni dependencias nuevas. Los binarios,
paquetes y logs generados permanecen fuera de Git.

Los cuatro ignored son LMU REST, LMU shared memory en la librería, el mismo
shared-memory test en la grabadora y ACC live. Requieren juegos; no se ejecutan.
El test de handoff usa launcher real y dos núcleos de replay; el segundo es un
suplente de overlays para comprobar lifecycle sin GPUI. **No prueba UI/OBS**.
La versión siguiente en las pruebas se simula cambiando el manifiesto y
conservando los exe reales; no se finge otra build ni fuente de telemetría.
La importación usa el fixture Wails V2 público del repo, no perfiles reales.

Logs reproducibles, no versionados, en `native/target/phase7-evidence/`:

- `final-package-build.log`, `final-artifacts.json`, `release-binaries.json`.
- `final-release-tests.log`, `final-installer-cli.log`.
- `entrega-fmt.log`, `entrega-clippy.log`, `entrega-test.log`.
- Logs por hito e intentos fallidos preservados; un intento fallido nunca se
  declara PASS. `gate-counts.json` conserva el recuento de los hitos previos.
- Las carpetas `native/target/phase7-tests-*` conservan estados/generaciones,
  archivos de prueba y logs CLI para revisión independiente.

Go/frontend/NSIS/CI remoto no se ejecutan: no se cambia ese producto ni sus
workflows. Soak, juego, OBS, GPU alternativa y Windows limpio no se ejecutan:
requieren sesión física del orquestador/Isaac con binarios finales. No hay
medición CPU/RSS/frame time ni compilación incremental UI; el orquestador las
hace en serie con los presupuestos fijados. Un smoke CLI no las sustituye.

## Reproducción manual y siguientes decisiones

Desde `vantare-v2`:

```powershell
powershell -NoProfile -File native/packaging/tests.ps1 -ArtifactsDirectory native/target/phase7-final-release
```

Instalar usando el script generado y SHA confiable en carpeta vacía. Consultar
Status. ImportProfiles sobre el fixture público, Rollback y comprobar bytes.
Las pruebas generan una actualización local, matan el actualizador en tres
fronteras y releen estado/rollback. El [README](README.md) da los comandos.

Preguntas pendientes para Isaac/orquestador, sin bloquear el mecanismo local:

1. ¿Qué esquemas/propietarios de fases 3/4/5 adoptarán `generation/data`, y qué
   golden demuestra conversión funcional y rollback de perfiles/DB/Strategy?
2. ¿Qué corte integra los servicios ausentes, incluido Testing Center, y
   demuestra su paridad sobre el SHA final de todas las fases?
3. ¿Qué mínimo Windows, distribución MSVC/ICU, notices/SBOM e instalador gráfico
   firmado se aceptan antes de añadir assets al workflow existente?
4. ¿Qué duración/escena/GPU/equipo limpio y criterios se fijan para soak físico
   con LMU + OBS y otra GPU? No elegir una duración arbitraria para llamarlo PASS.

Límites: NTFS/local; instalador script sin registro/UAC/atajos; bootstrap estable
schema=1; no feed/autenticidad/licencia remotos; migración solo opaca; todos los
escritores deben estar detenidos. Interrupción de proceso probada, corte eléctrico
no. Las generaciones se conservan y consumen disco; no hay purga automática.
No se publican ni promocionan artefactos ni se realiza ninguna acción externa
reservada a Isaac.
