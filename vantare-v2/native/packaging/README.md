# Instalador nativo y paquete beta

El Setup y Uninstall de `native/installer` y el lanzador `Vantare.exe` son el único motor instalado. El paquete contiene binarios Rust de motor 2, recursos y `manifest.json`; `candidate.ps1`, `beta.ps1` y NSIS ya no se distribuyen. `installer-cleanup.ps1` sigue siendo la excepción mínima y permanente para borrar el desinstalador después de que salga su proceso.

## Contrato de instalación

- `VantareSetup.exe` verifica el ZIP, el manifiesto y los hashes antes de escribir. Cada generación vive en `generations/<id>`; `state.json` liga activa y anterior a sus manifiestos por SHA-256. `data/` se conserva en actualización, rollback y desinstalación salvo elección expresa del usuario.
- La raíz contiene `Vantare.exe`, que se renueva al instalar, reparar y actualizar si difiere de la generación activa. El lanzador crea una sesión Rust para la generación activa. El Hub confirma una actualización pendiente mediante un token aleatorio de ese arranque. Un fallo de arranque restaura la generación anterior de motor 2 y ofrece Reparar. No se vuelve automáticamente a motor 1.
- Feed, Check, Apply, Confirm, rollback, Register y SetStartup son Rust. `shell::sync` proyecta registro y accesos de Windows; los valores o accesos ajenos se conservan. La preferencia de inicio de instalaciones anteriores se migra una vez.
- Uninstall retira solo los miembros de manifiestos ligados por SHA. Una generación huérfana se conserva y se diagnostica; su retención sigue aplazada hasta ligar su SHA al estado.
- El indicador de arranque se retiró tras medir cinco aperturas del Hub release bajo QA: mediana 343 ms desde proceso hasta ventana visible.

## Construir y publicar

`build-candidate.ps1` es herramienta del repositorio, no parte de la instalación. Construye los binarios mediante `native/scripts/compilar.ps1` con CRT estático, verifica sus versiones y dependencias, genera el manifiesto y los ZIP de paquete y portable. `build-installer.ps1` empaqueta Setup/Uninstall; `sign-beta-manifest.ps1` y `publish-beta.ps1` preparan el feed. Esas herramientas no publican una release por sí solas y exigen un checkout limpio salvo `-AllowDirty` explícito.

El inventario público cerrado está en `public-inventory.json`: diez EXE y 97 recursos aprobados, sin `ui/fixtures/layouts/` ni `telemetry-real/`. Cada artefacto publicable, incluido Setup, exige su `.sha256`. `build-tooling-tests.ps1 -QaRoot <raíz QA>` verifica la entrada UTF-8, el inventario, los sidecars y el manifiesto; con `-Verifier <matrix-verifier.exe>` comprueba además la firma de ida y vuelta con acentos. Tras una actualización confirmada no hay rollback manual: una versión nueva requiere otro paquete firmado.

`Test-BuildPackage` invoca el ejemplo `verify-package`, que llama al mismo
extractor Rust autenticado que Setup. El build solo calcula el SHA del ZIP y
comprueba su inventario público; los límites, rutas y hashes internos se validan
en Rust. `New-BuildZip` no emite entradas de directorio.
El archivo vacío `data/.vantare-directory` es parte del contrato del ZIP
portable: conserva la carpeta `data/` al extraerlo sin entradas de directorio.
Se conserva como dato opaco en futuras actualizaciones.

El gate de distribución de #1917 se aplica a `build-candidate.ps1`: rechaza las features QA del grafo resuelto y rastrea marcadores QA en los EXE antes de copiarlos y en el árbol final. `build-installer.ps1` comprueba también los EXE del ZIP y de Setup/Uninstall. `native/scripts/check-qa-distribution.ps1` prueba el rechazo positivo y un paquete release bajo un target aislado en la CI.

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
`build-installer.ps1` (canal beta por defecto) exigen `-ConfigFile` explícito y
un `VANTARE_LICENSE_PUBLIC_KEYS` no vacío dentro de ese archivo público.
El entorno heredado no sustituye el archivo. La allowlist debe aprobar todas
las claves; antes del RC Isaac debe incorporar las huellas de producción.
Para un smoke local sin autoridad se admite `-Channel nightly`, también en
build-installer; el canal del manifiesto debe coincidir. No se publica una beta
con ese paquete. El scanner bloquea las claves conocidas de test como bytes,
base64url, base64 estándar (con/sin padding) y hex sin distinguir mayúsculas/minúsculas.
