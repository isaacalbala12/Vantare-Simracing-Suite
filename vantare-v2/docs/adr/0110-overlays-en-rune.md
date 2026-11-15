# ADR 0110 — Overlays en Rune; el Hub se queda en Electron

Fecha: 2026-11-15. Issue: [#2333](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2333) (VANTA-144).
Enmienda [ADR 0099](0099-arquitectura-rust-nativa.md), [ADR 0107](0107-hub-electron-nucleo-y-overlays-rust.md) y
[ADR 0109](0109-studio-visual-geometria-y-preview-real.md). Cierra [ADR 0108](0108-hub-rune-via-paralela.md).

## Estado

**Decisión de Isaac del 2026-11-15, definitiva: el Hub se queda en Electron y
los overlays pasan de GPUI a Rune.** «Si hace falta, lo optimizamos nosotros
extensamente.» Lo estructural de este documento lo fija arquitectura por
delegación de Isaac y queda aceptado cuando el orquestador fusione su PR. No
autoriza releases, promociones de canal ni versiones para testers. Es solo
documentación: no se ha compilado ni ejecutado nada.

## Palabras que se usan aquí

- **Motor**: la biblioteca que dibuja los overlays. Hoy GPUI; pasa a ser Rune.
- **Presentar**: entregar una imagen nueva a Windows para que la muestre. Cada
  presentación cuesta CPU y GPU aunque la imagen sea casi igual a la anterior.
- **Cadencia**: cuántas veces por segundo, como mucho, se actualiza un widget.
  Ya existe en el producto (`Level::hz`: por ejemplo 15 veces por segundo para
  las tablas en el nivel Equilibrado).
- **Workspace**: un grupo de crates de Rust que comparten una sola lista de
  versiones (`Cargo.lock`). El producto vive en el workspace de `native/`.
- **Copia propia (fork)**: un repositorio nuestro con el código de Rune, donde
  podemos añadir cambios que el original no tiene.
- **Look**: cada aspecto de un widget (Vantare y Eficiencia). Cinco widgets
  tienen dos.

## Contexto

- El informe de arquitectura (`D:\VantareServer\evidence\rune-vs-gpui\INFORME-FABLE.md`)
  proponía decidir los overlays con una medición y dejar el Hub en Electron.
- La comparación rápida del 15-nov en el PC de juego
  (`…\rune-vs-gpui\rapida-20261115\INFORME_RAPIDO.md`, 10 Relative): los tres
  motores gastan muy poco. Rune usó unas 3 veces la CPU de GPUI (0,277 % frente
  a 0,093 % del PC), pero **presentó unas 70 veces más imágenes** (unas 25 por
  segundo frente a una cada tres segundos). No es una comparación justa.
- Con esos datos Isaac decide ir con Rune: más techo visual (animaciones,
  desenfoques, efectos) y zonas pulsables de serie, aceptando que hay que
  mantenerlo y optimizarlo nosotros.

Hechos comprobados hoy leyendo `origin/nightly` (`69379ffd3`):

1. **Los cuatro parches de Rune no chocan hoy con GPUI.** ADR 0108 decía que
   dentro de `native/` cambiarían los overlays: era inexacto. Rune usa
   `wgpu-hal` 30.0.1 y `accesskit_windows` 0.35.2; GPUI usa 29.0.4 y 0.34.0.
   Son versiones incompatibles entre sí y Cargo las mantiene separadas.
   Chocarían el día que coincidieran. `winit` y `parley_engine` no están en
   `native/`.
2. **GPUI no se va de `native/` con esta decisión.** Lo usan también el
   instalador, Gestión (`admin`) y el Hub congelado.
3. **Casi todo lo que no es dibujo ya no depende de GPUI**: el documento de
   diseño (`layout.rs`), las cadencias (`performance.rs`), la demanda de
   datos, la fuente de fotos (`source.rs`), sesión, geometría y las reglas
   puras de movimiento. Viven en `native/ui`, que sí arrastra GPUI.
4. **El Relative de medición en Rune** (`native/pruebas-rune/relative`)
   procesa cada foto (una cada 33 ms) sin aplicar la cadencia por widget que
   GPUI sí aplica, y pide una imagen nueva en cada refresco mientras haya un
   coche rápido acercándose (el parpadeo de aviso). Explica buena parte de las
   70 veces; el resto está sin explicar.
5. **Rune no tiene nada llamado `render_to_image`** (ese nombre es de GPUI
   fast). Lo equivalente es su destino fuera de pantalla (`Offscreen`): dibuja
   con la gráfica en una imagen sin abrir ventana. Su pintor por CPU
   (`cpu_boot`) no sirve para esto: rechaza desenfoques y capas.
6. **El núcleo solo acepta como overlay al ejecutable `vantare-overlays.exe`**
   (`runtime/src/rights/owner.rs`), y el supervisor ya admite otra ruta con
   `--overlays-bin`.
7. **El original de Rune avanzó 225 cambios en tres días** desde el commit
   fijado. Licencia MIT (comprobado).

## Decisión

### 1. Dónde vive Rune y cómo convive con GPUI

- **Workspace propio en `vantare-v2/native/overlays-rune/`.** Crate
  `vantare-overlays-rune`. No se cambia el workspace entero. Motivos:
  - Mientras GPUI sea la red de seguridad, sus ejecutables no deben cambiar ni
    en una versión de biblioteca. Con listas separadas eso está garantizado.
  - Rune se va a actualizar a menudo y con cambios nuestros: cada subida toca
    solo su lista, no la del producto entero.
  - El choque de parches no existe hoy pero puede aparecer en una subida.
  - No alarga las comprobaciones del resto del producto.
- **El código común se saca a un crate sin GPUI dentro de `native/`:**
  `native/overlay-model` (`vantare-overlay-model`). Lleva los tipos de widget
  y sus ajustes, el documento de diseño, cadencias, sesión, geometría, demanda,
  fuente de fotos y las reglas puras de movimiento. `native/ui` lo reexporta
  para que GPUI, el Hub congelado y Gestión sigan compilando igual. Rune lo
  usa por ruta. Así hay **una sola fuente** y no se copia nada. Es un crate
  nuevo por aislamiento demostrado (regla de ADR 0099): Rune no puede depender
  de `ui` sin arrastrar GPUI.
- **Convivencia, con un interruptor para todo el proceso** (no por widget):
  - Durante la migración hay dos ejecutables en `bin/`: `vantare-overlays.exe`
    (GPUI, el que se usa) y `vantare-overlays-rune.exe`. Rune solo se arranca
    en pruebas, con `--overlays-bin`. Los widgets aún no migrados no se ven en
    ese modo. No hay opción visible.
  - Cuando estén los 18 widgets y pasen las mediciones, se añade la opción
    «Motor de overlays» en Ajustes. Rune pasa a ser el de serie y GPUI queda
    elegible **durante un ciclo de testers**.
  - Acabado ese ciclo sin problemas graves, se retira el overlay GPUI y el de
    Rune pasa a llamarse `vantare-overlays.exe`.
  - Descartado mezclar motores (unos widgets en GPUI y otros en Rune a la
    vez): serían dos procesos y dos ventanas transparentes encima del juego,
    el doble de memoria y una medición que no vale para ninguno de los dos.
- Único cambio en el núcleo: admitir también `vantare-overlays-rune.exe` como
  overlay mientras dure la convivencia.

### 2. Copia propia de Rune

- **Repositorio `isaacalbala12/rune`**, copia pública del original (igual que
  este repositorio). Lo crea el orquestador. Dos ramas:
  - `upstream`: espejo exacto del original. No se edita nunca.
  - `vantare`: un commit del original más nuestros cambios encima, cada uno en
    un commit pequeño que empieza por `vantare:`.
- **El producto fija un commit exacto de `vantare`**, con una etiqueta
  (`vantare-AAAAMMDD-N`) para que no se pierda. Punto de partida: el mismo
  `d5338988a7c1b3377adb60853815b6d0843dae7c` de hoy, sin cambios nuestros. Los
  cuatro parches salen de la misma copia y del mismo commit. Siempre
  `--locked`.
- **Regla para nuestros cambios:** primero se intenta resolver en nuestro
  código, con lo que Rune ya ofrece. Solo se toca la copia si no hay otra vía.
  Cada cambio se apunta en `PARCHES.md` (qué hace, por qué, cómo se prueba) y
  se avisa al original con una incidencia: no aceptan aportaciones, pero si lo
  arreglan ellos, el nuestro se quita en la siguiente subida.
- **Traer cambios del original** es siempre una tarea `VANTA-N` propia con un
  solo PR. Ritmo: **una vez cada dos semanas** mientras dure la migración, y
  antes si necesitamos un arreglo suyo. **Nunca** a mitad de una fase, durante
  una campaña de medición ni durante el ciclo de testers. Si una subida cuesta
  más de tres días, se abandona y se reintenta en la siguiente ventana.
- **Pruebas de cada subida:** tests sin ventana y Clippy en la CI; revisión de
  licencias; en el PC de juego, capturas de todos los widgets migrados antes y
  después y la medición corta de consumo. Si algo empeora más que el ruido, la
  subida no entra.
- **Compilador:** no se acepta una subida que pida un Rust más nuevo que el
  del producto (hoy 1.99.1).
- **Licencia:** MIT. La copia conserva `LICENSE` y el aviso de autoría;
  nuestros cambios se publican bajo la misma licencia. El aviso MIT de Rune y
  los de sus dependencias se añaden a los avisos de terceros del instalador.
  La comprobación de licencias que ya existe (`check_dependencies.py`: falla
  con MPL o licencias no permisivas) pasa a este workspace.

### 3. Repintado a demanda (primera optimización)

Regla única: **solo se presenta una imagen si cambia algo que se ve.** Tres
causas admitidas: un dato que cambia píxeles, una animación en curso o un
cambio de diseño o de visibilidad. Sin relojes ni bucles continuos.

1. **Antes de optimizar se cuenta.** Los dos motores registran cuántas
   imágenes presentan y por qué causa (GPUI ya lo tiene con `paint-stats`;
   Rune recibe lo mismo). Sin ese dato no se interpreta ninguna medición.
2. **Cadencia por widget antes de tocar nada:** se usa el mismo código que
   GPUI (`Preferences::hz` y `Cadence::due`, desde `overlay-model`). Una foto
   que no le toca a un widget no se procesa ni se publica.
3. **Solo cambios reales:** la proyección ya devuelve el mismo objeto si nada
   cambió, y un valor `Live` igual al anterior no despierta nada.
4. **Una foto, como mucho una imagen por ventana.** Todos los widgets de un
   monitor comparten ventana: sus cambios se publican juntos.
5. **Las animaciones acaban.** Solo piden imágenes mientras se mueven. Con
   «reducir movimiento» no piden ninguna. El parpadeo de aviso deja de pedir
   una imagen por refresco: se limita a la cadencia del widget.
6. **Tests sin ventana que lo demuestran:** con datos quietos, cero imágenes
   tras asentarse; con datos que cambian, nunca más que la cadencia.

Objetivo medible en el PC de juego: en reposo, cero imágenes en 30 segundos;
con la grabación, imágenes por segundo no mayores que la cadencia del widget
más rápido visible, salvo durante una transición.

Si aun así no basta, por este orden y midiendo cada paso: recortar el trabajo
fijo por imagen de Rune en Windows (cambio en nuestra copia), presentar solo
la zona que cambió, y una ventana por widget. Ninguno se da por bueno sin
medirlo.

### 4. Objetivos de consumo

Los umbrales de la prueba B del informe **dejan de ser la puerta de entrada y
pasan a ser objetivos**. Se miden contra GPUI actual, en el PC de juego, con
10 Relative y la misma grabación.

| Medida | Hoy (15-nov) | Objetivo | Línea roja |
|---|---|---|---|
| CPU del proceso | 3 × GPUI | ≤ 1,10 × GPUI | ≤ 0,12 núcleos |
| Memoria privada | 1,09 × (110 MiB) | ≤ 1,25 × y ≤ 150 MiB | ≤ 150 MiB |
| Memoria de vídeo | 0,78 × | ≤ 1,5 × | — |
| GPU del proceso | +0,66 puntos | ≤ +1 punto | ≤ 2 % |
| Efecto en el juego (carga de prueba, p99) | sin medir | ≤ 3 % peor | ≤ 3 % peor |
| Tiempo hasta verse | sin medir | ≤ 1,5 × y ≤ 1,5 s | ≤ 1,5 s |
| Retraso dato → pantalla (p95) | sin medir | ≤ GPUI + 1 imagen | — |
| Aguante 4 horas | sin medir | 0 cierres, memoria estable | 0 cierres ni pantallazos |
| Clics, foco, encima del juego, escala, OBS, G-Sync/FreeSync | sin medir | todo correcto | todo correcto |

La línea roja de CPU es lo que ya se aceptó al adoptar GPUI (0,12 núcleos con
cuatro widgets). Hoy, con diez, Rune está en 0,044 y GPUI en 0,015 (de los
16 hilos del procesador del PC de juego).

**Si un objetivo no se cumple tras optimizar:**

- La migración **no se para** mientras se respeten las líneas rojas. Cada
  fase tiene hasta cinco días de trabajo de optimización por medida que falle.
- Lo que siga sin cumplirse se apunta en #2333 como deuda de consumo (medido,
  objetivo y causa) y el orquestador se lo enseña a Isaac antes de dar Rune a
  testers.
