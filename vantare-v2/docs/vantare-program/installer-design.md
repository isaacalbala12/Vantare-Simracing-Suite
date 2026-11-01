> Copia versionada del análisis del 1-nov-2026, base 056ec9d94. Es evidencia
> de diseño anterior a los pasos 0–1d, no el estado actual del producto.
> Las decisiones aceptadas y el contrato vigente están en
> [ADR 0103](../adr/0103-instalacion-nativa.md) y en la issue #1840.
> En particular: 1c usa registration-status.json separado; hub-ready acredita
> ventana creada; MSIX queda histórico; paso 9 aparcado; dependencias del paso 4
> aprobadas. Las cifras «después» son estimaciones para el recorrido completo.
> Se sustituyen rutas locales del analista por marcadores reproducibles.

**Notas de vigencia de la copia histórica (1-nov-2026, #1840):**

- §4.5, paso 3: el alcance aceptado migra solo lecturas Rust de Probe/Hub;
  conserva perfiles y adaptadores PS hasta pasos 4–7. No acredita 5→1 global.
- §4.5, paso 1c: el aviso real vive en registration-status.json, separado del
  actualizador. startup-options.json de 1d también es contrato vigente; el
  recuento original de señales de §5 no los incluía y no es una medida actual.
- §4.5, paso 5 conserva destinos existentes; el paso 6 cambia los accesos al
  lanzador una vez instalado. El inventario sin PS del paso 7 se refiere al
  producto nuevo: Setup conserva los scripts congelados necesarios para
  LegacyRunner mientras alguna referencia sea motor 1, incluso tras ese paso.
- La dependencia sha2 se adelanta al paso 3 por autorización del orquestador.
  Cambian solo aristas installer/Hub del lock, sin nuevas resoluciones; la frase
  histórica «no añaden nada al lock» no implica identidad byte a byte.

El texto original que sigue se conserva completo; estas notas y ADR 0103
resuelven sus recomendaciones superadas sin reescribir la evidencia histórica.

# Recorrido del instalador — diseño (revisión general, frente P2)

Rol: analista de diseño (advisor) del orquestador. Solo lectura: no se ha editado
código, compilado, ejecutado instaladores ni la app, no se han tocado
instalaciones reales ni el servidor de descargas, y no se han leído secretos ni
`.env*`. Base `origin/nightly` **056ec9d9487353a24b017c11eed287b57f3cf149**
(1-nov-2026). Se leyó con `git archive` en una carpeta temporal fuera del repo
(`<copia-temporal>`); el checkout de integración está 13 commits por detrás
y no se usó. Rutas `native/...` y `docs/...` relativas a `vantare-v2/`. Las
líneas citadas son de ese SHA.

Fuentes leídas: AGENTS.md (raíz y `vantare-v2`), MAPA.md (R1/R2), el ejemplo
`licencias-DISENO.md`, ADR 0099 (§3 ciclo de vida, §7 «Actualizador temporal»),
ADR 0102 (compatibilidad de generaciones, services v19 / control v7), plan
por fases (fase 7), `native/packaging/README.md`, `native/installer/README.md`,
kit RC9 (`<evidencia-rc9>/`: INFORME, INCIDENTE,
`qa-upgrade.original-incident.txt`, `guard-qa.ps1`, `lifecycle-issue.md`;
`<kit-rc9>/`: INFORME, PUBLICAR-DESPUES, `publicar.ps1`,
`feed-check.ps1`), issues #1816, #1795, #1753, #1748 y #1803, la lista de
issues abiertas de plataforma, y el código citado. Consulta de solo lectura
del feed: `Vantare-Downloads` tiene **0 releases** y el repo antiguo solo
`native-beta-v0.0.975`.

No existe ADR del instalador/actualizador: su contrato vive en los README de
`packaging/` e `installer/` (623 + 127 líneas, con secciones fechadas apiladas).

---

## Resumen para Isaac (en sencillo)

- **Lo que está bien y se queda:** cada versión instalada vive en su propia
  carpeta («generación») con su propia copia de tus datos; el cambio de versión
  es un solo paso atómico; el actualizador solo acepta paquetes firmados con tu
  clave (y la clave pública va dentro del programa); nunca se borran tus datos;
  nunca se mata la app para actualizar (espera a que la cierres); y si la versión
  nueva no abre, vuelve sola a la anterior. Ese modelo es bueno.
- **El problema de fondo:** el «motor» que instala y actualiza existe **en dos
  copias a la vez**. Una vive en la carpeta raíz y solo se renueva cuando
  ejecutas el Setup; la otra viaja dentro de cada versión. En cada arranque
  manda la copia vieja de la raíz. Por eso cada mejora necesita además un parche
  para convivir con copias antiguas. De ahí sale la mayoría de los 13 arreglos de
  `candidate.ps1` y los 7 de `beta.ps1`. Ejemplo claro (#1795): una actualización
  que añada **un solo archivo nuevo** no puede llegar por el actualizador; hay
  que reinstalar con Setup.
- **Segundo problema:** el motor está escrito en PowerShell. Cada vez que abres
  Vantare se arrancan **dos PowerShell** (unos 5 s medidos en #1748) y se
  comprueban los 109 archivos con hash **al menos cuatro veces**. Además,
  PowerShell «se mete» en las variables de quien lo carga: así ocurrió el
  incidente de RC9, en el que una prueba acabó escribiendo en tu instalación real.
- **Tercer problema:** la misma pregunta se responde en muchos sitios. Qué
  versión tienes se guarda o se deduce en **8** sitios; dónde está instalado, en
  **5**; con qué nombre se registra en Windows, en **5**; deshacer un cambio se
  hace con **4** mecanismos distintos; y «Iniciar con Windows» tiene **2**
  mecanismos que no se conocen entre sí (desinstalar deja uno de ellos colgado).
- **Riesgo concreto que hoy no se ve:** si falla algo cosmético (un acceso
  directo o el nombre en «Aplicaciones instaladas»), el Hub se cierra al
  arrancar. En un arranque normal, eso deja la app sin abrir; justo después de
  actualizar, devuelve a la versión anterior una versión que funcionaba.
- **Veredicto: rediseño acotado del motor, sin tocar el modelo ni tus datos.**
  Hay un momento bueno para hacerlo: `Vantare-Downloads` aún no tiene ninguna
  versión publicada y todas las instalaciones (la 0.0.975 pública y tus RC) van a
  pasar por el Setup una vez de todos modos.
- **La propuesta:** un lanzador pequeño y estable en la raíz (`Vantare.exe`) que
  solo hace tres cosas: elegir qué versión arrancar, arrancarla y volver a la
  anterior si no abre. Todo lo demás (instalar, actualizar, accesos, registro) pasa
  a Rust dentro de cada versión y llega por el actualizador. Los accesos
  directos apuntan siempre al mismo `Vantare.exe` y ya no hay que reescribirlos
  en cada versión.
- **Resultado esperado:** PowerShell en cada arranque, de 2 a 0; motor de unas
  2.100 líneas de PowerShell a unas 1.700 de Rust probadas con `cargo nextest`;
  lectores del estado de instalación, de 5 a 1; mecanismos de deshacer, de 4 a 1;
  señales sueltas en la raíz, de 12 a 6; y ningún arreglo futuro que dependa de
  «la copia vieja de la raíz».
- **Antes de nada, un paso 0 de tests** que fija lo que hace hoy cada operación
  sobre siete tipos de instalación. Después, **cuatro arreglos pequeños** que
  pueden entrar en la reconstrucción de RC9 si quieres, y seis pasos más. Hay
  cinco decisiones tuyas (§4.7).

---

## 1. Cómo debería funcionar (una página)

**Dos piezas, dos ritmos.** Una pieza **estable** en la raíz, que casi nunca
cambia y solo instala el Setup. Una pieza **evolutiva** dentro de cada
generación, que llega por el feed. La estable no sabe actualizar; la evolutiva
nunca decide si ella misma ha arrancado bien.

| Pieza | Dónde | Quién la cambia | Decide |
|---|---|---|---|
| Lanzador raíz | `<raíz>/Vantare.exe` (Rust, sin GPUI) | Solo Setup | Bloqueo de sesión, qué generación arrancar, plazo de confirmación y **rollback automático** |
| Motor | biblioteca `installer::engine`, compilada en `vantare.exe` de cada generación y en Setup/Uninstall | Feed o Setup | Verificar paquete, preparar, activar, reparar, desinstalar, integración con Windows |
| Sesión | `generations/<id>/bin/vantare.exe --session` | Feed o Setup | Arrancar supervisor y Hub con sus rutas de datos, comprobar el feed cada 6 h y aplicar al cerrar |

**Estados de una instalación** (una sola función los deduce del disco; un solo
escritor los cambia):

| Estado | En disco | Qué ve el usuario | Sale por |
|---|---|---|---|
| `Ausente` | sin raíz reconocida | Setup ofrece Instalar | Install |
| `Instalada{activa, anterior?}` | `state.json` | Vantare normal | Check, Setup, Uninstall |
| `Preparada{activa, anterior?, oferta}` | + `staging/pending.json` (sobre firmado) | «Actualización lista, se aplicará al reiniciar» | Apply al cerrar el Hub fuera de carrera |
| `Probando{nueva, anterior, plazo}` | + `boot-pending.json` | Arranque normal | `hub-ready` → `Instalada`; caída o plazo → rollback → `Instalada` con aviso «se restauró la anterior» |
| `Desinstalada{datos_conservados}` | `retained-data.json`, sin `state.json` | Setup ofrece Instalar y adopta los datos | Install |
| `Dañada{motivo}` | se **deduce**, no se escribe | Setup ofrece Reparar; nada se borra | Repair (Setup de la misma versión) |

Las operaciones (`Install`, `Update`, `Repair`, `Apply`, `Rollback`,
`Uninstall`) son transitorias y van bajo **un** bloqueo. No hay estado
«Operando» persistido: una interrupción deja el estado anterior o el siguiente,
nunca uno intermedio.

**Fuente de verdad de la versión.** Ya existe y es buena: `state.json.active`
apunta a una generación y al SHA-256 de su `manifest.json`, y el manifiesto
contiene la versión. **Una sola función la lee** (`Installation::read`). El
resto son proyecciones o datos de otra naturaleza:

| Vista | Naturaleza | Regla |
|---|---|---|
| `state.json.active` → `manifest.json.version` | **Verdad** | Única fuente de «qué está instalado» |
| `VANTARE_VERSION` del binario | Identidad del proceso | Debe coincidir con la verdad al arrancar desde la activa; si no, diagnóstico (nunca decide) |
| `DisplayVersion` del registro | Proyección | La escribe solo `shell::sync(estado)` |
| Feed firmado | Oferta | Solo dice qué hay disponible |
| `update-status.json` | Último resultado para el Hub | No decide nada |

**Setup frente al actualizador.** Son el mismo motor con la misma transición.
Solo cambian dos cosas: de dónde sale el paquete (embebido en el Setup, con su
SHA compilado; o del feed, con sobre Ed25519 → SHA del ZIP) y que el Setup,
además, instala o renueva el lanzador raíz y ofrece Reparar y Desinstalar. El
actualizador nunca toca la raíz salvo `state.json` y `staging/`.

**Rollback.** Solo hay uno: intercambiar `active` y `previous` en `state.json`
(binarios **y** datos de esa generación juntos). Automático únicamente desde
`Probando`, y lo decide el lanzador raíz. Manual, solo como operación de
soporte. La integración con Windows (registro, Inicio, Escritorio, Startup) es
una **proyección idempotente** del estado: tras cualquier cambio se vuelve a
sincronizar desde el estado resultante. Así no hacen falta copias de bytes para
deshacerla.

**Desinstalación.** Un único camino (`Uninstall.exe` → motor): exige la
instalación parada, retira binarios de todas las generaciones e integración con
Windows (incluida la clave Run), conserva todas las carpetas `data/` y deja
`Desinstalada{generación activa}`.

**Datos que nunca se tocan:** `generations/*/data/**` de cualquier generación
(el motor solo escribe en la `data/` de una generación nueva, nunca en una
existente), `%LOCALAPPDATA%/Vantare/native` (fuera de la instalación) y datos
Wails. Ninguna operación los borra. Una limpieza futura de datos antiguos sería
una acción explícita del usuario (decisión §4.7).

**Compatibilidad entre generaciones.** Todos los procesos de un arranque salen
de `bin/` de la **misma** generación, así que services v19, control v7 y fotos
v11 no necesitan compatibilidad cruzada. Una mezcla solo puede ocurrir si
sobrevive un proceso de otra generación: el motor exige la instalación parada
(guarda de binarios) y el supervisor es de instancia única. Los datos tampoco
necesitan migración hacia atrás: el rollback usa la copia de datos de la
generación anterior. El contrato entre la raíz y una generación es explícito y
versionado (`manifest.engine`), no un comentario en la primera línea de un
script.

---

## 2. Cómo funciona hoy

### 2.1 Cadena de arranque real

1. Acceso de Inicio/Escritorio/Startup → `generations/<activa>/bin/vantare.exe
   --beta -Root <raíz>` (`native/packaging/candidate.ps1:640-657`).
2. Ese `vantare.exe` lee la primera línea del `beta.ps1` **raíz** para saber si
   puede mostrar el indicador (`native/runtime/src/bin/vantare/beta.rs:52-71`) y
   lanza **PowerShell 5.1** con ese script (`beta.rs:165-185`).
3. `beta.ps1` raíz (`Run-BetaHub`, `native/packaging/beta.ps1:527-561`) carga por
   dot-source el `candidate.ps1` **raíz** (`beta.ps1:15`), aplica una
   actualización pendiente (`:532`), arranca supervisor y Hub fijando seis rutas
   de datos (`Start-BetaHub`, `:427-448`) y espera `hub-ready` 45 s
   (`Confirm-BetaBoot`, `:483-525`).
4. El Hub lanza **otro PowerShell** con el `candidate.ps1` **de su generación**
   (`-Operation Register`, `native/hub/src/installation.rs:39-63`). Register
   reescribe registro y accesos (`candidate.ps1:1247-1258`) y solo si termina
   bien el Hub escribe `hub-ready` (`installation.rs:105`).
5. Al cerrar, el Hub escribe `hub-exit` = `idle|live` (`native/hub/src/shell.rs:236-250`);
   `beta.ps1` para el supervisor con `vantare --parar` y 10 s por proceso
   (`beta.ps1:450-461`) y vuelve a intentar Apply (`:558`).

Lecturas completas con hash de los 109 archivos en un arranque normal: al
menos cuatro (`beta.ps1:428`, `candidate.ps1:1251`, `beta.ps1:158` y `:161`).
#1748 midió 2,2 s por `Read-NativeState` y 2,7 s por PowerShell vacío.

### 2.2 Quién decide cada cosa

**A. Estado de la instalación: 5 lectores, 1 escritor (y medio)**

| # | Sitio | Qué hace |
|---|---|---|
| 1 | `candidate.ps1:932-954` `Read-NativeState` | Lector «oficial»: valida activa con hashes y anula `previous` si está dañada (#1793) |
| 2 | `candidate.ps1:557-571` `Get-NativeLaunchTarget` | Segundo parser de `state.json` para los accesos |
| 3 | `beta.ps1:572-576` `Uninstall-Beta` | Tercer parser, estructural, para desinstalar a medias |
| 4 | `native/packaging/installer-driver.ps1:35-46` | Cuarto parser (desinstalación) y lectura del manifiesto (instalación) |
| 5 | `native/hub/src/settings/updates.rs:24-34`, `:122` | Quinto parser en Rust, con `deny_unknown_fields` |
| W | `candidate.ps1:956-965` `Set-NativeState` | Escritor atómico único… |
| W' | `beta.ps1:395-401` | …salvo el rollback de Setup, que reescribe los **bytes** antiguos de `state.json` sin pasar por él |

**B. Versión instalada: 8 sitios la guardan o la deducen**

- Verdad real: `manifest.json` de la activa, leído en `beta.ps1:161`, `:287`,
  `:352`, `:491`, `:519` e `installer-driver.ps1:43-44`.
- Copias: `DisplayVersion` del registro, escrito en **tres** sitios
  (`installer-driver.ps1:106` con la versión del Setup antes de confirmar,
  `candidate.ps1:774`/`:848` desde Register y `beta.ps1:479` al confirmar o
  restaurar) y **leído** como verdad al desinstalar (`installer-driver.ps1:40`);
  `update-status.json.version` (`beta.ps1:135-137`); `boot-pending.json.version`
  (`:315`); `retained-data.json.version` (`:583`); `VANTARE_VERSION` embebido
  (`native/ipc/src/product.rs:3-10`); y la constante del Setup
  (`native/installer/src/engine.rs:48`).
- Validadores de versión con reglas distintas: `candidate.ps1:467` (3–4 partes
  y sufijo), `:1159`, `beta.ps1:21` (3 partes ≤ 65535),
  `native/installer/src/model.rs:48` (u16 sin ceros a la izquierda) y
  `updates.rs` `valid_version` (con sufijo). Cinco reglas para el mismo dato.

**C. Dónde está instalado (5)**

`installer-driver.ps1:17-27` (registro > `/D` > por defecto > carpeta antigua
`Vantare Native Beta`); valor por defecto de `beta.ps1:6`
(`%LOCALAPPDATA%/Programs/Vantare`, **la instalación real**); `candidate.ps1:6`
(`$PSScriptRoot`); `VANTARE_BETA_ROOT` heredado (`beta.ps1:430`), que leen
`installation.rs:290`, `updates.rs:303` y `settings/windows.rs:132`; y los
argumentos `-Root` de cada acceso.

**D. Identidad de registro (5)**

`installer-driver.ps1:12-14` (QA por petición), `candidate.ps1:756-779`
(fichero `registration-identity.txt`), `:866-887` (con parámetros
`KnownIdentity`/`KnownFolder`), `beta.ps1:470-475` y `installation.rs:298-317`
(identidad del Hub para Run y avisos). La identidad QA (`VantareNativeBetaQA1492`)
y su prefijo de ruta `C:/tmp/ola2/1591-qa/` están dentro del producto
(`installer-driver.ps1:12-14`, `:29`).

**E. Deshacer (4 mecanismos)**

1. Rollback de generación automático (`beta.ps1:503-523`).
2. Rollback manual (`candidate.ps1:1068-1082`, con re-sincronizado parcial de
   Startup, `:1079`).
3. Restauración por bytes de 11 ficheros de metadatos y retirada de generaciones
   nuevas si Setup falla (`beta.ps1:333`, `:390-421`).
4. Transacción del registro y de los `.lnk` con copia de bytes
   (`candidate.ps1:715-749`).

**F. Modo de Setup (3)**

La UI decide Install/Update/Repair (`model.rs:64-80`); el driver vuelve a
comprobar Repair (`installer-driver.ps1:84`); `Install-Beta` decide de nuevo
bajar de versión y reparar (`beta.ps1:353-355`). Y «qué es `previous` al
reparar» se calcula dos veces con código copiado (`beta.ps1:311-314` y
`candidate.ps1:1046-1049`).

**G. Inventario (3 listas)**

Lista actual de binarios y 85 fixtures escrita a mano (`candidate.ps1:126-235`),
lista congelada de 91 miembros para 974–979 (`:240-344`) y la lista real del
`manifest.json` firmado. Las dos primeras no añaden autenticidad: el manifiesto
ya está atado al SHA del ZIP, que firma el feed o compila el Setup.

**H. Inicio con Windows (2, que no se conocen)**

- Setup: acceso `Startup/Vantare.lnk` → supervisor GUI con `--background`, según
  `installer-ui.json` (`candidate.ps1:671-711`).
- Hub, Ajustes › General: clave `HKCU\…\Run\VantareNative.Hub` →
  `powershell.exe … beta.ps1` **directo**, sin el bootstrap GUI ni `--background`
  (`native/hub/src/settings/windows.rs:126-168`), guardado en `general.json`
  dentro de la generación.
- Ningún script de `packaging/` ni del Setup toca la clave Run (búsqueda en
  `packaging/*.ps1` e `installer/src`). Por lectura: desinstalar deja esa clave
  apuntando a un `beta.ps1` ya borrado, y un rollback restaura un `general.json`
  que puede no coincidir con la clave. No se ha ejecutado.

**I. Plazos (7 relojes)**

45 s de confirmación (`beta.ps1:483`), 30 s de Register + 10 s de acuse
(`installation.rs:82`, `:107`), 10 s y 47 s del indicador (`beta.ps1:208-209`),
10 s por proceso al parar (`:455`, `:458`), 3 s para matar el Hub sin confirmar
(`:509`), 3 s por hijo en el supervisor (`native/runtime/src/bin/vantare/main.rs:53`,
`:419-436`) y 6 h de comprobación del feed (`beta.ps1:548`).

**J. Rutas de datos**

`Start-BetaHub` fija seis rutas (`beta.ps1:430-445`). Cada binario tiene además
su propio respaldo a `%LOCALAPPDATA%` si falta la variable
(`native/runtime/src/rights/mod.rs:55-60`, `main.rs:488`,
`native/services/src/app.rs:3055`, `native/ipc/src/freshness.rs:56`,
`services/src/diagnostics.rs:188`, `ipc/src/engineer_control.rs:192`). Tres tests
de Rust **leen el texto de `beta.ps1`** para no desincronizarse
(`native/hub/src/main.rs:688-720`, `ipc/src/product.rs:28-37`, `beta.rs` tests).

### 2.3 Estado repartido en ficheros sueltos

En la raíz hay 12 señales con significado de estado, además de 2 bloqueos
(`.operation.lock`, `beta-session.lock`), la guarda de binarios y el mutex del
supervisor: `.vantare-native`, `state.json`, `staging/pending.json`,
`update-status.json`, `boot-pending.json`, `hub-ready`, `hub-exit`,
`restart-request`, `retained-data.json`, `installer-ui.json`,
`installer-cleanup.json` y `registration-identity.txt`. El estado
«`Preparada`/`Probando`/`Desinstalada`» existe, pero solo como combinación de
presencias. Cada función lo reconstruye a su manera.

### 2.4 Contradicciones y casos escondidos

1. **Lo cosmético bloquea el arranque.** Si Register falla o tarda más de 30 s,
   el Hub sale con error (`shell.rs:1755-1768`) y no escribe `hub-ready`. En un
   arranque normal, `Run-BetaHub` lo reintenta una vez y aborta
   (`beta.ps1:539-543`): la app no abre. Tras una actualización, se restaura la
   anterior (`:511-523`). Register lanza excepción, por ejemplo, si un acceso
   existente «pertenece a otra instalación» (`candidate.ps1:811`) o si Windows
   no da la carpeta Programs (`:665-669`). Solo el fallo de AUMID se tolera (#1754).
2. **La copia raíz congelada manda.** Solo `Install` copia el `candidate.ps1`
   raíz (`candidate.ps1:978-979`) y solo el Setup lo renueva (`beta.ps1:386-387`);
   `Update` nunca lo sustituye (README `packaging`: «bootstrap schema 1 queda
   fijo»). El feed valida un paquete nuevo con la lista de
   inventario de la copia **vieja** (`Expand-NativePackage`, `:506-507`). Por eso
   un recurso nuevo rompe la actualización (#1795, abierta). Igual con el
   indicador (`# vantare-boot-capabilities`, `beta.ps1:1`, `beta.rs:52-71`) y con
   `--background` (`# vantare-launch-capabilities`, `candidate.ps1:1`,
   `:624-638`, `:699-703`): cada novedad del arranque necesita una marca en la
   primera línea y un camino «sin marca».
3. **Register de una generación antigua reescribe la integración nueva.** El
   installer README lo acepta como limitación («rollback a una generación anterior
   al instalador GPUI»), #1753 sigue abierta para accesos y Startup se parchea
   aparte en `Restore-NativeCandidate` (`candidate.ps1:1079`).
4. **Setup público no puede apuntarse a otra carpeta** si hay una instalación
   registrada: el registro gana a `/D` (`installer-driver.ps1:22`). Para aislar
   hace falta otra build (`-TestInstaller`) con identidad y prefijo QA
   **compilados en el producto** (`:12-14`, `:29`). Por eso la QA nunca prueba
   los bytes distribuidos en una raíz aislada («`distributed_setup_tested_here`:
   false» en `qa-upgrade.ps1`).
5. **Tres desinstaladores:** `Uninstall.exe` → driver → `Uninstall-Beta` +
   `Uninstall-NativeRegistration`; la copia `uninstall-vantare.ps1` →
   `UninstallInstalled`, que a su vez lanza `beta.ps1` en otro proceso
   (`candidate.ps1:890-893`); y el NSIS antiguo con `_?=`. El orden y la
   reentrada dependen de si `state.json` ya se borró.
6. **El script que se instala en casa del usuario también compila.** `Build`
   (cargo, dumpbin, CRT estático, `--version`) vive en el mismo `candidate.ps1`
   que viaja en cada generación (`:1152-1242`). Tres de los 13 arreglos eran de
   compilación (#1688, #1692, #1694) y cambiaron los bytes del motor instalado.
7. **Operaciones muertas en el producto.** `ImportProfiles`, `ImportLayout`
   (migración Wails, retirada por #1533) y `Start` solo las usan `tests.ps1` y el
   README (`candidate.ps1:1084-1150`, `:1272-1296`). Los canales
   `nightly/testers/master` del motor instalado no los usa ninguna instalación:
   Register exige `beta` (`:1252`).
8. **Sin retención de generaciones.** No hay purga (README `packaging`
   «Las generaciones se conservan»): cada actualización suma binarios y una copia
   completa de datos. La copia previa de RC9 ya ocupaba 1.350.913.466 bytes
   (share/rc9/INFORME.md). Encaja mal con el problema de disco ya conocido.
9. **Lo que más se rompe no está en CI.** El gate Windows ejecuta 6 suites de
   packaging (`.github/workflows/branch-channel-gates.yml:320-337`). Las
   campañas de actualización, rollback y feed (`beta-tests.ps1`, `tests.ps1`,
   `installer-qa.ps1`, `remote-feed-tests.ps1`, `bootstrap-*`) necesitan
   binarios compilados y se repiten a mano en cada RC.

### 2.5 Por qué `candidate.ps1` y `beta.ps1` acumulan arreglos

Clasificación de los 13 commits `fix` de `candidate.ps1` desde el 1-sep
(`git log origin/nightly --since=2026-09-01 -- native/packaging/candidate.ps1`):

| Causa | Commits | Qué la produce |
|---|---|---|
| Convivir con copias o generaciones antiguas | #1794, #1720, #1758, #1752, #1756 | Raíz congelada, inventario escrito a mano, accesos de formas anteriores |
| Fontanería de PowerShell como host de procesos | #1741, #1743, #1729 | stdout/stderr de EXE GUI, consola, streams cerrados |
| Compilación dentro del script instalado | #1689, #1693, #1696 | `Build` en el mismo fichero |
| Transacciones de registro/accesos/rollback | #1691, #1699 | Cuatro mecanismos de deshacer |

`beta.ps1` comparte 6 de sus 7 arreglos con esos mismos commits. El recorrido
suma 14 `fix` de 21 commits. Casi ninguno es un fallo de la idea
(generaciones + estado atómico + feed firmado). Son fallos de **estructura**:
dos copias del motor, PowerShell como lenguaje de producto y varias piezas que
toman la misma decisión. Cada parche añade otra marca, otra lista u otro
fichero de estado.

### 2.6 El incidente de QA de RC9 y su clase de riesgo

Causa (INCIDENTE.md): el arnés definía `$root` y luego hacía dot-source de
`beta.ps1`. En PowerShell las variables no distinguen mayúsculas y el bloque
`param` de un script cargado así se ejecuta en el ámbito del llamador: el valor
por defecto `Root = %LOCALAPPDATA%/Programs/Vantare` (`beta.ps1:6`) sustituyó la
raíz QA por la real. Después, el Setup **público** actualizó esa raíz con lo que
había sembrado la prueba.

No es solo un error del arnés. El diseño lo hace fácil por tres razones:

1. Los scripts del producto se usan también como biblioteca (dot-source) desde
   pruebas, desde el driver (`installer-driver.ps1:7`) y desde el kit de
   publicación (`share/rc9/publicar.ps1:7`, `feed-check.ps1:4`). El kit de RC9
   tiene hoy el mismo patrón latente.
2. El valor por defecto apunta a la instalación real del usuario.
3. El Setup público no puede apuntarse a una raíz aislada (§2.4.4) y la QA
   tiene que fabricar raíces a mano con funciones internas.

La mitigación actual (`guard-qa.ps1`, `guard-real.ps1`) vive en el kit, fuera del
producto, y hay que acordarse de usarla.

### 2.7 Lo que está bien (y se conserva)

- Generación inmutable + copia de datos verificada antes y después
  (`candidate.ps1:1016-1038`), `state.json` con `File.Replace` atómico
  (`:956-965`) y referencia por SHA del manifiesto (`:924-930`).
- Cadena de confianza: Setup con SHA compilado (`installer/src/engine.rs:49`);
  feed con sobre Ed25519 verificado por `vantare-services.exe` **de la generación
  instalada**, con la clave pública embebida (`beta.ps1:27-38`,
  `services/src/update_manifest.rs`), comprobado al preparar y otra vez al aplicar.
- Defensa del ZIP: tamaño, miembros exactos, sin enlaces ni `.env*`, sin
  reparse points (`candidate.ps1:356-388`, `:493-528`).
- No se mata la app: guarda de binarios con `FileShare.None` (`:999-1014`); si
  algo sigue abierto, la actualización espera.
- Errores tipados 0–5 compartidos por UI y `/S` (`installer/src/model.rs:82-101`).
- Pruebas que matan procesos reales en fronteras con eventos, sin sleeps
  (`Invoke-NativeCheckpoint`).
- Setup GPUI: UI, progreso real y cancelación antes de la transacción. Ese crate
  está bien; el problema empieza en lo que ejecuta por debajo.

---

## 3. Veredicto: **rediseñar la estructura del motor, conservar el modelo**

No es un rehacer desde cero: se conservan el modelo de generaciones, el formato
de `state.json` v1, los manifiestos, el feed y su firma, los datos y el Setup
GPUI. Lo que cambia es **dónde vive y en qué lenguaje** el motor.

Consolidar en PowerShell no basta, por un motivo estructural: mientras la raíz
guarde una copia del motor que solo cambia con Setup, cada mejora tiene que
convivir con todas las copias anteriores. Unificar funciones dentro de
`candidate.ps1` no lo arregla, porque la copia congelada seguiría mandando.

Frente a los dos criterios:

1. **Encaja con el resto de la app.** Hoy no: es el único recorrido de producto
   cuya lógica principal está en PowerShell. Su contrato con Rust se mantiene con
   tests que leen el texto del script (§2.2.J), sus errores se comparan como
   texto y sus plazos son relojes de pared sin inyectar. ADR 0099 pide Rust
   concreto, `Result`, un propietario del arranque y del cierre y un actualizador
   «temporal, fuera de carrera». #1748 ya apuntaba a sacar PowerShell del
   arranque normal.
2. **Sencillo de mantener por agentes.** Hoy no: 5 lectores del estado, 8 sitios
   con la versión, 5 con la identidad, 4 formas de deshacer, 2 de inicio
   automático, 12 señales sueltas, 7 relojes y dos copias del motor con
   marcadores de capacidad. Un agente que arregla un caso no puede saber qué
   copia lo ejecutará en casa del usuario. Los 14 arreglos de 21 commits son la
   prueba.

**Por qué ahora.** `Vantare-Downloads` tiene 0 releases. La 0.0.975 pública
apunta al feed antiguo y debe reinstalar con Setup de todos modos (#1565), y las
RC (980–988) son privadas. El próximo Setup público será el punto de migración
para todas las instalaciones existentes. Cambiar la raíz más adelante costaría
otra reinstalación para todos. Con unas 3 instalaciones (README `packaging`)
no es dramático, pero sí es el momento más barato.

**Lo que no recomiendo:** parar la publicación de RC9 por esto. El motor actual
funciona y está verificado en la máquina real; los pasos 0–1 pueden entrar en la
reconstrucción si el orquestador lo quiere, y el resto en el corte siguiente.

---

## 4. Propuesta

### 4.1 Estructura objetivo: quién decide qué

| Decisión | Pieza única | Sustituye a |
|---|---|---|
| Leer el estado (enum `State`, versión activa, `previous` restaurable, daño) | `installer::engine::Installation::read(raíz)` | Los 5 lectores de §2.2.A |
| Escribir `state.json` | `engine::commit(estado)` (replace atómico) | `Set-NativeState` y la restauración por bytes |
| Verificar paquete (SHA externo → ZIP → `manifest.files` exacto, rutas cerradas) | `engine::package` | `Expand-NativePackage` + las 3 listas de inventario |
| Instalar / actualizar / reparar / desinstalar | `engine::{install, update, repair, uninstall}`, llamado en el mismo proceso por Setup/Uninstall y por la sesión | Driver + `Install-Beta` + `Update-NativeCandidate` + `Uninstall-*` |
| Arrancar, confirmar y **rollback automático** | Lanzador raíz `Vantare.exe` | `Run-BetaHub`, `Confirm-BetaBoot`, `beta.rs`, `Complete-BetaBootstrap` |
| Arrancar supervisor y Hub con rutas de datos; feed cada 6 h; Apply al cerrar | `vantare.exe --session` de la generación | `Start-BetaHub`, `Stage-BetaUpdate`, `Apply-BetaUpdate` |
| Integración con Windows (registro, Inicio, Escritorio, Startup, AUMID, formas antiguas) | `engine::shell::sync(&State, &Options)`, idempotente, **fuera** del camino de confirmación | Register del Hub, `Sync-NativeRegistration`, transacción de bytes, `Sync-BetaRegistration` |
| Identidad y carpeta de accesos | `Options` (en `installer-ui.json`); QA como parámetro de la build TEST | Las 5 lecturas de §2.2.D |
| Inicio con Windows | `Options.autostart` + `shell::sync`; el Hub cambia la opción | Clave Run del Hub + acceso Startup |
| Parar la instalación antes de cambiarla | El supervisor, con **su** presupuesto de cierre; el motor espera a que salga el proceso y comprueba la guarda de binarios | `Stop-BetaRuntime` (10 s), kill del Hub a los 3 s |

Los accesos directos apuntan **siempre** a `<raíz>/Vantare.exe` (y
`--background` en Startup). El icono y el AUMID salen de ese EXE. El destino no
cambia con cada versión, así que no hay que reescribirlo en cada arranque.

Contrato raíz ↔ generación (lo único que el lanzador conoce):

```text
state.json schema 1 (sin cambios de formato)
boot-pending.json {schema:1, previous, version}       // como hoy
manifest.json  + "engine": 2                          // nuevo campo opcional
generación con engine ≥ 2: bin/vantare.exe --session -Root <raíz>
                            → escribe hub-ready <pid> // como hoy
generación sin engine (975–988): ruta heredada (§4.4)
```

Estados en código (nombres orientativos):

```text
enum State { Absent, Installed(Refs), Staged(Refs, Offer), Probing(Refs, Boot),
             Uninstalled(Retained), Damaged(Damage) }
enum Damage { StateUnreadable, ActiveMissing, ActiveCorrupt, Foreign }
struct Refs { active: Generation, previous: Option<Generation> }   // previous solo si íntegra
enum Outcome { Done, Busy /*2*/, Older /*3*/, PendingBoot /*4*/, Cancelled /*5*/, Failed(Reason) }
```

`Outcome` conserva los códigos 0–5 actuales: la UI del Setup no cambia.

### 4.2 Qué se elimina

1. **`candidate.ps1`, `beta.ps1` e `installer-driver.ps1` del producto**
   (2.082 líneas). Queda una copia **congelada y no mantenida** solo como
   ejecutor heredado (§4.4), que se borra sola cuando ninguna referencia de
   `state.json` es de motor 1.
2. **`Build`** sale del script instalado y pasa a una herramienta de build del
   repo (`packaging/build.ps1` o `tools/`), que nunca viaja en el paquete.
   `candidate.ps1` deja de ser miembro del inventario.
3. **Inventarios escritos a mano**: la lista de 85 fixtures y la congelada de 91
   (`candidate.ps1:144-344`). Manda `manifest.files`, validado contra reglas de
   ruta cerradas (#1795).
4. **Marcadores de capacidad** en primeras líneas
   (`# vantare-boot-capabilities`, `# vantare-launch-capabilities`) y sus caminos
   «sin marca»; el apretón de manos WM_APP+106 y las esperas de 10/47 s
   (`beta.ps1:208-277`). El lanzador raíz no está dentro de `generations/` y no
   bloquea las imágenes que hay que cambiar.
5. **Register en el arranque del Hub** (`installation.rs:9-127`): el Hub escribe
   `hub-ready` en cuanto abre; la sincronización con Windows va después y, si
   falla, solo deja un aviso.
6. **Señales sueltas**: `hub-exit` (el supervisor ya sabe si está en carrera),
   `restart-request` (código de salida de la sesión), `registration-identity.txt`
   (identidad en `Options`), `installer-cleanup.json` (autoborrado del
   desinstalador resuelto en el motor), `uninstall-vantare.ps1` y el `beta.ps1`
   raíz.
7. **Mecanismos de deshacer por bytes** (`beta.ps1:390-421`,
   `candidate.ps1:715-749`): pasan a «re-sincronizar desde el estado restaurado».
8. **Operaciones muertas**: `ImportProfiles`, `ImportLayout`, `Start`, canales
   no beta del motor instalado, ruta NSIS (`-LegacyNsis`, `beta-installer.nsi`),
   `_?=`.
9. **La clave Run del Hub** (`settings/windows.rs:126-168`).
10. **Respaldo a `%LOCALAPPDATA%` en producto instalado**: con
    `VANTARE_NATIVE_DATA_ROOT` siempre fijado por la sesión, el respaldo queda
    solo para desarrollo (y un proceso instalado sin la variable falla con un
    error explícito en lugar de escribir fuera de la generación).
11. **Tests de Rust que leen el texto de `beta.ps1`** (§2.2.J): la sesión es
    Rust y las rutas salen de una función compartida.

### 4.3 Contratos que cambian

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| `state.json` | **Ninguno** (schema 1, mismos campos) | Lo leen y escriben el motor nuevo y el heredado; mezclar es seguro |
| `boot-pending.json`, `staging/pending.json`, `retained-data.json`, `update-status.json`, `installer-ui.json` | Sin cambios de forma | Mismo motivo |
| `manifest.json` | Campo opcional `engine: 2` | El motor heredado de 975–988 rechazaría un paquete con inventario nuevo, que es el fallo seguro deseado: «reinstala con Setup» |
| Feed (tag, asset, sobre Ed25519, clave) | Sin cambios | Clientes 975 siguen en su repo antiguo; nada nuevo les llega por feed |
| Accesos | Destino `<raíz>/Vantare.exe` | El Setup migra una vez todas las formas conocidas (NSIS 975, RC3/RC4, GPUI) |
| Registro `VantareNativeBeta` | Misma clave; `UninstallString` → `Uninstall.exe` | Ya lo hace el Setup GPUI |
| Hub ↔ instalación | `hub-ready` sin Register; estado vía `Installation::read` | Los Hub de motor 1 siguen funcionando por la ruta heredada |
| Códigos 0–5 del Setup | Sin cambios | UI intacta |
| Protocolos services v19, control v7, fotos v11 | Sin cambios | Todos los procesos salen de la misma generación |

### 4.4 Compatibilidad con instalaciones existentes

| Origen | Qué pasa | Riesgo |
|---|---|---|
| **0.0.975 pública** (NSIS, raíz PS, feed antiguo) | Debe ejecutar el Setup nuevo (ya lo exigía #1565). El Setup lee `state.json` v1, valida la activa por su manifiesto (91 miembros), crea la generación nueva con copia de datos, instala `Vantare.exe` y migra accesos/registro. `previous` = la 975 | La 975 queda como destino de rollback de motor 1 |
| **RC 980–988** (Setup GPUI, privadas) | Igual, con `installer-ui.json` y opciones conservadas | Mismo |
| **Desinstalada con `retained-data.json`**, o sin él (copias idénticas) | El motor conserva la regla de hoy (`beta.ps1:358-377`) | Ninguno nuevo |
| **Rollback automático a una generación de motor 1** (la nueva no abre) | El lanzador cambia `active`/`previous` y arranca la de motor 1 por la **ruta heredada**: `generations/<v1>/bin/vantare.exe --beta -Root <raíz>` con el `beta.ps1`/`candidate.ps1` congelados que el Setup deja en la raíz solo mientras alguna referencia sea de motor 1. Su Register volverá a apuntar los accesos a esa generación; es la limitación que ya se acepta hoy, y funciona porque el `beta.ps1` congelado sigue ahí | Un caso explícito, con nombre (`LegacyRunner`), test propio y regla de retirada: desaparece cuando `active` y `previous` son de motor ≥ 2 (tras dos actualizaciones) |
| **Generación de motor 2 recibida por una raíz antigua** | No puede pasar por feed: Downloads no tiene releases para raíces antiguas y una raíz PS rechaza el inventario nuevo | Fallo seguro |
| **Datos** | Sin migración: cada generación conserva su `data/`; la nueva copia la de la activa como hoy | Ninguno nuevo |
| **Hub de motor 1 leyendo `state.json`** | Mismo formato; `deny_unknown_fields` sigue siendo válido porque no se añaden campos | Ninguno |

### 4.5 Plan por pasos (pequeños e integrables)

Cada paso es una issue `area:plataforma` con su PR a `nightly`. «Igual» se
demuestra con la matriz del paso 0, que se ejecuta contra el motor de cada
momento.

| # | Paso | Tipo | Cierra o absorbe | Demostración |
|---|---|---|---|---|
| 0 | **Matriz de caracterización de caja negra.** Siete raíces de partida (limpia; 975 NSIS real; 975 + 974 incompleta; RC GPUI con opciones; con `staging/pending.json`; con `boot-pending.json`; desinstalada con y sin `retained-data.json`) × operaciones (Probe, Install, Update, Repair, Check, Apply, confirmación correcta, plazo agotado, Rollback, Uninstall, Cleanup). La salida es una instantánea normalizada: ficheros de la raíz y sus hashes, `state.json`, valores de una clave de registro de prueba, destinos de los `.lnk` en carpetas de prueba e índices de todas las `data/`. Invariantes: los datos existentes nunca cambian y no hay escrituras fuera de la raíz ni de las carpetas de prueba. Registro, Programs y Startup se inyectan; ninguna ruta por defecto apunta a la instalación real | Solo tests | Base de todo; cubre en CI lo que hoy son campañas manuales (§2.4.9) | Pasa en nightly sin cambios de producto, en el gate Windows |
| 1a | **#1795**: inventario de la instalada leído de su `manifest.json`; se retira la lista congelada de 91 | Arreglo (alcance ya aprobado) | #1795 | Matriz + N→N+1 con inventario crecido |
| 1b | **Scripts sin raíz por defecto ni efectos al cargarse**: `-Root` obligatorio; modo biblioteca explícito; identidad y prefijo QA fuera del producto (los pasa la build TEST en la petición) | Seguridad | Clase del incidente RC9; `publicar.ps1`/`feed-check.ps1` dejan de poder heredar la raíz real | Test: dot-source sin `-Root` falla sin escribir; los mismos 5 rechazos de `guard-qa-tests.json` |
| 1c | **`hub-ready` antes de Register**; un fallo de Register queda como aviso en `update-status.json` | Cambio de comportamiento justificado | §2.4.1 | Matriz: Register que falla → la app abre y no hay rollback |
| 1d | **Desinstalar retira la clave Run**; el interruptor del Hub usa el acceso Startup del instalador | Arreglo | §2.2.H | Matriz: instalar → activar en el Hub → desinstalar → sin Run ni Startup |
| 2 | **ADR 0103** «Instalación nativa: raíz estable y motor por generación» (§4.9) | Documento | — | Revisión |
| 3 | **`installer::engine` de solo lectura** (sin GPUI): `Installation::read`, `Manifest`, `State`, versión. Lo usan Setup (Probe) y Ajustes del Hub en lugar de `updates.rs` y del driver | Refactor | 5 lectores → 1; 5 reglas de versión → 1 | Matriz de Probe idéntica; tests Rust con fixtures `fixtures/state-*.json` |
| 4 | **Motor de escritura en Rust para Setup/Uninstall**: install/update/repair/uninstall en el mismo proceso; el Setup deja de lanzar PowerShell | Refactor | Driver PS; 3 decisiones de modo → 1 | Matriz idéntica salvo los cambios ya acordados en 1c/1d. El feed sigue con PS: ambos escriben el mismo formato |
| 5 | **`engine::shell::sync`** idempotente (registro, Inicio, Escritorio, Startup, AUMID con `windows` 0.62 ya fijado en el lock; formas antiguas solo en la migración del Setup) | Refactor + simplificación | #1753, transacción por bytes, 3 escritores de `DisplayVersion` → 1 | Matriz de accesos/registro idéntica; `shortcut-branding-tests` pasan a Rust |
| 6 | **Lanzador raíz `Vantare.exe` + `vantare --session`**; accesos al lanzador; `LegacyRunner` para motor 1 | Cambio de arquitectura (ADR) | `beta.ps1` Run/Check/Apply/Confirm, `beta.rs`, apretón del indicador; parte de #1748 | Matriz completa; arranque, plazo agotado y rollback a 975 real con el lanzador; 0 PowerShell en arranque normal |
| 7 | **Retirar PowerShell del producto**: borrar scripts, operaciones muertas, NSIS, tests que leen texto; `Build` a herramienta de repo; README de `packaging` reescrito como contrato vigente | Eliminación | §4.2 | Inventario sin `.ps1`; gates verdes; matriz igual |
| 8 | **Retención de generaciones** (decisión §4.7): retirar binarios de generaciones no referenciadas; los datos se conservan | Cambio de comportamiento | §2.4.8 | Matriz: tras 3 actualizaciones solo hay binarios de `active`/`previous` y todas las `data/` intactas |
| 9 | *(Opcional)* La sesión puede renovar `Vantare.exe` raíz tras un arranque confirmado, conservando la copia anterior | Decisión §4.7 | Elimina «reinstalar Setup para cambiar el arranque» | Matriz + fallo simulado del lanzador nuevo |

Orden: 0 → 1a–1d (independientes; candidatos a la reconstrucción de RC9) → 2 → 3
→ 4 → 5 → 6 → 7 → 8. El 9 cuando convenga. Los pasos 3, 4, 5 y 7 no cambian
comportamiento. Los pasos 1c, 1d, 6 y 8 lo cambian a propósito, con su
justificación. Cada paso deja el producto publicable: 4 y 5 conviven con el feed
PS porque el formato en disco es el mismo.

Dependencias: el paso 4 añade dependencias directas del crate `installer` sobre
crates **ya fijados en `Cargo.lock`**: `zip` 6.0.0, `windows` 0.62 (Shell,
PropertiesSystem, COM; hoy entra por `vendor/gpui_windows`), `sha2`. No añaden
nada al lock, pero según AGENTS necesitan aprobación. El lanzador y la sesión no
añaden ninguna.

### 4.6 Cómo encaja #1816 (overlays matados a los 3 s)

- **La causa es del ciclo de vida (frente R2), no del instalador.** El
  supervisor pide cierre con `WM_CLOSE` a las ventanas del hijo y cerrando su
  stdin (`native/runtime/src/bin/vantare/win.rs:179-195`) y lo mata a los 3 s
  (`main.rs:53`, `:419-436`). Con overlays ocultos o sin ventana, la señal puede
  no llegar nunca. El arreglo es un contrato de cierre explícito
  supervisor → overlays. La parte «transferencia final sin confirmar»
  desaparece con el paso 8 de licencias ya integrado (`0a0060d4d`, retira
  `TransferRights`).
- **Qué cambia para este diseño:** hoy el instalador tiene sus propios relojes
  para parar (10 s por proceso en `beta.ps1:455-458`, 3 s para el Hub en `:509`).
  Si #1816 se arregla alargando el cierre limpio por encima de esos 10 s,
  algunas actualizaciones pasarían a quedar «pendientes» sin motivo. Por eso,
  regla del paso 6: **un solo presupuesto de cierre, el del supervisor.** La
  sesión pide parar y espera la salida del proceso; el motor solo comprueba
  después la guarda de binarios.
- **Orden recomendado:** #1816 en R2 antes o junto al paso 6, con un test
  compartido: «cerrar el Hub fuera de carrera → supervisor sale sin matar → Apply
  aplica en la misma sesión».

### 4.7 Decisiones que necesito de Isaac (u orquestador)

1. **¿Rediseño del motor (pasos 3–7) o solo los arreglos 0–1?** Recomiendo el
   rediseño, empezando después de publicar RC9. Si no se hace, los pasos 0 y 1
   reducen el riesgo, pero la clase «copia congelada» sigue viva.
2. **¿Los pasos 1a–1d entran en la reconstrucción de RC9?** Recomiendo 1a, 1b y
   1c sí (bajo riesgo, quitan fallos reales de la primera versión en Downloads);
   1d puede esperar.
3. **Retención de generaciones (paso 8):** recomiendo borrar automáticamente
   **solo binarios** de generaciones no referenciadas y no tocar nunca sus `data/`.
   Alternativa: no purgar nada (lo de hoy).
4. **Autoactualización del lanzador raíz (paso 9):** recomiendo **no** al
   principio: es un EXE pequeño y cambiarlo solo con Setup es sencillo y seguro.
   Reabrir si cambia más de una vez por trimestre.
5. **Retirar NSIS, MSIX experimental y operaciones Wails (`ImportLayout`)**:
   recomiendo retirarlos en el paso 7. MSIX puede quedarse como documento
   histórico si hay planes de Store.

### 4.8 Riesgos

- **Reescribir 2.000 líneas probadas en campañas reales.** Mitigación: la matriz
  del paso 0 se escribe y pasa **antes** contra el motor actual. Cada paso cambia
  una operación con el mismo formato en disco, y los motores pueden convivir.
- **Un fallo del lanzador raíz impide abrir Vantare.** Mitigación: pocas
  responsabilidades, sin red, sin GPUI, con tests de cada transición. Solo lo
  cambia el Setup, y Reparar siempre está disponible porque los datos nunca se
  tocan.
- **Ruta heredada a motor 1.** Es el único caso especial y tiene nombre, test y
  regla de retirada. Ensayarlo con la 975 real (`-LegacyPackage`, como ya hace
  `historical-inventory-tests.ps1`).
- **Accesos anclados por el usuario** a la ruta antigua de la generación: la
  migración del Setup reescribe los `.lnk` conocidos. Los anclajes de la barra de
  tareas pueden necesitar volver a anclarse una vez (avisar en las notas).
- **SmartScreen:** `Vantare.exe` lo instala el Setup y no tiene marca de
  descarga. No añade avisos nuevos; Setup y Uninstall siguen sin Authenticode,
  como ya se aceptó.
- **QA aislada:** el paso 1b saca la identidad QA del producto. La build TEST
  sigue siendo otra build; probar los bytes distribuidos en una raíz aislada
  requiere una cuenta o VM de pruebas (como ya dice el README del instalador).
- **Calendario:** no bloquear RC9. Los pasos 3–7 son de 1 a 3 días cada uno, con
  revisión; el 6 es el más delicado y conviene ensayarlo en una VM.

### 4.9 ADR

**Sí procede: ADR 0103.** Debe fijar:

- las dos piezas (raíz estable / motor por generación) y la frontera exacta;
- que `state.json` v1 es el formato estable;
- la fuente de verdad de la versión y la tabla de proyecciones;
- que la integración con Windows es una proyección idempotente y no forma parte
  de la confirmación de arranque;
- que solo el lanzador decide el rollback automático;
- que el cierre tiene un único presupuesto, el del supervisor;
- que PowerShell no forma parte del producto instalado salvo la ruta heredada,
  con su regla de retirada.

Sin ADR, el siguiente arreglo volverá a añadir una marca en la primera línea.

---

## 5. Simplificación esperada

| Medida | Antes (056ec9d94) | Después (estimado) |
|---|---|---|
| PowerShell lanzados en un arranque normal | 2 (`beta.rs:165`, `installation.rs:46`) | 0 |
| Lecturas completas con hash por arranque | ≥ 4 | 1 (la del lanzador o la sesión, al confirmar) |
| Motor de producto | 2.082 líneas PS (`candidate` 1.297 + `beta` 628 + driver 157) + ~800 de Rust que lo hospeda (`installer/src/engine.rs`, `hub/src/installation.rs`, `settings/updates.rs`, `runtime/src/bin/vantare/beta.rs`) | ~1.700 Rust (estado 300, paquete 250, operaciones 350, `shell` 350, lanzador 250, sesión 200) |
| Copias del motor que pueden ejecutarse | 2 (raíz congelada + generación) + 1 desinstalador PS | 1 (generación) + lanzador estable |
| Lectores de `state.json` | 5 | 1 |
| Escritores de `state.json` | 1 + restauración por bytes | 1 |
| Sitios que guardan o deducen la versión | 8 | 1 verdad + 2 proyecciones (registro, aviso) |
| Reglas de validación de versión | 5 | 1 |
| Decisiones de raíz / identidad | 5 / 5 | 1 / 1 |
| Mecanismos de deshacer | 4 | 1 (intercambio) + re-sincronizado idempotente |
| Mecanismos de inicio con Windows | 2 | 1 |
| Caminos de desinstalación | 3 | 1 |
| Listas de inventario | 3 | 1 (manifiesto) |
| Marcadores de capacidad en primera línea | 2 | 0 (campo `engine` en el manifiesto) |
| Señales de estado sueltas en la raíz | 12 | 6 (`.vantare-native`, `state.json`, `staging/pending.json`, `boot-pending.json`, `retained-data.json`, `installer-ui.json`) + `hub-ready` y `update-status.json` como canales |
| Relojes del recorrido | 7 | 3 (confirmación 45 s, cierre del supervisor, feed 6 h) |
| Tests Rust que leen texto de PowerShell | 3 | 0 |
| Tests de packaging | 4.140 líneas PS en ~30 suites; 6 en CI | ~1.200 Rust (nextest) + matriz de caja negra (~600) en CI |
| Legado | NSIS 156 + MSIX experimental 383 + operaciones Wails ~75 | 0 (o MSIX como documento) |
| README del recorrido | 623 + 127 líneas con secciones fechadas | ADR 0103 + README de contrato vigente (~200) |

Neto estimado: **unas 2.000–2.800 líneas menos** sumando producto, tests y
legado. Lo importante, como en licencias, es que **desaparecen casos**: «raíz
sin marca», «inventario de 974–979», «Register antiguo tras rollback», «Startup
congelado con flag», «limpieza huérfana del desinstalador», «Run sin acceso» y
«Hub cerrado por un acceso ajeno».

### Método de medición reproducible

```bash
S=056ec9d9487353a24b017c11eed287b57f3cf149
R=<raíz-git>
P=vantare-v2/native/packaging
# Líneas del motor PS y de sus tests
git -C $R show $S:$P/candidate.ps1 | wc -l        # 1297
git -C $R show $S:$P/beta.ps1 | wc -l             # 628
git -C $R show $S:$P/installer-driver.ps1 | wc -l # 157
git -C $R ls-tree --name-only $S $P/ | grep -E 'tests?\.ps1$|installer-(qa|interaction|visual)\.ps1|campaign' \
  | xargs -I{} sh -c "git -C $R show $S:{} | wc -l" | awk '{s+=$1} END {print s}'   # ≈4.100
# Lectores de state.json
git -C $R grep -n "state.json" $S -- $P/candidate.ps1 $P/beta.ps1 $P/installer-driver.ps1 \
  vantare-v2/native/hub/src/settings/updates.rs | grep -E "ReadAllText|read\("
# (+ Get-NativeLaunchTarget, candidate.ps1:558-561, que lee por variable)
# Escritores de DisplayVersion
git -C $R grep -n "DisplayVersion" $S -- $P/candidate.ps1 $P/beta.ps1 $P/installer-driver.ps1
# Identidad de registro
git -C $R grep -n "VantareNativeBeta" $S -- 'vantare-v2/native/*.ps1' 'vantare-v2/native/*.rs' \
  | grep -v tests
# Clave Run: solo el Hub la escribe; packaging no la toca (debe salir vacío)
git -C $R grep -n "CurrentVersion.Run" $S -- $P/ vantare-v2/native/installer/
# PowerShell lanzado desde Rust en el arranque
git -C $R grep -n "WindowsPowerShell/v1.0/powershell.exe" $S -- 'vantare-v2/native/*.rs'
# Arreglos del recorrido
git -C $R log $S --since=2026-09-01 --format='%h %s' -- $P vantare-v2/native/installer | grep -ci fix  # 14
git -C $R log $S --since=2026-09-01 --format='%h' -- $P vantare-v2/native/installer | wc -l           # 21
# Releases del feed nuevo (lectura anónima)
gh api repos/isaacalbala12/Vantare-Downloads/releases --jq length                                     # 0
```

Para el «después», las mismas órdenes sobre el SHA del paso 7 deben dar: 0
líneas de `.ps1` de producto en el inventario del paquete, 0 coincidencias de
`powershell.exe` en `native/**/*.rs` fuera de tests y herramientas, 1 lector
(`Installation::read`) y 1 escritor de `DisplayVersion` (`shell::sync`).

---

## Lo que este documento no acredita

- Lectura estática: no se ejecutó ningún test, Setup, campaña ni la app. Los
  efectos de §2.2.H (clave Run tras desinstalar) y §2.4.1 (Register que bloquea
  el arranque) se deducen del código citado; deben confirmarse en el paso 0.
- Las cifras «después» son estimaciones por bloques de responsabilidad, no un
  prototipo.
- No se revisó en detalle la UI del Setup (`installer/src/view.rs`,
  `screens/`), que se conserva.
- El análisis del cierre (#1816) se limita a lo que afecta al instalador; el
  contrato supervisor ↔ overlays es del frente R2.
- No se consultó ninguna instalación real; el estado «0 releases» del feed es
  del 1-nov-2026.
