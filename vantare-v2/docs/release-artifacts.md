# Release artifacts reproducibles (R03.B)

Fuente operativa del flujo de empaquetado oficial de Vantare Simracing Suite para Windows. Documenta que artefactos se publican, que comandos los generan, donde se guardan y como se verifica que la version correcta esta embebida.

Esta guia complementa a `docs/release-beta-operations-runbook.md` (operativa general de release) y a `docs/versioning-and-release-gates.md` (versionado). El detalle tecnico vive en los scripts `tools/build_nsis.ps1` y `tools/release_artifacts.ps1`.

---

## 1. Artefactos oficiales

| Artefacto | Ruta | Tamanio tipico | Notas |
|---|---|---|---|
| Instalador NSIS | `bin/vantare-amd64-installer.exe` | ~25 MB | Ejecutable self-extracting con `vantare.exe` y la unidad DuckDB confiada. Genera atajos y desinstalador. |
| Portable zip | `bin/vantare-portable-amd64.zip` | ~25 MB | Contiene `vantare.exe`, `configs/*.json`, `docs/README.txt` y la unidad exacta `runtime/telemetry/duckdb-v1`. |
| Binario base | `bin/vantare.exe` | ~13 MB | Empaquetado dentro del instalador. El updater productivo descarga y ejecuta el installer, por lo que hereda la unidad DuckDB. |
| Checksums SHA-256 | `bin/<artifact>.sha256` | ~90 B | Un archivo `<artifact>.sha256` por cada artefacto oficial. Formato `<hash>  <nombre>`. |
| Suma global de checksums | `bin/SHA256SUMS.txt` | (futuro) | Se anade en R03.C si la publicacion a GitHub Releases lo necesita. |

**El portable zip debe contener `configs/`** porque los perfiles recomendados son la primera impresion para un tester nuevo. Ver `docs/tester-build-instructions.md` seccion 2 metodo B.

---

## 2. Comandos oficiales

Desde la raiz de `vantare-v2/`:

| Tarea | Comando | Equivalente Windows |
|---|---|---|
| Pipeline completo (build + installer + portable + SHA256 + verify) | `wails3 task release:artifacts` | `windows:package:all` |
| Solo build | `wails3 task build` | `windows:build` |
| Solo installer NSIS | `wails3 task package` | `windows:package` |
| Solo portable zip | `wails3 task release:portable` | `windows:release:portable` |
| Solo checksums SHA256 | `wails3 task release:checksums` | `windows:release:checksums` |
| Solo verificacion de version | `wails3 task release:verify` | `windows:release:verify` |
| Limpieza de stale artifacts | `wails3 task release:clean` | `windows:release:clean` |

`release:artifacts` es el alias canonico de R03.B y es lo que un orquestador o un humano debe correr para producir un set de release.

**Pre-condicion Windows:** `makensis` accesible (real NSIS 3.x). Acepta cualquiera de estas fuentes:
- en `PATH` (`where makensis` debe resolver),
- en la ruta estandar `C:\Program Files (x86)\NSIS\Bin\makensis.exe`,
- en `%ProgramFiles(x86)%\NSIS\Bin\makensis.exe` en hosts con instalacion no estandar.

El script `tools/build_nsis.ps1` resuelve el NSIS real automaticamente en ese orden y cae al binario real aunque exista el shim de wails3 (que falla con 0x2 en algunos entornos).

El runtime DuckDB requiere ademas PowerShell 7 (`pwsh`), Go 1.26.4 y GCC
UCRT64. `windows:package:all` y `windows:release:portable` lo preparan antes de
empaquetar. Para una ejecucion reproducible sin volver a descargar el ZIP
DuckDB oficial, pasar
`DUCKDB_ARCHIVE_PATH=C:\ruta\libduckdb-windows-amd64.zip`; el script valida su
SHA-256 antes de usarlo.

---

## 3. Pipeline detallado (`wails3 task release:artifacts`)

```text
1. version:sync   (root)
   Lee VERSION (0.3.10.0) y sincroniza:
     - cmd/vantare/main.go              -> var version = "v0.3.10.0"
     - build/config.yml                 -> info.version
     - build/windows/info.json          -> fixed.file_version + info.ProductVersion
     - build/windows/nsis/project.nsi   -> !define INFO_PRODUCTVERSION

2. windows:build (windows:build:native)
   go mod tidy + frontend build (pnpm) + icons + syso + go build con ldflags:
     -tags production -trimpath -buildvcs=false
     -ldflags="-w -s -H windowsgui -X main.version=v0.3.10.0"
   -> bin/vantare.exe

3. windows:telemetry:runtime
   build-runtime.ps1 + verify-runtime.ps1 + smoke-runtime.ps1
   -> bin/runtime/telemetry/duckdb-v1 (5 miembros exactos)

4. windows:package:all
   4.1 tools/build_nsis.ps1
       wails3 generate webview2bootstrapper + makensis project.nsi
       -> bin/vantare-amd64-installer.exe
   4.2 tools/release_artifacts.ps1 portable-zip
       Comprime exe, configs, tester README y el runtime confiado
       -> bin/vantare-portable-amd64.zip
   4.3 tools/release_artifacts.ps1 sha256
       Escribe <artifact>.sha256 para installer, zip y exe
       usando certutil.exe (siempre disponible en Windows)
   4.4 tools/release_artifacts.ps1 verify
       Escanea el binario y el installer confirmando que la
       cadena 'v<VERSION>' (UTF-8) o '<VERSION>' (UTF-16 LE en
       el recurso de version PE del NSIS) esta presente.
       Ademas abre el ZIP, extrae de forma acotada solo los cinco miembros del
       runtime y revalida inventario, manifest trust, tamanos y hashes. Falla
       con exit code !=0 ante ausencia, tamper o miembros extra.
```

