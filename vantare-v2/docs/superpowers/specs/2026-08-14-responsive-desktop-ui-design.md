# Spec: UI responsive integral de escritorio

Estado: fase Specify aprobada por Isaac el 2026-08-14
Issue: ISA-337 / UI-RESP-01
Base auditada: `origin/nightly@b635d795128de6600b9c5008d0e4bc143872d976`

## Objetivo

Hacer que la interfaz de escritorio de Vantare se adapte de forma continua a
cualquier ventana soportada, desde el mínimo productivo Wails hasta 4K,
32:9 y tamaños superiores, aprovechando el espacio sin estirar contenido hasta
volverlo difícil de leer.

El usuario debe poder redimensionar la aplicación sin encontrar controles fuera
del viewport, solapamientos, recortes accidentales ni scroll horizontal global.
Las pantallas anchas deben ganar composición o contexto cuando el contenido lo
permita; las pantallas compactas deben priorizar la tarea principal y conservar
todas las acciones mediante navegación, drawers o scroll vertical.

Esta iniciativa corrige layout. No cambia el lenguaje visual, el modelo de
navegación, la arquitectura del producto ni la lógica de negocio.

## Supuestos aprobados

- La UI objetivo es la aplicación Windows de escritorio, no una web móvil.
- El suelo funcional es la ventana mínima declarada por Wails: `900x600` de
  ventana. El viewport CSS útil se medirá en runtime porque la barra de título,
  los bordes y el escalado de Windows pueden hacerlo menor.
- La optimización visual principal empieza en `1920x1080`, pero reducir la
  ventana hasta el suelo funcional no puede romper ni ocultar funcionalidad.
- Se cubren de forma explícita 16:9, 16:10, 21:9 y 32:9, sin codificar una lista
  cerrada de relaciones de aspecto.
- `5120x1440` representa el caso 32:9 principal. `3840x2160` representa 4K.
- Tamaños superiores deben seguir siendo seguros por las mismas restricciones
  fluidas, aunque no se cree una composición especial para cada monitor.
- No se añaden dependencias ni se crea un framework responsive interno.

## Alcance

Incluye:

- shell global, topbar, navegación, dock, banners y área desplazable;
- Dashboard;
- Launcher;
- Calendar;
- Overlay Studio como aplicación de autoría dentro del Hub;
- Settings y diagnósticos;
- Engineer;
- Strategy Planner;
- Telemetry;
- Roadmap;
- Testing Center cuando el canal lo habilite;
- login, paywall, onboarding, estados vacíos, diálogos, menús y toasts;
- los cuatro idiomas obligatorios: español, inglés, italiano y portugués.

Excluye:

- cambiar la geometría del documento de Overlay Studio o su
  `layoutViewport`, ya resuelta por ISA-326;
- cambiar renderizadores o dimensiones contractuales de widgets;
- Desktop Overlay, OBS y Workshop como superficies de producto;
- trasladar automáticamente la dirección visual de los prototipos Fable al
  código productivo;
- móvil, tablet táctil, nuevas funciones, backend, persistencia o licencias;
- un rediseño general, una librería de componentes o un sistema de breakpoints
  propio.

## Principios de comportamiento

### 1. Continuidad, no catálogo de resoluciones

El layout se define mediante restricciones de contenido: `minmax()`, `clamp()`,
`min()`, `max()`, flex wrapping, grid auto-fit y límites de lectura. Las pruebas
usan una matriz representativa, pero el código no pregunta si la pantalla es
16:9, 21:9 o 32:9.

### 2. La anchura pertenece a cada superficie

El shell no impone un `max-width` universal que desperdicie monitores anchos.
Cada página decide qué regiones pueden crecer, añadir columnas o permanecer
acotadas:

- formularios, texto y controles mantienen una longitud legible;
- galerías, métricas, timelines, editores y paneles paralelizables pueden usar
  más columnas;
- una página estrecha por naturaleza puede conservar márgenes amplios si no hay
  información útil con la que llenarlos.

No se considera defecto el espacio libre intencional. Sí se considera defecto
un gran espacio vacío causado únicamente por el límite global actual de
`1920px` cuando la página dispone de contenido paralelizable.

