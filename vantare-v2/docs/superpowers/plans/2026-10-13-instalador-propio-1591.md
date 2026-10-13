# #1591 — Plan de implementación del instalador propio

> FASE 2 autorizada por Isaac el 2026-10-13 tras revisar FASE 1. Ejecución directa, por hitos, sin subagentes. Al terminar: push y PR draft a nightly, enlazada en T3, y FIN en buzón; revisión independiente antes de integrar. No autoriza merge, firma real ni release.

**Objetivo:** reemplazar la interfaz NSIS de `VantareSetup.exe` y su desinstalador por Rust/GPUI, copiando el diseño aprobado y conservando instalación, actualizaciones, reparación, rollback, datos e identidad técnica.

**Arquitectura:** nuevo crate `native/installer` con una presentación GPUI y un motor que ejecuta los scripts PowerShell 5.1 existentes. Setup transporta el ZIP íntegro, los scripts y un desinstalador propio mediante `include_bytes!`; no descarga el payload ni reimplementa generaciones, firma Ed25519 o persistencia en Rust.

**Tecnología:** Rust 1.95, std, GPUI/GPUI Platform en la revisión ya fijada, serde/serde_json existentes, `vantare-build-support`, Windows SDK (`rc.exe`) y PowerShell 5.1/.NET incluidos en Windows. Ninguna dependencia externa nueva.

## 1. Base, autoridad y referencia inmutable

- Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1591, OPEN al leerla el 2026-10-13. Sin milestone, labels ni Project al inicio; corregir su clasificación como distribución/plataforma y revisión del plan, sin comprometer una versión.
- Worktree: `C:/Users/isaac/.t3/worktrees/vantare-v2/vantareapp-isa-1591-instalador-propio`.
- Rama: `vantareapp/isa-1591-instalador-propio`.
- HEAD/base tras `git fetch origin nightly`: `cec4364a5b4fc03f111dde6073c01e5fb36dad68`; árbol limpio al entrar. No desarrollar en el checkout principal.
- Plan solicitado: `C:/tmp/ola2/plan-1591.md`. Copia versionada idéntica: este fichero. Handoff único: `docs/vantare-program/handoffs/platform-commercial.md`.
- Diseño: `C:/Users/isaac/.t3/scratch/2026-10-13-issue-1591-dise-ar-en-59d28486/instalador-r3.html`.
- SHA-256 del diseño: `ca1e9bd31ba76fda1031e1b93ba6a090ef889b911cf20d58f30e0181867ad841`.
- Referencia visual: ventana principal `#E`, Rajdhani y pie solo bajo contenido. El HTML también contiene alternativas Inter/pie ancho; se toma `#E`, no una mezcla. Si la elección aprobada fuera una alternativa, Isaac debe indicarla antes de copiarla.
- Leídos AGENTS de raíz y aplicación en disco y `origin/nightly`, `native/AGENTS.md`, `native/README.md`, README de packaging, expediente/contratos/handoff, workflow de agentes/canales/roadmap y skill de orquestación. La orden explícita de Isaac de trabajar aquí y sin subagentes gobierna esta entrega.
- Leídos completos `beta-installer.nsi`, `installer-tests.ps1`, `publish-beta.ps1`, `release.yml`; contrastadas las funciones de instalación, activación, bootstrap, registro, extracción, datos, build, desinstalación y rollback de `beta.ps1`/`candidate.ps1`.
- Dependencias funcionales: #1565 (feed/Downloads; PR #1592 abierta, HEAD observado `aec1c30f816d19c9e40a72d10907367d7e61fe39`) y #1589 (Store, todavía investigación). GitHub no declara dependencias bloqueantes formales para #1591 al consultar su endpoint. No certificar requisitos Store ni cambiar MSIX en esta issue.

## 2. Crate y payload: sin dependencias nuevas

Crear `native/installer`, paquete `vantare-installer`, biblioteca pequeña y dos bins `vantare-setup` y `vantare-uninstall`. La distribución los nombra `VantareSetup.exe` y `Uninstall.exe`. Sus dependencias directas serán versiones/revisiones ya presentes en `native/Cargo.lock`: GPUI y GPUI Platform `72d28c32c2ba77a579e1c02f984654518552124b`, serde 1, serde_json 1 y build-support local. GPUI se declara bajo Windows; otros sistemas compilan lógica pura y un entrypoint que informa plataforma no compatible. No depender de hub/ui/runtime/services para arrancar un instalador ni enlazar DuckDB.

El crate nuevo sí añade su entrada local en Cargo.lock. Eso no autoriza introducir paquetes, revisiones o features externas nuevas. Comparar el conjunto `(nombre, versión, source)` externo antes/después con `cargo metadata --offline --locked`; si aparece uno nuevo, documentar necesidad/alternativa/riesgo y PARAR. No usar zip, winreg, winresource, webview, framework de installer ni descarga de código al compilar.

Estructura prevista:

