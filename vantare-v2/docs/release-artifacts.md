# Release artifacts reproducibles (R03.B)

Esta es la **receta unica y autosuficiente** para construir artefactos
distribuibles de Vantare en Windows. El runbook general y la guia de testers
deben enlazar aqui, no duplicar la carga de entorno ni los comandos de build.
El versionado se rige por `docs/versioning-and-release-gates.md`; el detalle
tecnico vive en `tools/release_build_preflight.ps1`, `tools/build_nsis.ps1` y
`tools/release_artifacts.ps1`.

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

### 2.1 Preparar una consola autorizada sin copiar ni imprimir `.env.local`

Abre PowerShell desde la raiz de `vantare-v2/`. El archivo autorizado puede
estar en este checkout o en otro worktree: indica su ruta original y leelo en
memoria; no lo copies al worktree de release, no uses `Get-Content` a solas y
no imprimas las variables. Este bloque solo admite los dos nombres publicos de
Supabase y exporta los nombres `VANTARE_*` que consume Task:

```powershell
$releaseEnvPath = 'C:\ruta-autorizada\vantare-v2\frontend\.env.local'
if (-not (Test-Path -LiteralPath $releaseEnvPath -PathType Leaf)) {
  throw 'No existe la ruta .env.local autorizada.'
}

$releaseConfig = @{}
foreach ($line in [System.IO.File]::ReadLines($releaseEnvPath)) {
  if ($line -match '^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and
        (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or
         ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $releaseConfig[$Matches[1]] = $value
  }
}

$env:VANTARE_SUPABASE_URL = $releaseConfig['VITE_SUPABASE_URL']
$env:VANTARE_SUPABASE_ANON_KEY = $releaseConfig['VITE_SUPABASE_ANON_KEY']
Remove-Variable releaseConfig, value -ErrorAction SilentlyContinue
& .\tools\release_build_preflight.ps1
if ($LASTEXITCODE -ne 0) { throw 'Configuracion publica de release incompleta.' }
```

El preflight solo muestra `SET`, `UNSET` y los nombres ausentes; nunca muestra
valores. `release:artifacts`, `windows:package:all` y `release:portable` lo
ejecutan como primera orden y fallan antes de dependencias, frontend, Go o
runtime si falta cualquiera de los dos nombres. `windows:build`, desarrollo y
los flujos offline no se bloquean.

Task necesita `VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY`; durante su
build frontend deriva de ellas `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY`. Si se invoca `pnpm --dir frontend build` directamente,
hay que proporcionar los nombres `VITE_*`. Si se invoca el generador y
`go build` directamente, hay que proporcionar los nombres `VANTARE_*`.

Una pareja Supabase local o de desarrollo basta para comprobar que el build
queda configurado contra ese proyecto, pero **no demuestra paridad real de
licencia**. La validacion real requiere ademas el registro autorizado
`VANTARE_LICENSE_PUBLIC_KEYS` y la configuracion del canal/CI correspondiente.
No inventes ni copies ese registro entre worktrees.

### 2.2 Construir y verificar

Tras cargar el entorno en la misma consola:

```powershell
wails3 task release:clean
wails3 task -f release:artifacts
wails3 task release:verify
```

Usa `-f` cuando corriges un build o cambias variables de entorno: obliga a Task
a reconstruir pasos que de otro modo podria considerar actualizados. El
preflight es un comando serial, no una precondition de Task, por lo que `-f` no
puede omitirlo. No uses un artefacto previo para validar un entorno nuevo.

Comandos disponibles desde la raiz:

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

Los scripts de bajo nivel pueden empaquetar un `vantare.exe` preconstruido y no
repiten el preflight. Esa via solo sirve para diagnostico controlado de un exe
ya validado; no convierte el resultado en publicable. Todo artefacto
distribuible debe salir de `release:artifacts` o `release:portable` con el gate.

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
0. release_build_preflight.ps1
   Exige VANTARE_SUPABASE_URL y VANTARE_SUPABASE_ANON_KEY antes de build/deps.

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
| Push de tag `v*` | Exige que el commit del tag pertenezca a `master`; construye, sube los seis assets y crea o actualiza una release estable. |
| `workflow_dispatch` desde `nightly` o `testers`, `publish_channel: none` | Construye y sube el artifact interno de Actions; no crea GitHub Release. |
| `workflow_dispatch` desde `nightly` o `testers`, canal homonimo | Exige `release_tag`, manifest y fragmentos; construye, crea o actualiza la pre-release y solo despues publica las comunicaciones configuradas. |

Los inputs actuales del dispatch son `publish_channel` (`none`, `nightly` o
`testers`), `release_tag` y `release_notes`. No existe un input
`create_release`. El canal publicable debe coincidir con la rama y el tag debe
seguir el sufijo de ese canal.