### 3. Compacto conserva funcionalidad

Entre el viewport útil de la ventana mínima Wails y los layouts amplios:

- las columnas se apilan o se convierten en paneles accesibles;
- la navegación cambia de presentación sin perder destinos;
- acciones primarias y estado operativo permanecen visibles;
- el contenido secundario puede plegarse, pero nunca desaparecer sin una ruta
  para recuperarlo;
- el scroll vertical ocurre en el área prevista y no deja capas fijas tapando
  el último contenido.

### 4. Ultrawide añade utilidad, no gigantismo

Al crecer la ventana:

- no se escala toda la UI proporcionalmente;
- tipografía, controles y tarjetas conservan límites razonables;
- el espacio adicional se usa para columnas, paneles simultáneos, vistas
  auxiliares o separación respirable;
- una línea de texto normal no supera aproximadamente `75ch`;
- los controles no se separan tanto que pierdan su relación visual.

### 5. Altura y escala también cuentan

Responsive incluye anchura, altura útil, zoom y escalado de Windows. Las vistas
de poca altura deben seguir pudiendo alcanzar todas sus acciones mediante
scroll. DPR o escala de Windows no puede provocar doble escalado, recortes ni
coordenadas erróneas.

### 6. Overflow explícito

El documento y el shell no tienen scroll horizontal. Solo se permite overflow
horizontal local cuando el contenido lo necesita semánticamente, por ejemplo
una tabla, timeline o canvas. Esa región debe ser identificable, operable con
teclado y no desplazar el shell completo.

## Modelo responsive mínimo

Para evitar sobreingeniería:

1. Usar primero CSS fluido y el flujo normal del documento.
2. Reutilizar los breakpoints Tailwind existentes (`sm`, `md`, `lg`, `xl`,
   `2xl`) cuando se necesite un cambio estructural discreto.
3. Usar una media query adicional solo si responde a una necesidad observable
   que los breakpoints existentes no expresan.
4. Usar container queries solo en un componente reutilizado dentro de
   contenedores realmente distintos; no como sustituto general de media
   queries.
5. No introducir un hook global de viewport, contexto responsive, registro de
   resoluciones ni componente wrapper universal.
6. JavaScript puede observar tamaño únicamente cuando el comportamiento no se
   puede expresar en CSS, como geometría interactiva existente de Studio.

## Tech stack

- React 19 y TypeScript estricto.
- Tailwind CSS 4 y CSS existente.
- Vitest y Testing Library para comportamiento.
- Playwright 1.60 ya instalado para evidencia visual y de interacción.
- Wails v3 para la ventana Windows productiva.

No se añade ninguna dependencia.

## Comandos

Desde la raíz del worktree:

```powershell
# Desarrollo
corepack pnpm --dir frontend dev

# Tests frontend completos
corepack pnpm --dir frontend test

# Build productiva frontend
corepack pnpm --dir frontend build

# Lint global; cualquier deuda heredada se separa de regresiones nuevas
corepack pnpm --dir frontend lint

# Gates visuales existentes que correspondan al corte
corepack pnpm --dir frontend visual:overlay-studio
corepack pnpm --dir frontend visual:strategy-planner
corepack pnpm --dir frontend visual:testing-center

# Higiene del diff
git diff --check
```

El plan puede añadir un único runner Playwright responsive compartido si la
auditoría confirma que reutilizar los runners actuales produciría más
duplicación. No se crea un framework de capturas ni se regeneran baselines para
ocultar diferencias.

## Estructura del proyecto

```text
frontend/src/hub/components/       shell y componentes compartidos
frontend/src/hub/pages/            páginas principales
frontend/src/hub/launcher/         workspace Launcher
frontend/src/hub/calendar/         superficies Calendar
frontend/src/hub/overlay-studio/   shell/editor Studio, no renderers
frontend/src/hub/strategy/         workspace Strategy
frontend/src/hub/settings/         Settings y diagnósticos
frontend/src/hub/testing-center/   Testing Center
frontend/src/hub/auth/             login, paywall y estados de acceso
frontend/src/hub/onboarding/       onboarding
frontend/src/hub/roadmap/          componentes Roadmap
frontend/src/index.css             tokens y estilos globales existentes
frontend/scripts/                  runners visuales existentes o uno compartido
docs/superpowers/specs/            esta especificación
docs/superpowers/plans/            plan posterior, solo tras aprobar la spec
```