Cambios existentes acotados: `native/Cargo.toml`/`Cargo.lock` (miembro local), `native/build-support/src/lib.rs` (recurso de installer), `native/packaging/candidate.ps1` (exclusión del builder/registro/limpieza), `beta.ps1` (solo eventos opcionales de las fases de instalación/desinstalación, por defecto sin efectos), `publish-beta.ps1`, `installer-tests.ps1`, README nativo/packaging y handoff de plataforma. Nada en runtime/domain/ipc, validadores de feed, MSIX ni workflows de release. Las funciones de progreso se fijan antes del código: eventos de preparación, extracción, verificación, copia, accesos y registro; nunca reutilizar `Invoke-NativeCheckpoint` para una UI de producción alterando sus puntos de interrupción de tests.

| Archivo | Responsabilidad |
|---|---|
| `installer/Cargo.toml`, `build.rs`, `README.md` | Features, payload opcional y recurso PE; contrato de build/CLI. |
| `installer/src/lib.rs`, `args.rs`, `model.rs` | Argumentos Unicode, tipos de estado, códigos y transiciones puras. |
| `installer/src/engine.rs`, `payload.rs` | Extraer bytes embebidos a temporal propio, procesos ocultos y resultado real. |
| `installer/src/view.rs`, `controls.rs`, `style.rs` | Seis pantallas, controles/estados y medidas exactas de `#E`. |
| `installer/src/bin/vantare-setup.rs`, `vantare-uninstall.rs` | Entrada interactiva o silenciosa, sin arrancar GPUI en /S. |
| `installer/tests/contract.rs` | CLI, transiciones, ausencia de payload y errores/cancelación. |
| `packaging/build-installer.ps1` | Construir primero uninstaller y después Setup con payload final. |
| `packaging/installer-driver.ps1` | Puente pequeño con scripts actuales; preflight, eventos, registro y limpieza propia. |
| `packaging/installer-shell-tests.ps1` | Seguridad de raíz/identidad, registro, eventos y limpieza sin interfaz. |
| `packaging/installer-qa.ps1` | Orquestar QA aislada y evidencia, sin tocar Isaac. |
| `packaging/installer-visual.ps1` | Capturas GPUI y comparación con HTML, con mutex/pantalla libre. |

Secuencia de construcción, sin ciclo:

1. `Build-NativeCandidate` crea el mismo ZIP de aplicación de hoy. Excluir `vantare-installer` junto con admin de su build de bins e inventario de bins de aplicación; comprobar separadamente que el crate installer solo declara sus dos bins. No añadir Setup/Uninstall al ZIP, ni cambiar `Get-NativeMembers`/manifest schema 1.
2. Construir `vantare-uninstall` sin feature de payload. Embebe únicamente puente/scripts/fuentes/recursos necesarios; nunca un ZIP completo. Copiar a salida propia y calcular hash.
3. Feature `setup-payload` solo para `vantare-setup`: build.rs recibe rutas absolutas de ZIP y uninstaller, versión, SHA esperado y scripts del mismo checkout. Genera constantes en OUT_DIR con `include_bytes!`; declara `rerun-if-env-changed` y `rerun-if-changed` para cada entrada. No incluye rutas de config ni claves.
4. El build sin esa feature permite gates/tests de workspace sin disponer del paquete. Intentar instalar desde ese bin devuelve error explícito: no crea un Setup distribuible con payload ficticio.
5. Validar bytes/hash/metadatos del ZIP antes de construir y otra vez al ejecutarlo mediante `Expand-NativePackage`/SHA streaming .NET, conservando inventario, límites y protección de enlaces. Extraer los bytes embebidos con std a directorio exclusivo creado con `create_dir` y nombres cerrados; rechazar temporales/raíces con reparse points. Limpiar solo ese temporal, nunca data/staging ajenos.
6. Builder verifica PE x64, ProductName Vantare, FileDescription Instalador/Desinstalador Vantare, versión numérica `${VERSION}.0`, icono actual y manifest `asInvoker`. Extender build-support con función específica de instalador; no cambiar recursos de los bins actuales. SDK ya usado por `embed()`; no crate de recursos nuevo.

Inter, Rajdhani y Space Mono se embeben desde `native/ui/assets/fonts`, sin depender del crate UI ni descargar fuentes. Conservar sus tres licencias OFL en los notices de Setup/Uninstall. Comprobar peso/cobertura real de Rajdhani y las fuentes WOFF2 del HTML frente a los TTF existentes antes de certificar tipografía; no simular el peso ni cambiar a Segoe por conveniencia. Si falta el asset exacto, detener la aceptación visual y comunicar la diferencia, sin añadir una librería.

## 3. Paridad de comportamiento con NSIS