El job Windows recibe estas variables sin imprimir sus valores:

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` desde secrets para Vite;
- `VANTARE_SUPABASE_URL` y `VANTARE_SUPABASE_ANON_KEY` desde los mismos
  valores publicos para Task/Go y el preflight;
- `VANTARE_LICENSE_PUBLIC_KEYS` para paridad de licencia;
- `VANTARE_BUILD_CHANNEL` derivado de la rama o `master` para tags.

El gate inicial comprueba los nombres `VITE_*` y
`VANTARE_LICENSE_PUBLIC_KEYS`; el preflight de packaging comprueba despues la
pareja `VANTARE_*`. La ausencia de cualquiera de esos contratos detiene el job.

Pasos principales del job `build`:

1. Checkout del repo en la raiz (`Vantare-Overlays/`).
2. Verificacion de entorno Supabase/licencia y del deploy surface de Supabase.
3. Setup de Go desde `vantare-v2/go.mod` (`1.25.0`), Node `22`, pnpm `9.1.0`
   (tambien declarado en el `packageManager` raiz), NSIS `3.12.0` y Wails
   `v3.0.0-alpha.98-tui`.
4. Gates antes de generar artefactos:
   - `pnpm install --frozen-lockfile` y `pnpm build` en
     `vantare-v2/frontend/`;
   - `go test ./...` en `vantare-v2/`;
   - `pnpm test` y `pnpm lint` en `vantare-v2/frontend/`.
   - Go, build y tests son bloqueantes. El lint solo es advisory en
     `workflow_dispatch`; en un tag publico sigue siendo bloqueante.
5. Sincronizacion de version desde `release_tag`/tag valido y export de
   `VANTARE_VERSION`; un dispatch `none` sin tag conserva `VERSION`. La
   sincronizacion puede modificar archivos generados dentro del runner, nunca
   el repositorio remoto.
6. En `vantare-v2/`, exactamente como esta escrito hoy en el workflow:
   - `wails3 task release:clean`
   - `wails3 task release:artifacts`
   - `wails3 task release:verify`
   CI no usa `-f`: parte de un checkout limpio y ejecuta esos pasos una vez en
   el mismo job. La receta local si usa `-f` al corregir un build o cambiar el
   entorno para invalidar resultados que Task pudiera considerar actuales.
7. Verificacion estricta de que existen los 6 archivos oficiales.
8. Upload a GitHub Actions artifacts.

El job `release` corre para tags `v*` y para dispatch publicable. En Ubuntu,
descarga los artifacts y crea o actualiza de forma idempotente la GitHub
Release, resubiendo con `--clobber` cuando ya existe:

- `vantare.exe` + `.sha256`
- `vantare-amd64-installer.exe` + `.sha256`
- `vantare-portable-amd64.zip` + `.sha256`

El body del release se extrae de la seccion `## vX.X.X.X` de `docs/changelog.md`; si no existe, se usa un fallback generico y se emite un warning.

Seguridad:

- Permisos minimos: el workflow usa `permissions: contents: read` por defecto; solo el job `release` solicita `permissions: contents: write`.
- Supabase, claves publicas de licencia, webhooks y `GITHUB_TOKEN` se inyectan
  mediante secrets en los jobs que los consumen; los gates muestran nombres o
  destinos verificados, no valores.
- La sincronizacion de version solo cambia el workspace efimero del runner; el
  workflow no commitea ni empuja esos cambios.
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

1. `Get-ChildItem bin -File` debe listar exactamente los 6 archivos oficiales
   (3 artefactos + 3 checksums). El directorio de trabajo verificado
   `bin/runtime/telemetry/duckdb-v1` también existe localmente, pero no es un
   artefacto publicable separado.
2. `Get-Content bin\vantare-amd64-installer.exe.sha256` debe mostrar el mismo hash que `certutil.exe -hashfile bin\vantare-amd64-installer.exe SHA256`.
3. `Expand-Archive bin\vantare-portable-amd64.zip -DestinationPath $env:TEMP\vantare-test` y confirmar que dentro hay `vantare.exe`, `configs\*.json` y `docs\README.txt`. Borrar `$env:TEMP\vantare-test` despues.
4. Instalar el NSIS en una maquina limpia o VM y arrancar la app. Verificar que
   la version en Ajustes -> Acerca de coincide con `VERSION`.
5. **Smoke obligatorio de autenticacion:** pulsar el login Google OAuth,
   completar el retorno del navegador y comprobar que la app llega al Hub sin
   `Configuracion incompleta`. Para paridad real de licencia, confirmar tambien
   el entitlement esperado en una build de CI con
   `VANTARE_LICENSE_PUBLIC_KEYS`; una pareja Supabase local por si sola no
   demuestra ese gate.

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
