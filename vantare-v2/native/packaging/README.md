# Beta nativa — instalador y actualizaciones (#1454)

El orquestador publica la beta; estos scripts **no publican ni usan tokens**.
Windows x64, NTFS, PowerShell 5.1, NSIS para construir el instalador.
El compilador NSIS predeterminado está en `Program Files (x86)/NSIS/makensis.exe`;
`-NsisCompiler <ruta>` permite indicar otra instalación real (no un shim roto).
No se añaden crates. Instalador sin firma: SmartScreen puede pedir «Más información → Ejecutar de todas formas» (aceptado por Isaac).

## Instalar y desinstalar

Doble clic en **VantareSetup.exe**. Instala sin administrador en
`%LOCALAPPDATA%/Programs/Vantare`, crea «Vantare» y
«Desinstalar» en el menú Inicio y ofrece abrir el Hub al terminar.
No crea acceso en el escritorio. «Aplicaciones instaladas» de Windows también
permite desinstalar. Se conserva la clave técnica `VantareNativeBeta`: cambiarla
rompería la sincronización de versión y rollback del bootstrap ya instalado.
El nombre visible en NSIS, Inicio, Windows y la ventana del Hub es **Vantare**.
Una instalación anterior conserva su `InstallLocation`, incluida la carpeta
`Vantare Native Beta`; moverla obligaría a migrar datos y referencias sin aportar
valor al usuario. Setup también adopta datos de esa ruta tras desinstalar.

La actualización desde el Hub antiguo funciona sin reemplazar su bootstrap:
el Hub nuevo ejecuta `Register` del `candidate.ps1` de su generación verificada
antes de publicar `hub-ready`. Esa operación cambia DisplayName, mantiene la
misma clave y raíz, crea los dos accesos nuevos y retira solo accesos antiguos
que apuntan a esa instalación. Puede repetirse sin duplicados. Un fallo impide
confirmar el arranque y deja actuar al rollback existente. El tag técnico,
asset, canal y firma del feed siguen iguales para clientes anteriores.

Inicio y Aplicaciones instaladas usan `uninstall-vantare.ps1`, copia durable
del script del paquete: llama a la desinstalación beta instalada, conserva los
datos y retira accesos, registro y bootstrap. Así también puede desinstalarse
una beta renombrada solo por feed, cuyo Uninstall.exe antiguo desconoce la nueva
carpeta. La copia permanece disponible si se interrumpe la desinstalación.
El nuevo Uninstall.exe NSIS también retira los accesos nuevos; la migración
ya retiró los antiguos propios y preservó cualquier acceso ajeno.
Wails usa «Vantare Simracing Suite», otra carpeta y sus propios accesos.
No se leen ni importan datos Wails durante la instalación.

La desinstalación exige cerrar todos los procesos de esta instalación, retira
los binarios y conserva `generations/<id>/data/`. No borra perfiles ni cuenta.
Ejecutar Setup encima actualiza a una versión más reciente o reinstala los
binarios de la misma versión, conservando perfiles, layout y cuenta. Usa la
misma activación por generaciones que el Hub: exige cerrar Vantare y restaura
la versión anterior si el Hub nuevo no confirma su ventana. Una versión inferior
se rechaza con un aviso; no baja de versión en silencio. Inicio y el registro
de desinstalación se actualizan, también si hay rollback.
Si se vuelve a ejecutar Setup antes de comprobar el arranque de una actualización
o reparación, devuelve código 4 y pide abrir y cerrar Vantare primero. No cambia
la generación ni el marcador pendiente: el arranque conserva su rollback.
Los códigos 2 (sesión/binarios abiertos), 3 (versión anterior) y 4 provienen de
errores tipados, sin depender del texto mostrado.

Después de desinstalar, Setup adopta automáticamente los datos de la generación
activa conservada en `retained-data.json`. Desinstaladores antiguos sin esa
referencia permiten recuperar una copia única (o copias idénticas); si quedan
copias distintas, se rechaza sin elegir datos arbitrariamente.