| Contrato vigente comprobado | Implementación propuesta y prueba necesaria |
|---|---|
| Instalación por usuario, sin UAC, `%LOCALAPPDATA%/Programs/Vantare` | Misma raíz inicial/asInvoker; registro y accesos del usuario, sin servicios ni asociaciones. Ruta explícita `/D=` compatible con espacios, Unicode y `/D` al final. |
| Registro previo decide InstallLocation aunque /D difiera | Resolver primero HKCU de la identidad propia y validar raíz; mantener su ruta, sin trasladar generaciones. Desactivar Cambiar en una instalación existente. |
| Adopción de ruta antigua | Sin registro, adoptar `Programs/Vantare Native Beta` si existe `state.json` o `retained-data.json`, igual que NSIS. No descubrir/importar Wails. Reinstalación en ruta personalizada tras desinstalar requiere /D o selección explícita de esa misma ruta. |
| Identidad productiva | HKCU `Software/Microsoft/Windows/CurrentVersion/Uninstall/VantareNativeBeta`; DisplayName Vantare, DisplayVersion del paquete, InstallLocation, UninstallString, DWORD NoModify=1/NoRepair=1. No renombrar identidad/tag/canal. |
| QA `/DTEST_INSTALLER` | Builder acepta este define de compatibilidad y su forma `-TestInstaller`; traduce exclusivamente a feature `test-installer`. Identidad `VantareNativeBetaQA1492`, carpeta Inicio `Vantare QA1492`, antigua `Vantare Native Beta QA1492`. Exigir `/D=` y raíz bajo `C:/tmp/ola2/1591-qa/`, rechazar las dos raíces reales, aliases/case/junctions y registro QA que apunte fuera. QA nunca adopta registro/ruta productiva. |
| Marker QA | Escribir `registration-identity.txt` antes de Register; contiene solo la identidad QA y se retira al desinstalar. Mantener ShortcutFolder/LegacyShortcutFolder en registro QA. Scripts productivos no enumeran identidades QA. |
| Accesos actuales | Inicio `Vantare/Vantare.lnk` y `Desinstalar.lnk`; Vantare abre PowerShell x64 oculto → beta.ps1 de la raíz. Retirar solo accesos antiguos que pertenecen a esta instalación; conservar accesos ajenos o fallar si hay colisión. Escritorio/autostart se resuelven en §4. |
| Instalación/actualización/reparación | Ejecutar el `beta.ps1` embebido: `-Operation Install -Root <resuelta> -Archive <ZIP temporal> -ExpectedSha256 <embebido> -NoLaunch`. Conservar locks, guardas de exe, generación nueva, copia opaca exacta de datos y state atómico. |
| Errores tipados | 0 éxito; 2 sesión/binarios abiertos; 3 downgrade de binarios o datos; 4 arranque anterior pendiente; 1 resto. Usar ExitCode, no parsear el texto. Error GPUI mantiene esos códigos; no matar la app/carrera. Registro fallido después de instalar devuelve 1, sin ocultar que los binarios ya se instalaron. |
| Apertura final | Botón Abrir Vantare inicia PowerShell **System32** x64 oculto con `beta.ps1 -Root <raíz>` y desactiva doble clic mientras lanza. En Rust x64 no usar Sysnative (alias necesario solo para NSIS x86). Cerrar no abre; /S nunca abre Hub ni diálogos. |
| Confirmación/rollback | Conservar `boot-pending.json`, `hub-ready`, plazo actual 45 s, `Confirm-BetaBoot`, generación anterior y corrección de DisplayVersion. Setup repetido pendiente da 4 y preserva hash exacto del marcador. No confirmar arranque desde la ventana de Setup. |
| Renovación del bootstrap | `Install-Beta` copia a raíz el candidate.ps1 y beta.ps1 del Setup **después** de activar correctamente. Exigir hashes idénticos a scripts embebidos. Update por feed sigue sin renovar scripts raíz. No añadir renovación automática del feed. |
| Programas y desinstalador propio | Instalar `Uninstall.exe` GPUI y conectar Inicio/UninstallString a él. Conservar `uninstall-vantare.ps1` durable como fallback de generaciones/NSIS antiguos; resolver la coexistencia abajo. |
| Desinstalación | Reusar `Uninstall-Beta` + limpieza de registro/accesos de `Uninstall-NativeRegistration`; sin datos borrados. Sesión abierta rechaza con resultado de error, incluso si existe boot-pending. No `Remove-Item -Recurse` sobre raíz instalada ni sobre data. |

### Registro, feed y desinstalador que se está ejecutando

`Sync-NativeRegistration` hoy sustituye UninstallString por PowerShell → `uninstall-vantare.ps1`. Un simple cambio en Setup se perdería en el siguiente arranque: `hub/src/installation.rs::confirm_ready` ejecuta Register del candidate.ps1 verificado de la generación. Por eso hay que adaptar esa función en candidate, manteniendo su entrada/validación actual.

