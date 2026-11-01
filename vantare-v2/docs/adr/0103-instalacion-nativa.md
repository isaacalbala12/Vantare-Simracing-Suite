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
| Probando | `boot-pending.json` con nueva, anterior y plazo de confirmación |
| Desinstalada con datos conservados | `retained-data.json`, sin `state.json` |
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
de binarios, anterior con verificación completa. Uninstall interrumpido conserva
temporalmente DisplayVersion como presentación heredada si faltan binarios o
manifiesto; ese adaptador se retira en el paso 4, sin usarlo para decidir versión
activa de una instalación completa.

### Confirmación, integración con Windows y rollback

`engine::shell::sync(estado)` es una proyección idempotente: registro, Inicio,
Escritorio, Startup y AUMID se reconstruyen desde el estado resultante. Los
accesos nuevos apuntan al lanzador estable. Solo se modifican entradas propias;
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

Nunca se borran `generations/*/data/`, datos nativos externos ni datos Wails.
La nueva generación copia y verifica datos; no sobrescribe los de una existente.
Desinstalar exige instalación parada, retira binarios e integración propia,
incluida Run, y conserva la referencia a los datos activos. La retención del
paso 8 elimina automáticamente **solo binarios de generaciones no referenciadas**;
no borra sus `data/`. Borrar datos requeriría otra acción explícita del usuario.

Se conservan firma Ed25519, clave pública embebida, SHA autenticado del ZIP,
validación de inventario/hash, rutas cerradas y rechazo de enlaces/reparse
points. Un paquete preparado se verifica de nuevo al aplicar. No se añade
red ni autoridad de actualización al lanzador.

### Compatibilidad y retirada de PowerShell

`boot-pending.json`, `staging/pending.json`, `retained-data.json`,
`update-status.json` e `installer-ui.json` conservan su forma. `manifest.json`
admite `engine: 2` opcional; ausencia significa motor 1. Se mantienen feed,
tag, asset, sobre y códigos 0–5 del Setup. Un motor antiguo debe rechazar de
forma segura un paquete que no pueda validar y pedir reinstalar con Setup.

La 0.0.975 pública y las RC 980–988 pasan una vez por Setup: se lee state v1,
se conserva la anterior para rollback y se migran las formas conocidas de
registro/accesos. Una generación motor 1 se arranca mediante **LegacyRunner**:
`generations/<id>/bin/vantare.exe --beta -Root <raíz>`, con scripts congelados
de la raíz. Es la única excepción temporal a retirar PowerShell del producto.
Desaparece cuando **active y previous son de motor ≥ 2**; su prueba usa la
975 real sin ejecutar sus binarios en la matriz. La prueba live requiere VM
o cuenta aislada. Su Register puede volver a apuntar accesos a la generación
antigua, limitación heredada aceptada hasta salir de LegacyRunner.

El paso 7 retira PowerShell del producto nuevo, NSIS y operaciones Wails,
incluida ImportLayout. Build se convierte en tooling del repositorio. MSIX
se conserva como documento histórico, sin ruta de distribución activa.

## Decisiones de #1840 y secuencia de entrega

Se aprueba el rediseño completo tras 0–1: 2 ADR y diseño versionado; 3 lector
Rust; 4 escritura Setup/Uninstall; 5 shell; 6 lanzador/sesión; 7 retirada PS;
8 retención. RC9 0.0.988 se publica tal como fue probada; 1a–1d corresponden
a la siguiente candidata. Este ADR no publica ni reconstruye RC9.

Para el **paso 4** están aprobadas dependencias directas de installer sobre
`zip 6.0.0`, `windows 0.62` y `sha2`, ya fijadas en Cargo.lock. El orquestador
autoriza adelantar **solo sha2 al paso 3**, en su versión ya fijada y sin cambiar
el lock, para preservar el vínculo SHA del manifiesto y las validaciones de
Probe. zip y windows siguen en el paso 4. No se incorporan dependencias en
este paso documental ni se autorizan otras versiones.
Se permite actualizar únicamente las listas de dependencias de installer y Hub
en Cargo.lock al conectar el lector: ningún paquete, versión o checksum nuevo.

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
mantiene un LegacyRunner explícito, ensayado y con retirada definida. Los
anclajes de la barra de tareas pueden requerir volver a anclarse una vez.
Setup/Uninstall siguen sin Authenticode, conforme al riesgo ya aceptado.

## Relación con otras ADR

Complementa ADR 0099 en instalación y ciclo de vida; conserva ADR 0102 y los
protocolos de acceso. Sustituye progresivamente la autoridad del recorrido
PowerShell descrito en los README de packaging/installer. Hasta cada paso,
esos README y su evidencia describen el producto que realmente se ejecuta.