- **Si se cruza una línea roja**, Rune no pasa a ser el motor de serie: GPUI
  sigue siéndolo, se deja de migrar widgets y se trabaja solo en arreglarlo.
  Tras dos rondas sin lograrlo, decide Isaac.

### 5. Orden de migración

| Fase | Widgets | Medición en el PC de juego al cerrar |
|---|---|---|
| F0 | Ninguno: base (copia de Rune, crate común, proceso y ventana) | Arranca, lee el diseño, no roba foco, los clics pasan |
| F1 | Relative (2 Looks) | Recuento por causa, medición corta y **campaña B completa** |
| F2 | Standings (2 Looks) | Medición corta y aguante de 30 minutos |
| F3 | Delta y Fuel (2 Looks cada uno) | Igual que F2 |
| F4 | Los 14 restantes, en tres tandas: tablas (Relative multiclase, Torre, Cara a cara, Vuelta rápida); trazas y dibujo (Pedales con 2 Looks, Telemetría de pedales, Telemetría de entrada, Historial de delta, Mapa, Radar, Daños); avisos (Banderas, Avisos de sesión, Tiempo en pista) | Igual que F2 por tanda; al final, **campaña B completa con los 18** y prueba de G-Sync/FreeSync |

«Daños detallados» está en el código pero no en el catálogo: se migra en la
última tanda solo si el orquestador confirma que sigue en producto.