Añadir marker raíz `installer-ui.json`, schema 1, kind `rust-gpui`, nombre cerrado `Uninstall.exe` y SHA-256 del uninstaller. No meter versión de aplicación ni datos de cuenta en él. Register reconoce únicamente ese marker y el hash/exe correspondiente, y usa el EXE propio para Inicio/Programas. Si no hay marker, conservar exactamente la ruta durable PowerShell para instalaciones antiguas. Marker inválido no concede una ruta ejecutable arbitraria. Mantener el script durable para recuperación y no alterar Hub, protocols ni confirm_ready.

El uninstaller permanece en raíz; el feed no lo reemplaza ni transporta installers. Setup lo renueva. La limpieza del archivo actualmente ejecutado requiere tratamiento explícito: el puente retira inventario/registro/bootstrap dejando temporalmente el EXE en uso y el marker de limpieza. Al pulsar Cerrar tras éxito (o al finalizar /S), un helper PowerShell oculto, situado en temporal propio, espera como máximo 30 s el fin de ese PID y elimina SOLO el Uninstall.exe validado por ruta/hash y su marker. No matar procesos ni borrar generaciones. Helper con resultado/log durable; fallo conserva evidencia y permite reintento. Verificar desaparición final en QA con condición observable, no con sleep fijo. No devolver éxito del trabajo principal si falla retirar binarios/registro/accesos; distinguir ese resultado de la comprobación posterior de autoeliminación. No dejar un helper esperando indefinidamente mientras el usuario contempla Desinstalado. Retirar opciones/marker solo después de conservar la información necesaria para esta limpieza y el reintento.

Conservar `Uninstall.exe /S _?=<raíz>` para el harness heredado: `_?` se acepta como raíz explícita de compatibilidad, se valida contra la instalación/identidad propia y no se concatena a una orden de shell. Entradas nuevas usan raíz del exe/registro; nunca inferir otra identidad de usuario.

## 4. Diferencias del HTML: decisiones visibles antes de implementar

Decisiones cerradas por Isaac/orquestador el 2026-10-13:

1. **Escritorio/Windows.** Interactivo: escritorio ON/autostart OFF en instalación nueva, como el HTML. `/S`: ninguno nuevo por defecto, como NSIS. Accesos opcionales mediante WScript.Shell existente; autostart usa Startup del usuario apuntando al mismo bootstrap, sin tocar la clave Run real del Hub. Persistir opciones en `installer-ui.json`, preservarlas en reinstalación y quitar solo accesos propios al desinstalar. QA usa nombres QA exclusivos, exige hashes/propiedad y conserva cualquier acceso ajeno.
2. **Conservar datos.** SIEMPRE. Quitar la casilla y mostrar «Tus datos se conservan en <ruta real>». No implementar borrado ni prometer borrar datos locales/remotos. Cualquier borrado futuro requiere otra issue.
3. **Reparar 0.9.3 con Setup 0.9.4.** El HTML ofrece eso, pero el motor actual exige paquete de la MISMA versión para Repair. No inventar un ZIP ni descargar una reparación sin contrato. Recomendación: mantener ambos cards; Actualizar habilitado solo si payload > instalada y Reparar solo si payload == instalada. Si es menor, error 3; explicar que para reparar una versión anterior hace falta su Setup. Reparación de versión vigente después de feed requiere el Setup de esa versión. Elegir Repair nunca instala otra versión por debajo del mismo título.
4. **Valores demostrativos.** Sustituir 0.9.3/0.9.4, 180 MB, PID y ruta de log por versión/tamaño/raíz/log observados. No copiar `%LOCALAPPDATA%/Vantare/native` como ubicación de ajustes instalada ni usar progreso aleatorio del JS. §5 demuestra rutas. «Nada ha cambiado» se mantiene solo donde sea cierto; tras activación o fallo de accesos mostrar «Tus datos se conservan» y estado real con la misma composición.

Cambios de medidas/estructura/tipografía/colores no forman parte de estas excepciones. Si Isaac no acepta una propuesta funcional, modificar el plan y resolverla antes del código dependiente.

## 5. Datos conservados: ruta real comprobada en código

Fuentes: `beta.ps1::Start-BetaHub`, `Uninstall-Beta`, `Install-Beta`; `candidate.ps1::Copy-NativeData`/`Update-NativeCandidate`; `hub/src/main.rs::persistence_paths`; `ui/src/paths.rs::default_data_dir`; `services/src/app.rs::default_root` y `services/src/diagnostics.rs::data_root`.