---

## 4. Donde se guardan y como se evita publicar artefactos obsoletos

- **Path oficial:** todos los artefactos viven en `bin/` en la raiz de `vantare-v2/`. Mantener el path estable permite que `.github/workflows/release.yml` (R03.C) suba los assets con nombres exactos `vantare-amd64-installer.exe`, `vantare-portable-amd64.zip` y `*.sha256`.
- **Sin `release/` ni directorios versionados.** Los artefactos son inmutables por tag git, no por path. Cada tag `vX.X.X.X` reconstruye `bin/` desde cero.
- **Anti-stale:** `wails3 task release:clean` elimina cualquier archivo en `bin/` que no sea uno de los 6 oficiales (3 artefactos + 3 checksums). Se debe correr antes de empaquetar un tag para evitar subir binarios viejos por accidente. El pipeline de CI invoca esta tarea como pre-step.
- **Version gate:** `verify` corre siempre al final del pipeline `release:artifacts`. Si el binario o el installer no contiene la version esperada, el pipeline falla y NO se llega a publicar. Esto cubre el riesgo R-P0-1 del plan tecnico.

## 4.1. CI de release (`.github/workflows/release.yml`)

El workflow `Release build` (R03.C) automatiza el pipeline de artefactos en GitHub Actions:

| Trigger | Comportamiento |
|---|---|
| Push de tag `v*` | Build + upload de artifacts + creacion automatica de GitHub Release con los 6 archivos oficiales. |
| `workflow_dispatch` sobre un tag con `create_release: true` | Build + upload + creacion manual de GitHub Release. |
| `workflow_dispatch` sobre una rama o tag sin `create_release` | Build + upload de artifacts; **no** crea release. |

Pasos principales del job `build`:

1. Checkout del repo en la raiz (`Vantare-Overlays/`).
2. Setup de Go `1.25.0`, pnpm `10`, Node `22`.
3. Instalacion de NSIS `3.12.0` via Chocolatey (pinned).
4. Instalacion de Wails v3 CLI `v3.0.0-alpha.98-tui` via `go install` (pinned).
5. Gate de tests/lint (antes de generar artefactos):
   - `go test ./...` desde `vantare-v2/`.
   - `pnpm install` + `pnpm test` + `pnpm lint` desde `vantare-v2/frontend/`.
   - Si cualquier gate falla, el job se aborta y no se generan artefactos ni se publica release.
6. En el directorio `vantare-v2/`:
   - `wails3 task release:clean`
   - `wails3 task release:artifacts`
   - `wails3 task release:verify`
7. Verificacion estricta de que existen los 6 archivos oficiales.
8. Upload a GitHub Actions artifacts.

El job `release` (solo en tags `v*`) corre en Ubuntu, descarga los artifacts y ejecuta `gh release create` subiendo:

- `vantare.exe` + `.sha256`
- `vantare-amd64-installer.exe` + `.sha256`
- `vantare-portable-amd64.zip` + `.sha256`

El body del release se extrae de la seccion `## vX.X.X.X` de `docs/changelog.md`; si no existe, se usa un fallback generico y se emite un warning.

Seguridad:

- Permisos minimos: el workflow usa `permissions: contents: read` por defecto; solo el job `release` solicita `permissions: contents: write`.
- No se imprimen secretos; el unico token usado es `secrets.GITHUB_TOKEN` en el job de release.
- No se modifican archivos de version en CI: `VERSION` se lee via `version:sync` pero nunca se escribe.
- Si falta algun artefacto o checksum, el job `build` falla antes de llegar al release.

---

## 5. Checksum SHA-256: como se calcula y como se verifica

Calculo (Windows nativo, sin herramientas externas):

```powershell
certutil.exe -hashfile bin\vantare-amd64-installer.exe SHA256
```

El pipeline escribe automaticamente:

```text
bin/vantare-amd64-installer.exe.sha256
bin/vantare-portable-amd64.zip.sha256
bin/vantare.exe.sha256
```

Formato compatible con `sha256sum -c`:

```
9e728acb5068c8ff29224cc8c177ee50b8e77af78e478a83610cb69f2c568ee7  vantare-amd64-installer.exe
```

Verificacion manual por un tester:

```powershell
# Opcion A: PowerShell
Get-FileHash bin\vantare-amd64-installer.exe -Algorithm SHA256
# comparar contra el contenido de bin\vantare-amd64-installer.exe.sha256

# Opcion B: certutil
certutil.exe -hashfile bin\vantare-amd64-installer.exe SHA256
```

