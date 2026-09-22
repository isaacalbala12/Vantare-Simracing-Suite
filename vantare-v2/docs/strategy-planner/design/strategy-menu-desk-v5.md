# Strategy — Menú de origen y mesa de carrera

**Dirección visual aprobada por Isaac el 22 de septiembre de 2026.**
Contrato de diseño del concepto A, revisión v5. Implementación: [ISA-1314](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1314), continuación de ISA-1277. Este documento fija la apariencia, la composición y las interacciones que deben mantenerse al llevar la referencia a la aplicación.

La referencia aprobada es el menú «Elige tu punto de partida.» del HTML v5 entregado en `concepto-A-menu-v5.zip`. La aprobación sustituye la dirección anterior de Strategy basada en el garaje y el asistente de cinco pasos. Conserva el sistema Orbit de Vantare y todos los contratos funcionales de Strategy registrada.

## 1. Intención

Strategy empieza con una decisión reconocible: usar una sesión de telemetría o preparar la carrera desde referencias manuales. La entrada debe sentirse como un menú cuidado de un juego de gestión, con espacio, identidad y dos acciones claras. Después se trabaja en una mesa compacta: la carrera permanece visible mientras el lateral permite ajustar sus condiciones.

La presencia visual nace del contraste entre superficies grises, la tipografía y el tamaño de las zonas. El rojo señala actividad o interacción. Las cifras y los controles aparecen cuando ayudan a preparar la carrera; no llenan el menú inicial.

## 2. Sistema visual

La fuente de color es `frontend/src/styles/orbit.tokens.css`. Se consumen sus variables; no se crea un segundo tema ni se altera el resto de Vantare.

| Función | Token Orbit | Valor de referencia |
|---|---|---|
| Lienzo | `--orbit-canvas` | `#08090b` |
| Rail | `--orbit-rail-bg` | `#0b0c0e` |
| Columna / panel de telemetría | `--orbit-column-bg` | `#0f1013` |
| Superficie inferior | `--orbit-surface-0` | `#0d0e11` |
| Tarjetas | `--orbit-surface-1` | `#121316` |
| Superficie elevada | `--orbit-surface-2` | `#18191e` |
| Detalle y controles destacados | `--orbit-surface-3` | `#202127` |
| Texto principal | `--orbit-ink` | `#f5f3f2` |
| Texto secundario | `--orbit-ink-2` | `#b7b2b2` |
| Metadatos | `--orbit-ink-3` | `#8a858b` |
| Ayuda discreta | `--orbit-ink-4` | `#787379` |
| Decoración tenue | `--orbit-ink-muted` | `#57545a` |
| Separador fino | `--orbit-line` | Blanco al 7,5 % |
| Borde de tarjeta | `--orbit-line-strong` | Blanco al 13 % |
| Acento principal | `--orbit-carmine` | `#d52f49` |
| Foco / acento activo | `--orbit-red` | `#f04755` |
| Acento puntual cálido | `--orbit-coral` | `#ff6a5f` |
| Acción principal | `--orbit-primary-bg` / `--orbit-primary-ink` | `#f3eeee` / `#1c1719` |

El gris debe ocupar toda la estructura. Carmín aparece en la marca activa del rail, el borde de una tarjeta interactiva, pequeños puntos y la selección. No se extiende como un resplandor rojo sobre el fondo. El blanco cálido diferencia la acción principal sin introducir un nuevo color de marca. Colores de neumático, advertencia o estado conservan su significado y no se usan para decorar paneles.

Los degradados permitidos son tonales y locales: iluminación muy suave del póster y transición de `surface-2` a `column-bg` en Manual. Se retiran las fotografías de garaje, los velos sobre fotografías y los reflejos que competían con la información.

## 3. Tipografía y detalle

Inter es la tipografía de interfaz; Cascadia Code queda para tiempos, unidades, revisiones y cifras que necesiten alineación. Se reutilizan las fuentes y los iconos de la aplicación.

| Elemento | Referencia en escritorio |
|---|---|
| Título del menú | 42 px, peso 600, interlínea 1,15, tracking −0,05 em |
| Título del bloque Manual | 32 px, peso 550, interlínea 1,13 |
| Título de sección Telemetría | 23 px, peso 550 |
| Identidad principal de tarjeta | 26 px, peso 550 |
| Descripción del menú | 13 px, interlínea 1,6 |
| Etiquetas de sección | Mayúsculas discretas, tracking 0,11–0,13 em |
| Metadatos y ayuda | Menores que el contenido; no depender de ellos para identificar una acción |