**Qué no cambia:** `domain` (las proyecciones), `ipc`, el anfitrión y el Hub.
`runtime` solo cambia en dos puntos pequeños: el núcleo admite el segundo
ejecutable y, al final, el supervisor elige el motor según la opción.
**Qué se mueve sin reescribir** (a
`overlay-model`): ajustes, diseño, cadencias, demanda y reglas de movimiento.
`source.rs` conserva su transporte; cambia quién consume las fotos.
**Qué se reescribe en Rune:** el dibujo de cada widget y Look, y el proceso
que abre las ventanas. **Qué desaparece al final:** las llamadas a Windows a
mano (`overlay.rs`), la captura con ventana oculta (`capture*.rs`) y las
animaciones hechas a mano. Instalador, Gestión y `vendor/gpui_windows` no se
tocan aquí.

El Relative de medición se convierte en el de producto en F1 y se borra de
`pruebas-rune`: el kit pasa a compilar el de producto. No puede haber dos.

**Paridad visual**, por widget y Look, antes de fusionar:

- Mismas escenas fijas que ya existen (`scenes.json` de cada widget),
  pintadas por GPUI y por Rune **en Windows**. Las capturas del Mac sirven
  para trabajar, no como prueba.
- Cajas y posiciones a un píxel; colores planos idénticos; mismos textos. El
  trazo de las letras no puede ser idéntico (motores de texto distintos):
  guía de menos de un 5 % de píxeles distintos, la misma vara con la que se
  eligió GPUI.