QA aislada: compilar NSIS con `/DTEST_INSTALLER` y ejecutar
`VantareSetup.exe /S /D=E:\tmp\1492\installed` (el argumento `/D` va al final).
Esta build exige ruta explícita y usa registro `VantareNativeBetaQA1492` y
accesos «Vantare QA1492», separados de la instalación de Isaac.
Solo este instalador escribe `registration-identity.txt` en la raíz y lo retira
al desinstalar; el bootstrap lee esa identidad validada para sincronizar el
registro tras confirmar o restaurar. Sin ese archivo usa `VantareNativeBeta`.
No distribuir esta build. `installer-tests.ps1` prueba los dos Setup construidos
sin abrir ventanas (primer Setup anterior, segundo nuevo); `beta-tests.ps1` requiere verificador y semilla de TEST
para probar el feed firmado, nunca la clave privada productiva.

El acceso de Inicio abre un host PowerShell de 64 bits oculto. NSIS usa
[Sysnative](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector)
para evitar la redirección WOW64; el acceso guardado apunta a System32 para Explorer x64.
El host abre el supervisor nativo `vantare` (instancia `native-beta`, núcleo live
y overlays) y el Hub conectado a él. Mantiene
un lock de sesión único, comprueba actualizaciones al abrir y cada 6 horas
mientras el Hub está abierto, y termina después del Hub. No hay tarea programada
ni updater residente durante la carrera. Al cerrar el Hub fuera de Live se
solicita el cierre protegido del supervisor beta; al entrar en Live se mantiene
el supervisor con overlays y la actualización espera a que terminen. Abrir un exe directamente es una ruta
diagnóstica; para recibir actualizaciones utiliza el acceso instalado.

## Actualización automática

El feed anónimo consulta las 100 Releases más recientes de
`isaacalbala12/Vantare-Simracing-Suite`, selecciona la mayor versión numérica
`native-beta-vMAJOR.MINOR.PATCH` con asset `vantare-native-beta.json`
(incluidas prereleases, excluidos drafts). El repositorio debe ser público.
La comprobación anónima dio HTTP 200 en el desarrollo local; no certifica una
release beta publicada. Rate limit, falta de red o manifiesto ausente se muestran
en Ajustes; no bloquean el uso de la versión instalada.

Contrato cerrado del manifiesto:

```json
{
  "schema": 1,
  "product": "vantare-native",
  "channel": "beta",
  "version": "0.1.1",
  "url": "https://github.com/isaacalbala12/Vantare-Simracing-Suite/releases/download/native-beta-v0.1.1/vantare-native-amd64-package.zip",
  "sha256": "<64 hex minúsculas>",
  "notes": "Cambios de la beta"
}
```

El nombre del asset, tag, URL, canal, esquema, versión y SHA se verifican.
El ZIP pasa además el inventario y hashes del candidato. Solo entonces queda
en `staging/` y el Hub muestra **«Actualización lista, se aplicará al reiniciar»**
y **«Reiniciar ahora»**. El botón utiliza el cierre protegido del Hub; no
interrumpe un proceso de carrera. Al cerrar se aplica `Update` de `candidate.ps1`,
que exige todos los escritores detenidos y copia datos a una generación nueva.
Si algún proceso sigue usando los binarios, queda pendiente para otro arranque.

El Hub confirma la creación de su ventana mediante `hub-ready`. Un marcador
durable `boot-pending.json` sobrevive a interrupciones del supervisor. Si el Hub
nuevo termina o no confirma en 45 s, se restaura la generación anterior con
`Rollback`; en timeout se cierra únicamente el Hub nuevo que creó el supervisor.
La confirmación prueba apertura, no login remoto, juego ni sesión prolongada.
Las generaciones se conservan; no hay purga automática ni migración de esquema.
El bootstrap schema 1 queda fijo durante Update; el registro visible se
sincroniza mediante el script verificado que ya viaja en cada generación.
Los demás cambios de bootstrap requieren reinstalación/revisión. SHA-256 prueba integridad sobre GitHub HTTPS;
el manifiesto del feed exige firma Ed25519; no se ofrece Authenticode.

Los datos beta viven en la generación (`data/`); el Hub y sus hijos heredan
`VANTARE_NATIVE_DATA_ROOT`. Layout, ajustes, servicios y derechos no se escriben
en la ubicación Wails. Ajustes → Actualizaciones y los diagnósticos muestran
versión de producto embebida; cada exe admite `--version` y muestra el canal.
PostHog (cola, privacidad e identificador anónimo) y `freshness.log` usan
`data/Vantare/native/`; los borradores protegidos se guardan bajo
`data/Vantare/native/services/<namespace>/` por el auxiliar del supervisor.
Todos permanecen en la misma generación aislada. El Testing Center usa la
membership RPC `testers` para una build `beta`, sin cambiar el esquema remoto.
Su contexto visible añade el identificador anónimo y el canal de distribución;
la preview y el reintento conservan el mismo payload. El límite de contexto de
4096 bytes incluye estos metadatos: si se supera, el borrador se conserva y el
envío se rechaza, sin recortar el texto.

