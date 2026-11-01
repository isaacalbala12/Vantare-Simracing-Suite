# #1840 / VANTA-127 · paso 3, lectura Rust

Estado: en curso, gates finales sobre nightly actualizado. Base inicial
`5cc23113afae7cfa44429f225f0aeb5f770c061c`; rebase sin conflictos sobre
`668d99c32`, que incluye el paso 2 integrado por el orquestador en
[PR #1857](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1857). Rama
`vantareapp/isa-1840-paso3-engine-lectura`; target exclusivo
`D:/VantareServer/targets/isa-1840-p3`.

## Alcance y decisiones

El orquestador autoriza centralizar solo lecturas Rust de Setup/Hub, conservar
perfiles y dejar adaptadores PS hasta pasos 4–7. No hay puente ni ejecutable
nuevo de producto. El ejemplo probe-read-matrix es exclusivamente de tests y
no se incluye en ningún inventario. Setup sigue usando el driver para contexto
de Windows, y Rust completa versión/datos mediante Installation::read.

sha2 0.10.9 se adelanta al paso 3 con autorización expresa; zip/windows directos
siguen en paso 4. El lock añade solo `vantare-installer` a Hub y `sha2` a
installer. No cambia paquetes, versiones, fuentes o checksums. El lector sin
features no compila host, payload, scripts embebidos ni GPUI; transport/ui
conservan Setup/Uninstall por defecto.

Refactor en `e7deb1172`. Cambio de comportamiento autorizado separado en
`c4b17382e`: Ajustes Package proyecta versión/canal del manifiesto activo y
compara la oferta contra esa versión. Development/Invalid usan identidad del
binario; Unread indica espera. El test lee un manifiesto de disco, comprueba
caso normal y discrepancia, incluida una oferta que la identidad binaria
hubiera ocultado. No se presenta un test añadido como ejecutado hasta el gate.

## Lectores y reglas reales

| Lector tras este paso | Uso y perfil | Retirada |
| --- | --- | --- |
| Installation::read / Manifest::read | Única implementación Rust: Probe ligado al SHA del manifiesto sin rehash de activa; anterior completa o aviso; Hub informativo, portátil conservado | Vigente |
| Read-NativeState / Read-NativeManifest, candidate.ps1 | Escrituras/feed PS y compatibilidad, también Probe heredado de la matriz | Consumidores migran pasos 4–6; producto PS se retira paso 7 |
| Get-NativeLaunchTarget, candidate.ps1 | Lectura estructural para accesos | Paso 5, shell::sync |
| Uninstall-Beta, beta.ps1 | Retirada parcial sin exigir manifiesto/binarios ya retirados | Paso 4 migra Uninstall; ruta heredada hasta paso 7 |
| Driver PS | Contexto de Windows; lector antiguo conservado para operaciones y oráculo. Con readContext=true no lee state/manifiesto | Paso 4, incluido descubrimiento/opciones |

La excepción de versión DisplayVersion del Uninstall heredado no elige ni
autoriza la activa. Se conserva para presentar y recuperar desinstalaciones
interrumpidas, y se retira en paso 4. Los adaptadores están identificados en
la documentación del módulo engine y en el driver, sin cambiar los bytes de
candidate/beta instalados únicamente para añadir comentarios.

| Regla que permanece | Consumidor y retirada |
| --- | --- |
| validation::package_version | Sintaxis packaging 3–4 partes/sufijo; vigente como perfil |
| validation::hub_version | Mismo parser con límite informativo de 100 bytes; vigente como perfil |
| validation::setup_version | Comparación de tres u16 sin ceros iniciales; vigente como perfil |
| Regex manifiesto/build de candidate | Motor PS hasta pasos 4–7; Build pasa a tooling en paso 7 |
| Read-BetaVersion | Setup/feed/sesión PS; consumidores migran pasos 4/6 y producto PS se retira paso 7 |

No se afirma cinco lectores/reglas → uno global. Se retiran los tipos/parser
de instalación de updates.rs y la comparación de model.rs se reexporta desde
validation. El catálogo de rutas sigue teniendo una sola fuente PS durante
la transición: build.rs lo extrae y la matriz compara los cuatro canales.

## Caracterización y aislamiento

La matriz añade ReadProbe: compara los ocho campos públicos de Probe viejo y
Rust sobre la misma raíz, también en modo Uninstall. Las capturas siguen
comparándose con el baseline existente, sin Record ni nuevas normalizaciones.
La campaña nueva usa raíz con espacios/Unicode y el helper finito de PS5 con
entrada UTF-8, stdout/stderr separados y plazo de 30 s; posee y recoge al hijo.
El ejemplo rechaza raíz ajena, relativa o traversal.

El arnés se copia a `D:/VantareServer/qa/isa-1840/p3-harness/packaging` y se
comprueban sus bytes LF. Cada hijo recibe TEMP/TMP/LOCALAPPDATA de QA, HKCU
remapeado y carpetas inyectadas. Nunca se invoca Setup/Uninstall de producto
ni candidate/beta contra instalación, registro o carpetas reales. No se toca
Downloads. La 975 usa el ZIP ya disponible en QA, con digest público fijado.

## Gates y evidencia

- `p3-guard-01`: PASS, siete rechazos raíz/reparse y cinco checks de bytes;
  raíz válida, sentinel intacto y ausencia de raíz sin escritura.
- Parser PS, calidad/retirada 468/468 y diff intermedios: PASS.
- Check final del lector sin defaults y Clippy final Installer/Hub all-targets
  `-D warnings`: PASS. Nextest final retomado al observar D con 27–49 GB libres.
- `p3-logs/nextest-all-01.log`: no llegó a ejecutar tests. Link de Hub falló
  LNK1180 por espacio insuficiente; D tenía 65 MiB libres. Se pidió limpieza
  del servidor al orquestador; no se borran salidas ajenas ni se reduce la suite.
- `p3-logs/nextest-reader-01.log`: el intento focal sin defaults tampoco ejecutó
  tests; las dev-dependencies exigieron otra variante y falló al escribir rmeta
  con os error 112. Se detienen nuevas compilaciones hasta disponer de espacio.
- La revisión automática rechazó la acción combinada propuesta para detener
  solo los Cargo de este target y retirar su incremental regenerable, con motivo
  literal `blocked by policy`. Esa acción no se ejecutó ni se reintentó por otra
  vía. La limpieza se solicita al orquestador; fuentes y evidencia se conservan.
- `nextest-all-final.log`: el primer arranque de la suite detectó el helper de
  almacenamiento ausente (16 PASS, 1 FAIL, 617 no ejecutados). Se construyó el
  helper real con DuckDB 1.5.5 según README, sin modificar fuentes de storage.
- `nextest-all-final-02.log`: 634 PASS, 4 omitidos; Clippy all-targets PASS.
  Se repiten los gates tras conservar el SHA real/ausente de Uninstall parcial
  y el requisito previous del perfil Probe, con tests de lectura sin escritura.
- `p3-guard-02`: PASS 7 rechazos y 5 checks de bytes sobre la copia actualizada.
- Un intento de fmt omitió manifest-path y falló sin ejecutar rustfmt. Se
  repitió con native/Cargo.toml explícito; no se oculta el intento.
- Primer check se invocó sin el token cargo y falló antes del compilador.
  Repetición corregida con VANTARE_SCCACHE=0: check del lector PASS.
- Clippy inicial señaló docs, extensión, tamaño de función y estilo del test/
  arnés. Se corrigieron sin excepciones de lint ni retirar pruebas.

Pendientes: fmt/check/clippy/Nextest finales de crates tocados, matriz completa,
comparación de catálogos y fuentes/QA, fragmento, medición final y PR draft.
Telemetría/lifecycle runtime no se requieren por ámbito: sin cambios propios
runtime/domain/ipc/testdata ni ciclo de vida. QA física en VM/cuenta separada
sigue pendiente; un arnés no demuestra instalación interactiva de producto.

## Medición reproducible

Desde vantare-v2:

```powershell
python native/scripts/installer-lines.py --base 668d99c32 --head <SHA-final>
```

Sin head mide el árbol de trabajo. Perímetro fijo publicado en el script:
fuentes installer y Ajustes, tests/fixtures/ejemplo de installer, scripts PS de
packaging, README/handoff/fragmento de la entrega, build.rs, workflow y contador.
Cuenta líneas físicas (comentarios y vacías incluidos), excluye items Rust
exclusivos de test de producción con el clasificador existente y los suma a
tests. Separa scripts PS de producto y tests/tooling, Rust build, Python y CI.
No cuenta targets, binarios, fuentes generadas ni archivos de instalación.
Los resultados por archivo permiten reproducir los totales y detectar traslados.

Medición de la fuente preparada, todavía con gates pendientes:

| Categoría | Antes | Después | Diferencia |
| --- | ---: | ---: | ---: |
| Rust producción | 6258 | 6791 | +533 |
| Rust tests/ejemplo | 469 | 1014 | +545 |
| Fixtures JSON | 0 | 6 | +6 |
| PowerShell producto | 2246 | 2252 | +6 |
| PowerShell tests/tooling | 5787 | 5837 | +50 |
| Rust build/tooling | 74 | 155 | +81 |
| Python tooling | 0 | 95 | +95 |
| CI | 469 | 471 | +2 |
| Documentación | 8760 | 9024 | +264 |

Este paso añade el lector Rust mientras conserva PS: no acredita reducción
neta de producción. El ahorro global se medirá al retirar consumidores PS.

## Riesgos y comprobación manual

La igualdad de Probe no convierte el perfil informativo Hub en un verificador
de confianza ni añade rehash de activa. Reparación/instalación continúan bajo
sus guardas y bloqueos PS. DisplayVersion queda como excepción heredada de
presentación hasta paso 4. #1848 y #1856 siguen fuera de este alcance.

En VM/cuenta de pruebas, comparar Setup sobre 975/RC/datos conservados sin
cambiar opciones, y comprobar Ajustes con versión de manifiesto distinta de
la identidad del binario. Caso normal debe conservar texto/canal; una oferta
distinta de la instalada no debe ocultarse porque coincida con el binario.
No se ejecuta esa QA física con la cuenta/instalación del usuario.

Sin Plane, merge, release, promoción ni vigilancia de CI. El orquestador decide
revisión/integración y vigila los checks remotos cuando exista PR.
