# Fase 7 — inventario de distribución y datos (ISA-1432)

## Actualización fase 7b (2026-09-30)

Base asignada `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`; issue #1432 leída
con `gh issue view`. El inventario inicial de abajo se conserva como historia.
Esta base incorpora Hub, Engineer y Storage: diez binarios con el importador
V4 de este corte; todos comparados con `cargo metadata`, empaquetados y
verificados con sidecars individuales. Contrato y pruebas en
[IMPORTACION-V4.md](IMPORTACION-V4.md); tamaños/evidencia de esta build en
`FASE7B-VERIFICACION.md`. No se usan cifras de la entrega anterior.

## Inventario inicial (base antigua)

Inspección local del 2026-09-30, base `c9606a287672936689d6d48db1445956267c2a48`.
Proyecto: arquitectura Rust nativa, ADR 0099. Referencia técnica:
[#1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432).
Isaac autoriza expresamente trabajar sin Notion en este encargo; no hay lectura,
escritura ni estado Notion verificados. La lectura pública de la issue falló
(`Cache miss`); el alcance es el encargo y el plan versionado, no un estado remoto
inventado. No se hace fetch: el encargo limita la red a documentación pública.
`origin/nightly` local apunta a `f29b5fee04022756f9ae59f19bf153f91eebe4ed`;
merge-base con esta rama: `5838de5a4abee3e99d9d50aebd5dc20609c53611`.
No se cambia la base asignada por el orquestador ni se integra otra fase.

## Producto Go/Wails distribuido

| Función / contrato | Evidencia local (rutas respecto a la raíz Git) | Implicación para el candidato |
| --- | --- | --- |
| Canales y autoridad de publicación | `.github/workflows/release.yml:53`, `:101`, `:140`, `:227`; `vantare-v2/docs/branch-channels.md` | Nightly y Testers son prereleases; público procede de Master. Mantener esta cadena, no publicar ni disparar workflow. |
| Artefactos oficiales y checksums | `.github/workflows/release.yml:373`, `:379`, `:489`, `:503`, `:534` | Se comprueban seis assets: exe, instalador NSIS, portable ZIP y sus tres SHA-256. El candidato nativo necesita nombres distintos; los validadores actuales no admiten sustituir esos seis. |
| Composición de instalador / portable | `vantare-v2/build/windows/Taskfile.yml:149`, `:173`, `:194`; `vantare-v2/tools/release_artifacts.ps1:175`, `:192`, `:199`, `:229` | Wails compila frontend/Go y distribuye el runtime DuckDB aprobado con notices y manifiesto. No portar Wails, WebView2 ni el reader Go al nativo. |
| Instalación por usuario y transacción | `vantare-v2/build/windows/nsis/project.nsi:96`, `:117`, `:169`, `:196`, `:306`, `:357`, `:430` | NSIS conserva exe/runtime anteriores; diferencia pending de committed y recupera tras interrupción. Mantener la propiedad de atomicidad, no copiar el instalador entero. |
| Descubrimiento público de releases | `vantare-v2/internal/updater/github.go:15`, `:65`, `:73`, `:127`, `:177`, `:187` | GitHub Releases, paginación limitada, assets exactos. El nombre nativo evita que el actualizador Wails lo ejecute. |
| Selección de canal | `vantare-v2/internal/updater/settings.go:14`, `:22`; `vantare-v2/internal/updater/updater.go:181`, `:195`; `vantare-v2/frontend/src/hub/settings/updater-channel.ts:21` | `stable` equivale a rama `master`; Nightly incluye todos, Testers incluye Testers y Stable. El candidato offline usa canal explícito y exige coincidencia; la autorización de licencia queda en Hub/núcleo, no en packaging. |
| Instalación verificada, exclusión mutua y eventos | `vantare-v2/internal/app/updater_service.go:250`, `:272`, `:297`, `:315`; `vantare-v2/internal/updater/updater.go:344`, `:350`, `:375`, `:380`, `:438` | Backend resuelve el tag, no acepta URL de ejecución del frontend; exige SHA, cancela descargas estancadas, excluye instalaciones concurrentes y emite progreso. Offline no descarga ni ejecuta instaladores remotos. |
| Configuración instalada / portable | `vantare-v2/cmd/vantare/main.go:163`, `:190`, `:224`, `:2257` | Roaming/Vantare/configs para instalación, configs y data junto al portable; sesiones en LocalAppData/Vantare/telemetry/sessions y Strategy en data/strategy. No descubrir ni leer datos reales automáticamente. No hay `app*.go` en esta raíz: la composición está en cmd/vantare. |
| Perfiles y compatibilidad | `vantare-v2/pkg/config/profile_v3_migrate.go:55`; `vantare-v2/pkg/config/profile_v4_migrate.go:10`; `vantare-v2/pkg/config/profile_v3_store.go:49`, `:79`, `:121`, `:181`; `vantare-v2/internal/app/studio_profile_service.go:156` | Lee legado y V3/V4, valida, revisa concurrencia y escribe V4 con backups pre-V3/V3. No interpretar estas estructuras como esquema Rust sin contrato de fase 5. |
| Migración de histórico | `vantare-v2/internal/telemetry/recording/migration.go:48`, `:182`, `:227`, `:244`; `vantare-v2/internal/strategy/repository/migration.go`; `vantare-v2/internal/strategy/application/legacy_migration.go` | Migración por copia y verificación de origen; no modificar bases Wails ni inventar conversión DuckDB/Strategy. Depende de fases 4/5. |
| Testing Center | `vantare-v2/cmd/vantare/main.go:2727`, `:2738`, `:2740`; `vantare-v2/internal/testingcenter/`; `vantare-v2/docs/vantare-program/handoffs/testing-center.md` | Incluye borradores, diagnósticos y trabajos con límites de autoridad. Ningún equivalente nativo en esta base: debe figurar como falta de paridad, no excluirse silenciosamente. |

## Candidato Rust de esta base

- `native/Cargo.toml:3`: cuatro crates, sin crate de packaging; no agregar uno.
- `native/runtime/src/bin/vantare/main.rs:90`, `:305`: launcher resuelve core y
  overlays junto a su exe. La distribución puede mantener esa geometría sin
  tocar código de producto. Job Object, instancia única y cierre están en
  `native/runtime/src/bin/vantare/win.rs` y `native/runtime/tests/lifecycle.rs`.
- Binarios actuales: `vantare`, `vantare-core`, `vantare-overlays`,
  `vantare-workshop`, `vantare-grabar-lmu`, `vantare-grabar-acc`.
  Core exige `--live` o `--replay`; no añadir un arranque sintético implícito.
- `native/ui/src/efficiency/text.rs:21`: fuentes embebidas; SVG/fixtures se
  embeben también. Distribuir licencia Inter, no una carpeta de assets falsa.
- GPUI fijado a `72d28c32c2ba77a579e1c02f984654518552124b`
  (`native/ui/Cargo.toml:21`), DX11; las DLL de plataforma y el redistribuible
  de MSVC necesitan verificación en un equipo limpio. No descargar runtime.
- `native/README.md`, ADR 0099 §3/§7 y fase 7 del plan: actualizador temporal,
  fuera de carrera y rollback compatible con datos. No hay Hub/persistencia
  nativa completa ni actualizador nativo en esta base.

La matriz de servicios y los bloqueos físicos se concretarán en el microplan.
Empaquetar y arrancar localmente no demuestra instalación comercial, firma,
paridad, recursos en carrera, OBS, sesión prolongada ni compatibilidad otra GPU.

Gates del inventario: cargo fmt --check, clippy --workspace --all-targets -j 2 -- -D warnings y test --workspace -j 2: PASS offline. Cuatro entradas físicas ignoradas (tres de LMU, una de ACC). Logs locales en native/target/phase7-evidence/inventario-*.log.