## Preparar publicación (sin publicar)

Desde `vantare-v2`, en el SHA integrado y limpio:

```powershell
powershell -NoProfile -File native/packaging/publish-beta.ps1 `
  -Version 0.1.0 -OutputDirectory C:/tmp/isa-1432-beta-build `
  -SigningKeyFile <ruta-privada-elegida-por-Isaac> `
  -ConfigFile C:/tmp/beta/build-config/beta-dev-clerk.env `
  -Notes 'Notas revisadas por el orquestador'
```

Compila Release offline/locked con `-j 2`, verifica inventario Cargo y genera
paquete, portable, `VantareSetup.exe`, sidecars y `vantare-native-beta.json`.
Fija `VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL=beta` para todos los binarios,
restaurando el entorno al terminar. No compila Wails ni altera sus workflows.
Imprime un comando `gh release create --prerelease`; **no lo ejecuta**.
El orquestador revisa y publica el tag y los assets exactos. No usar `latest/download`
porque la beta es prerelease. `-BuildProfile Debug -AllowDirty` sirve para QA local;
no equivale a una candidata Release del SHA integrado.

### Variables públicas finales de build

`-ConfigFile` carga líneas literales `NOMBRE=valor` (comillas opcionales), sin
expansión de PowerShell ni impresión de valores. Rechaza nombres desconocidos,
duplicados, valores vacíos y claves privilegiadas; restaura el entorno al acabar.
La configuración queda fuera del repositorio y del paquete. Lista cerrada:

| Variable | Uso |
| --- | --- |
| `VANTARE_SUPABASE_URL` | Origen HTTPS del proyecto Supabase. |
| `VANTARE_SUPABASE_ANON_KEY` | Clave pública anon/publishable; nunca service role. |
| `VANTARE_LICENSE_PUBLIC_KEYS` | Claves públicas de verificación de licencia y sus kid. |
| `VANTARE_CLERK_ISSUER` | Issuer OAuth Clerk. |
| `VANTARE_CLERK_CLIENT_ID` | Client ID público nativo. |
| `VANTARE_CLERK_REDIRECT` | Callback loopback registrado. |
| `VANTARE_CLERK_ACCOUNT_PORTAL_URL` | Origen HTTPS del Account Portal; obligatorio para alta/reset con dominio propio. Desarrollo conserva su derivación si falta. |
| `VANTARE_ACCOUNT_BRIDGE_URL` | Endpoint exacto `native-account-authorize`. |
| `VANTARE_POSTHOG_KEY` | Clave pública PostHog UE; ausencia desactiva diagnóstico. |
| `VANTARE_ADMIN_URL` | Endpoint owner, solo para la compilación separada de admin. |

`VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL` los fija el builder desde `-Version`
y el canal `beta`; no se aceptan en el fichero. `packaging/version.rs` es la
fuente de identidad que usan binarios, PostHog y Testing Center. Las claves
privadas de licencia y los secretos Clerk/Supabase viven solo en servidor.

Para la instancia productiva, seguir el [runbook de Clerk](../../docs/billing/clerk-production-runbook.md).

La miniapp `vantare-admin` se excluye de la compilación pública y del inventario
del paquete; `beta.ps1` solo arranca supervisor y Hub. Se compila aparte según
[`admin/README.md`](../admin/README.md), nunca se añade al instalador público.

## Prueba local

Construye dos salidas con versiones 0.1.0 y 0.1.1 mediante el script anterior.
Luego, desde `vantare-v2`:

```powershell
powershell -NoProfile -File native/packaging/beta-tests.ps1 `
  -Version010Directory C:/tmp/isa-1454-evidence/build-0.1.0 `
  -Version011Directory C:/tmp/isa-1454-evidence/build-0.1.1 `
  -EvidenceDirectory C:/tmp/isa-1454-evidence/roundtrip `
  -TestVerifier <exe-aislado-con-clave-publica-de-TEST> `
  -SigningKeyFile <semilla-de-TEST>