Los tests permanecen junto al componente o módulo que protegen. Los cambios de
implementación se dividirán por superficie y no convertirán `index.css` en un
archivo de excepciones por página.

## Estilo de código

Se prefiere una regla CSS local y fluida antes que ramas JavaScript o una lista
de resoluciones:

```css
.responsive-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: clamp(1rem, 1.5vw, 1.5rem);
}

.responsive-card-grid > * {
  min-width: 0;
}
```

Convenciones:

- nombres que describen función, no resolución (`details-panel`, no
  `desktop-4k-panel`);
- `min-width: 0` en hijos flex/grid que puedan contener texto largo;
- `rem`, `ch`, porcentajes y funciones fluidas para layout; `px` se conserva
  cuando expresa borde, icono o contrato visual existente;
- sin estilos inline nuevos para resolver breakpoints;
- sin ocultar contenido para hacer pasar una captura.

## Estrategia de implementación posterior

La implementación no se hará como un rewrite. El plan deberá ordenar cortes
verticales pequeños:

1. caracterización y gate responsive del shell;
2. shell y navegación global;
3. páginas informativas y formularios;
4. workspaces complejos por separado: Launcher, Calendar, Strategy y Studio;
5. estados transversales: auth, modales, banners, idiomas y stress;
6. matriz final y smoke Windows.

Cada corte debe tener aceptación observable, máximo aproximado de cinco archivos
productivos salvo justificación y test de regresión antes o junto al cambio.

## Estrategia de pruebas

### Matriz representativa

La continuidad se valida al menos en:

| Viewport CSS | Propósito |
| --- | --- |
| viewport CSS real de Wails mínimo | suelo productivo; se mide antes de fijar el gate |
| `900x600` | referencia CSS compacta, no sustituto del suelo real medido |
| `1024x768` | ventana compacta 4:3 |
| `1280x720` | compacta 16:9 y poca altura |
| `1366x768` | portátil Windows frecuente |
| `1440x900` | referencia de exploración existente |
| `1920x1080` | base 16:9 solicitada |
| `2560x1440` | escritorio QHD |
| `2560x1080` | ultrawide 21:9 bajo |
| `3440x1440` | ultrawide 21:9 |
| `3840x2160` | 4K 16:9 |
| `5120x1440` | 32:9 |
| `2304x864` | tamaño arbitrario no preset |

No todas las capturas se convierten en baselines permanentes. El runner final
debe comprobar toda la matriz mediante invariantes y conservar capturas de una
selección pequeña que represente compacto, 1080p, 4K y 32:9.

### Invariantes automáticos

En cada destino y estado representativo de la matriz completa:

- `scrollWidth <= clientWidth` en documento, body, root, shell y todo
  contenedor con `overflow-x: hidden` o `clip`;
- ningún elemento excede los bordes de su contenedor de scroll, salvo
  overflow horizontal local declarado y comprobado como operable;
- cero solapamientos entre navegación fija y área principal;
- acciones y campos accesibles mediante scroll vertical;
- ningún texto operativo queda truncado sin mecanismo para leerlo;
- menús, diálogos y toasts permanecen dentro del viewport;
- foco visible y orden de teclado coherente;
- cero errores de consola, página o red relevantes;
- resize entre tamaños no pierde estado, selección ni borradores;
- en Dashboard, Settings, Diagnostics, Testing Center, Studio V3 y las partes
  ya traducidas de Launcher/auth, los cuatro idiomas pasan stress de longitud;
- en chrome y superficies todavía no conectadas a i18n se usa stress sintético
  de cadenas largas; completar su traducción es una issue separada, no un
  cambio silencioso de esta iniciativa (`ISA-342`);