- Raíz de datos instalada: `<InstallLocation>/generations/<state.active.generation>/data/`. Con instalación nueva por defecto: `%LOCALAPPDATA%/Programs/Vantare/generations/<id>/data/`; en legado/QA es su propia InstallLocation.
- Hub recibe explícitamente `--data-dir <generación>/data/hub`; `appearance.json` vive ahí, y `VANTARE_APPEARANCE_FILE` usa la misma ruta.
- Layout/perfiles Launcher y Engineer: `<generación>/data/Vantare/native/{layout.json,launcher.json,engineer.json}`; hijos heredan `VANTARE_NATIVE_DATA_ROOT=<generación>/data`.
- Servicios/cuenta y borradores locales: `<generación>/data/Vantare/native/services/<namespace>/`; diagnósticos/privacidad: `<generación>/data/Vantare/native/`. No leer contenido real para construir el plan o comprobar conservación.
- Ejecución diagnóstica fuera de beta tiene fallbacks AppData (el Hub directo usa `VantareNative/hub`); no equivale a los datos instalados ni autoriza migrarlos/borrarlos.
- `Uninstall-Beta` guarda `retained-data.json` con schema/generación activa/versión, retira solo miembros del inventario y preserva **todos** los data/ de generaciones. No exige integridad de los bins ya retirados para reintentar una desinstalación interrumpida.
- Reinstalación recupera la copia indicada por retained-data; conserva bytes y rechaza datos de versión superior. Para antiguos sin marker, solo adopta una copia o copias idénticas; varias diferentes se rechazan y todas permanecen.
- Pantalla Desinstalado muestra ruta real conservada (datos Hub y raíz data), no dos rutas AppData supuestas. No prometer que «no queda nada»: permanecen datos y marcadores de recuperación, igual que hoy.

## 6. Copia fiel de las seis pantallas

Ventana principal: 720×460 unidades lógicas, sin decoración del sistema, radio 10, borde blanco 14 % de 1 px; panel 240 px, degradado vertical `#2b0a0e → #140708 (42 %) → #0b0b0b`; contenido padding superior 48/lateral 40; pie 64 px solo a la derecha. Barra de arrastre 36 px también sobre panel; minimizar/cerrar 44×36. Títulos Rajdhani 700/28, cuerpo Inter 13.5/64 %, mono Space Mono; tokens exactos del CSS, sin adoptar un tema alternativo del Hub.

Barra de tres segmentos 3 px/gap 6, hechos gris y actual rojo/error amarillo. Botones 40 px, principal mínimo 132, radio 8, degradado `#ff3b3b→#9a0606`, foco 2 px/offset 2; hover/pulsado/foco/disabled iguales a la hoja del HTML. Logo/icons con PathBuilder/canvas GPUI reproduciendo sus paths, sin fuentes de iconos sustitutivas. Transición 200 ms opacidad/translateY 6; hover 150 ms; pulso actual 1 s, sin otras animaciones y respetando movimiento reducido.

| Pantalla | Estado y acción |
|---|---|
| Bienvenida con opciones | Default root resuelta, tamaño/versión reales, Cambiar para instalación nueva, panel Opciones y botón Instalar. |
| Instalando | Título Instalar/Actualizar/Reparar según operación; porcentaje mono 54, barra 4, seis pasos del HTML. Datos desde eventos reales; no temporizador de progreso. |
| Terminado | Hechos: versión activa, raíz, accesos y arranque elegidos/efectivos. Cerrar/Abrir Vantare y estado Abriendo con bloqueo de doble clic. No decir arranque confirmado antes de Hub. |
| Error | Composición exacta amarilla, detalles plegables, log local y error tipado real. Reintentar para 2 o fallos recuperables; 3 pide Setup adecuado y 4 abrir/cerrar la instalación. |
| Ya instalado | Versión instalada/payload reales, dos cards Actualizar/Reparar con la habilitación de §4; Desinstalar abre confirmación del uninstaller propio. |
| Desinstalar | Confirmación, Conservar marcado, Cancelar/Desinstalar; incluye estados secundarios Desinstalando (cuatro pasos) y Desinstalado. No contar estos como un diseño distinto. |

Concurrencia/cancelación: tarea background GPUI con Child propietario; stdout JSONL del puente (schema/op/step/done/total), stderr local drenado sin deadlock. Mensajes con enum/contadores validados y límites, sin stdout de datos de cuenta. El puente puede informar fases discretas verificadas y bytes de extracción; porcentaje expresa avance de trabajo, no tiempo estimado ni MB ficticios. Cancelar funciona antes de invocar la transacción de instalación, con token propio del temporal; inmediatamente antes de mutar la raíz se deshabilita Cancelar/cerrar/Escape. Cancelación no mata PowerShell durante state commit/copia. Worker se termina/join al cerrar; /S consume exactamente el mismo motor sin crear aplicación GPUI. Si el motor no permite medir una fase, mostrar su estado sin inventar contadores.

## 7. Build, firma, release y convivencia con #1565

`publish-beta.ps1` actual: Build-NativeCandidate → JSON del feed → firmador/verificador Ed25519 `vantare-services` → makensis → hash Setup → imprime `gh release create`. NO hay Authenticode, firma del Uninstall.exe ni publicación ejecutada. `release.yml` rechaza expresamente el pipeline Wails retirado. Un plan no habilita otro workflow de release.

