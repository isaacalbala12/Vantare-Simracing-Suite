# Microplan — fase 7, candidato empaquetado y reversible

Fecha: 2026-09-30. Issue [#1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432)
(ISA-1432), [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md),
[fase 7 del plan](2026-09-29-arquitectura-rust-nativa.md).
Worker Codex; revisión completa y mediciones de rendimiento: Claude Opus 5.5.
Rama asignada `vantareapp/isa-1432-fase7-empaquetado`, base
`c9606a287672936689d6d48db1445956267c2a48`. Seguimiento Notion inaccesible;
Isaac autoriza explícitamente la excepción para este trabajo. No se declara
seguimiento completado ni estado remoto de GitHub verificado.

## Objetivo y alcance

Construir y probar **un candidato técnico offline**, instalable por usuario y
portable, con actualización interrumpible y rollback de binarios **y datos**.
El producto Wails continúa distribuido. No cambiar workflows, tags, releases,
credenciales, licencias ni runtime de otras fases. Sin push, PR ni merge.
El [inventario](../../../native/packaging/INVENTARIO.md) fija las fuentes.

Propiedad de archivos: `native/packaging/**` y este microplan. No cambiar
Cargo.toml/lock, widgets, kit de UI, model.rs, ipc, core, adaptadores ni README
compartidos con otros workers. No necesita punto de entrada Rust: el launcher
existente busca sus hijos junto a su exe.

## Cortes verticales en orden (un commit local por hito)

1. **Inventario**: rutas/líneas de Go/Wails, instalador, release, updater,
   perfiles, persistencia y Testing Center. Verificar cada cita contra código.
2. **Este microplan**, antes de implementar. ADR fija actualizador temporal y
   rollback compatible, no pide un daemon ni otro crate.
3. **Paquete e instalación local**: PowerShell 5.1 + .NET ya presentes en
   Windows; compilar offline los seis binarios con Cargo `--locked -j 2`.
   ZIP con manifiesto schema=1, producto separado, canal, versión de candidato,
   SHA de fuentes, perfil de compilación, arquitectura x64 y SHA/tamaño de cada
   archivo. Instalador script por usuario, sin registro/UAC/atajos automáticos.
   Portable usa exactamente el árbol instalado. Comprobar PE x64, entradas
   únicas, paths sin escapes/ADS/reservados/reparse points, lista exhaustiva,
   límites de tamaño y SHA externo obligatorio. Probar instalación real de
   estos binarios y negativos de checksum/manifest/ZIP.
4. **Actualización + rollback**: generaciones completas fuera de carrera,
   lock de archivo entre operaciones/arranque; copiar datos activos a la nueva
   generación y cambiar un único `state.json` mediante reemplazo atómico en
   el mismo volumen. La generación anterior conserva binarios y datos. No
   sobrescribir ejecutables en uso ni lanzar actualización mientras la app
   siga viva; el wrapper mantiene el lock durante el launcher. Verificar
   también procesos abiertos directamente. Rollback explícito cambia juntos
   el puntero de binarios y datos; no fusiona escrituras posteriores.
   Probar actualización, corrupción, canal distinto, fallo antes/después del
   commit, muerte abrupta y recuperación, bloqueo/concurrencia y rollback.
   Las generaciones incompletas nunca se activan y se conservan para inspección;
   no introducir borrado automático o journal adicional.
5. **Datos, evidencia y matriz de paridad**: importación explícita de perfiles
   JSON de un directorio indicado, sin leer `.env*` ni descubrir AppData.
   Solo copia opaca verificada, sin conversión ni activación del perfil: crear
   otra generación permite deshacer la importación. Usar fixtures públicos del
   repo y datos locales de prueba, no información real del usuario. Registrar
   hashes/artefactos, logs de gates, pruebas con el paquete y matriz de TODOS
   los servicios de ADR 0099, incluido Testing Center. Documentar bloqueos de
   fases 3/4/5 y físicos sin cerrar la fase completa.

Verificación de cada commit: `git diff --check`; scripts parseados/ejecutados
con Windows PowerShell 5.1. Antes de cada commit: desde `native/`,
`cargo fmt --check`, `cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --workspace -j 2`, offline. Nunca ejecutar más de dos compilaciones
por Cargo ni solapar clippy/test/build. No tocar Go/frontend: sus suites no son
el gate de este cambio. Las pruebas de packaging serán un script sin Pester
ni dependencias, con asserts observables y operaciones reales sobre carpetas
temporales bajo `native/target/phase7-*`.

## Fronteras y decisiones mínimas

- **Release reutilizada**: futuro asset `vantare-native-amd64-package.zip`
  y su SHA, portable con nombre nativo y script instalador separados de los
  seis assets Wails. Misma GitHub Release/tag/canal autorizado y mismos
  manifiestos de notas, nunca reemplazar `vantare-amd64-installer.exe`.
  Esta fase solo genera archivos locales. Integrar assets/validadores en
  release.yml requiere otro corte revisado después de paridad.
- **Canales**: `nightly`, `testers`, `master` explícitos en manifiesto;
  `master` corresponde a `stable` de Go. Instalación local no prueba derecho
  a canal ni concede licencia. Actualización exige mismo canal; cambiarlo
  queda para Hub/autoridad de licencia (fase 5). No selección de URL, red,
  descarga automática, firma ni instalación remota.
- **Datos**: generación = conjunto binarios + directorio de datos. Esquema
  inicial `opaque-v1`: packaging conserva bytes, no interpreta DBs ni layouts.
  Rechazar manifiestos con otro esquema hasta migración explícita probada.
  Fases 4/5 deben adoptar/validar esta frontera antes de prometer rollback de
  sus escrituras. El nativo actual no consume los perfiles importados.
- **Dependencias nuevas**: ninguna crate, biblioteca ni herramienta descargada.
  PowerShell/.NET ofrece ZIP, SHA-256, mutex de archivo y File.Replace.
  Alternativa NSIS instalado: añadiría compilador/plantilla y lógica transaccional
  duplicada sin necesidad para demostrar el candidato offline. Un instalador
  gráfico firmado queda para el corte de distribución real.
- **Perfil de build**: se admiten Debug/Release y se registra el usado. Debug
  prueba el mecanismo, nunca presupuestos de producto ni readiness comercial.
  Las pruebas no ejecutan `--live` ni modo sintético; el smoke usa argumentos
  inválidos controlados o `--parar` y/o replay real sin red.
- **Mantenibilidad**: reportar líneas de scripts/documentos/tests y ninguna
  dependencia Rust nueva. Incremental UI y recursos no se miden en paralelo;
  pertenecen al orquestador en condiciones fijadas.

## Bloqueos y preguntas pendientes (seguir con cortes independientes)

| Corte / aceptación de fase 7 | Estado al planificar | Quién / siguiente evidencia |
| --- | --- | --- |
| Conversión real perfiles Wails → Studio Rust | Bloqueado por fase 5: no hay contrato persistido nativo | Orquestador coordina esquema y semántica; fixtures golden y backup sin tocar origen. La copia opaca NO equivale a migración funcional. |
| Migración DuckDB, Strategy y datos Engineer | Bloqueado por fases 3/4/5 | Propietarios definen esquema destino, snapshots consistentes y compatibilidad; no abrir ni copiar DB viva aquí. |
| Actualizador remoto, autorización canal, firma y NSIS/EXE comercial | Bloqueado por integración y decisiones de distribución | Isaac autoriza publicación/firma/secrets cuando haya candidato revisado. No se solicita ni ejecuta acción externa. |
| Sesión prolongada LMU/OBS y otra GPU / equipo limpio | Bloqueado por prueba física y binarios finales de otras fases | Isaac/orquestador fijan duración, escena, GPU, hashes y criterios; no sustituir por proceso idle o test de carpeta. |
| Matriz de servicios completa | Documentable ahora; aceptación bloqueada por fases 2–6 | Marcar cada servicio disponible/parcial/ausente con fuentes; paquete no demuestra paridad. |
| Notion | Inaccesible; excepción expresa del encargo | Orquestador reconcilia tarea/proyecto y evidencia cuando vuelva el acceso. |

No hay decisión de arquitectura fuera del ADR necesaria para el candidato local.
El diseño del instalador final, el esquema persistido y las pruebas físicas son
preguntas abiertas; ningún fallback se presenta como producto terminado.

## Registro de ejecución

Se actualizará por corte con checks, artefactos y límites realmente observados.

- Microplan: fmt/clippy/test PASS offline (-j 2; dos pruebas físicas ignored). Logs microplan-*.log en native/target/phase7-evidence. Inventario comprometido en ba2c32c6. Implementación aún no iniciada.
- Corte 3: paquete, instalador script por usuario y portable creados con seis
  binarios Debug reales; 30 comprobaciones locales PASS (instalación, integridad,
  entradas ZIP adversarias, portable, seis smoke CLI y exclusión mutua).
  Artefactos de prueba en `native/target/phase7-cut3-v3`, `source_dirty=true`
  explícito: no se presentan como build del commit limpio. PowerShell 5.1
  genera separadores ZIP diferentes con CreateFromDirectory; el builder fija
  nombres POSIX explícitos y conserva directorios vacíos de datos del portable.
  Inspección PE: dependencia MSVC VCRUNTIME140; GPUI importa ICU/DX11. Su
  distribución/preflight en Windows limpio sigue bloqueada, no se descarga.
  Logs `corte3-build-v3.log`, `corte3-tests-final.log`,
  `corte3-{core,overlays}-imports.log` en `native/target/phase7-evidence`.
- Gates corte 3: fmt/clippy/test PASS offline (-j 2); 2 físicos ignored. git diff --check PASS. Sin cambios Rust ni dependencias nuevas.
- Corte 4: 53 comprobaciones packaging PASS con los binarios reales. La versión
  siguiente es **simulada** cambiando solo el manifiesto: no se finge una segunda
  build del producto. Se prueban actualización por copia, rollback/retorno,
  rechazo de otro canal/esquema, núcleo real ejecutándose sin matarlo y muerte
  real del actualizador en staged/before-commit/after-commit. Tras matar, el
  estado vuelve a leerse y el lock está libre; rollback posterior restaura la
  generación previa. Log `corte4-tests-v2.log`. PowerShell 5.1 requiere
  `NullString.Value` para pasar null real a File.Replace (sin backup/journal
  redundante); el test ejecuta este reemplazo en NTFS.
  Límite: interrupción de proceso, no apagón/durabilidad física del disco.
  Bootstrap estable schema=1: evolucionarlo exige otro corte revisado, no
  reemplazar automáticamente el script instalado ni ejecutar código del ZIP.
- Gates corte 4: fmt/clippy/test PASS offline (-j 2; dos físicos ignored), packaging 53 PASS y git diff --check PASS. Sin nuevas dependencias ni cambios de producto.