```

Prueba comparación de versiones, contrato inválido, SHA erróneo, staging,
Update real con conservación de datos, versiones de los once exe, fallo de
arranque real y rollback reversible, y desinstalación preservando datos.
Verifica también el bootstrap instalado y el hash en un proceso PowerShell 5.1
sin `Get-FileHash`/autoload: el SHA se calcula en streaming mediante .NET.
El harness heredado se ejecuta con `tests.ps1 -Channel beta -ArtifactsDirectory <salida> -EvidenceDirectory C:/tmp/isa-1454-evidence/phase7`, incluyendo corrupción e interrupción real en tres fronteras.
El manifiesto local usa URI `file:` únicamente con `-LocalManifest`; el feed
productivo rechaza esa URL. Para abrir una instalación local y comprobar el
aviso/botón con la misma cadena automática:

```powershell
powershell -NoProfile -File native/packaging/beta.ps1 -Operation Run `
  -Root C:/tmp/isa-1454-evidence/installed `
  -LocalManifest C:/tmp/isa-1454-evidence/roundtrip/local-manifest.json
```

Evidencia fuera del repo. QA final debe repetirse sobre la integración B1–B4,
Release, Windows limpio y otra GPU. MSVC/ICU siguen siendo límites de la fase 7:
que el paquete cargue en este PC no certifica redistribución ni equipo limpio.

---

# Candidato offline — fase 7 (ISA-1432)

Windows x64, PowerShell 5.1/.NET y volumen local con reemplazo atómico (NTFS).
No requiere Python, NSIS, crates nuevas ni permisos de administrador.
**Candidato técnico sin firma; Wails sigue siendo el producto distribuido.**

Desde la raíz `vantare-v2`, con checkout limpio y dependencias Cargo cacheadas:

```powershell
& native/packaging/candidate.ps1 -Operation Build -Version 0.0.0-local `
  -Channel nightly -BuildProfile Debug -OutputDirectory C:/tmp/isa-1454-evidence/phase7-build
```

Compila todos los binarios del workspace (once en esta base), offline/locked con `-j 2`.
`Release` es el perfil por defecto; `Debug` verifica packaging sin representar
rendimiento de producto. Beta empaqueta diez: excluye `vantare-workshop.exe` y su
sidecar, pero sigue compilándolo para desarrollo y capturas de paridad en el repo.
Los demás canales conservan Workshop. El inventario se verifica según el canal
guardado en el manifiesto/estado, también al actualizar, importar o consultar Status.
Para probar antes del commit, `-AllowDirty` registra `source_dirty=true`.
El SHA de Git y los hashes de todos los archivos identifican lo construido;
los binarios embeben `VANTARE_VERSION` y `VANTARE_BUILD_CHANNEL`, que el builder fija y restaura. Todos responden a `--version`.

La salida conserva `payload`, `portable-tree`, el paquete, portable e instalador
script con sus SHA-256. El manifiesto enumera exactamente los exe del canal y sus sidecars SHA-256, el
script, README, licencia Inter y catálogo Cargo con versiones/licencias/source.
Este catálogo **no es un SBOM ni una auditoría de distribución**. No publica
releases ni ejecuta los workflows Wails.

Instalación por usuario en una carpeta vacía elegida expresamente (puede ser
una carpeta de prueba; no escribe registro, servicios, asociaciones o AppData):

```powershell
$package = 'C:/tmp/isa-1454-evidence/phase7-build/vantare-native-amd64-package.zip'
$sha = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
& native/packaging/candidate.ps1 -Operation Install -Root C:/tmp/isa-1454-evidence/phase7-install `
  -Archive $package -ExpectedSha256 $sha -Channel nightly
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Status -Root C:/tmp/isa-1454-evidence/phase7-install
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
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Start -Root C:/tmp/isa-1454-evidence/phase7-install `
  -ApplicationArgs @('--', '--replay', (Resolve-Path testdata/lmu-fixture.bin).Path, '--build', '1.3.0.0', '--', '4')
```

Start conserva el lock solo hasta crear el proceso launcher en consola oculta
y devuelve su PID. PowerShell termina; el launcher nativo es el propietario de
sus hijos. Cierre normal de overlays / `vantare --parar` usan el ciclo de vida
existente. Si existe `data/layout.json` en la generación activa y no se proporciona un
grupo explícito de argumentos de overlays, Start pasa su ruta mediante
`--layout`. Un grupo explícito (p. ej. `4`) mantiene la selección indicada.

