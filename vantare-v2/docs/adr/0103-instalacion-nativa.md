# ADR 0103 — Instalación nativa: raíz estable y motor por generación

Fecha: 2026-11-01. Issue: [#1840](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1840), Plane VANTA-127.
Diseño: [Recorrido del instalador](../vantare-program/installer-design.md), §1, §2.2 y §4.1–4.9.

## Estado

**Aceptado por el orquestador**, con autoridad delegada por Isaac, el 2026-11-01
(decisiones registradas en #1840). Este es el paso 2, documental. Aceptar la
arquitectura no acredita su implementación, integración ni publicación.
Los pasos 0 y 1a–1d están integrados en la base `nightly@5cc23113a`;
los pasos 3–8 requieren sus propias entregas y PR a nightly.

## Contexto

ADR [0099](0099-arquitectura-rust-nativa.md) fija Rust, GPUI y un único dueño
del ciclo de vida, con actualizador temporal fuera de carrera. El modelo actual
de generaciones, activación atómica, manifiestos ligados por hash y feed
Ed25519 se conserva. La copia del motor PowerShell en la raíz solo cambia con
Setup, mientras otra copia llega con cada generación: esa duplicación obliga
a mantener capacidades y reglas divergentes en cada arranque.

ADR [0102](0102-modelo-acceso-nativo.md) conserva el acceso y sus contratos.
Los procesos de una sesión deben proceder de la misma generación: el cambio
de versión desplaza juntos binarios y copia de datos, sin exigir compatibilidad
cruzada entre services v19, control v7 o fotos v11.

## Decisión

### Dos piezas con responsabilidades cerradas

| Pieza | Ubicación y actualización | Responsabilidad |
| --- | --- | --- |
| Lanzador raíz `Vantare.exe`, Rust sin GPUI ni red | Raíz; solo Setup lo instala o renueva | Bloqueo de sesión, selección de generación, arranque, plazo de confirmación y decisión de rollback automático |
| Biblioteca `installer::engine`, sin GPUI | Cada generación y Setup/Uninstall; evoluciona por feed o Setup | Leer instalación, verificar paquetes, preparar, activar, reparar, desinstalar y sincronizar Windows |
| Sesión `vantare.exe --session` | `generations/<id>/bin/`, misma generación que sus hijos | Supervisor y Hub con rutas de datos explícitas, comprobación del feed cada seis horas y aplicación al cerrar fuera de carrera |

Setup y actualizador usan el mismo motor y transición. Cambia el origen del
paquete: ZIP embebido con SHA compilado o ZIP cuyo SHA procede del sobre
Ed25519. Setup además instala el lanzador y ofrece Reparar/Desinstalar.
No hay autoactualización del lanzador raíz; el paso 9 queda aparcado.

**Frontera histórica del paso 4, autorizada el 2-nov-2026:** el núcleo Rust
realiza estado, ZIP, generaciones y datos en el proceso de Setup/Uninstall.
No adelanta shell::sync ni porta la transacción Windows que retira el paso 5.
Conserva una llamada PowerShell por operación de finalización, marcada
`TODO(#1840 p5)`, mediante installer-shell.ps1:

| Operación | Entrada y condición previa | Salida y recuperación |
| --- | --- | --- |
| FinalizeInstall | Raíz ya activada, versión del manifiesto, opciones anteriores/nuevas, identidad y contexto Windows | Progreso JSON acotado; exit0 o error. La transacción existente restaura registro/accesos por bytes y Rust restaura estado/metadatos/generación si falla |
| FinalizeUninstall | Estado y binarios retirados por Rust; raíz/identidad/opciones verificadas. Rechaza state.json presente para impedir entrar al desinstalador PS | Mantiene propiedad de accesos, Run, registro, marker/hash y retirada de metadatos. El fallo queda visible y se puede reanudar |
| Cleanup | Padre de Uninstall, raíz y marker/hash; temporal exclusivo poseído | Conserva espera30s, bloqueo de sesión, rechazo de instalación renovada, borrado del EXE propio y temporal. No usa cmd ni un contrato nuevo de autoborrado |

Contrato de cada llamada: JSON máximo64KiB con operación, request, context y
previousUi; progreso JSON por stdout, diagnóstico por stderr y código de salida.
El código de salida decide el resultado. Líneas stdout que no sean progreso JSON
válido se conservan como diagnóstico en el log, sin revertir una salida0;
installer-shell dirige Write-Warning a stderr, incluidos fallos cosméticos.
En QA, context inyecta HKCU y carpetas bajo el guard antes de cargar la biblioteca.
No se exigen una llamada única total de Uninstall+Cleanup ni un nuevo ciclo de
vida. El paso5 cierra FinalizeInstall/FinalizeUninstall; la decisión posterior
conserva Cleanup permanentemente, como se detalla debajo. Feed y Register siguen en PS
hasta sus pasos previstos. Esto sustituye temporalmente la frase histórica
«Setup deja de lanzar PowerShell»; nunca autoriza el driver PS para el núcleo.
La consulta de objetivo para accesos y la persistencia de preferencias Windows
siguen dentro de esa transacción heredada hasta p5. Rust aporta opciones/contexto;
no obtiene de ella estado, versión instalada ni datos para decidir operaciones.

**Decisión permanente del paso5, 2-nov-2026:** Cleanup conserva un script mínimo
ejecutado por powershell.exe de Windows, fuera del árbol retirado. Espera al padre,
adquiere la exclusión de limpieza y valida raíz, temporal propio, marcador y SHA
del Uninstall antes de retirar exclusivamente ese EXE, el marcador y su temporal.
No interpreta ni escribe estado de instalación, registro, accesos o datos. Rust
decide si procede limpiar; tras esperar al padre, el script vuelve a comprobar
la presencia de state.json y el marcador/hash dentro del bloqueo de sesión para
rechazar una renovación concurrente (revisión 5a). Setup no reemplaza un
desinstalador pendiente bajo ese mismo bloqueo. Si una retirada heredada carece
de marcador, se conserva el EXE y se registra el residuo sin falsear su resultado.

El ensayo QA de FileDispositionInfoEx(DELETE|POSIX) falló con ACCESS_DENIED(5)
sobre una imagen propia sin ReadOnly en NTFS/Windows22631. No se ha medido NTSTATUS
ni acreditado el caso de otro Windows/volumen o IGNORE_READONLY. Se conserva como
diagnóstico manual, fuera de los gates: [evidencia p5](../../native/packaging/matrix/evidence-1840-p5.md).
Dejar el EXE raíz podría hacerlo permanente en un equipo que nunca reinstale;
una copia ejecutable temporal añade otro ciclo de vida y deja su propio residuo.
La excepción conserva la desinstalación limpia ya probada sin ninguno de esos dos
cambios. Es permanente, también después del paso7: no se promete cero PowerShell
durante la limpieza del desinstalador. No autoriza cmd ni técnicas de autoborrado.
FinalizeInstall y FinalizeUninstall pasan a shell::sync nativo: ante error se
restaura el estado lógico y se resincroniza Windows, sin copias de deshacer por bytes.
Es el único escritor Rust de esa proyección. El corte aceptado no adelanta
Feed/Register/SetStartup: sus escritores y mecanismos heredados continúan hasta
los pasos6–7, sin puente temporal. No se afirma convergencia global antes de retirarlos.

### Estado estable y versión instalada

`state.json` **schema 1** conserva campos y significado. `active` y `previous`
referencian una generación mediante identificador y SHA-256 de `manifest.json`.
No se añaden campos para describir operaciones transitorias. Un único motor
deduce el estado del disco y las escrituras van bajo un único bloqueo de operación;
una interrupción no activa una generación parcialmente preparada.

| Estado deducido | Evidencia |
| --- | --- |
| Ausente | Sin raíz reconocida |
| Instalada | `state.json` válido con activa y anterior opcional |
| Preparada | Instalada más `staging/pending.json` firmado |
| Probando | `boot-pending.json` con versión nueva y anterior; el lanzador fija el plazo de 45 s, sin añadir campos |
| Desinstalada con datos conservados | Sin `state.json`, con `retained-data.json` o datos de una desinstalación antigua sin marcador |
| Dañada | Validación fallida; se informa, nunca se escribe como estado persistente |

`Installation::read` reúne `State`, `Manifest` y versión instalada. La autoridad
es **`state.json.active` → manifiesto ligado por SHA → `manifest.version`**.

| Dato | Naturaleza y dueño |
| --- | --- |
| Versión del manifiesto de la activa | Única verdad de lo instalado |
| `VANTARE_VERSION` del binario | Identidad del proceso; una discrepancia se diagnostica, no selecciona generación |
| `DisplayVersion` | Proyección escrita por `engine::shell::sync` |
| Feed firmado | Oferta disponible, nunca prueba de instalación |
| `update-status.json` | Resultado del actualizador para presentación, nunca autoridad |

El orquestador autoriza el paso 3 acotado a las lecturas Rust de Setup (Probe)
y Ajustes del Hub, sin puente ni ejecutable nuevo. Los perfiles actuales de
validación se reúnen en un módulo común, sin ampliar ni restringir comportamiento.
La convergencia se mide sobre consumidores reales: **no se afirma 5 → 1 global
hasta el paso 7**. Los adaptadores PowerShell heredados se marcan en código.

| Lector/regla que permanece tras el paso 3 | Retirada prevista |
| --- | --- |
| Driver: lectura estructural de estado durante desinstalación interrumpida | Paso 4, escritura Setup/Uninstall en Rust |
| `Read-NativeState` y `Read-NativeManifest` de candidate: operaciones y feed heredados | Pasos 4–6 migran consumidores; paso 7 elimina scripts de producto |
| `Get-NativeLaunchTarget`: lectura para accesos | Paso 5, `shell::sync` |
| `Uninstall-Beta`: lectura para retirada parcial | Paso 4 migra Uninstall; paso 7 retira la ruta PowerShell heredada |
| Validación de versión en manifiesto/build de candidate | Paso 4 migra paquete; paso 7 deja Build en tooling y retira producto PS |
| `Read-BetaVersion`: comparación para feed/instalación | Paso 4 migra Setup; paso 6 migra sesión/feed; paso 7 retira producto PS |

Setup conserva descubrimiento de raíz/registro y opciones en el driver como
contexto; `Installation::read` reúne la lectura de estado/manifiesto en Rust.
El perfil del Hub sigue siendo informativo, sin conceder autoridad al paquete.
Probe conserva el perfil real: activa ligada al SHA del manifiesto sin rehash
de binarios, anterior con verificación completa. Desde el paso 4, Uninstall
interrumpido usa el manifiesto ligado si sobrevive o deja la versión ausente;
DisplayVersion ya no sustituye la versión del motor.

### Confirmación, integración con Windows y rollback

`engine::shell::sync(&State, &Options)` es una proyección idempotente: registro, Inicio,
Escritorio, Startup y AUMID se reconstruyen desde el estado resultante. Los
accesos nuevos apuntan al lanzador estable **a partir del paso 6**. El paso 5
conserva los destinos actuales, incluida la compatibilidad Startup de raíces
antiguas: nunca apunta a un lanzador aún no instalado. Options aporta identidad,
carpeta de accesos y preferencias desktop/autostart. Solo se modifican entradas propias;
los valores y enlaces ajenos se conservan. La preferencia Startup es única.

La integración con Windows queda fuera de la confirmación de arranque.
Compromiso del paso 1c: **`hub-ready` significa ventana creada y proceso vivo**,
antes de Register; no certifica login, mantenimiento ni salud prolongada.
Un fallo de registro produce aviso separado en `registration-status.json`,
sin cerrar el Hub ni contaminar `update-status.json`. Un fallo posterior a
readiness ya no dispara rollback de arranque: es el riesgo aceptado en #1840.

Solo el lanzador raíz decide el rollback automático desde Probando: confirma
en 45 segundos o restaura la anterior ante caída/plazo. El motor ejecuta el
intercambio de `active`/`previous`; binarios y datos cambian juntos. El rollback
manual es una operación explícita de soporte. Tras restaurar se sincroniza
Windows desde el estado restaurado; se retiran los mecanismos de deshacer
registro/accesos mediante copias de bytes al migrar esas operaciones.

### Cierre, datos y confianza

**Un solo presupuesto de cierre: el del supervisor**, conforme a #1816.
La sesión solicita parar y espera la salida del supervisor; no suma plazos
por hijo ni termina procesos por su cuenta. Después el motor comprueba la
guarda de binarios: con escritores vivos, Apply queda pendiente. El contrato
de cierre supervisor → overlays se resuelve en el frente de arranque/cierre;
el paso 6 prueba cierre fuera de carrera → salida limpia → Apply en la sesión.
Su entrega depende de resolver el contrato de #1816 antes o junto a ese paso.

Nunca se borran `generations/*/data/`, datos nativos externos ni datos Wails.
La nueva generación copia y verifica datos; no sobrescribe los de una existente.
Desinstalar exige instalación parada, retira binarios e integración propia,
incluida Run, y conserva la referencia a los datos activos. La retención del
paso 8 elimina automáticamente **solo binarios de generaciones no referenciadas**;
no borra sus `data/`. Borrar datos requeriría otra acción explícita del usuario.
Sin marcador de datos conservados, Setup adopta una copia única o copias
idénticas; con copias distintas rechaza la operación sin escoger arbitrariamente.
La sesión fija `VANTARE_NATIVE_DATA_ROOT`: un proceso instalado sin esa ruta
falla explícitamente, sin escribir por respaldo fuera de su generación. El
respaldo a LOCALAPPDATA queda solo para desarrollo al migrar la sesión.

Se conservan firma Ed25519, clave pública embebida, SHA autenticado del ZIP,
validación de inventario/hash, rutas cerradas y rechazo de enlaces/reparse
points y `.env*`. Se conservan miembros ZIP exactos y topes actuales de tamaño
comprimido, por miembro y total descomprimido; no se relajan al pasar a Rust.
Un paquete preparado se verifica de nuevo al aplicar. No se añade
red ni autoridad de actualización al lanzador.

### Compatibilidad y retirada de PowerShell

`boot-pending.json`, `staging/pending.json`, `retained-data.json`,
`update-status.json`, `registration-status.json`, `installer-ui.json` y
`startup-options.json` conservan su forma. El Hub escribe/lee el aviso de
registro separado; Setup/SetStartup escriben la preferencia y el Hub la lee,
con prioridad de installer-ui sobre startup-options. `manifest.json`
admite `engine: 2` opcional; ausencia significa motor 1. Se mantienen feed,
tag, asset, sobre y códigos 0–5 del Setup. Un valor de engine desconocido exige
rechazo explícito, sin presuponer compatibilidad futura. Un motor antiguo debe rechazar de
forma segura un paquete que no pueda validar y pedir reinstalar con Setup.

La 0.0.975 pública y las RC 980–988 pasan una vez por Setup: se lee state v1,
se conserva la anterior y sus datos, y se migran las formas conocidas de
registro/accesos. El lanzador nuevo solo ejecuta motor 2; una primera versión
que no arranca ofrece Reparar sin activar motor 1. La validación de ambas
raíces reales mediante los bytes distribuidos del Setup es gate de publicación,
según la enmienda del paso 6 más abajo.

El paso 7 retira PowerShell del producto nuevo, salvo Cleanup permanente,
NSIS y operaciones Wails, incluidas ImportProfiles,
ImportLayout y Start. Retira canales muertos, `_?=` y tests que leen scripts;
reescribe README de packaging como contrato vigente. Build queda en tooling. MSIX
se conserva como documento histórico, sin ruta de distribución activa.

## Decisiones de #1840 y secuencia de entrega

Se aprueba el rediseño completo tras 0–1: 2 ADR y diseño versionado; 3 lector
Rust; 4 install/update/repair/uninstall de Setup, incluido descubrimiento/opciones
para que Setup deje de lanzar PS; 5 shell; 6 lanzador/sesión; 7 retirada PS;
8 retención. RC9 0.0.988 se publica tal como fue probada; 1a–1d corresponden
a la siguiente candidata. Este ADR no publica ni reconstruye RC9.

Para el **paso 4** están aprobadas dependencias directas de installer sobre
`zip 6.0.0`, `windows 0.62` y `sha2`, ya fijadas en Cargo.lock. El orquestador
autoriza adelantar **solo sha2 al paso 3**, en su versión ya fijada, para
preservar el vínculo SHA del manifiesto y las validaciones de
Probe. zip y windows siguen en el paso 4. No se incorporan dependencias en
este paso documental ni se autorizan otras versiones.
Se permite actualizar únicamente las listas de dependencias de installer y Hub
en Cargo.lock al conectar el lector: ningún paquete, versión o checksum nuevo.

## Enmienda aprobada: poda 5b antes del paso 6

El replanteo del 2-nov-2026 simplifica lo ya escrito: dos fases Rust,
read (manifiesto ligado por SHA, sin rehash de binarios) y verify
(verificación de binarios), un único contrato de versión y lectura por operación.
El estado y los manifiestos leídos se pasan a las operaciones y a shell::sync;
no se vuelven a abrir para reconstruir una verdad ya validada en esa operación.
El inventario autorizado del ZIP procede de su manifiesto, autenticado por el
SHA externo, con miembros exactos, rutas seguras y límites; no de un catálogo
manual de91/109/111 nombres. Se conserva el rechazo de duplicados ZIP crudos.

La identidad de producto también se usa en QA, siempre dentro del Context con
HKCU y carpetas inyectados y guard activo. Se retira la identidad QA paralela.
Se centralizan el marcador de limpieza y la frontera Windows. Cleanup mantiene
su comprobación independiente al ejecutarse fuera del proceso y después del
padre: sigue siendo la excepción permanente anterior, no un nuevo perfil Rust.
`batch.rs`, que nunca se distribuyó, pasa a tooling; su reclasificación se informa
separada de las líneas borradas. Se elimina installer-driver.ps1 sin introducir
puentes ni migrar Feed/Register/SetStartup antes de sus pasos previstos.

La matriz pasa de igualdad de bytes con PowerShell a invariantes: datos existentes
y carpetas vacías intactos; escrituras solo en raíz/HKCU/carpetas inyectados;
estado coherente con generaciones completas; paquete autenticado y acotado;
rutas sin escapes, enlaces o .env; integración Windows propia e idempotente;
rollback desde el estado anterior; interrupciones reanudables y procesos propios
recogidos. Se conservan los45 rechazos por motivo, sin comparar textos de error.
Los archivos ajenos se conservan: retirar el catálogo no autoriza borrarlos.

Presupuesto de producción ampliada, medido con installer-lines.py --projection:
5b≤12800,6≤12200,7≤10080,8≤10110. Si un paso no cabe, se para antes de entregar.
Se permite windows-registry0.6.1 ya fijada solo si reduce líneas frente al SDK;
el PR muestra el ahorro y el diff de dependencias, sin otros paquetes/versiones.
Las retiradas legacy6–7 incluyen inventarios, NSIS, _?=, ImportProfiles,
ImportLayout, Start y variantes antiguas de estado; se conservan migraciones
baratas que protegen datos o preferencias. Lo ilegible se presenta como Dañada
con Reparar, sin sobrescribir ni elegir datos arbitrariamente.

LegacyRunner no se retira en5b. El indicador de arranque solo desaparece si la
ventana del Hub se mide en≤1,5s; en otro caso se conserva. No se autoriza paso6
por cerrar esta poda ni se altera el presupuesto único del supervisor (#1816).

**Resultado del paso 6 (3-nov-2026):** la build release del Hub, con fixtures
distribuidos en QA aislada, abrió la ventana en 2402/344/331/330/343 ms;
mediana 343 ms. Se retiró el indicador. Tras el rebase y los arreglos, el paso 6
ocupa 12458 líneas de producción: 148 sobre el límite inicial de 12310, dentro
del margen de 150 autorizado. El tope compensado del 7 es 10082 y el objetivo final sigue en
10110. Los excesos intermedios de hasta 150 líneas se trasladan al paso
siguiente; solo se detiene la entrega si exceden 150 o el final no cabe.

### Enmienda del paso 6: fin de LegacyRunner

Se retira la ruta de ejecución de generaciones de motor 1 en los pasos 6–7.
Setup puede leer y migrar sus manifiestos y datos, pero el lanzador nuevo solo
arranca motor 2. Si el primer motor 2 no confirma el arranque, no se vuelve a
ejecutar el motor 1: se muestra un aviso que ofrece **Reparar**. La `data/` de
la generación anterior se conserva intacta; ninguna elección automática de
datos sustituye esa recuperación explícita. Las referencias de motor 1 pueden
seguir en `state.json` para proteger sus datos hasta la retención del paso 8.

La prueba sobre las instalaciones reales 0.0.975 y 0.0.988 deja de bloquear la
programación. **Bloquea la publicación** de cualquier release que contenga
motor 2 sin LegacyRunner: Isaac debe ejecutar el Setup de bytes distribuidos
en una VM o cuenta aislada sobre ambas raíces reales, comprobar migración,
arranque/fallo, aviso Reparar y conservación de `data/`, y dejar la evidencia
en #1840 y el handoff. CI, matriz sintética o un PR verde no sustituyen esa
prueba. No se publica ni promociona una release que no tenga el acta de Isaac.

## Consecuencias y verificación

La matriz de caracterización fija lo observable antes de migrar cada operación.
Paso 3 exige Probe idéntico y fixtures Rust (975, RC, corrupción, ausencia y
schema mayor); cada paso de escritura conserva la matriz salvo diferencias
aprobadas explícitamente. Se cuentan líneas de producción, pruebas, scripts PS
y documentos por separado, con SHA base y método reproducible.

QA solo bajo `D:/VantareServer/qa/` o TEMP aislado de CI, con guard activo,
HKCU y carpetas inyectados. #1848 sigue el aislamiento de suites históricas;
#1856 conserva avisos UI, lock del finalizador y proyección de General fuera
de este corte. No se confunde un arnés con una instalación interactiva real.

El lanzador es una pieza crítica y deliberadamente pequeña. La transición
lee las generaciones anteriores sin ejecutarlas. Los
anclajes pueden requerir volver a anclarse una vez; se avisará en las notas.
Setup/Uninstall siguen sin Authenticode, conforme al riesgo ya aceptado.

## Relación con otras ADR

Complementa ADR 0099 en instalación y ciclo de vida; conserva ADR 0102 y los
protocolos de acceso. Sustituye progresivamente la autoridad del recorrido
PowerShell descrito en los README de packaging/installer. Hasta cada paso,
esos README y su evidencia describen el producto que realmente se ejecuta.


### Decisión 5b: inventario de retirada y generaciones huérfanas

Uninstall solo retira miembros de los manifiestos ligados por SHA a `active` o
`previous` en el estado leído bajo bloqueo. Conserva los archivos ajenos de
`bin/`. Una generación sin referencia SHA queda intacta, incluidos sus binarios:
el log identifica su ruta y el motivo. No se añade ningún inventario ni marcador.
Este residuo está autorizado y pendiente del paso 8; allí se decidirá si un
manifiesto autoconsistente basta para retirar binarios de una generación huérfana.
Las carpetas `data/` se conservan en todos los casos. La matriz prueba tanto el
residuo como su diagnóstico; ya no exige el snapshot PowerShell byte a byte.


### Poda adicional 5b autorizada

Se aplica la propuesta `D:/VantareServer/evidence/revision-general/instalador-PODA-5b.md`
en el orden 5 → 3 → 1 → 4 → 2, midiendo producción tras cada bloque. El techo
12800 no cambia. Las cifras válidas son las del script tras fmt, no las estimaciones.

Cambios observables autorizados y sujetos a regresiones:

- Una referencia previous igual a active se considera previous-corrupt y no
  habilita una vuelta atrás a la misma generación.
- REG_EXPAND_SZ deja de expandirse. Se rechaza explícitamente al leerlo; la raíz
  y Run se comprueban antes de mutar, conservando la instalación si aparece.
- Cleanup programado guarda también stdout en su log, como el modo síncrono.
  Su código de salida sigue siendo la autoridad y el script sigue siendo la
  excepción permanente mínima que valida propiedad después del padre.

La API de lectura expresa las dos fases sin un enum de perfiles:
`Installation::read(root)` liga y valida los metadatos; `verify(root)` añade
integridad de binarios sobre lo ya leído. No introduce un tercer lector.
La identidad del directorio temporal propio pasa a GUID; el script mantiene
una regla cerrada del mismo nombre y conserva raíz, contenido, hash y bloqueo.

Los jobs Linux actuales de policy/quality ejecutan tooling Python, no Cargo.
La compatibilidad del crate en Linux se verifica expresamente con el target
x86_64-unknown-linux-gnu antes de usar la reserva Windows del bloque 6 y se vuelve
a comprobar en la tanda final; no se atribuye esa compilación a un job inexistente.
