# Instalador nativo y paquete beta

El Setup y Uninstall de `native/installer` y el lanzador `Vantare.exe` son el único motor instalado. El paquete contiene binarios Rust de motor 2, Electron en `hub-ui/`, recursos y `manifest.json`; `candidate.ps1`, `beta.ps1` y NSIS ya no se distribuyen. `installer-cleanup.ps1` sigue siendo la excepción mínima y permanente para borrar el desinstalador después de que salga su proceso.

## Contrato de instalación

- `VantareSetup.exe` verifica el ZIP, el manifiesto y los hashes antes de escribir. Cada generación vive en `generations/<id>`; `state.json` liga activa y anterior a sus manifiestos por SHA-256. `data/` se conserva en actualización, rollback y desinstalación salvo elección expresa del usuario.
- La raíz contiene `Vantare.exe`, que se renueva al instalar, reparar y actualizar si difiere de la generación activa. El lanzador crea una sesión Rust para la generación activa. El Hub confirma una actualización pendiente mediante un token aleatorio de ese arranque. Un fallo de arranque restaura la generación anterior de motor 2 y ofrece Reparar. No se vuelve automáticamente a motor 1.
- Feed, Check, Apply, Confirm, rollback, Register y SetStartup son Rust. `shell::sync` proyecta registro y accesos de Windows; los valores o accesos ajenos se conservan. La preferencia de inicio de instalaciones anteriores se migra una vez.
- Uninstall retira solo los miembros de manifiestos ligados por SHA. De una generación que `state.json` ya no nombra se retiran, al confirmar un arranque y al desinstalar, los archivos que coinciden con su propio manifiesto; su `data/` y lo que no coincide se conservan (#2740, detalle en `installer/README.md`).
- El indicador de arranque se retiró tras medir cinco aperturas del Hub release bajo QA: mediana 343 ms desde proceso hasta ventana visible.

## Construir y publicar

`build-candidate.ps1` es herramienta del repositorio, no parte de la instalación. Construye los binarios mediante `native/scripts/compilar.ps1` con CRT estático, verifica sus versiones y dependencias, genera el manifiesto y los ZIP de paquete y portable. `build-installer.ps1` empaqueta Setup/Uninstall; `sign-beta-manifest.ps1` y `publish-beta.ps1` preparan el feed. Esas herramientas no publican una release por sí solas y exigen un checkout limpio salvo `-AllowDirty` explícito.

El inventario público cerrado está en `public-inventory.json`: una lista de EXE y los recursos aprobados, sin `ui/fixtures/layouts/` ni `telemetry-real/`. Cada artefacto publicable, incluido Setup, exige su `.sha256`. `build-tooling-tests.ps1 -QaRoot <raíz QA>` verifica la entrada UTF-8, el inventario, los sidecars y el manifiesto; con `-Verifier <matrix-verifier.exe>` comprueba además la firma de ida y vuelta con acentos. Tras una actualización confirmada no hay rollback manual: una versión nueva requiere otro paquete firmado.

`Test-BuildPackage` invoca el ejemplo `verify-package`, que llama al mismo
extractor Rust autenticado que Setup. El build solo calcula el SHA del ZIP y
comprueba su inventario público; los límites, rutas y hashes internos se validan
en Rust. `New-BuildZip` no emite entradas de directorio.
El archivo vacío `data/.vantare-directory` es parte del contrato del ZIP
portable: conserva la carpeta `data/` al extraerlo sin entradas de directorio.
Se conserva como dato opaco en futuras actualizaciones.

El gate de distribución de #1917 se aplica a `build-candidate.ps1`: rechaza las features QA del grafo resuelto y rastrea marcadores QA en los EXE antes de copiarlos y en el árbol final. `build-installer.ps1` comprueba también los EXE del ZIP y de Setup/Uninstall. `native/scripts/check-qa-distribution.ps1` prueba el rechazo positivo y un paquete release en la CI.

Antes de **publicar** cualquier release con motor 2 sin LegacyRunner, Isaac debe probar el Setup con los bytes distribuidos sobre raíces 0.0.975 y 0.0.988 reales en una VM o cuenta aislada y registrar la evidencia en [#1840](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1840). La prueba es condición de publicación, no de programación ni de apertura del PR.

## QA

La [matriz](matrix/README.md) ejecuta las 88 combinaciones de ocho raíces y once operaciones, conserva los 45 rechazos por motivo, prueba la cadena real lanzador → sesión → Hub y verifica que los datos no cambian. Todo producto de prueba usa raíces bajo `D:/VantareServer/qa` o `RUNNER_TEMP` en CI, HKCU y carpetas inyectadas. Nunca se ejecutan Setup, Uninstall, beta.ps1 ni candidate.ps1 contra una instalación real.

Compilar únicamente con `pwsh -NoProfile -File native/scripts/compilar.ps1`, target propio y la cola del repositorio. El workflow `branch-channel-gates.yml` construye los fixtures y ejecuta el guard antes de la matriz. La evidencia histórica de los pasos 3–5b permanece en `matrix/evidence-1840-*.md`; el contrato de arquitectura está en [ADR 0103](../../docs/adr/0103-instalacion-nativa.md) y [installer-design](../../docs/vantare-program/installer-design.md).

### Alta de huellas públicas antes del RC

Isaac debe añadir la huella de producción a `production-license-keys.sha256`
antes del próximo RC. La lista vacía permanece fail-closed. Para obtener sólo
el SHA-256 de los bytes públicos, suministrar por stdin la pública base64url
o su pareja `kid:base64url`, nunca una privada ni un fichero de configuración:

```powershell
Get-Content -LiteralPath 'C:/ruta/public-license-key.txt' -Raw | pwsh -NoProfile -File native/packaging/license-key-fingerprint.ps1
```

El script sólo imprime la(s) huella(s); no consulta entorno/configuración ni
añade nada a la lista. La incorporación se revisa por separado.

El gate autocontenido `Assert-NativeDistributionLicensePackage` de `no-qa.ps1`
valida las huellas del registro configurado, exige el registro literal en núcleo
y services, y rechaza claves conocidas de test y marcadores QA en todos los EXE.
`build-candidate.ps1` lo invoca antes de generar los ZIP. `build-installer.ps1`
repite el gate sobre los EXE del ZIP antes de embeberlo; recibe el mismo
`-ConfigFile` público que el candidato (`publish-beta.ps1` lo propaga).
Sin registro sólo se permite el smoke sin autoridad; cualquier registro
configurado exige una lista válida y no vacía. No se leen claves privadas.


### Autoridad de licencias obligatoria para beta

`publish-beta.ps1`, `build-candidate.ps1 -Channel beta` y
`build-installer.ps1 -Channel beta` exigen `-ConfigFile` explícito y
un `VANTARE_LICENSE_PUBLIC_KEYS` no vacío dentro de ese archivo público.
El entorno heredado no sustituye el archivo. La allowlist debe aprobar todas
las claves; antes del RC Isaac debe incorporar las huellas de producción.
Para un smoke local sin autoridad se admite `-Channel nightly`, también en
build-installer; el canal del manifiesto debe coincidir. No se publica una beta
con ese paquete. El scanner bloquea las claves conocidas de test como bytes,
base64url, base64 estándar (con/sin padding) y hex sin distinguir mayúsculas/minúsculas.

### Candidato Hub Electron (P3 / VANTA-138)

Requiere Bun 1.4.4 y `bun install --frozen-lockfile` en `hub-web/`.
`build-candidate.ps1` construye y sella Electron normal con la misma versión y
procedencia del anfitrión. Compila `vantare-hub-host` aparte y lo instala como
`bin/vantare-hub.exe`; el Hub GPUI queda excluido del candidato, sin retirar
su crate. Los overlays GPUI existentes se conservan hasta su relevo autorizado.

La generación lleva `hub-ui/` completa, con licencias Electron/Chromium,
sidecars de todos sus EXE y textos de licencia npm en `licenses/hub-web-notices.txt`.
El recibo de P1 cierra los nombres, tamaños y hashes antes de crear el manifiesto.
El gate QA inspecciona también los bytes de ASAR y recursos web. No se ejecuta
Electron para empaquetar o verificar. Rust/Setup copian sus artefactos dentro de
la reserva del target compartido; no crean targets por salida o por rama.

La lista `executables` es extensible: un EXE declarado y su sidecar bastan para
validarlo, sin cambiar la lógica del manifiesto. `external_bins` solo admite
`vantare-overlays-rune.exe`, presente también en `executables`: queda fuera de
la comparación con los bins del workspace principal, pero exige su EXE y hash.
El candidato lo incluye junto al anfitrión; sin interruptor el launcher usa GPUI.

Rune usa su workspace y lock propios. Antes del único `cargo fetch --locked`
con red, el parser TOML (`rune-lock.py`, Python >=3.11) exige crates.io o el fork
Rune fijado a `d5338988a7c1b3377adb60853815b6d0843dae7c`. Se comprueba el hash del
lock antes/después; el build posterior vuelve a `--offline --locked`, con el
mismo perfil, CRT estático y target reservado por la cola. Se validan features,
bytes no QA, imports CRT y `--version` compartido antes de copiar EXE y sidecar.
La prueba CPU de `--version` termina antes de inicializar Rune; con
`VANTARE_SIN_GRAFICOS=1` el guard conserva prioridad y devuelve 6.
Solo la fase Rune usa `CARGO_HOME=D:/VantareServer/cargo-home-rune`: se crea
vacío y se reutiliza su caché, rechazando `config`/`config.toml` y el home del
host. El entorno se restaura también al fallar. Tras el fetch se rechaza cualquier
`.gitmodules` dentro de `git/checkouts`; no se permiten submódulos del fork.

Cada candidato Release llama a `rune-release-version-tests.ps1` antes de copiar
Rune: exige PE Windows GUI x64 y compara stdout por tubería con la versión exacta
(incluido el salto de línea), sin depender de una consola. Para repetirlo sobre
un candidato real ya construido, sin compilar ni cambiar el guard gráfico:

```powershell
& native/packaging/rune-release-version-tests.ps1 -Executable D:/ruta/payload/bin/vantare-overlays-rune.exe -Version 0.0.0 -Channel nightly
```

La primera ejecución real de esta comprobación se registra en el PR del
seguimiento M4; los tests de fixtures y del lock no sustituyen esa evidencia.
### Topes del paquete y clientes que los aplican (#2863)

Los topes de `expand` (`installer/src/engine/package.rs`), que aplican Setup y
`stage` del feed `hub-beta`, son ZIP <=256 MiB, miembro <=384 MiB y total
<=768 MiB. Se comprueban con los tamaños declarados del directorio central, que
deben coincidir con el `size` del manifiesto firmado, antes de escribir nada; la
extracción corta además cada miembro en su tamaño declarado. El miembro subió de
256 a 384 MiB en #2863 porque el EXE de Electron ya pesa 238 MiB.

`check-qa-distribution.ps1` mide el candidato Release real con
`verify-package --capacity`, que imprime los topes compilados: escribe una línea
`[capacidad]` con las tres medidas y su porcentaje, avisa (`::warning::`) al 90 %
de cada tope y falla por encima o si falta el paquete o el verificador.
`verify-build-package.ps1` aplica el mismo gate en candidato y publicación.
Medida de la CI del 27-nov: ZIP 184,1 MiB (72 %), expandido 432,7 MiB (56 %),
miembro más grande 238,3 MiB (62 %).

Quién aplica qué tope:

1. Los clientes beta publicados (GPUI 0.0.975 y 0.0.988, motor 1) **no tienen
   `stage`**. Actualizan por el feed antiguo `native-beta-v<versión>` con
   PowerShell (`beta.ps1` + `candidate.ps1`), cuyos topes son ZIP <=128 MiB,
   miembro <=256 MiB y total <=512 MiB (`candidate.ps1`, líneas 227 y 241 del
   tag `native-beta-v0.0.975`). No pueden recibir Electron por el feed
   `hub-beta`, que no leen; migran con **Setup nuevo** (ADR 0103, con el acta de
   Isaac sobre raíces 0.0.975 y 0.0.988 reales).
2. El tope de 384 MiB por miembro solo aplica a clientes que **ya tienen
   `stage`**, es decir, instalados con el Setup nuevo.
3. Orden de publicación: primero el Setup nuevo para migrar a esos clientes;
   después, los paquetes Electron por `hub-beta`. Si algún día se quisiera
   publicar Electron **también** en `native-beta`, el paquete tendría que caber
   en 128/256/512 MiB (hoy no cabe: ZIP 184 > 128) y habría que decidirlo
   expresamente.

Este candidato no autoriza publicación. El feed nuevo queda fuera de P3: usará
`hub-beta-v<versión>` / `vantare-hub-beta.json`, nunca el publicador heredado
`publish-beta.ps1` ni su etiqueta/manifiesto `native-beta`. El esquema firmado
con tamaños y el rechazo antes de descargar siguen pendientes de su paso aprobado.

### Feed Hub firmado (schema2)

`publish-hub-beta.ps1` prepara, sin publicar, `hub-beta-v<versión>` y
`vantare-hub-beta.json`. El sobre Ed25519 conserva la autoridad de producción;
el payload cerrado usa product `vantare-hub`, channel `beta`, version/url/sha256,
notes y compressed_bytes/expanded_bytes medidos del ZIP (máximos256/768MiB).
El cliente nuevo verifica firma y límites antes del GET, longitud/SHA al descargar
y total expandido tras verificar la extracción. Rechaza versiones <= instalada.
El manifiesto interno de instalación mantiene schema1/product `vantare-native`.
`update_feed.rs` queda intacto; el nuevo módulo no selecciona native-beta.
Decisión de raíz: nightly solo genera Hub; sus builds ya no consultan `native-beta-v…`.
La última generación antigua se compila desde master o testers; retirada futura: [#2533](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2533).
El publicador heredado rechaza ZIP>128MiB antes de firmar o crear Setup.
`hub-update-qa` habilita exclusivamente la autoridad TEST ya usada por la matriz;
no es un override runtime ni cambia el verificador antiguo. La distribución
prohíbe esa feature y su marcador. Tests normales rechazan firmas QA; el gate
QA aislado prueba aceptación y cero peticiones ZIP al exceder los límites.
Desde #2771 la feature implica `installer-qa`: ese `vantare.exe` solo arranca
`--root` o `--session` con el contexto Windows aislado inyectado, y `stage` y
`apply` solo operan bajo el guard QA. Activar solo `vantare-services/hub-update-qa`
no compila: el binario `vantare` exige que coincida con su propia feature.
El marcador y la clave TEST viven en estáticos `#[used]`. El lenguaje no promete
que el enlazador los conserve enteros en el EXE final, así que no se da por
supuesto: `hub-update-qa-exe-tests.ps1` comprueba en el EXE real (Debug en
instalación, Release en distribución) que esos bytes están seguidos, que el gate
lo rechaza y que el candidato limpio no los lleva.

Transporte QA (#2771, PR B). Solo con `hub-update-qa`, `stage()` consulta el
feed en `http://127.0.0.1:<puerto>` en lugar de GitHub. Traduce únicamente la
lista de releases y las dos descargas `hub-beta-v<versión>` de nombre fijo. El
puerto sale del archivo `qa-feed-port` de la raíz, leído después del guard QA.
No hay redirecciones ni proxy, y la oferta guardada conserva la URL firmada.
**Riesgo aceptado:** la clave TEST es pública (semilla `[42; 32]`). Cualquier
proceso del mismo equipo que ocupe ese puerto, o que escriba `qa-feed-port` en
la raíz, puede servir paquetes que esta build acepta. Por eso solo opera en el
contexto aislado que exigen los guards (sesión, `stage`, `apply` y el propio
archivo de puerto, bajo `D:/VantareServer/qa` o el temporal del runner), y la
distribución nunca la contiene. Como mucho elige otro puerto de `127.0.0.1`:
no cambia el host ni la ruta.
