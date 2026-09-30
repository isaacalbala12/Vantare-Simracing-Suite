# Candidato offline — fase 7 (ISA-1432)

Windows x64, PowerShell 5.1/.NET y volumen local con reemplazo atómico (NTFS).
No requiere Python, NSIS, crates nuevas ni permisos de administrador.
**Candidato técnico sin firma; Wails sigue siendo el producto distribuido.**

Desde la raíz `vantare-v2`, con checkout limpio y dependencias Cargo cacheadas:

```powershell
& native/packaging/candidate.ps1 -Operation Build -Version 0.0.0-local `
  -Channel nightly -BuildProfile Debug -OutputDirectory native/target/phase7-build
```

Compila los seis binarios actuales, offline/locked con `-j 2`. `Release` es el
perfil por defecto; `Debug` verifica packaging sin representar rendimiento de
producto. Para probar antes del commit, `-AllowDirty` registra `source_dirty=true`.
El SHA de Git y los hashes de todos los archivos identifican lo construido;
los binarios aún no tienen versión de producto embebida.

La salida conserva `payload`, `portable-tree`, el paquete, portable e instalador
script con sus SHA-256. El manifiesto enumera exactamente los seis exe, el
script, README, licencia Inter y catálogo Cargo con versiones/licencias/source.
Este catálogo **no es un SBOM ni una auditoría de distribución**. No publica
releases ni ejecuta los workflows Wails.

Instalación por usuario en una carpeta vacía elegida expresamente (puede ser
una carpeta de prueba; no escribe registro, servicios, asociaciones o AppData):

```powershell
$package = 'native/target/phase7-build/vantare-native-amd64-package.zip'
$sha = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
& native/packaging/candidate.ps1 -Operation Install -Root native/target/phase7-install `
  -Archive $package -ExpectedSha256 $sha -Channel nightly
& native/target/phase7-install/candidate.ps1 -Operation Status -Root native/target/phase7-install
```

El instalador es `vantare-native-installer.ps1` con operación Install y los
mismos argumentos. Para instalar de verdad por usuario se puede elegir
`$env:LOCALAPPDATA/Programs/Vantare Native Candidate`; los tests no usan esa ruta.
Portable: verificar su sidecar y extraer el ZIP a una carpeta nueva; contiene
el mismo árbol listo, con `candidate.ps1`, `state.json` y generaciones.

El SHA externo debe venir de una fuente confiable. Calcularlo del propio ZIP,
como en el ejemplo local, prueba integridad de prueba, **no autenticidad remota**.
El script no descarga ni concede acceso a canales. `master` equivale a Stable
de Wails; canal explícito no equivale a licencia. No usar este candidato para
distribución comercial ni reemplazar assets Wails.

Arranque explícito (replay real, no fuente sintética por defecto):

```powershell
& native/target/phase7-install/candidate.ps1 -Operation Start -Root native/target/phase7-install `
  -ApplicationArgs @('--', '--replay', (Resolve-Path testdata/lmu-fixture.bin).Path, '--build', '1.3.0.0', '--', '4')
```

El wrapper conserva el lock mientras vive el launcher. Ctrl+C / cierre normal
usan el ciclo de vida existente. El nativo actual no consume un directorio de
perfiles persistidos: packaging todavía no demuestra migración funcional.

No se aceptan ZIP parciales, hashes erróneos, otro esquema, paths arbitrarios,
enlaces ni árboles con `.env*`. Las preparaciones incompletas se conservan para
inspección y nunca se activan. No hay borrado automático de datos/generaciones.

Antes de cada commit, desde `native/`:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
$env:CARGO_BUILD_JOBS = '2'
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

Faltan firma/SmartScreen, notices completos de terceros, redistribuible MSVC
si fuera necesario, equipo Windows limpio/otra GPU, sesión prolongada LMU+OBS,
paridad completa de servicios y contratos de persistencia de fases 3/4/5.
Ver el microplan: la fase 7 completa sigue abierta aunque el mecanismo local pase.

Prueba local del mecanismo (con binarios reales de la salida indicada):

```powershell
powershell -NoProfile -File native/packaging/tests.ps1 `
  -ArtifactsDirectory native/target/phase7-build
```

Las pruebas conservan sus carpetas bajo `native/target/phase7-tests-*` y no
necesitan Pester. El smoke solo verifica carga del exe y rechazo de argumentos,
sin abrir juego, ventana GPUI ni red. La inspección PE local de Core/Overlays
detecta `VCRUNTIME140.dll`; Overlays también importa `icuuc.dll`, DX11 y
`d3dcompiler_47.dll`. Que carguen en este PC no prueba Windows 10 limpio.
