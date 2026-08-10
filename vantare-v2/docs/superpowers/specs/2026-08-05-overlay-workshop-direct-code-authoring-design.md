# Overlay Workshop: autoría directa sobre código productivo

> **Especificación técnica histórica.** Conserva la decisión aplicada durante
> ISA-291, pero no autoriza trabajo ni fija estado, rama o base actuales. Linear
> posee el alcance y los valores esperados; Git demuestra el checkout real.

- Estado en el snapshot: especificación canónica para revisión de Isaac
- Fecha: 2026-08-05
- Issue del snapshot: ISA-291 / OS-09G2
- Programa padre: ISA-259 / OS-09
- Base observada entonces: ISA-265 en `54088b2e5ad25d9a897cb89187ee9684b75c645f`
- Riesgo: medio; tooling y documentación de autoría sobre renderizadores productivos

## 1. Decisión

Overlay Workshop será una superficie de desarrollo que renderiza y recarga el
**mismo código TSX/CSS que utiliza Vantare en producción**. No habrá conversión
Workshop→aplicación, catálogo paralelo, lenguaje declarativo general, scaffolder
obligatorio ni copia posterior del diseño.

El flujo canónico es:

1. El agente o diseñador modifica el componente, los estilos o la configuración
   productiva del widget.
2. Vite aplica HMR en `/workshop`.
3. Workshop vuelve a renderizar el widget mediante `WidgetVisualHost` y los
   renderizadores registrados reales.
4. Las fixtures deterministas permiten revisar estados, superficies y tamaños.
5. Tras la aprobación, el diseño ya es código de la aplicación y pasa los gates
   técnicos y de entrega; no se reimplementa.

Esta decisión sustituye el enfoque de ISA-266–278. Esas issues se conservan como
trazabilidad, pero sus declaraciones universales, migración masiva, generated
barrel, scaffolder y `catalogPosition` no forman parte del producto.

## 2. Problema que se resuelve

La creación de widgets era lenta porque el flujo mental y operativo parecía
exigir una referencia HTML, una traducción posterior y una validación tardía en
la aplicación real. La propuesta declarativa posterior intentaba reducir ese
coste creando otra representación de cada diseño, pero introducía un segundo
sistema que también habría que mantener, validar y depurar.

La infraestructura de ISA-260–265 ya resuelve la parte difícil:

- `WidgetVisualHost` es la frontera única de renderizado.
- Studio, Desktop, OBS, Harness y Workshop usan los renderizadores productivos.
- Las fixtures son neutrales, deterministas y portables.
- `/workshop` existe únicamente en desarrollo y soporta HMR.
- El selector reproduce widget, sistema, diseño, estado, sesión, localización,
  superficie, variante, fondo, escala y dimensiones.
- El protocolo visual captura el root contractual sin incluir el fondo o stage.

ISA-291 debe convertir esa infraestructura en un contrato sencillo de autoría,
demostrar el bucle rápido y retirar del plan la arquitectura duplicada.

## 3. Objetivos

### 3.1 Objetivo principal

Permitir que Isaac pida «crea o modifica este overlay» y que un agente pueda
editar el código definitivo, mostrar el resultado casi inmediatamente en un
servidor local y entregar el mismo renderer sin una segunda conversión.

### 3.2 Objetivos operativos

- Mantener una única fuente de verdad para cada diseño.
- Reducir el tiempo entre edición visual y observación del resultado.
- Hacer explícito dónde se modifica un restyle, una composición o un sistema.
- Conservar tipos y settings estrictos donde aportan seguridad real.
- Permitir validación rápida sin ejecutar siempre el gate visual de 5–8 minutos.
- Conservar un gate final reproducible antes de `nightly`.
- Ser comprensible para agentes con poco contexto mediante una guía ejecutable.
- Evitar que herramientas de desarrollo entren en Stable.

## 4. No objetivos

ISA-291 no implementará:

- un editor no-code o low-code;
- una DSL visual o JSON capaz de expresar cualquier widget;
- un conversor automático HTML→TSX/CSS;
- un registro genérico de plantillas;
- un generated barrel o descubrimiento mediante `import.meta.glob`;
- un scaffolder obligatorio;
- una migración de los 41 diseños existentes;
- `catalogPosition` u otro metadato cuyo único fin sea ordenar el array;
- un segundo host, registry o renderer de Workshop;
- persistencia de borradores de diseño;
- cambios de píxeles en los widgets existentes;
- cambios en canvas, drag/resize, LMU, Wails/SSE, Billing o perfiles;
- regeneración de baselines para ocultar diferencias.