Actualización y rollback, con todos los procesos de esta instalación cerrados:

```powershell
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Update -Root C:/tmp/isa-1454-evidence/phase7-install `
  -Archive 'C:/ruta/local/vantare-native-amd64-package.zip' -ExpectedSha256 '<64 hex minúsculas confiables>'
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Rollback -Root C:/tmp/isa-1454-evidence/phase7-install
```

Update exige el mismo canal/esquema y un paquete íntegro. Copia datos a una
generación nueva, verifica que el origen no cambió y solo entonces reemplaza
`state.json` atómicamente. No sobrescribe exe en uso. Un lock excluye las
operaciones y el arranque; handles exclusivos de los exe rechazan procesos
abiertos directamente durante actualización/rollback. No se mata la app.
Rollback selecciona a la vez binarios y datos anteriores. Las escrituras hechas
en la generación nueva permanecen allí; **no se mezclan en la anterior**.
Otro Rollback permite volver a la generación retirada. No borra ninguna.

Interrupción antes del reemplazo: sigue activa la anterior. Después: la nueva
está completa y tiene anterior para rollback. Las pruebas matan procesos reales
en tres fronteras mediante eventos, sin sleeps. Esto cubre interrupción de
proceso, **no** corte eléctrico, fallo físico de disco o DB con propietario
externo. Copiar archivos requiere todos sus escritores detenidos; fases 4/5
deben adoptar el contrato antes de usarlo con sus almacenes.
El bootstrap `candidate.ps1` instalado no se reemplaza en Update (schema=1).
Una evolución del instalador requiere reinstalación aislada/revisión explícita;
no ejecutar un script nuevo automáticamente desde un ZIP.

Importación explícita de Studio V4 (un solo perfil y monitor elegido):

```powershell
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation ImportLayout -Root C:/tmp/isa-1454-evidence/phase7-install `
  -ProfileFiles @((Resolve-Path native/packaging/fixtures/studio-v4.json).Path) `
  -MonitorBounds @(-2560, 100, 2560, 1440)
& C:/tmp/isa-1454-evidence/phase7-install/candidate.ps1 -Operation Rollback -Root C:/tmp/isa-1454-evidence/phase7-install
```

Bounds son x/y globales y ancho/alto del monitor en las coordenadas usadas por
GPUI. Se eligen explícitamente; no se deduce el monitor actual a partir del
índice antiguo. Véase IMPORTACION-V4.md del repositorio para conversión,
Settings y límites. El informe queda en
`data/legacy-profiles/<generación>/native/report.json`, el origen copiado con
SHA en el mismo archivo y el layout activo en `data/layout.json`. La generación
anterior conserva exactamente el layout previo; Rollback revierte binarios y
datos juntos, sin borrar el original ni la generación importada.

`ImportProfiles` conserva su comportamiento anterior: archivo opaco explícito,
sin conversión ni activación. Para V2/V3 usar primero la migración del producto
Wails a V4; el CLI nativo rechaza versiones anteriores.

La [matriz de servicios](PARIDAD-SERVICIOS.md) identifica qué existe en esta
base y qué falta, incluido Testing Center. La fase completa no está aceptada.

No se aceptan ZIP parciales, hashes erróneos, otro esquema, paths arbitrarios,
enlaces ni árboles con `.env*`. Las preparaciones incompletas se conservan para
inspección y nunca se activan. No hay borrado automático de datos/generaciones.

Antes de cada commit, desde `native/`:

```powershell
$env:CARGO_NET_OFFLINE = 'true'
$env:CARGO_BUILD_JOBS = '2'
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo nextest run --workspace -j 2
cargo test --workspace --test lifecycle -j 2
```

Faltan firma/SmartScreen, notices completos de terceros, redistribuible MSVC
si fuera necesario, equipo Windows limpio/otra GPU, sesión prolongada LMU+OBS,
paridad completa de servicios y contratos de persistencia de fases 3/4/5.
Ver el microplan: la fase 7 completa sigue abierta aunque el mecanismo local pase.

Prueba local del mecanismo (con binarios reales de la salida indicada):

```powershell
powershell -NoProfile -File native/packaging/tests.ps1 `
  -ArtifactsDirectory C:/tmp/isa-1454-evidence/phase7-build
```