La referencia reduce el título a 36 px bajo 1560 px y a 34 px bajo 1320 px. Los nombres reales pueden ocupar más de una línea. No se achica una ruta extensa hasta hacerla ilegible ni se recorta la identidad sin una alternativa accesible.

Bordes de un píxel y radios nativos: panel 18 px, controles y tarjetas 12 px. Las sombras tienen presencia mínima. El espacio entre grupos, la alineación y los cambios de superficie separan los contenidos.

## 4. Composición del menú

La navegación pertenece a la shell productiva: rail comprimido de 81 px, icono de Estrategia activo y barra superior de 70 px. No se dibuja una segunda barra ni se sustituye el rail por iconos parecidos. La columna contextual expandida no ocupa el menú.

El contenido tiene un ancho máximo de 1480 px, centrado, con 40 px de margen vertical y 48 px lateral en escritorio amplio. El título y la descripción están arriba; las dos zonas principales se alinean debajo. El margen inferior contiene una sola ayuda sobre dónde se ajustan las reglas.

| Zona | Geometría y contenido |
|---|---|
| Cabecera | «Nueva estrategia», «Elige tu punto de partida.» y una frase breve. Marca de Strategy tenue a la derecha. |
| Telemetría | Zona dominante: `minmax(0, 2.2fr)`. Título y formato, dos tarjetas recientes, acción para abrir la biblioteca. |
| Manual | `minmax(300px, 1fr)`. Composición vertical con ilustración técnica, título, explicación y acción propia. |
| Separación | 24 px entre Telemetría y Manual; 16 px entre tarjetas. |
| Tarjeta de sesión | Póster de 212 px, identidad, metadatos y flecha circular. Toda la tarjeta es una acción. |
| Pie de Telemetría | Texto de ayuda a la izquierda y «Abrir telemetría» en blanco cálido a la derecha. |
| Pie de Manual | «Empezar en manual», a todo el ancho, sobre gris elevado. |

Las dos opciones no son tarjetas gemelas: Telemetría muestra el material desde el que empezar; Manual expresa la creación propia. El título de Manual se compone en dos líneas: «Crea tu / propia estrategia.» Su ilustración tiene círculos concéntricos finos, icono de ajustes y tres líneas oblicuas con puntos discretos. Es decorativa y no simula una gráfica de datos.

Las tarjetas de telemetría tienen tipografía de fondo tenue y una carátula técnica. Un contorno de circuito sólo se muestra si se dispone del recurso correcto para la identidad verificada. Antes de abrir un archivo, se utiliza su nombre saneado y una carátula documental abstracta. No se adivinan circuito, coche, vueltas o ritmo a partir del nombre del archivo.

**El menú no contiene** selectores de duración, formularios de reglas, combustible, pilotos, indicadores de pasos ni un botón «Siguiente». La navegación principal son las sesiones y la opción manual.

## 5. Recorrido y estados

| Acción o estado | Comportamiento esperado |
|---|---|
| Entrar en Strategy | Mostrar el menú y descubrir candidatos con el mecanismo existente. Descubrir no abre contenido. |
| Pulsar una sesión utilizable | Abrir con Analysis, verificar identidad/revisión y adoptarla mediante la acción explícita. Entrar en la mesa sólo al terminar correctamente. |
| Pulsar «Abrir telemetría» | Biblioteca en una pantalla completa, con búsqueda, estados y retorno al menú o a la carrera de origen. |
| Pulsar «Empezar en manual» | Entrar en la mesa con la combinación editable. No exigir una sesión ni conservar referencias de telemetría como si fueran manuales. |
| Descubrimiento en curso | Estado visible y acción de cancelación cuando corresponda. Sin porcentajes inventados. |
| Archivo todavía inestable / WAL activo | Explicar su disponibilidad y respetar la comprobación de estabilidad. No habilitar una lectura insegura para reducir un clic. |
| No hay sesiones | Estado vacío con la misma presencia visual; acceso a biblioteca/manual. Sin sesiones de muestra. |
| Fallo de apertura o cancelación | Permanecer en un lugar recuperable y conservar el borrador. No simular una sesión adoptada. |
| Metadatos incompletos | Explicar qué falta; conservar inspección cuando el contrato actual lo permite. No anunciar base de cálculo válida. |
| Cambiar origen | Volver al menú sin recrear el borrador. Mostrar retorno a la carrera en curso. Adoptar otro origen es una decisión explícita. |
| Abrir carrera guardada | Recuperar su contexto sin repetir una introducción obligatoria. |

