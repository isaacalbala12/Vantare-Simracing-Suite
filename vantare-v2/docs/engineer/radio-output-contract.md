# Contrato de salida visual Engineer v1

## Propósito

ENG-08 convierte la presentación canónica de ENG-07 en una salida visual
productiva para Desktop y OBS. El backend sigue siendo la única autoridad de
mensaje, prioridad, preempción y caducidad. React no calcula TTL ni conserva
mensajes entre cambios de fuente, sesión o configuración.

## Flujo

1. `messagepolicy` admite una decisión.
2. `presentation` crea el texto localizado y sus metadatos.
3. `EngineerService` decide, por familia, si la entrega es `audio`, `visual`,
   `both` o `disabled`.
4. Wails y SSE publican el mismo `EngineerNotification` cuando la salida visual
   está habilitada.
5. Los adaptadores validan el payload estricto y lo introducen en un store de
   presentación único por superficie.
6. El host construye un ViewModel puro y Vantare Crystal lo renderiza.

No existe catálogo de texto en frontend, acceso a telemetría desde el widget ni
una segunda cola visual.

## Lifecycle

`createdAt` y `expiresAt` vienen de la decisión canónica. El store programa
únicamente la ocultación en `expiresAt`; no inventa duración. Además,
`EngineerStatus.presentationLifecycle` aumenta ante:

- pérdida o reconexión de fuente;
- cambio de sesión, piloto o identidad;
- desactivación de Engineer o Spotter;
- parada del servicio;
- cambio efectivo de routing visual.

Wails y SSE eliminan la presentación activa cuando cambia esa generación,
incluso si la nueva sesión vuelve a estar conectada. Un status SSE lento recibe
siempre el snapshot más reciente, no una cola histórica.

## Salidas por categoría

Las familias productivas cerradas son `spotter`, `fuel`, `penalties`, `laps`,
`timings` y `pitstops`. Cada una admite:

- `both`: audio disponible y salida visual;
- `visual`: salida visual aunque no exista audio;
- `audio`: audio sin publicar la tarjeta;
- `disabled`: ninguna salida.

La configuración es global de Engineer, no contenido privado del widget. Así
Desktop y OBS no pueden divergir accidentalmente y audio/visual no mantienen
dos políticas incompatibles. Este corte no añade motor TTS.

## Widget funcional

`engineer-radio` es un tipo funcional propio, registrado únicamente en
Vantare Crystal. Su documento conserva geometría, visibilidad y sistema visual;
el contenido live llega por `WidgetRuntimeInput` y el renderer recibe solo:

- rol y etiqueta localizada;
- categoría, cuando aporta información distinta;
- texto visual;
- severidad;
- identificador del mensaje.

El texto visible funciona como subtítulo sin audio. El rol se expresa por texto
y semántica accesible; el color nunca es el único indicador. Sin presentación
activa el renderer devuelve `null`, por lo que Desktop y OBS mantienen fondo
realmente transparente.

## Responsive y material

El contrato visual se prueba en `440x112`, `340x92` y `260x76`, con superficies
transparent, solid y grid. El material Crystal pertenece al widget y no incluye
fondos de página, decoración del harness ni elementos tomados de F1, CrewChief
u otros productos. `prefers-reduced-motion` elimina la animación de señal.

## Verificación

- parser y store strict TypeScript;
- paridad Wails/SSE y limpieza por lifecycle;
- routing audio/visual/both/disabled en Go;
- registro funcional, feature gate y diseño oficial Crystal;
- harness determinista en cuatro locales y tres tamaños;
- capturas root-only en `docs/evidence/isa-178/`;
- frontend completo, build, lint focal, Go Engineer/App/Server/Telemetry, vet y
  race cuando el entorno lo permita.

## Fuera de alcance

TTS, STT, PTT, wake word, Pit Manager, canvas, inspector, shell, Vantare
Original y cambios de Telemetry Core.