- Revisión a ojo, lado a lado, por diseño y por el orquestador. Sin ella no se
  fusiona.

### 6. Studio: la preview se hace sobre Rune

Corrige la Decisión 1 de ADR 0109. El contrato no cambia (pide «la imagen de
esta referencia» y no nombra el motor).

- **No se construye la preview sobre GPUI.** El PR 4 de ADR 0109 espera a F1.
- **Un ejecutable, tres modos, un solo camino de dibujo:** en pista (ventanas
  encima del juego), preview (sin ventana: dibuja en el destino fuera de
  pantalla de Rune y devuelve un PNG con transparencia) y captura de escenas
  para la paridad, que es el mismo modo preview llamado desde la línea de
  órdenes.
- El anfitrión lo lanza bajo demanda como ya fija ADR 0109 (canal privado,
  clave de un arranque, nunca en pista). Es un proceso distinto del que pinta
  en pista y no comparte nada con él.
- **La medida del tamaño real** de un widget sale de la colocación de Rune,
  que no necesita gráfica.
- Un widget aún no migrado responde «no disponible» y el Hub muestra la
  ilustración rotulada (regla 7 de ADR 0109).
- La clave de cada imagen incluye el motor y su commit.
- A confirmar en ese PR: que lo público de Rune basta para dibujar sin ventana
  fuera de sus herramientas `--snap`. Si no, es el primer cambio de nuestra
  copia.