Una abstracción nueva solo podrá proponerse más adelante si al menos tres casos
reales repiten la misma estructura y la extracción reduce código sin ocultar el
contrato visual.

## 5. Alternativas evaluadas

### 5.1 Autoría directa TSX/CSS — seleccionada

Workshop importa indirectamente los renderizadores productivos a través del host
real. Vite ya conoce el grafo y recarga los módulos modificados.

Ventajas:

- una sola implementación;
- feedback inmediato;
- máxima libertad visual;
- tipos, tests y build existentes siguen siendo autoridad;
- cualquier diseño que React/CSS pueda expresar es posible;
- no existe una fase de traducción o reconciliación.

Coste aceptado:

- crear un widget nuevo sigue requiriendo entender su ViewModel, renderer y
  catálogo; la guía debe indicar las rutas exactas.

### 5.2 Declaraciones tipadas universales — descartada

Pretendía describir cada composición como datos y transformarla en React.

Se descarta porque:

- duplica la representación de diseños existentes;
- restringe composiciones complejas o fuerza escapes arbitrarios;
- añade migraciones, generators y validadores sin reducir el trabajo visual;
- crea una nueva frontera susceptible de divergir de Studio/Desktop/OBS;
- obliga a migrar el catálogo antes de obtener valor.

Los settings tipados específicos de un renderer, como un `templateId` real, sí
se conservan. Lo descartado es el envoltorio universal.

### 5.3 HTML como fuente compilable — descartada

El HTML seguirá siendo una referencia válida para explorar un diseño, pero no
será fuente productiva ni se copiará al runtime.

Se descarta como arquitectura porque tendría que resolver componentes, estado,
telemetría, accesibilidad, sanitización, estilos, fuentes y contratos React. El
resultado sería un compilador propio más frágil que editar TSX/CSS directamente.

## 6. Arquitectura canónica

### 6.1 Fuente única de renderizado

`frontend/src/overlay/core/WidgetVisualHost.tsx` conserva estas responsabilidades:

- resolver el tipo funcional mediante `widgetTypeRegistry`;
- construir el ViewModel puro desde la snapshot y el contenido;
- validar y migrar settings visuales mediante el manifest del sistema;
- seleccionar el renderer registrado;
- aislar errores mediante `WidgetRenderBoundary`;
- emitir diagnósticos sanitizados.

Workshop no importará renderers concretos para decidir qué mostrar. Recibirá un
`WidgetInstanceV3`, una snapshot y una superficie, igual que los demás
consumidores. Las excepciones de preparación de fixture, como Engineer Radio,
pertenecen a la entrada runtime tipada y no cambian el selector visual.

### 6.2 Catálogo oficial

`frontend/src/overlay/design-systems/official-designs.ts` sigue siendo el índice
explícito de diseños oficiales. El orden visible se deriva del orden legible del
array mientras no exista un requisito real de orden independiente.

Cada registro declara únicamente lo necesario:

- identidad estable;
- nombre;
- tipo funcional;
- sistema y versiones;
- settings visuales;
- si incluye contenido;
- origen y default.

No declara ruta de componente, import dinámico, posición artificial ni markup.
El renderer y su manifest siguen siendo autoridades de ejecución.

### 6.3 Settings y composiciones

Un `templateId` se utiliza solo cuando varias composiciones reales comparten el
mismo tipo y sistema visual. Debe cumplir este contrato:

- unión literal específica del renderer;
- parser fail-closed o fallback explícito y diagnosticable;
- default estable;
- rama de renderizado dentro del renderer del sistema existente;
- tests de cada valor permitido y de valores desconocidos;
- entrada correspondiente en `official-designs.ts`.

No todos los widgets necesitan `templateId`. Un cambio de color, tipografía,
espaciado o detalle visual que no altera la composición se implementa en TSX/CSS
sin inventar una variante.

### 6.4 Sistemas visuales

Vantare Original y Vantare Crystal continúan como sistemas completos. Añadir un
sistema futuro requiere el manifest y los registros productivos del sistema, no
una skin exclusiva de Workshop. Un sistema define lenguaje visual, primitives,
settings, migraciones y renderizadores, pero conserva los ViewModels funcionales.