Las pruebas conservan sus carpetas fuera del repo (por defecto `%TEMP%/vantare-native-packaging-evidence/`; `-EvidenceDirectory` permite elegir otra ruta) y no
necesitan Pester. El smoke solo verifica carga del exe y rechazo de argumentos,
sin abrir juego, ventana GPUI ni red. La inspección PE local de Core/Overlays
detecta `VCRUNTIME140.dll`; Overlays también importa `icuuc.dll`, DX11 y
`d3dcompiler_47.dll`. Que carguen en este PC no prueba Windows 10 limpio.

## Firma del manifiesto (#1472)

La clave PÚBLICA Ed25519 está en `PUBLIC_KEY_BASE64`
(`native/services/src/update_manifest.rs`). La semilla privada (32 bytes
binarios) se generó el 2026-10-07 y la custodia Isaac en un USB, carpeta
`vantare-claves\actualizador-ed25519.seed` (letra de unidad variable).
Para firmar: conectar el USB y pasar
`-SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed`.
**No copiar la semilla al disco, logs ni repo.** Retirar el USB al terminar;
Isaac conserva una copia de seguridad offline bajo su custodia. Si se pierde, ninguna
instalación podrá recibir actualizaciones firmadas y habrá que reinstalar con
una clave nueva. No hay clave de test, clave obtenida del feed ni parámetro
para reemplazar la clave del verificador. Instalaciones con el bootstrap
antiguo sin firma necesitan reinstalación.

El JSON anterior es el contenido firmado, no el asset publicado. El asset
`vantare-native-beta.json` tiene exactamente `payload` (bytes UTF-8 del JSON
en base64) y `signature` (firma Ed25519 de esos bytes en base64). Reescribir el
JSON dentro del payload invalida la firma. El verificador es `vantare-services`
de la generación instalada, verificada por los hashes del inventario.
Se comprueba la firma antes del staging y otra vez al aplicar; pending.json
conserva el sobre firmado. `-LocalManifest` también exige firma.

Isaac custodia su semilla privada de 32 bytes binarios fuera del repo. Esta
implementación no genera ninguna clave privada real ni la imprime. Pasar
`-SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed` a `publish-beta.ps1`; el archivo se lee
solo en el proceso firmador, con buffers zeroize. No ponerlo en logs ni Git.
Para firmar por separado un JSON revisado:

```powershell
pwsh -File native/packaging/sign-beta-manifest.ps1 -Manifest <json-revisado> -Output <asset-firmado> -ServicesExecutable <vantare-services.exe> -SigningKeyFile <USB>\vantare-claves\actualizador-ed25519.seed
```

El script también acepta la ruta desde `VANTARE_UPDATE_SIGNING_KEY_FILE`.
No es una variable con el valor secreto. Solo escribe el sobre firmado y lo
verifica con la clave pública embebida antes de guardarlo. Firma de manifiesto
y SHA-256 autenticado del ZIP no sustituyen Authenticode/SmartScreen.
Las pruebas Rust generan sus claves de test en memoria y comprueban ausencia
de firma, cambio de contenido, clave ajena y campos desconocidos.
El smoke beta genera paquetes aislados con un verificador de TEST y sobres
firmados con su semilla de TEST. No sustituye la comprobación remota con los
binarios y la clave pública productivos ni requiere el USB de Isaac.

### Prueba del feed remoto firmado (#1472 R2)

Regresión local (sin red): `remote-feed-tests.ps1 -TestVerifier <exe aislado con
clave pública de TEST> -SigningKeyFile <semilla de TEST>`. El feed simulado
incluye versiones inválidas `99999.0.0` y `65535.0.0`, un asset ajeno y una
versión menor firmada. Comprueba selección descendente y contenido string,
UTF-8 bytes y UTF-16 con BOM; no modifica la clave productiva.

Prueba real pendiente, **solo cuando Isaac autorice una prerelease**: construir
instalador inicial y actualización con la clave pública productiva fijada;
Isaac firma fuera del repo. Publicar la prerelease autorizada y su manifiesto,
instalar la anterior en una cuenta de prueba, ejecutar Check sin LocalManifest,
verificar versión/notas, reiniciar y confirmar Apply/arranque y datos conservados.
Guardar tags, hashes, log y capturas; desinstalar esa instalación de prueba.
No publicar una versión inválida para simular el ataque en el feed real.