- «En vivo» sigue decidiéndose midiendo. La textura compartida, descartada con
  GPUI, vuelve a ser candidata porque el motor cambia.

### 7. CI y servidor

- **Servidor:** compila por la cola (`native/scripts/compilar.ps1 cargo …
  --manifest-path native/overlays-rune/Cargo.toml`), dos trabajos y sin
  símbolos. **No ejecuta el binario ni `--snap`, `--frames`, `--video` o
  `--tree`.** Cinturón: una variable de máquina `VANTARE_SIN_GRAFICOS=1`; con
  ella el ejecutable sale con error antes de crear ventana o dispositivo.
- **Tests sin ventana**: solo `Runtime::new` y `Runtime::frame` de Rune y
  funciones puras. La preview se prueba con un pintor falso.
- **CI de Windows:** un trabajo nuevo, con formato, Clippy `-D warnings`,
  tests sin ventana y licencias. Se dispara con cambios en `overlays-rune`,
  `overlay-model`, `domain`, `ipc` y `profiling`. Informa siempre y se salta
  los pasos pesados si no toca, como los demás. **Obligatorio** desde que
  exista el primer widget. Un cambio solo en `overlays-rune` no lanza las
  comprobaciones nativas completas.
- **Capturas y mediciones:** PC de juego. El Mac, si está, para iterar.
- `overlay-model` se compila con dos listas de versiones. Sus tests de
  escritura del diseño se pasan con los dos órdenes de claves de
  `serde_json`, como ya hace el anfitrión.

### 8. `hub-rune/` y CORTE-1

**Se retiran de `nightly` en un solo PR.** El Hub en Rune está abandonado y
dejarlo cuesta: su CI se lanza en cada cambio del anfitrión y habría que
arrastrarlo en cada subida de Rune.

- Se borran `vantare-v2/hub-rune/`, `hub-rune.yml`, sus entradas en los
  clasificadores de CI y `hub-web/scripts/rune-catalog.mjs`.
- **Se reutiliza una pieza:** la comprobación de licencias, que se muda a
  `overlays-rune`. El anfitrión de escena, el catálogo de textos y el cliente
  del canal son del Hub y no sirven a los overlays.
- **CORTE-1 se cierra como no realizado:** nunca se abrió la ventana.
- Referencia: una etiqueta `archivo/hub-rune` en el último commit que lo
  contiene, más las ramas conservadas.
- Del kit de medición se retira lo que era del Hub (`inicio`, `hub-fast`).
- Quedan sin objeto: la fila «R» de ADR 0109 y VANTA-139 (GPUI kit y fast).

### 9. Plan de PRs

Días de trabajo de un worker; son estimaciones por volumen, no medidas.