### 6.5 Ruta de desarrollo

`/workshop` permanece bajo `import.meta.env.DEV` y carga dinámica. No habrá una
segunda entrada Vite. El boot normal de Wails no se inicializa dentro de esta
ruta. Los controles y la URL son efímeros; no modifican perfiles ni layouts.

La ruta de desarrollo puede utilizarse localmente por agentes y por Isaac. La
política futura de builds internas permanece separada:

- local DEV: disponible;
- Nightly/Testers: solo owner firmado si ISA-264 lo demuestra y autoriza;
- Stable: ausencia física de ruta, chunk, fixtures y sentinels de autoría.

ISA-291 no implementa ni altera la autoridad de acceso.

## 7. Flujos de autoría

### 7.1 Restyle de un diseño existente

Se aplica cuando no cambia la estructura funcional del widget.

1. Abrir el diseño y estado objetivo en Workshop mediante URL reproducible.
2. Modificar el TSX, CSS scoped o tokens del sistema que ya consume el renderer.
3. Observar el cambio por HMR.
4. Revisar transparent/grid/solid/context para separar widget y escenario.
5. Revisar Studio/Desktop/OBS cuando el cambio pueda depender de superficie.
6. Ejecutar test focal y captura del root.
7. Ejecutar el gate final antes de entregar.

No se crea un diseño nuevo si solo se corrige el diseño existente.

### 7.2 Nueva composición del mismo tipo y sistema

Se aplica cuando la función es la misma pero cambia sustancialmente la forma,
orden, jerarquía o composición visual.

1. Añadir el componente presentacional o rama de composición junto al renderer.
2. Añadir CSS scoped junto al sistema/tipo correspondiente.
3. Ampliar la unión literal y parser de `templateId` si el renderer ya necesita
   seleccionar entre composiciones.
4. Añadir el diseño explícito a `official-designs.ts`.
5. Añadir tests de parser, renderer, catálogo y selección Workshop.
6. Validar el mismo ViewModel en estados y superficies relevantes.

No se crea un nuevo `WidgetType`, ViewModel o reader si la función no cambia.

### 7.3 Nuevo tipo funcional

Se aplica cuando cambian los datos, comportamiento o propósito del widget.

1. Definir el `WidgetType` y su contrato de contenido.
2. Crear ViewModel puro y readers/derivaciones fuera del renderer.
3. Registrar la definición funcional.
4. Registrar Original y/o Crystal solo cuando el renderer sea real.
5. Añadir diseños oficiales.
6. Añadir fixture determinista y estados honestos.
7. Workshop lo descubre desde las autoridades productivas existentes.

Workshop no genera el tipo ni introduce placeholders de catálogo.

### 7.4 Nuevo sistema visual

Se aplica cuando cambia el lenguaje visual completo de varios widgets.

1. Definir identidad y versión del sistema.
2. Crear primitives y tokens scoped.
3. Registrar settings, migraciones y renderers reales por tipo soportado.
4. Añadir diseños oficiales únicamente para parejas soportadas.
5. Añadir fixtures/capturas sin duplicar ViewModels.
6. Workshop lo ofrece cuando catálogo y registry confirman la pareja.

## 8. Flujo de datos y aislamiento

El flujo permitido es:

`query validada → fixture determinista → WidgetInstanceV3 + snapshot → WidgetVisualViewport → WidgetVisualHost → manifest/renderer productivo`

Restricciones:

- el stage solo controla fondo y contexto visual;
- el root del widget no hereda el fondo como parte de la captura;
- la superficie se pasa al renderer, pero no se inserta en el ViewModel;
- las fixtures no acceden a LMU, Wails, SSE, perfiles o almacenamiento;
- los renderers no acceden a Workshop ni a su query;
- Workshop no escribe en documentos de usuario;
- una query inválida falla cerrada antes del renderizado.

## 9. HMR y bucle rápido

### 9.1 Contrato observable

El piloto de ISA-291 debe demostrar mecánicamente:

1. El servidor Vite parte de un árbol limpio.
2. Workshop abre una URL fija con fixture determinista.
3. Un cambio controlado en CSS productivo aparece sin reiniciar Vite.
4. El archivo se restaura byte a byte y la vista vuelve al estado inicial.
5. Un cambio controlado en TSX productivo aparece sin reiniciar Vite.
6. El archivo se restaura byte a byte y la vista vuelve al estado inicial.
7. No quedan archivos modificados, procesos, puertos ni artefactos versionados.

El piloto no cambia permanentemente píxeles del producto. Utiliza marcadores
temporales seguros que el script aplica y revierte dentro de un `try/finally`.
Si no puede restaurar el contenido exacto, falla y conserva evidencia en un
directorio temporal ignorado.

### 9.2 Velocidad esperada

El bucle interactivo no debe ejecutar el protocolo visual completo tras cada
tecla. HMR debe ser el feedback inmediato; las pruebas focales verifican el
contrato al cerrar un microcorte.

## 10. Escalera de validación

### Gate A — durante la iteración

- HMR visible en la URL objetivo.
- Consola y page errors relevantes en cero.
- Estado/superficie principal del cambio.
- Ninguna escritura en perfiles o almacenamiento.

### Gate B — antes de commit

- Vitest focal del renderer, settings, catálogo o Workshop afectado.
- ESLint focal de archivos modificados.
- `git diff --check`.
- Build frontend cuando cambia el grafo productivo.
- Comprobación de compile-out si se toca authoring/bootstrap.

### Gate C — entrega de un diseño

- estados ready, stale, disconnected y error cuando sean aplicables;
- fondos transparent, grid, solid y context;
- Studio, Desktop y OBS cuando sean aplicables;
- root contractual, alpha, bounds, overflow y fuentes;
- protocolo visual focal del diseño;
- baseline/paridad únicamente si el alcance visual lo exige;
- captura y pasos manuales para Isaac;
- revisión independiente sin hallazgos abiertos razonables.

### Gate D — programa OS-09 previo a Nightly

- suite focal acumulativa de Workshop;
- build frontend;
- compile-out Stable;
- protocolo visual limpio sobre `HEAD`, con `dirty=false`;
- ninguna dependencia nueva;
- ningún renderer o host paralelo;
- handoff y Linear actualizados;
- aprobación explícita de Isaac antes de promover.

## 11. Errores y comportamiento fail-closed

- Widget desconocido: la query se rechaza.
- Sistema no soportado por el tipo: la query se rechaza.
- Diseño ausente o incompatible: la query se rechaza.
- `templateId` desconocido: parser del renderer aplica su contrato explícito y
  emite diagnóstico cuando corresponda; nunca importa un módulo por texto.
- Fixture no disponible: no se inventan datos live.
- Renderer lanza: `WidgetRenderBoundary` contiene el fallo.
- HMR pierde conexión: se informa y se permite recargar; no se altera producto.
- Piloto no puede revertir: falla y no realiza commit.
- Captura incluye stage o fondo: el protocolo visual falla.

Los mensajes no incluirán rutas personales, secretos, telemetría real o payloads
de usuario.

## 12. Archivos y responsabilidades previstas

ISA-291 debe mantener un write set pequeño. La implementación se planificará
sobre estas rutas, condicionadas por TDD:

- `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
  — decisión canónica.
- `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`
  — microplan ejecutable.
- `docs/overlays-studio/os-09-overlay-workshop-contract.md`
  — contrato operativo vigente y retirada del enfoque declarativo.
- `docs/overlays-studio/overlay-workshop-authoring-guide.md`
  — receta para restyle, composición, tipo y sistema.
- `frontend/scripts/overlay-workshop-hmr-smoke.mjs`
  — piloto reversible TSX/CSS, sin cambios visuales permanentes.
- `frontend/scripts/overlay-workshop-hmr-smoke.node-test.mjs`
  — helpers de mutación/reversión y fallos.
- `frontend/package.json`
  — script focal, solo si TDD demuestra que es necesario.
- `frontend/src/overlay/authoring/OverlayWorkshopDevRoute.test.tsx`
  — regresión del uso de catálogo/host real, solo si falta cobertura observable.
- `frontend/src/overlay/core/overlay-workshop-characterization.test.ts`
  — guard contra host/registry paralelo, solo si la prueba actual no cubre el
  nuevo contrato.
- `frontend/src/overlay/design-systems/official-designs.test.ts`
  — reglas mínimas del catálogo, sin `catalogPosition` ni registry genérico.
- Linear y el handoff de Overlay Studio
  — estado esperado y continuidad técnica, respectivamente.

No se modificarán renderers visuales ni `official-designs.ts` para fabricar una
demostración. El smoke puede tocar temporalmente un archivo bajo control del
script, pero debe restaurarlo byte a byte y dejar el worktree limpio.

## 13. Estrategia Git y Linear aplicada durante ISA-291

- La rama y el worktree se verificaron contra Linear y Git durante ISA-291; no
  se reutilizan desde esta especificación histórica.
- Commits pequeños por documentación, test y tooling.
- Staging por rutas; nunca `git add .`.
- ISA-266–278 permanecen canceladas y enlazadas a ISA-291.
- ISA-279 y ISA-280 quedan bloqueadas por ISA-291, no por el enfoque descartado.
- Las ramas ISA-269/274 no se integran; cualquier limpieza física posterior debe
  comprobar antes cambios sin commit y queda fuera de ISA-291.
- El resultado puede terminar en review técnico, pero no entra en `nightly`
  hasta la aprobación inicial de Isaac.
- `testers` y `master` quedan fuera del alcance.

## 14. Riesgos y mitigaciones

### 14.1 HMR aparente pero renderer incorrecto

Mitigación: caracterización estática y prueba DOM demuestran que Workshop pasa
por `WidgetVisualHost`; el smoke modifica un marcador productivo observable.

### 14.2 El smoke deja cambios locales

Mitigación: bytes originales en memoria, `try/finally`, verificación de hash y
check final de estado. No se ejecuta sobre un worktree sucio.

### 14.3 CSS del stage contamina el widget

Mitigación: root contractual aislado, fondos cruzados y hashes de alpha/bounds.

### 14.4 Un nuevo diseño fuerza condicionales desordenados

Mitigación: componentes presentacionales pequeños junto al renderer y unión
literal local. Solo extraer primitives cuando exista repetición real.

### 14.5 Catálogo manual desincronizado

Mitigación: tests de unicidad, compatibilidad, default por pareja y existencia de
registro real. Se prefiere una lista explícita verificable a magia de imports.

### 14.6 Tooling de autoría llega a Stable

Mitigación: import dinámico DEV, sentinels de compile-out y gate de build.

### 14.7 El plan vuelve a migrar todo el catálogo

Mitigación: la migración masiva es un no objetivo explícito. ISA-291 solo prueba
el flujo y documenta cómo usarlo en cambios futuros bajo sus propias issues.

## 15. Criterios de aceptación trazables

- La especificación y guía definen una única fuente de verdad.
- TSX y CSS productivos se actualizan mediante HMR y se revierten byte a byte.
- Workshop sigue utilizando host, registry, ViewModels y renderers reales.
- La receta de nueva composición exige el mínimo de archivos y ningún paso de
  conversión.
- No existen nuevas abstracciones universales, dependencies o generators.
- ISA-266–278 constan como sustituidas y las dependencias activas apuntan a
  ISA-291.
- Tests focales, lint focal, build y compile-out pasan.
- El protocolo visual distingue root de stage y no cuenta el background.
- La entrega incluye evidencia y revisión independiente adversarial.

## 16. Verificación manual de Isaac

La revisión de ISA-291 no evalúa un rediseño visual. Debe permitir comprobar:

1. Abrir Workshop siguiendo la guía desde el worktree.
2. Seleccionar al menos Delta Crystal y otra pareja tipo/sistema.
3. Ver estados y superficies sin errores de navegador.
4. Observar una modificación de prueba por HMR sin reiniciar el servidor.
5. Confirmar que la modificación se revierte y la aplicación queda igual.
6. Confirmar que el flujo explicado permite pedir un diseño y verlo directamente
   sin HTML obligatorio ni copia posterior.

## 17. Cierre y siguientes cortes

Al completar ISA-291:

1. ISA-279 puede endurecer fixtures/replay/live read-only y roundtrip sin cambiar
   el modelo de autoría.
2. ISA-280 puede ejecutar el gate técnico acumulativo.
3. ISA-281 presenta la evidencia a Isaac para decidir promoción a `nightly`.

Ninguno de esos cortes debe reabrir la arquitectura declarativa sin nueva
evidencia, decisión explícita y una issue separada.