El contenido de una sesión procede de los clientes existentes. Los originales permanecen intactos; las correcciones tienen su revisión separada. No hay una lectura alternativa en la UI, un motor de muestra ni un cálculo local que sustituya al backend.

## 6. Mesa de preparación y edición

Corrección de Isaac del 22 de septiembre, ISA-1322: no basta con reutilizar un resumen previo y cambiar sus colores. La composición se toma directamente de `workflow.js` (`context`, `sourcePanel`, `entryPanel`, `sourceChoices`/`manualInputs`, `referenceCards`, `preparationInspector`) y `workflow.css` del HTML aprobado. El resumen general antiguo no se inserta de nuevo en el centro.

| Zona | Contrato de composición |
|---|---|
| Cabecera | Compacta, junto a la identidad y acciones; sin otra banda de 120 px que desplace la mesa. Cambiar origen vuelve al menú y conserva el borrador. |
| Tablero | Margen interior 16 px y separación 12 px; contexto y centro dentro del tablero, inspector acoplado fuera a la derecha. |
| Contexto izquierdo | Panel gris con borde y radio. Identidad del circuito y coche, origen y acción explícita para cambiar combinación. El formulario se despliega sólo cuando hace falta; campos en columna, etiqueta encima y ancho completo. |
| Centro, base | Tarjeta «Base de la estrategia»: cabecera de 54 px, cuerpo con titular humano sobre la base elegida, explicación y acción pertinente, motivo visual documental sobrio y pie de procedencia. |
| Centro, fuentes | Tabla de las fuentes reales seleccionadas con acceso a biblioteca; en manual, referencias editables de ritmo, Fuel y VE aplicable. No una segunda fila de Evento/Reglas/Pilotos. |
| Centro, referencias | Tarjetas de ritmo, combustible y energía virtual cuando sea aplicable. Sólo valores observados de la revisión adoptada o estimaciones manuales explícitas; lo ausente aparece pendiente. |
| Inspector | 395 px en escritorio, 320 px bajo 1560 px. Resumen del evento con duración prominente, condiciones y pilotos. Pestañas/acciones para editar reglas y pilotos. Pie con acción principal visible, cuerpo con scroll independiente. |

No repetir circuito/coche/origen en varios resúmenes centrales. No encajar los selectores horizontales heredados en una columna de 215 px. Ningún nombre, control ni acción puede quedar recortado; los textos largos se ajustan o truncan de forma deliberada con acceso al valor completo. La geometría de circuito sólo se muestra si el recurso corresponde a la identidad real: no dibujar un circuito genérico como si fuera el observado.

La shell conoce la disposición compacta de Strategy desde el cambio de ruta, antes de cargar su componente diferido. No se anima la rejilla global ni se desplaza toda la interfaz al entrar. Los estados de hover/foco de controles pueden mantener su feedback local.

La edición reutiliza los controles y validadores productivos. Manual conserva referencias explícitas de ritmo, combustible y VE aplicable en el borrador y usa los overrides del comando Go existente. La ruta registrada mantiene las revisiones exactas y su autoridad de Analysis; no se fabrica una proyección para llenar las tarjetas.

Las reglas del evento, calendario, pilotos, límites, inventario, recursos y reservas conservan el alcance funcional actual. Los datos ausentes siguen pendientes; las estimaciones entre pilotos se identifican. Guardar, calcular y aceptar siguen siendo acciones distintas. Los errores mantienen accesible la edición y no anuncian como óptimo un resultado parcial o solamente factible.

## 7. Adaptación y accesibilidad