Modificar solo tramo makensis para invocar `build-installer.ps1` después de construir el ZIP; retirar requisito `NsisCompiler` de la ruta productiva nueva y documentar invocación histórica para baseline NSIS. Builder y publish conservan Release/offline/locked/-j 2, checkout limpio (`source_dirty=false`), versión/canal embebidos y restauración del entorno, con target propio. No incluir nueva UI ni config dentro del inventario de aplicación. QA Debug/AllowDirty queda marcada como QA, nunca candidata.

Firma: preservar `SigningKeyFile`, Invoke-BetaManifestTool, verificación con clave pública del paquete, sobre payload/signature exacto y hash del ZIP. Hash Setup se calcula tras producir su bytes finales; si Isaac autoriza Authenticode en otra entrega, firmar antes del sidecar, no ahora. No leer USB/semilla real, config .env ni variables con secretos durante esta fase o QA. Usar solamente fixture/verificador de TEST aislados para pruebas de firma; nunca parchear la clave pública productiva. Build local sin firma productiva se hace con candidate + builder, no se esquiva la obligatoriedad de SigningKeyFile del publisher.

En esta base BetaRepository aún es Vantare-Simracing-Suite. PR #1592 de #1565 lo cambia a `isaacalbala12/Vantare-Downloads`, añade Assert-BetaPackageUrl y el sidecar del ZIP. No aplicar esos cambios desde #1591, no volver a la URL antigua ni editar validadores/orígenes del feed. Builder transporta beta.ps1 vigente literalmente; publish conserva interpolación `$script:BetaRepository`, assets `VantareSetup.exe`, ZIP, `vantare-native-beta.json`, sidecars y tag `native-beta-v*`. Al integrar, resolver el pequeño solapamiento de publisher/handoff conservando íntegro #1565 y volver a ejecutar sus tests de origen/feed.

#1591 NO retrasa 0.0.976: #1565 publica con NSIS actual. Mantener beta-installer.nsi como baseline durante el trabajo aislado; no integrar sustitución del publisher antes de ese corte si está pendiente. No implementar feed doble, migración automática de bootstrap ni publicar nada en Downloads. No tocar runners/visibilidad/Supabase/workflows de #1565. #1589 recibe compatibilidad /S, sin promesa de aprobación de Store.

## 8. Hitos de FASE 2 y commits

Antes de cada hito: releer issue/plan/handoff y estado de #1565, comprobar Git/status/ocupación, conservar cambios ajenos. Cada hito termina con diff completo, gates correspondientes, commit local de rutas propias y actualización/verificación del mismo handoff y issue (SHA, checks, límites, siguiente paso). Nada de push/PR/merge/firma real/release como efecto implícito.

- [x] **H1 — motor/CLI/payload.** Crear crate/estructura/binarios/build y driver. Añadir tests de contrato antes de conectar UI: argumentos `/S /D=...`, Unicode, defaults, códigos 0–4, payload ausente, temporal ajeno, exclusión del inventario, downgrade/pendiente intactos. Probar bin x64 headless y hash/extracción corrupta. Commit `feat(installer): add embedded setup engine (#1591)`.
- [x] **H2 — registro/uninstaller.** Implementar identidad QA, metadata/marker, integración de Register con UI propia, limpieza diferida acotada y fallback antiguo. Regresiones de accesos ajenos, registro que apunta fuera, código de fallo y reintento interrumpido. Commit `feat(installer): preserve installed identity and data (#1591)`.
- [x] **H3 — seis pantallas GPUI.** Copiar #E y controles, ligar a motor/eventos/apertura/cancelación; resolver explícitamente §4. Capturar todas las pantallas/opciones/estados a 100 %, corregir comparando zonas y tipografía. Commit `feat(installer): reproduce approved GPUI screens (#1591)`.
- [x] **H4 — publisher/QA.** Sustituir únicamente el build de NSIS, conservar firma/feed/artefactos y ampliar installer-tests con matriz antigua→propia y propia→propia. Runbooks/README/mapa de crates/fragmento `docs/changelog/fragments/ISA-1591.json`; la estructura actual del changelog se lee antes de escribirlo. Commit `feat(packaging): build custom Vantare setup (#1591)`.
- [ ] **H5 — validación final.** Gates generales, matriz QA y Windows limpio, capturas revisadas e inventario final. Corregir solo hallazgos de alcance; commit de correcciones si existen. Entregar evidencia y pedir aceptación de la implementación; no confundir hito completo con promoción/publicación.

## 9. Tests y QA aislada

Toda evidencia en `C:/tmp/ola2/1591-qa/`: builds/old-nsis, build-a, build-b, installed, evidence y temporales propios. Antes de mutar, comprobar raíz absoluta bajo ese prefijo, NTFS, ausencia de reparse points y que HKCU/shortcuts QA no existen o pertenecen al ensayo. Si ya hay QA1492 ajena, conservarla y parar; no desinstalarla. No modificar HKCU VantareNativeBeta, carpetas reales nuevas/antiguas, Wails, clave Run VantareNative.Hub ni archivos de cuenta. Auditar únicamente metadatos permitidos de esos límites si hace falta demostrar ausencia de cambios; nunca leer sus secretos/datos.