| PR | Dueño | Qué entra | Cómo se verifica | Días |
|---|---|---|---|---|
| 0 | Arquitectura | Este ADR | Revisión del orquestador | hecho |
| 1 | Trabajo mecánico | Retirar `hub-rune` y lo del Hub en el kit; mudar licencias | CI verde; tests de clasificadores | 0,5 |
| 2 | Orquestador | Crear `isaacalbala12/rune` (ramas, etiqueta, `PARCHES.md`); apuntar el kit a la copia, mismo commit | `Cargo.lock` solo cambia de origen | 0,5 |
| 3 | Ejecutor principal | `overlay-model` (a): tipos de widget, ajustes y Looks | `comprobar.ps1 ui -Full`, Hub y telemetría; diseños guardados idénticos byte a byte | 2 |
| 4 | Ejecutor principal | `overlay-model` (b): diseño, cadencias, sesión, geometría, demanda, fuente, movimiento | Igual que el 3 | 1,5 |
| 5 | Ejecutor principal | Workspace `overlays-rune`: Rune fijado, trabajo de CI, clasificadores, cinturón del servidor, `AGENTS.md` y `native/README.md` | Compila para Windows; un test sin ventana; un PR solo de overlays no lanza lo nativo | 1 |
| 6 | Ejecutor principal | Proceso: ventana por monitor, diseño, fuente, cadencias, derechos, cierre por el supervisor; el núcleo admite el segundo ejecutable | Tests sin ventana; F0 en el PC de juego | 3 |
| 7 | Ejecutor principal | Relative Vantare con repintado a demanda y contadores | Tests de la decisión 3; paridad en Windows | 2 |
| 8 | Ejecutor principal | Relative Eficiencia; modo de captura de escenas | Paridad en Windows | 2 |
| 9 | Ejecutor principal | Optimización tras medir F1 (solo si hace falta) | Campaña B completa | hasta 5 |
| 10 | Ejecutor principal | Preview sobre Rune (PR 4 de ADR 0109) | Lo que fija ADR 0109, con este motor | 3 |
| 11–12 | Ejecutor principal | Standings, un Look por PR | Paridad; medición F2 | 4 |
| 13–14 | Dos workers | Delta; Fuel | Paridad; medición F3 | 4 |
| 15–17 | Dos workers | Las tres tandas de F4 | Paridad; medición por tanda | 10 |
| 18 | Ejecutor principal | Empaquetado, avisos de terceros y opción «Motor de overlays» | Tests de empaquetado; campaña B con los 18 | 2 |
| 19 | Ejecutor principal | Tras el ciclo de testers: retirar el overlay GPUI y renombrar | Solo con orden de Isaac | 2 |

Orden: 1 y 2 en paralelo; 3 → 4 → 5 → 6 → 7 → 8 → 9. El 10 puede empezar
tras el 8. Del 11 en adelante, dos workers en paralelo sobre widgets
distintos. Total aproximado: unos 40 días de worker, cuatro o cinco semanas
de calendario.

## Riesgos

| Riesgo | Qué hacemos |
|---|---|
| El original cambia muy deprisa y no acepta aportaciones | Copia propia, commit fijado, subidas cada dos semanas con pruebas |
| Rune no llega al objetivo de CPU | Repintado a demanda, cinco días por fase y líneas rojas (decisión 4) |
| El texto se ve distinto al de GPUI | Capturas en Windows y revisión a ojo por widget |
| Mover código a `overlay-model` rompe el overlay GPUI | Es un traslado sin cambios; tests de `ui`, Hub y telemetría; diseños idénticos byte a byte |
| DirectX 12 en gráficas antiguas | Aguante de 4 horas en F1 y al final; GPUI elegible un ciclo |
| Alguien ejecuta algo gráfico en el servidor | Variable de máquina que lo impide |
| La preview de Studio se retrasa | Depende solo de F1; mientras, la ilustración rotulada |
| El PC de juego no está encendido | Las mediciones se agrupan por fase; el código no espera, la fusión de cada widget sí |

## Consecuencias

- **ADR 0099:** los overlays dejan de ser «UI GPUI». Lo demás sigue igual.
- **ADR 0107:** su punto 3 (GPUI, GPUI kit y fast, Rune fuera hasta 2027)
  queda sustituido por este documento. El requisito de G-Sync/FreeSync sigue.
  El Hub en Electron queda confirmado.
- **ADR 0108:** cerrado. No hay segundo Hub ni cortes 1 y 2.
- **ADR 0109:** el pintor de la preview es Rune; la fila «R» desaparece.
- Durante la migración hay dos motores en el repositorio y, al final, un ciclo
  de testers con los dos ejecutables instalados.
- Vantare pasa a mantener una copia de una biblioteca gráfica.