- Escritorio amplio: mantener la proporción Telemetría/Manual, dos tarjetas y la separación de las tres zonas de la mesa.
- Bajo 1560 px: márgenes de 30 × 36 px, separación de 18 px, póster de 168 px y título de 36 px, siguiendo v5.
- Bajo 1320 px: margen de 28 px, separación de 16 px, póster de 158 px y título de 34 px.
- Cuando no cabe la composición: pasar las zonas a filas; no escalar el escritorio entero ni ocultar contenido mediante `overflow-x: hidden` como sustituto de un layout correcto. Manual y las acciones de sesión siguen accesibles.
- El inspector puede ocupar una sección de ancho completo en tamaños pequeños; volver a la carrera conserva el estado. La biblioteca mantiene paginación para no montar centenares de filas.
- Verificar 320, 768, 1024, 1672 y 1920 px, con nombres largos y los cuatro idiomas actuales. El scroll necesario es vertical o del contenedor de datos, no de toda la shell en horizontal.
- Tarjetas implementadas como botones, orden de tabulación lógico, foco visible, nombre accesible con identidad y acción. Los adornos usan `aria-hidden`.
- Hover: transición nativa de 130 ms, borde carmín y desplazamiento máximo de 3 px en tarjetas. Con movimiento reducido se elimina el desplazamiento y la transición.
- Estados de carga, error y selección se comunican con texto además del color. Los controles deshabilitados tienen una causa visible cerca de la acción.

## 8. Fidelidad y evidencia

La revisión se realiza sobre componentes de la aplicación. El HTML aprobado orienta composición y medidas; no se incrusta como una app paralela. Los datos de ejemplo del HTML nunca pasan al producto.

Para aceptar el porte hay que comprobar:

1. Mismo rail, grises, proporciones asimétricas, tipografía, dibujo Manual y jerarquía del menú v5.
2. Entrada manual y entrada desde sesión funcionales; biblioteca, cancelación, errores y retorno recuperables.
3. Mesa sin asistente obligatorio; combinación, reglas y pilotos accesibles y validados.
4. Conservación de datos, correcciones, revisiones, guardado, cálculo y editores de stint/parada.
5. Pruebas de comportamiento, tipos, build, lint e i18n; evidencia visual productiva separada de pruebas del backend y de una ejecución Wails con DuckDB real.

La revisión v5 recibió aprobación visual del usuario. Su HTML local había sido bloqueado por la política de navegación de las herramientas; no se dispone de capturas automáticas verificadas de ese archivo. La aprobación no equivale a haber verificado aún su porte productivo. No se rehostea ni se cambia de herramienta para eludir ese bloqueo.

## 9. Trazabilidad de la referencia

Archivo entregado: `concepto-A-menu-v5.zip`, SHA-256 `566a5fa7495dc550fab8c24796bae67adb1bbbdcaa5e98279a15b172af652114`.

| Archivo de referencia | SHA-256 |
|---|---|
| `index.html` | `3d9432fb29fe43a17cdfa6735a496c9eb68fd1c72f989f1cf1403051b725d8ce` |
| `assets/entry-menu.css` | `c0cdcad40f443ec566dff2ab87772aea6f857d7388cb27c32aa6fb8cf7a79edc` |
| `assets/workflow.js` | `a2cd44e7ef6b45a3464343544a2bc01a5c35b11b84a2b24c70aed3ab77516c78` |

Se mantienen como antecedentes los documentos y capturas A4 de ISA-1277. Su asistente y tratamiento de garaje dejan de ser la referencia visual vigente. Los contratos de Analysis, Strategy y persistencia, la validación numérica y los pendientes de pruebas nativas siguen vigentes en el SDD y en el handoff único.

## 10. Estado del porte productivo

ISA-1314 incorpora el menú y la mesa en React, reutilizando los controles y el motor existentes. ISA-1318 permite probar la build local sin cuenta y mantiene separado el comportamiento comercial. ISA-1322 corrige la transición de entrada y la composición de la preparación tras la revisión nativa del usuario.

La preparación abre Plan tras guardar su configuración; Datos/Revisiones/Plan y sus editores conservan su implementación productiva. La revisión de ISA-1322 cubre la preparación y su inspector; no acredita por extensión todas las pantallas posteriores ni el gate T22 integral. Las tarjetas de referencias de telemetría siguen pendientes hasta que esta vista disponga de la proyección de la revisión exacta; no se sustituyen con métricas de ejemplo.

Véanse las evidencias de [ISA-1314](../evidence/isa-1314/README.md) y [ISA-1322](../evidence/isa-1322/README.md). La aprobación del HTML se distingue de la aceptación del porte productivo, que corresponde a Isaac.