La raíz aislada NO aísla por sí sola la sesión live: Start-BetaHub usa instancia `native-beta` y pipe `vantare-core-<SID>-native-beta`. En el usuario de Isaac hacer solo Setup /S, guards y fallos headless del Hub con argumentos inválidos; no lanzar supervisor/Hub live. Abrir Vantare, confirmar arranque exitoso y e2e de feed/Inicio/autostart requieren cuenta de prueba con SID distinto o VM. No cambiar la instancia productiva para fingir aislamiento, ni cerrar la sesión real. Si ese entorno no está disponible, dejar esas pruebas pendientes con evidencia precisa, sin crear cuentas ni habilitar autostart de Isaac.

No reutilizar sin cambio `installer-tests.ps1`: hoy exige una versión anterior **con nombre Vantare Native Beta** y luego Vantare, y usa el flag NSIS `_?=`. Conservar esas aserciones para su caso legacy; añadir casos propios sin hacer que la segunda build finja llamarse beta. Sin rebajar expectativas de hashes, versiones, locks, rollback y exclusividad.

Matriz ejecutable por `installer-qa.ps1`:

1. **NSIS legado A → Setup propio B:** raíz QA explícita, fixture name antigua y datos de prueba; update conserva raíz/nombre técnico, migra accesos propios, renueva ambos scripts raíz al hash B y crea uninstaller propio. Probar rollback fallando Hub con `--invalid-beta-start` como el harness actual; confirmar DisplayVersion y datos recuperados.
2. **Propio A limpio /S:** salida 0, sin UAC/ventanas/procesos Hub, metadata/registro/accesos/UninstallString exactos. Omitir /D en QA, rutas reales (incluido case/alias/junction), raíz registro fuera de QA, argumentos incompletos y payload corrupto → rechazo sin tocar instalación real.
3. **Feed A → B firmado TEST:** sobre local firmado, Check→Apply→confirmación/rollback. Capturar hash de scripts raíz/uninstaller ANTES y DESPUÉS: el feed no los renueva. Nueva generación/versión, perfil/layout/ajustes/cuenta fixture idénticos; Register mantiene uninstaller UI e identidad QA. Feed remoto simulado y validación de origen de #1565 se prueban aparte; no publicar versiones fixture en Downloads.
4. **Reinstalar B conservando datos:** Setup B actualiza bootstrap, mantiene raíz, crea generación nueva y copia índice/bytes completos. Quitar Hub de generación QA y reparar con mismo Setup: restaura binario sin datos cambiados. Setup anterior devuelve 3 con registro/marker/hashes intactos.
5. **Sesión/archivo bloqueado y boot-pending:** locks/handles reales solo QA → código 2, reintento tras liberar; repetir Setup sin confirmar boot → 4 y boot-pending/generación exactos. Registro/acceso fallido después de activar → 1 y aviso real, no pantalla de éxito falsa.
6. **Desinstalar:** UI, /S, Inicio y Programas apuntan al mismo uninstaller; sesión abierta falla sin eliminar datos. Cerrado → registro/accesos/binarios/bootstrap/uninstaller propios retirados, retained-data válido, índice/hash de TODOS los data de TODAS las generaciones idéntico. Esperar condición de cleanup/log, no dormir arbitrariamente. Repetir tras interrupción en `uninstall-member` sin borrar ni escoger datos distintos.
7. **Reinstalar tras desinstalar:** Setup B recupera referencia activa y 4/4 familias de datos fixture; A rechaza datos de versión superior. Añadir caso de retained-data antiguo único y caso de dos copias diferentes: este último falla conservando ambas.
8. **Opciones aprobadas:** escritorio/startup QA ON/OFF, reparación conserva preferencias, desinstalar quita solo accesos QA propios; simular link ajeno para comprobar protección. /S conserva defaults NSIS y nunca autoabre/autoarranca.
9. **Windows limpio:** cuenta/VM de prueba de Isaac, Windows 10/11 x64 sin Rust/NSIS/herramientas de desarrollador; solo prerequisitos OS reales. Instalar/arrancar/desinstalar Setup propio desde cualquier carpeta offline. Medir imports/tamaño; comprobar DLL MSVC/ICU/D3D que GPUI necesite. No dar equipo limpio por acreditado usando el PC de desarrollo; si falta redistribución, documentar y parar, sin descargar dependencias/producto del sistema en secreto.

Gates futuros, TODOS vía cola solicitada; comandos desde `vantare-v2/native` y sin procesos de build directos:

```powershell
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 cargo fmt --all -- --check
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 cargo test -p vantare-installer --locked --offline -j 2
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 pwsh -NoProfile -File gates.ps1 -Gate check
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 pwsh -NoProfile -File gates.ps1 -Gate clippy
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 pwsh -NoProfile -File gates.ps1 -Gate test
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 pwsh -NoProfile -File gates.ps1 -Gate lifecycle
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 powershell -NoProfile -File packaging/installer-shell-tests.ps1 -EvidenceDirectory C:/tmp/ola2/1591-qa/evidence/shell
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 powershell -NoProfile -File packaging/installer-qa.ps1 -Root C:/tmp/ola2/1591-qa
```

Los dos últimos scripts son entregables previstos, no existen en FASE 1. El harness nuevo ejecuta con sus argumentos reales `tests.ps1`, `beta-tests.ps1`, `installer-tests.ps1`, `uninstall-tests.ps1`, `config-tests.ps1`, `build-guard-tests.ps1`, remote-feed-tests y, tras #1565, feed-origin-tests. Necesita dos paquetes REALES y verificador/semilla sintética de TEST, nunca sustituirlos con binarios 0.0.975 etiquetados como una versión nueva. Registrar tests fixture separados de e2e con binarios reales. PS 5.1 es el host de distribución; pwsh solo lleva cola/gates.

Targets: `native/target/gates` exclusivo de este worktree para gates; `C:/tmp/ola2/1591-qa/target-package` para distribución y `target-installer` para Setup/Uninstall. No junctions ni compartir targets. Distribución retira DUCKDB_LIB_DIR del proceso y usa bundled, restaurando entorno al acabar. Repetir sin sccache (`VANTARE_SCCACHE=0`) solo ante fallo de caché sin diagnóstico; conservar el fallo. Telemetría requerida si finalmente cambia runtime/domain/ipc/testdata; este plan no prevé cambios ahí. `retirement/verify.py`, quality y AST de PS pasan por la misma cola, sin recalibrar baselines.

QA visual: comprobar `C:/tmp/fase2/pantalla-ocupada` inmediatamente antes de cada apertura/captura; mientras exista, no abrir ventanas y trabajar en checks headless. Capturas nativas solo con `Global/VantareParityCapture` (nombre Win32 `Global\VantareParityCapture`), revalidando ocupación bajo mutex y liberándolo al terminar. No cerrar/mover ventanas de Isaac, no cambiar su DPI global. Referencias de #E con fuentes cargadas y animación congelada; capturas GPUI reales del mismo estado/versión/datos fixture. Comparación de imagen y revisión humana por zonas; no aceptar diferencias de geometría/fuentes/color compensadas por un porcentaje global. Verificar teclado, arrastre, minimizar, cierre/cancelación y 100/125/150/200 % en sesión/VM de QA. Un modo capture/test debe estar detrás de feature de QA y no producir acciones ficticias en instalación real.

## 10. Riesgos, rollback y cierre de FASE 1

Riesgos concretos: solapamiento publisher/handoff con #1565; Register sobrescribiendo la nueva UI si no se adapta; Windows bloqueando la autoeliminación del EXE; DLL de GPUI en equipo limpio; tipografías distintas HTML/TTF; progreso/cancelación prometidos antes de tener eventos. Cada uno tiene prueba o stop arriba. No abrir un nuevo proyecto de arquitectura: la autoridad del motor sigue en packaging.

Rollback de la implementación: conservar baseline NSIS hasta aceptación, commits pequeños y reversión local/PR del hito de sustitución; no force push ni tags movidos. Rollback de aplicación: mecanismo actual por generaciones, conservando todas las copias de data. Restaurar bootstrap requiere volver a ejecutar Setup autorizado; el ZIP/feed no lo renueva. FASE 1 no necesita rollback de instalación porque no instala nada.

Criterio de aceptación futura: todas las filas de §3 y casos de §9 con evidencia, seis pantallas revisadas frente a `#E`, ninguna dependencia externa nueva, scripts raíz renovados SOLO por Setup, no cambios a Isaac/feed real/secrets y aceptación explícita de §4. Firma real, publicación, Store, CI remota y canales requieren sus pruebas/autorizaciones independientes.

FASE 1: entregar este plan, copiarlo byte a byte a `C:/tmp/ola2/plan-1591.md`, registrar hito documental con `git diff --check`/integridad, actualizar y releer issue/handoff y añadir una línea DUDA a `C:/tmp/buzon/1591.md` sin borrar rondas de diseño. Omitir build/gates Rust/instalación/firma: no hay cambio de producto y el encargo termina en PLAN. **PARAR después de DUDA.**


## Cierre local de FASE 2 (2026-10-13)

Código, QA headless/UI y hoja de seis capturas entregados para review independiente. Gates y evidencia exactos en docs/reviews/2026-10-13-1591-instalador-qa.md. H5 mantiene pendientes arranque live/Windows limpio/DPI físicos por falta de cuenta o VM identificada. La rama se publica como PR draft a nightly, enlazado en T3; no hay integración, firma real ni release. Targets/copia de evidencia propios pasaron a E por disco lleno, manteniendo los logs/mapas y todos los datos fixture.