- idiomas se comprueban en el suelo real y `1920x1080`; DPR `1`, `1.25`, `1.5`
  y `2` se comprueba en contextos separados sobre dos destinos representativos,
  además del smoke Windows cuando el host lo permita.

La matriz completa valida invariantes de layout. El límite aproximado de
`75ch` se revisa humanamente en las cuatro capturas representativas; no se
convierte en un gate DOM artificial.

### Niveles

- Vitest: estructura, estados adaptativos y regresiones de interacción.
- Playwright: bounds, overflow, navegación, resize, teclado y capturas.
- Build: TypeScript y bundle productivo.
- Smoke Windows: resize manual, escalado real y superficies que dependen de
  Wails.

## Criterios de éxito

La iniciativa completa se considera correcta cuando:

1. Toda superficie incluida pasa la matriz sin overflow horizontal global,
   solapamientos ni acciones inaccesibles.
2. La aplicación sigue siendo funcional en el viewport útil medido de la
   ventana Wails mínima y aprovecha correctamente
   `5120x1440` y `3840x2160`.
3. No existe un límite global de `1920px` aplicado indiscriminadamente a todas
   las páginas.
4. Las páginas con contenido paralelizable aumentan composición útil en ancho;
   texto y formularios mantienen límites legibles.
5. Redimensionar en caliente no desmonta páginas ni pierde estado.
6. Topbar, dock, subnavegación, banners y overlays de licencia funcionan en
   todos los tamaños.
7. Studio adapta su chrome al espacio sin alterar `layoutViewport`, posiciones
   de widgets, drag/resize imperativo ni paridad Studio/Desktop/OBS.
8. Español, inglés, italiano y portugués no generan overflow o controles
   inaccesibles.
9. No se añaden dependencias, servicios de viewport, catálogos de resolución,
   renderizadores ni pipelines paralelos.
10. Tests frontend, build, lint aplicable, gates visuales afectados y smoke
    manual quedan registrados con evidencia real.

## Límites operativos

### Siempre hacer

- partir de `origin/nightly` en rama/worktree de issue;
- caracterizar antes de cambiar una superficie;
- mantener cambios pequeños y focales;
- probar resize, altura, idiomas y contenido de estrés;
- preservar estado, accesibilidad y contratos de producto;
- revisar el diff completo y actualizar handoff, Linear y plan vivo.

### Preguntar antes

- cambiar arquitectura, navegación o lenguaje visual;
- añadir dependencias o configuración de build;
- modificar el mínimo de ventana Wails;
- cambiar contratos de Overlay Studio, widgets, Desktop u OBS;
- superar claramente el write set previsto para un corte;
- promocionar a `nightly`, `testers` o `master`.

### Nunca hacer

- enumerar resoluciones soportadas dentro de componentes;
- crear un responsive manager, viewport store o design system paralelo;
- ocultar funcionalidad para evitar overflow;
- convertir toda medida existente a `rem` de forma mecánica;
- regenerar baselines para encubrir una regresión;
- mezclar el port visual Fable con este trabajo de layout;
- limpiar o incorporar cambios ajenos del checkout `refactor`.

## Riesgos y mitigaciones

- **Alcance demasiado grande:** dividir la implementación por superficies y
  cerrar cada corte con evidencia propia.
- **CSS global frágil:** preferir ownership local y modificar tokens globales
  solo cuando todos sus consumidores estén caracterizados.
- **Ultrawide vacío o estirado:** distinguir páginas paralelizables de
  formularios/texto; no aplicar una regla única a ambas.
- **Studio regresiona geometría:** tratar ISA-326 como autoridad y limitar este
  trabajo al chrome del editor.
- **Exploración visual concurrente:** Fable es referencia separada; esta spec no
  autoriza portarla ni modificar sus HTML.
- **Explosión de snapshots:** usar invariantes en toda la matriz y pocas
  capturas representativas.

## Preguntas abiertas

- Medir el viewport CSS útil de la ventana Wails `900x600` en Windows y
  confirmar si sus límites se interpretan en DIP o píxeles físicos. Es una
  tarea de caracterización previa, no una invitación a cambiar el mínimo.