Verificacion automatica (recomendada antes de distribuir):

```powershell
Get-Content bin\vantare-amd64-installer.exe.sha256 | ForEach-Object {
    $hash, $name = $_ -split '  '
    $actual = (certutil.exe -hashfile "bin\$name" SHA256 | Select-String -Pattern '^[0-9a-f]{64}$').Matches[0].Value
    if ($actual.ToLower() -ne $hash) { throw "MISMATCH: $name" }
}
```

---

## 6. Firma de codigo: estado y gap

**Estado actual (R03.B): sin firma de codigo.**

- Las tareas `windows:sign` y `windows:sign:installer` existen en `build/windows/Taskfile.yml` (template de wails3) pero requieren `SIGN_CERTIFICATE` o `SIGN_THUMBPRINT` + password en keychain. Ninguno esta configurado.
- Sin firma: Windows SmartScreen muestra la advertencia "Editor desconocido" al ejecutar el installer.
- Los checksums SHA-256 mitigan integridad (un atacante no puede sustituir el binario sin que el hash cambie), pero NO mitigan autenticidad (un atacante puede publicar su propio binario + SHA256 en otro canal).
- El autoupdater de Vantare (`internal/updater`) descarga el installer y verifica SHA-256 contra un manifest separado. Eso protege a testers que actualizan in-app desde un canal legitimo. NO protege a un tester nuevo que descarga un installer de un enlace comprometido.

**Lo que falta para firma real (out of R03.B, plan R03.H/14):**

1. Comprar certificado Authenticode (OV o EV) a una CA reconocida (DigiCert, Sectigo).
2. Exportar `.pfx` + password y configurar `SIGN_CERTIFICATE` y `wails3 setup signing` para guardar el password en el keychain del host.
3. Decidir si la firma se aplica solo al installer o tambien al `.exe` portable (recomendado: ambos).
4. Actualizar el runbook para que `wails3 task release:artifacts` invoque `windows:sign` + `windows:sign:installer` como paso final, antes de `release:verify`.
5. Validar que NSIS firma correctamente el instalador firmado (NSIS 3.x soporta signtool via `SignTool::Sign` en `.onInit`).

Mientras tanto, el runbook `docs/release-beta-operations-runbook.md` ya documenta la advertencia SmartScreen como un "known issue" para testers de beta privada.

---

## 7. Verificacion manual recomendada

Despues de correr `wails3 task release:artifacts`, en este orden:

1. `Get-ChildItem bin` debe listar exactamente los 6 archivos oficiales (3 artefactos + 3 checksums) y nada mas.
2. `Get-Content bin\vantare-amd64-installer.exe.sha256` debe mostrar el mismo hash que `certutil.exe -hashfile bin\vantare-amd64-installer.exe SHA256`.
3. `Expand-Archive bin\vantare-portable-amd64.zip -DestinationPath $env:TEMP\vantare-test` y confirmar que dentro hay `vantare.exe`, `configs\*.json` y `docs\README.txt`. Borrar `$env:TEMP\vantare-test` despues.
4. (Opcional) Instalar el NSIS en una maquina limpia o VM y arrancar la app. Verificar que aparece la pantalla principal y que la version en Ajustes -> Acerca de coincide con `VERSION`.

---

## 8. Riesgos restantes (heredados, fuera de R03.B)

- **Sin firma de codigo.** Ver seccion 6. Riesgo P0 para release estable publico (R03.H/14 lo cierra).
- **Reproducibilidad del binario Go.** Go embebe timestamps y paths en el binario. `-trimpath -buildvcs=false` ya esta aplicado, pero dos builds consecutivos del mismo commit daran SHA256 distintos para `vantare.exe`. Esto es esperado; lo importante es que `version:sync` se ejecuto antes. El checksum por si solo no es unico-identificador.
- **NSIS comprime el exe.** El instalador no contiene el string `v0.3.10.0` en UTF-8 (NSIS comprime con zlib). Por eso `verify` busca `0.3.10.0` en UTF-16 LE dentro del recurso de version PE (que NSIS pone sin comprimir). Si NSIS cambia su representacion de version resources, este check se rompe. Mitigacion: test regresivo si se actualiza NSIS.
- **Shim de wails3 `makensis.exe` local.** En algunos entornos (este host incluido) el shim de wails3 falla con error 0x2 porque no encuentra el NSIS real. `tools/build_nsis.ps1` lo evita llamando al binario real directamente. El task `windows:package` original sigue dependiendo del shim; se deja como esta porque arreglarlo es responsabilidad del entorno, no del codigo de Vantare.
- **Toolchain del workflow remoto.** El runtime confiado de TA-03C se produjo
  con Go 1.26.4, GCC UCRT64 16.1.0 y PowerShell 7. Un workflow que conserve Go
  1.25 falla cerrado al preparar el manifest y no publica artefactos. Actualizar
  ese workflow forma parte del futuro corte de release, fuera de TA-03F.
