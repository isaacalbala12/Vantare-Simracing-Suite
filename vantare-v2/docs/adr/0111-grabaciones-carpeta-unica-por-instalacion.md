# ADR 0111 — Dónde viven las grabaciones de Análisis: una carpeta por instalación, fuera de `generations/`

Fecha: 2026-11-20. Issue: [#2746](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2746)
(prioridad alta), parte de [#1995](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1995)
(Plane VANTA-138). Relacionada con [#2740](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2740)
y su PR 1, [#2745](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2745).

## Estado

**Aceptado (raíz, 20-11-2026).** La raíz acepta la opción A y las doce
respuestas de §13 tal como se recomiendan, y fija el orden de trabajo de §12.
Aceptar la decisión no demuestra que esté implementada: cada trozo va en su
propio PR. No autoriza ninguna promoción ni publicación.

El documento es solo lectura de código y de evidencia: no se ha ejecutado el
instalador, ni Vantare, ni se ha tocado el PC de juego ni datos de nadie. Base
leída: `origin/nightly` `286822afc`.

**Enmienda dos frases de [ADR 0103](0103-instalacion-nativa.md)**
(detalle en «Relación con otras ADR»). No cambia
[ADR 0099](0099-arquitectura-rust-nativa.md) ni
[ADR 0107](0107-hub-electron-nucleo-y-overlays-rust.md).

Lo que se afirma lleva su archivo y línea (rutas relativas a
`vantare-v2/native/` salvo aviso). Lo que no se ha podido comprobar leyendo
está marcado como **no verificado**.

## Palabras que se usan

- **Raíz de instalación:** la carpeta donde está `Vantare.exe`. Por defecto,
  `%LOCALAPPDATA%\Programs\Vantare` (`installer/src/engine/context.rs:172`).
- **Generación:** una carpeta `generations/<id>/` con una versión completa del
  programa (`bin/`, `hub-ui/`) y su propia copia de los datos (`data/`).
- **Activa, anterior y huérfana:** `state.json` nombra la generación que se
  usa (activa) y la de antes (anterior, para poder volver atrás). Cualquier
  otra carpeta de generación que ya nadie nombra es una huérfana.
- **Confirm:** el momento en que una versión recién instalada demuestra que
  arranca (se abre la ventana del Hub). Hasta ese momento se puede volver
  sola a la anterior; después, ya no.
- **Grabación:** un archivo con la telemetría de lo conducido, usado por la
  pantalla de Análisis. Es una base de datos DuckDB (una base de datos que
  vive en un solo archivo). A veces lleva al lado un archivo `.wal`: los
  últimos cambios que aún no se han pasado al archivo principal.
- **Lanzador, sesión, núcleo, anfitrión y pantalla:** `Vantare.exe` de la raíz
  (lanzador) arranca la **sesión** de la generación activa; la sesión arranca
  el **núcleo** (lee el simulador y graba) y el **anfitrión del Hub** (programa
  Rust que atiende a la interfaz); la **pantalla** es la parte de Electron que
  ve el usuario.
- **Argumento:** un dato que un programa recibe de quien lo arranca; por
  ejemplo, `--series-dir <carpeta>` le dice al núcleo dónde grabar.
- **Contrato o protocolo del anfitrión:** las reglas de los mensajes entre la
  pantalla y el anfitrión. Cambiarlo obliga a coordinar a varios equipos.
- **Manifiesto:** la lista de archivos de una versión, con la huella de cada
  uno. El instalador solo considera suyo lo que aparece en esa lista.
- **Bloqueo de sesión:** un archivo-candado en la raíz. Mientras Vantare está
  abierto lo tiene cogido, y el instalador no trabaja hasta que queda libre.
- **Huella:** un número largo (SHA-256) calculado a partir del contenido de un
  archivo. Dos archivos con la misma huella son iguales.
- **Poda:** borrar las grabaciones más antiguas cuando se supera un tope.
- **Mover frente a copiar:** dentro del mismo disco, mover un archivo solo le
  cambia el nombre; es instantáneo, no gasta espacio y el contenido no se
  toca. Copiar lee y escribe todo el contenido.

## 1. Contexto y problema

### Qué pasa hoy (leído en el código)

- Las grabaciones viven **dentro** de cada generación:
  `generations/<id>/data/hub/recordings/series-*.duckdb`. La sesión calcula
  esa ruta (`runtime/src/bin/vantare/recording.rs:9-41`,
  `ipc/src/paths.rs:12`) y se la pasa al núcleo con `--series-dir`
  (`runtime/src/bin/vantare/main.rs:557-561`). El anfitrión del Hub la deduce
  por su cuenta de `--data-dir` (`main.rs:587-600`,
  `hub-host/src/protocol/modules/analysis/init.inc:1`).
- La grabación está **encendida por defecto**
  (`hub-host/src/settings/model.rs:138-146`) y se graba aunque la pantalla de
  Análisis esté oculta. Cada arranque del núcleo crea un archivo nuevo
  (`runtime/src/service/series.rs:83-91`).
- Tope: **200 grabaciones o 5 GiB**, lo que llegue antes
  (`runtime/src/service/series/prune.rs:8-9`). Lo aplica el núcleo al
  arrancar, **por carpeta**.
- En cada actualización y en cada Reparar, el instalador copia `data/` entero
  a la generación nueva (`installer/src/engine/operations.rs:553-554`). La
  copia calcula la huella de todo antes, lo copia, y vuelve a calcular la
  huella del origen y del destino (`installer/src/engine/write_fs.rs:269-287`):
  **cada byte se lee cuatro veces y se escribe una**, con Vantare cerrado y el
  usuario esperando.

### Cifras

| Dato | Valor | Cómo se sabe |
| --- | --- | --- |
| `data/` hoy, sin grabaciones | 8,5 MB (más del 97 % es caché de gráficos que se regenera sola) | **Medido** en 119 perfiles reales de este servidor |
| Tamaño de una grabación | 20–26 MB por hora de pista | **Estimado** leyendo el código; ninguna grabación real medida (pendiente de G5 de Análisis) |
| Tope | 200 grabaciones o 5 GiB | Constantes del código |
| Disco al tope (activa + anterior) | 10 GiB fijos | Calculado |
| Por cada generación huérfana | +5 GiB | Calculado |
| Trabajo de cada actualización al tope | escribir 5 GiB y leer 20 GiB | Calculado a partir de `write_fs.rs:269-287`; el **tiempo real no está medido** |
| Cuándo se llega al tope | 5–6 meses a 10 h de pista por semana; 9–12 meses a 5 h | **Estimado** |

Fuente: `D:\VantareServer\evidence\hub-web\verificacion-instalado\P4\data-por-generacion.md`
y el comentario de medición de #2740.

### Problemas que salen de ahí

1. **Disco:** el tope real no es 5 GiB sino 5 GiB por cada copia. Con activa y
   anterior son 10 GiB; con huérfanas, más.
2. **Tiempo:** cada actualización o Reparar se alarga con las horas de pista
   acumuladas. No hay comprobación previa de espacio libre: si el disco se
   llena a mitad, la operación falla y se deshace, después de haber copiado.
3. **Las grabaciones «retroceden»:** si una versión nueva falla y se vuelve a
   la anterior, lo grabado con la nueva se queda en la carpeta de la nueva y
   la anterior no lo ve.
4. **Fechas cambiadas (hallazgo de este estudio):** el catálogo de Análisis
   usa la fecha de creación del archivo como inicio de la grabación
   (`hub-host/src/protocol/modules/analysis/state.rs:99-110`). Al copiar un
   archivo, Windows le pone como fecha de creación el momento de la copia.
   **Comprobado** en este servidor con una copia normal de Windows (la copia
   estrena fecha de creación; mover la conserva); **no verificado** con el
   instalador real. Consecuencia: tras cada actualización, todas las
   grabaciones anteriores aparecerían con la fecha de la actualización.
5. **Frena el plan de huérfanas:** el PR 2 de #2740 quiere borrar el `data/`
   de una huérfana solo si no contiene nada único. Con las grabaciones
   dentro, tiene que leer hasta 5 GiB por huérfana; y una grabación ya podada
   en la activa parece «única» en la huérfana, así que casi nunca podría
   borrar nada.

### Por qué hay que decidirlo ahora

Por las fechas del código, los testers aún no tienen grabaciones: la grabación
automática entró en nightly el 17-11-2026 (#2529 y #2530) y los testers no
reciben versiones desde el 10-11-2026 (estado de ADR 0107). **No verificado**
en una instalación real de tester. Decidirlo antes de que Análisis llegue a
testers hace que la migración sea, en la práctica, mover cero archivos.

## 2. Opciones consideradas

| Opción | Ventajas | Costes y riesgos |
| --- | --- | --- |
| **A. Una carpeta de grabaciones por instalación, fuera de `generations/`** (la propuesta) | Disco: 5 GiB como máximo, de verdad. Actualizar y Reparar vuelven a copiar solo MB. Las grabaciones dejan de retroceder y de cambiar de fecha. El PR 2 de #2740 se abarata. Cambio pequeño: una ruta y una migración moviendo archivos | Las grabaciones dejan de formar parte de la «foto» de datos que se guarda por versión: una versión antigua puede encontrarse archivos de un formato más nuevo (ver §5). Hay una sola copia: ya no existen las copias accidentales por generación |
| **B. Compartir todo `data/`** (un solo `data/` para todas las generaciones) | Lo mismo que A y, además, deja de copiarse el resto | Rompe el modelo de vuelta atrás de ADR 0103: los ajustes, el diseño y los perfiles sí se **modifican** y una versión nueva puede dejarlos en un formato que la anterior no entiende. Ahorra solo 8,5 MB. Es el cambio con más riesgo de todos para el menor beneficio |
| **C1. Dejarlas donde están y bajar el tope** (o apagar la grabación por defecto) | Sin cambio de arquitectura | No arregla nada, solo lo hace más pequeño: sigue el doble de disco, sigue la copia en cada actualización, siguen las fechas y el retroceso. Recorta una función del producto |
| **C2. Dejarlas donde están y usar enlaces duros** (el mismo archivo con dos nombres, uno por generación, sin copiar) | Sin duplicar disco ni tiempo de copia, y cada generación conserva su «foto» | Hay que enseñar al motor del instalador a tratar distinto esos archivos (enlazar en vez de copiar y no recalcular huellas), que es tanto código como A pero en la pieza más delicada. Las versiones ya instaladas no lo harían. Borrar por poda no libera espacio mientras otra generación tenga su enlace. Siguen existiendo N carpetas que comparar en huérfanas, y sigue el retroceso |
| **C3. Dejarlas donde están y no copiarlas** | El cambio más pequeño en el instalador | Tras actualizar, el usuario deja de ver sus grabaciones anteriores, o el Hub tiene que leer de varias generaciones. Inaceptable |
| **D. Una carpeta fuera de la instalación** (Documentos, otra carpeta del usuario o una elegida por él) | El usuario la encuentra; podría ir a otro disco; sobrevive a borrar la carpeta de instalación | Segunda carpeta que descubrir y poseer; dos instalaciones (la real y una de pruebas) chocarían en la misma; puede estar en otro disco, y entonces mover es copiar y la grabación exige un tipo de disco concreto (`runtime/src/service/series/status.rs:73-92`). Nadie lo ha pedido |

### Recomendación

**Opción A**, con dos ajustes sobre la propuesta tal como llegó. Los dos la
hacen más sencilla y más segura:

1. **La migración se hace moviendo, no copiando.** La carpeta nueva y las
   generaciones están siempre en el mismo disco (la raíz no admite enlaces
   ni atajos a otro disco: `installer/src/engine/write_fs.rs:91`,
   `installer/src/engine/installation.rs:393`). Mover no duplica, no puede
   dejar un archivo a medias y conserva las fechas. La comprobación por
   huella solo hace falta para lo único que se **borra**: copias repetidas.
2. **La migración la hace la sesión de la versión nueva, sobre su propia
   carpeta de datos**, no el instalador durante la actualización. Así el
   motor del instalador no cambia su copia ni su vuelta atrás, y la
   generación anterior conserva intacta su copia por si hay que volver.

El estudio no ha encontrado una opción mejor que A. Sí ha encontrado un
límite que conviene aceptar a sabiendas: **la actualización que trae este
cambio todavía copia las grabaciones una última vez**, porque esa copia la
ejecuta el programa ya instalado, que no se puede cambiar
(`runtime/src/bin/vantare/installed.rs:393-427`). Con los testers sin
grabaciones, ese coste es hoy cero.

## 3. Layout, propietario, permisos y quién resuelve la ruta

```text
<raíz>/
  Vantare.exe, state.json, …               (sin cambios)
  recordings/                              ← NUEVA: una por instalación
    series-<época>-<pid>.duckdb            una grabación por arranque del núcleo
    series-<época>-<pid>.duckdb.wal        solo mientras se graba o tras un corte
    recording-status.json                  estado de la grabación en curso
    (temporales de creación del propio grabador)
  generations/<id>/
    bin/, hub-ui/, manifest.json           (sin cambios)
    data/                                  se sigue copiando por generación
      hub/                                 ajustes y perfil de Electron; ya sin recordings/
      Vantare/native/                      diseño, perfiles, Ingeniero, Launcher…
```

- **Nombre:** `recordings`, el mismo de hoy (`ipc/src/paths.rs:12`). El
  contenido y los nombres de archivo no cambian. En el nombre, `<época>` es
  el instante de arranque del núcleo y `<pid>` el número que Windows da a ese
  programa: juntos hacen que dos grabaciones no se llamen igual.
- **Propietario:** el usuario. La instalación es por usuario, sin permisos de
  administrador, bajo su carpeta local (`context.rs:172`). La carpeta hereda
  los permisos de la raíz; no se le pone ningún permiso especial.
- **Quién la crea:** la sesión, al arrancar (hoy la crea el núcleo:
  `runtime/src/service/series.rs:56`).
- **Quién graba y poda:** solo el núcleo. **Quién lee para Análisis:** solo
  el anfitrión del Hub. La sesión y el instalador únicamente **traen** a ella
  grabaciones que ya existían dentro de una generación (§4).
- **El instalador nunca copia esta carpeta ni borra nada de ella.** Solo lee
  un archivo suyo para compararlo con una copia repetida antes de borrar esa
  copia (§4). No forma parte de ningún paquete ni de ningún manifiesto.
- Como hoy con `data/`, al abrir la instalación el instalador recorre los
  nombres de toda la raíz para rechazar enlaces (`write_fs.rs:107`,
  `installation.rs:378-405`). Son unos cientos de nombres; no lee contenido.
  Consecuencia que ya existe: un enlace a otro disco puesto a mano dentro de
  la carpeta hace que el instalador se niegue a trabajar.
- **Quién resuelve la ruta:** **una sola función en la sesión**. Si hay
  instalación, `<raíz>/recordings`; en desarrollo (sin instalar), la de hoy.
  La sesión se la pasa al núcleo con `--series-dir` (ya existe:
  `runtime/src/bin/vantare-core.rs:63-68`) y al anfitrión con un argumento
  nuevo, `--recordings-dir`. El anfitrión rechaza argumentos que no conoce
  (`hub-host/src/args.rs:38-49`), así que hay que añadirlo ahí.
- **La pantalla nunca ve rutas.** Hoy ya es así y no cambia: recibe un
  identificador opaco, la fecha, el tamaño y si está en curso
  (`hub-host/src/protocol/modules/analysis/state.rs:438-445`). **No cambia
  el contrato ni el protocolo del anfitrión**: el argumento nuevo es entre
  dos programas de la misma generación.
- **Disco:** al estar dentro de la raíz, la carpeta hereda sus garantías:
  disco local con el formato que el grabador necesita
  (`write_fs.rs:62-76,96`; `status.rs:73-92`). Si el usuario instaló en otra
  carpeta, las grabaciones van con ella.

## 4. Migración única

### Regla («adoptar»)

Se define una sola operación, **adoptar** las grabaciones de una carpeta
`data/` de una generación hacia `<raíz>/recordings/`. Para cada grabación
(`series-<n>-<n>.duckdb` y su `.wal` si existe):

| Situación | Qué se hace |
| --- | --- |
| En la carpeta única no existe ese nombre | Se **mueve**. Instantáneo, sin copia; contenido y fechas intactos |
| Existe ese nombre y es igual (mismo tamaño y misma huella) | Se **borra la copia** de la generación. Es el único borrado, y solo tras comprobar la huella con el archivo abierto en exclusiva |
| Existe ese nombre y es distinta | **No se toca.** Se conserva donde está y se anota en el registro |
| Cualquier otro archivo de esa carpeta | No se toca ni se mueve. El estado (`recording-status.json`, unos bytes) y los temporales no son grabaciones: el núcleo crea los suyos en la carpeta única |

### Quién la ejecuta y cuándo

1. **La sesión, al arrancar, sobre su propia `data/`, antes de lanzar el
   núcleo y el Hub. Solo mueve; nunca calcula huellas ni borra.** Es
   instantáneo y no retrasa el arranque (importa: una versión recién
   instalada tiene un minuto para abrir la ventana antes de que se dé por
   fallida, `installed.rs:113-117`). La sesión es, por construcción, la
   generación activa y dueña de esa carpeta (`installed.rs:272-288`), y ya
   tiene el bloqueo que impide que el instalador trabaje a la vez
   (`main.rs:510-517`).
2. **El instalador, en Confirm y al desinstalar, sobre la `data/` de la
   activa y de las huérfanas. Aquí sí compara huellas y borra copias
   repetidas.** Es el mismo sitio donde #2745 retira los programas de las
   huérfanas, y forma parte del PR 2 de #2740 (§10).

### Propiedades

- **Idempotente:** no guarda ningún marcador; el estado es lo que hay en el
  disco. Ejecutarla otra vez no cambia nada. En una instalación ya migrada
  es mirar una carpeta vacía.
- **Reanudable:** cada archivo se mueve por separado y de una vez. Si se
  corta, lo movido está en su sitio y el resto sigue donde estaba; el
  siguiente arranque continúa.
- **Sin perder:** mover no borra. Solo se borra una copia cuya huella coincide
  con la de la carpeta única. Lo dudoso se conserva.
- **Sin duplicar:** al terminar hay una sola copia de cada grabación, salvo la
  «foto» de la generación anterior (ver abajo).
- **Si falla** (archivo ocupado por un antivirus, permiso denegado): no se
  bloquea el arranque. Lo que no se pudo mover se queda donde estaba, intacto,
  y se reintenta en el siguiente arranque. Mientras tanto, esa grabación no
  aparece en Análisis.

### Qué pasa con las copias que ya existen

| Copia | Qué pasa |
| --- | --- |
| La de la **activa** | La mueve la sesión en su primer arranque |
| La de la **anterior** | **No se toca.** Es la copia a la que se vuelve si la versión nueva falla. Se limpia cuando esa generación pasa a ser huérfana, en la siguiente actualización confirmada |
| Las de **huérfanas** | Las adopta el instalador en Confirm o al desinstalar: mueve lo que falte (por ejemplo, lo grabado por una versión que falló y se revirtió), borra lo repetido tras comprobar la huella, conserva lo distinto |
| **Instalaciones de testers** | Por código y fechas no tienen grabaciones: la migración no mueve nada. **No verificado** en una instalación real |

### La última copia

La actualización que trae este cambio la aplica el programa ya instalado
(`installed.rs:393-427`), que copia `data/` entero como hasta ahora. Después,
la sesión nueva mueve su copia a la carpeta única y, a partir de ahí,
`data/` ya no tiene grabaciones y las actualizaciones vuelven a copiar solo
MB. La generación anterior se queda con su copia hasta dejar de ser la
anterior. Es un coste de una sola vez y solo para quien ya tenga grabaciones.

## 5. Vuelta atrás y compatibilidad

| Caso | Qué ve el usuario |
| --- | --- |
| La versión nueva falla al arrancar y se vuelve a una **versión antigua** (que busca las grabaciones dentro de `data/`) | Ve **exactamente lo que tenía antes de actualizar**: su copia sigue intacta. No ve lo poco que grabó la versión que falló (igual que hoy). No falla ni muestra «sin grabaciones». Cuando llegue la versión corregida, se adopta todo: lo de la copia antigua, lo grabado después y lo que grabó la versión que falló |
| La versión nueva falla y se vuelve a otra **versión que ya conoce la carpeta única** | Ve **todo**, incluido lo grabado por la que falló. Las grabaciones ya no retroceden |
| Una grabación tiene un formato más nuevo que el programa que la lee | Aparece como **«incompatible»**; no se abre, no se modifica y no se borra (`storage/README.md:159-160`; `hub-host/src/protocol/modules/analysis/state.rs:426,454`). La poda no mira el contenido (`prune.rs:1`), así que funciona igual |
| La actualización falla **a mitad de copiar** | El instalador retira la generación a medias (`operations.rs:316-339`). Las grabaciones no estaban dentro: ni se copiaron ni se tocan |
| Se intenta instalar una **versión más antigua** encima | Ya se rechaza hoy sin tocar nada (`operations.rs:457-464`; con datos conservados, `operations.rs:375-381`) |
| Una versión antigua se encuentra la carpeta `recordings/` en la raíz | La ignora. El lector del instalador solo rechaza enlaces y nombres `.env` en la raíz, no carpetas desconocidas (`installation.rs:378-405`). **No verificado** con los ejecutables públicos 0.0.975 y 0.0.988 |

Regla que este ADR fija para el futuro: **las grabaciones son datos que solo
se añaden**. Un cambio de formato tiene que ser legible por el programa nuevo
sin reescribir los archivos viejos (ya se hace así: `storage/README.md:53-58`),
y un programa que no entienda un archivo lo marca como incompatible y lo deja
como está.

**Vuelta atrás del instalador antes de Confirm:** no cambia. Se intercambian
activa y anterior (`operations.rs:779-837`); los programas y el resto de
`data/` siguen cambiando juntos. Lo único nuevo es que las grabaciones no
participan.

## 6. Concurrencia

| Quién | Qué hace en `recordings/` | Cuándo | Por qué no choca |
| --- | --- | --- | --- |
| Núcleo (grabador) | Crea **un archivo nuevo** por arranque y escribe solo en él | Mientras hay sesión | Un único programa posee cada base (`storage/README.md:53`); nunca reabre una antigua para escribir |
| Núcleo (poda) | Borra las más antiguas | Solo al arrancar | Abre cada archivo en exclusiva; si alguien lo tiene abierto, lo salta y lo anota (`prune.rs:153-174,223-227`) |
| Anfitrión del Hub | Lee | Cuando el usuario abre Análisis | Abre en solo lectura y no abre una grabación que se está escribiendo (`hub-host/src/analysis/status.rs:153-177`); si está ocupada, muestra «ocupada» |
| Sesión (adoptar, solo mover) | Añade archivos | Al arrancar, **antes** de lanzar núcleo y Hub | Nadie más está vivo; tiene el bloqueo de sesión (`main.rs:510-517`) |
| Instalador (Setup, Reparar) | **Nada** | Con Vantare cerrado | Exige el bloqueo de sesión (`operations.rs:431-433`) y ya no encuentra grabaciones que copiar |
| Instalador (Desinstalar) | Trae grabaciones desde huérfanas | Con Vantare cerrado | Exige el bloqueo de sesión (`operations.rs:872-874`) |
| Instalador (Confirm) | Trae grabaciones desde huérfanas; lo que borra son copias dentro de `generations/` | Con el Hub abierto | Esas copias no las abre ningún programa nuevo, y se borran con el archivo abierto en exclusiva. Un archivo que llega a la carpeta única aparece en Análisis al refrescar |

- **DuckDB** admite un solo programa escribiendo en un archivo, o varios
  leyendo. La carpeta única no cambia eso: sigue habiendo un archivo por
  arranque y un solo escritor por archivo.
- **Dos sesiones a la vez** sobre la misma instalación no son posibles: lo
  impide el bloqueo de sesión.
- **Si el Hub y el núcleo vieran rutas distintas:** el núcleo grabaría en un
  sitio y el Hub miraría otro. No se pierde nada, pero el Hub enseñaría «sin
  grabaciones» y sin estado de grabación. Se evita por construcción (una sola
  función calcula la ruta y se la da a los dos) y con una prueba obligatoria
  que compara lo que recibe cada uno.

## 7. Poda (200 grabaciones o 5 GiB)

- **No cambia el código ni las cifras.** La sigue ejecutando el núcleo al
  arrancar, sobre la carpeta que recibe (`runtime/src/service/series.rs:58-63`).
- Lo que cambia es el efecto: el tope pasa a ser **de verdad por
  instalación**. Hoy son 5 GiB por cada copia.
- Dos detalles que ya existen y se mantienen: la poda solo corre si la
  grabación está encendida; y si no consigue bajar del tope, se graba
  igualmente y se avisa (`prune.rs:277-281`).
- Efecto pasajero a vigilar: el catálogo del Hub admite 256 archivos
  (`hub-host/src/analysis/mod.rs:25,509-511`) y la poda deja 200. Si una
  adopción junta más de 256 (solo posible tras una vuelta atrás, con muchas
  grabaciones), el Hub muestra un error de límite hasta el siguiente arranque
  del núcleo, que poda. No se pierde nada.

## 8. Desinstalar y Reparar

- **Desinstalar:** hoy los datos del usuario se conservan y la pantalla lo
  dice («Tus datos se conservan en…», `installer/src/screens/uninstall.rs:23`).
  El motor solo borra los archivos que enumera el manifiesto de cada
  generación (`operations.rs:931-963`); `recordings/` no está en ninguno, así
  que **se conserva sin tocar una línea**. Al reinstalar, las grabaciones
  siguen ahí, en la misma ruta. Recomendación: conservarlas, como el resto de
  datos, y que el texto las nombre. Borrarlas debe ser una acción explícita
  del usuario dentro del Hub, en una tarea aparte; hoy no existe ninguna
  función de borrar ni de exportar grabaciones.
- **Reparar:** crea una generación nueva de la misma versión y copia `data/`.
  Con las grabaciones fuera, copia MB y no toca las grabaciones. Deja de
  cambiarles la fecha.

## 9. Copia de seguridad y exportación

- **Copia de seguridad:** una sola carpeta. Con Vantare cerrado, copiar
  `<raíz>/recordings/` es una copia completa; cada `.duckdb` es una grabación
  independiente. Para restaurar, se devuelven los archivos a esa carpeta.
- **Aviso honesto:** hoy cada actualización dejaba, sin querer, una segunda
  copia de las grabaciones. Con este cambio hay una sola. Si el usuario borra
  esa carpeta, las pierde.
- **Exportar** (guardar una grabación donde el usuario elija) no existe hoy y
  no forma parte de este ADR. La carpeta única lo facilita: lo haría el
  anfitrión, y la pantalla seguiría sin ver rutas.

## 10. Interacción con el motor del instalador

| Pieza | Hoy | Con este ADR |
| --- | --- | --- |
| Copia de datos (`copy_data`, `write_fs.rs:269-287`) | Copia y comprueba todo `data/`, grabaciones incluidas | **Sin cambios de código.** Deja de encontrar grabaciones porque la sesión ya las sacó: copia MB |
| Deshacer una operación fallida (`Before::restore`, `operations.rs:288-347`) | Borra la generación nueva con los GiB recién copiados | **Sin cambios de código.** Ya no hay GiB que copiar ni que borrar |
| Vuelta atrás tras un arranque fallido (`operations.rs:779-837`) | Cambia programas y datos juntos | **Sin cambios.** Las grabaciones no participan |
| Reinstalar sin marcador de datos conservados (`operations.rs:388-403`) | Calcula la huella de todas las copias de `data/` para comprobar que son iguales | **Sin cambios de código**; pasa a comparar MB |
| Desinstalar (`operations.rs:867-976`) | Conserva `data/` | `recordings/` se conserva por la misma regla, sin código nuevo. Lo único que se añade es el barrido de huérfanas del PR 2 (fila de abajo) |
| PR 1 de #2740 (#2745): programas de huérfanas | Los retira en Confirm y al desinstalar; nunca mira `data/` | **Sin cambios.** Sigue su curso |
| **PR 2 de #2740: `data/` de huérfanas** | Tendría que leer hasta 5 GiB por huérfana y casi nunca podría borrar (las grabaciones ya podadas parecen únicas) | **Se simplifica:** primero adopta las grabaciones de la huérfana (mover o borrar si la huella coincide); lo que queda de su `data/` son MB, que se comparan con la activa como estaba previsto |

Nota para el PR 2, fuera de este ADR: el perfil de Electron (`hub/hub-ui/`)
contiene caché de gráficos que cambia en cada arranque. Si esa caché cuenta
como «algo único», ninguna huérfana se borraría nunca. Conviene que el plan
del PR 2 lo decida.

## 11. Qué se puede verificar y dónde

**En el servidor y en CI, sin máquina virtual:**

- La operación «adoptar» con el mismo sistema de pruebas del instalador
  (carpetas de prueba, sin tocar la instalación real): mover, repetir, cortar
  a mitad y continuar, archivo ocupado, permiso denegado, nombre repetido
  igual y distinto, `.wal`, archivos ajenos intactos, enlaces rechazados.
- Que núcleo y anfitrión reciben la misma ruta, instalado y en desarrollo.
- El recorrido de Análisis de extremo a extremo con el grabador real
  (`hub-host/src/analysis_e2e.rs` ya existe) apuntando a la carpeta única.
- Actualizar, Reparar, volver atrás y desinstalar con una carpeta
  `recordings/` presente: que nadie la toca.
- **Medir el antes y el después** con archivos inertes del tamaño real (1 GiB
  y 5 GiB) en D:: tiempo y disco de una actualización. El coste de copiar no
  depende del contenido, así que la medida vale.
- Mutaciones de control en la revisión (errores metidos a propósito para
  comprobar que las pruebas los detectan): borrar de más, borrar sin comparar
  huella, mover sobre un nombre existente.

**Solo en máquina virtual o en el PC de juego (con hora acordada):**

- El recorrido completo con Electron real: actualizar, primer arranque,
  Confirm y vuelta atrás.
- Una grabación de una sesión real (G5): tamaño por hora y que Análisis la
  abre desde la carpeta única.
- Windows 10, disco mecánico y antivirus (pueden retener un archivo unos
  instantes).
- Las instalaciones públicas 0.0.975 y 0.0.988 pasando por el Setup nuevo.

## 12. Trozos de implementación propuestos

Todos por debajo de 1 200 líneas. **Ninguno toca el contrato ni el protocolo
del anfitrión, ni `state.json`, ni el manifiesto.** No hay dependencias nuevas.

| Trozo | Qué hace | Dónde | Tamaño | Depende de |
| --- | --- | --- | --- | --- |
| **T1** | La operación «adoptar» y sus pruebas. No se conecta a nada todavía | `installer` (motor) | M · 500–800 líneas | #2745 fusionado (reutiliza su apertura en exclusiva) |
| **T2** | Ruta única en la sesión, argumento `--recordings-dir` del anfitrión y adopción al arrancar (solo mover). Con sus pruebas y el recorrido de Análisis adaptado | `runtime` (sesión), `hub-host` (argumentos) | M · 400–700 líneas | T1 |
| **T3** | PR 2 de #2740 rehecho: en Confirm y al desinstalar, adoptar con comprobación de huella desde la activa y las huérfanas, y retirar el `data/` de huérfanas sin nada único | `installer` (motor) | M · 500–800 líneas | T1 y #2745 |
| **T4** | Medición antes/después en el servidor y recorrido en máquina virtual | Evidencia | S | T2 y T3 |
| **T5** | Documentos (`native/README.md`, README de instalador, storage y anfitrión) y texto de desinstalación que nombre las grabaciones | Documentos y un texto | S · menos de 200 líneas | T2 |

### Orden de trabajo decidido por la raíz (20-11-2026)

1. **T1**, cuando se fusione #2745.
2. **T2 junto con T5.** T2 es el que hace efecto para el usuario.
3. **T3**, que **sustituye al PR 2 de #2740**: el PR 2 original queda
   cancelado. Donde este documento dice «PR 2 de #2740», ese trabajo lo
   hace T3.
4. **T4** (medición y máquina virtual), al final: depende de T2 y T3. Este
   último punto lo propone el orquestador del Hub; la raíz puede moverlo.

**Revisión de datos por Opus en T1 y T3**, además de la revisión
independiente con mutaciones como en #2745: son los dos trozos que tocan el
motor del instalador y los datos del usuario.

### Fechas del catálogo: issue propia

Por decisión de la raíz, va **aparte, como issue propia**
([#2749](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2749)),
y no forma parte de T1–T5: que el catálogo use la época que ya va en el
nombre del archivo en lugar de la fecha de creación, para arreglar las fechas
de las grabaciones que ya se hayan copiado alguna vez.

## 13. Riesgos y preguntas para la raíz

### Riesgos

1. **Borrar una grabación por error.** Es el riesgo principal. Se acota así:
   mover nunca borra; solo se borra una copia cuya huella coincide con la de
   la carpeta única, con el archivo abierto en exclusiva; lo dudoso se
   conserva. Revisión con mutaciones.
2. **Una sola copia.** Desaparecen las copias accidentales por generación.
3. **Formato más nuevo tras una vuelta atrás.** Se ve como «incompatible»; no
   se pierde. Obliga a mantener la regla de §5 en cada cambio de formato.
4. **Más de 256 archivos durante un rato** tras una adopción grande (§7).
5. **Rutas distintas entre núcleo y Hub** por un fallo de programación (§6).
   Una función y una prueba.
6. **Archivo retenido** por un antivirus al mover: se queda en origen y se
   reintenta; mientras, no aparece en Análisis.
7. **Instalaciones reales no inspeccionadas.** Todo lo dicho sobre testers
   sale del código y de las fechas.

### Preguntas (con recomendación)

**Decisión de la raíz (20-11-2026): se aceptan las doce respuestas tal como
se recomiendan.** El texto se conserva como se presentó.

1. **¿Se acepta la carpeta única `<raíz>/recordings/`?** Recomiendo que sí.
2. **¿Dentro de la raíz de instalación o en otra carpeta del usuario?**
   Recomiendo dentro. Una carpeta elegible por el usuario se puede añadir
   después sin rehacer nada, porque la ruta se resuelve en un solo sitio.
3. **¿Migración moviendo, hecha por la sesión nueva, y no copiando desde el
   instalador?** Recomiendo que sí: es menos código en la pieza más delicada
   y conserva la copia para la vuelta atrás.
4. **¿Se acepta que la actualización que trae el cambio copie las
   grabaciones una última vez?** Recomiendo que sí: no se puede evitar por la
   vía de actualización normal y hoy cuesta cero.
5. **¿Se acepta que, al volver a una versión antigua, se vea la copia de
   antes de actualizar y no lo grabado después?** Recomiendo que sí: es lo
   que pasa hoy, y se recupera todo con la versión corregida.
6. **La generación anterior conserva su copia de grabaciones hasta la
   siguiente actualización (hasta 5 GiB, solo en quien ya tuviera
   grabaciones). ¿Se limpia antes, justo tras Confirm?** Recomiendo no
   tocar la anterior en la primera entrega; se puede añadir después.
7. **¿Se mantiene el tope de 200 grabaciones o 5 GiB?** Recomiendo
   mantenerlo y revisarlo con la medición real de G5.
8. **Al desinstalar, ¿se conservan las grabaciones?** Recomiendo que sí,
   igual que el resto de datos, nombrándolas en el texto. Borrarlas, como
   acción explícita en el Hub, en tarea aparte.
9. **¿Copia de seguridad y exportación?** Recomiendo documentar la copia
   manual ahora y dejar «Exportar» como tarea aparte.
10. **¿Se abre la tarea pequeña de las fechas del catálogo?** Recomiendo que
    sí: es un fallo visible que ya existe.
11. **¿Se espera a la medición real (G5) para decidir?** Recomiendo que no:
    la decisión no depende de si son 20 o 26 MB por hora.
12. **¿Revisión de seguridad de datos por otro modelo (Opus) en T1 y T3?**
    Recomiendo que sí, como se propuso para el PR 2 de #2740.

## Relación con otras ADR

- **Enmienda [ADR 0103](0103-instalacion-nativa.md)** en dos frases, solo
  para las grabaciones:
  - «El cambio de versión desplaza juntos binarios y copia de datos»: sigue
    siendo cierto para todo `data/` menos las grabaciones.
  - «Un proceso instalado […] falla explícitamente, sin escribir por respaldo
    fuera de su generación»: las grabaciones pasan a escribirse fuera de la
    generación, en una ruta explícita de la raíz que da la sesión. No es un
    respaldo ni una ruta por defecto.
  - Se mantiene «nunca se borran `generations/*/data/`» con una excepción
    acotada: una grabación repetida cuya huella coincide con la de la carpeta
    única (§4). El resto del borrado de `data/` de huérfanas lo decide #2740.
- **Conserva** de ADR 0103: `state.json` esquema 1 sin campos nuevos, el
  manifiesto, los bloqueos, la vuelta atrás y que el instalador no elige
  entre datos distintos.
- **Conserva** de [ADR 0099](0099-arquitectura-rust-nativa.md): un único
  propietario de la base de datos y la escritura fuera del hilo que lee el
  simulador. **Conserva** de [ADR 0107](0107-hub-electron-nucleo-y-overlays-rust.md):
  la pantalla habla con el anfitrión y no conoce rutas.

## Enmiendas de implementación (T1 y T2, 20-11-2026)

Lo aprendido al implementar y revisar T1 (#2755) y T2 (#2758). No cambia la
decisión; precisa cinco puntos del texto de arriba.

1. **§4, «y su `.wal` si existe»: la pareja no se adopta.** Una grabación con
   un `.wal` o un temporal al lado se queda entera donde está y se anota.
   Mover dos archivos no es un solo paso: un corte entre los dos separaría la
   grabación de sus últimos cambios, y un `.wal` que llegara sin su grabación
   lo borraría la poda del núcleo a los diez minutos
   (`runtime/src/service/series/prune.rs:109-113`). Consecuencia: una
   grabación que no se cerró bien **antes** de este cambio no aparece en
   Análisis; sigue en `data/` de su generación y viaja con ella en cada
   actualización. Cerrarla en su carpeta para que el `.wal` desaparezca y
   adoptarla después queda como seguimiento. Las grabaciones nuevas no tienen
   este problema: nacen en la carpeta única, con su `.wal` al lado. T3 trata
   esas parejas como únicas.
2. **§4 y §6, cómo se mueve.** La grabación se abre en exclusiva y se cambia
   de sitio a través de esa misma apertura, no por su ruta: desde la
   comprobación hasta el movimiento nadie más puede abrirla. Con ella cogida
   se vuelve a mirar si ha aparecido un `.wal` o un temporal con su nombre, en
   el origen y en el destino. Nunca sustituye un archivo y, entre discos
   distintos, falla en vez de copiar.
3. **§3, «quién la crea».** No la crea la sesión por adelantado: la crea quien
   primero escribe en ella, la adopción al recibir la primera grabación o el
   núcleo al empezar a grabar. Si no existe, Análisis muestra el catálogo
   vacío.
4. **§6, la sesión no está sola del todo.** La adopción trabaja bajo
   `.operation.lock`, el mismo candado con el que el lanzador de la raíz
   renueva el registro de Windows justo después de arrancar la sesión. La
   sesión espera su turno dos segundos como máximo; si no lo consigue,
   arranca igual y lo reintenta en el siguiente arranque.

5. **§5, regla de publicación.** Desde la primera versión con la carpeta
   única, ninguna versión que no la conozca debe publicarse con un número
   mayor en el mismo canal: dejaría de mostrar todo lo adoptado, sin borrarlo.
   Además, un núcleo antiguo sí borra **por cupo** al podar la carpeta que
   recibe, también archivos de formato más nuevo: «incompatible» protege de
   abrirlos y modificarlos, no de la poda.

## Cómo se revisa esta decisión

Se reabre si una medición real demuestra que mover falla en equipos normales
(por ejemplo, por antivirus), si aparece una grabación perdida atribuible a
la adopción, o si los usuarios piden guardar las grabaciones en otro disco.

## Checks de esta entrega

Entrega solo documental. **Omitidos**, por no haber código: `cargo fmt`,
Clippy, tests, telemetría y lifecycle. **Hecho:** lectura completa de los
archivos citados en `origin/nightly` `286822afc`, comprobación de que el
número 0111 está libre en `nightly` y en los PR abiertos, y de que los
enlaces relativos existen.
