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
4. `disabled` se descarta antes de scheduler, ACK, cooldown, contexto o
   preempción; cambiar a disabled cancela únicamente la familia afectada.
5. Wails y SSE publican el mismo `EngineerStreamEvent`, ordenado por generación
   y secuencia, cuando cambia el estado o la presentación visual.
6. Los adaptadores validan el envelope estricto y lo introducen en un store de
   presentación único por superficie.
7. Radio y subtítulos construyen el mismo ViewModel puro y se enrutan de forma
   independiente.

No existe catálogo de texto en frontend, acceso a telemetría desde el widget ni
una segunda cola visual.

## Lifecycle

`createdAt` y `expiresAt` vienen de la decisión canónica. El store programa
únicamente la ocultación en `expiresAt`; no inventa duración. Además,
Cada envelope incluye `generation` y `sequence`. La generación aumenta ante:

- pérdida o reconexión de fuente;
- cambio de sesión, piloto o identidad;
- desactivación de Engineer o Spotter;
- parada del servicio;
- cambio efectivo de routing visual.

Wails y SSE eliminan la presentación activa cuando cambia esa generación,
incluso si la nueva sesión vuelve a estar conectada. Ambos transportes usan un
solo canal ordenado. Al conectar o reconectar entran primero en estado
`awaitingSnapshot`: descartan `presentation` y `status` hasta recibir el snapshot
autoritativo del nuevo runtime. Ese snapshot establece generación y secuencia de
forma atómica, con la presentación activa exacta si aún es válida o vacío. Un
evento tardío del transporte anterior no puede resucitar después de un clear ni
durante la reconexión.

## Salidas por categoría

Las familias productivas cerradas son `spotter`, `fuel`, `penalties`, `laps`,
`timings` y `pitstops`. Cada una admite:

- `both`: audio disponible y salida visual;
- `visual`: salida visual aunque no exista audio;
- `audio`: audio sin publicar la tarjeta;
- `disabled`: ninguna salida; la candidata no entra en scheduler ni puede
  alterar ACK, cooldown, contexto o preempción.

La configuración es global de Engineer, no contenido privado del widget. Así
Desktop y OBS no pueden divergir accidentalmente y audio/visual no mantienen
dos políticas incompatibles. Este corte no añade motor TTS.

## Salidas visuales independientes

Los subtítulos son una superficie runtime opcional, no un alias del widget ni
un segundo tipo de catálogo. Pueden mostrarse aunque el layout no contenga
`engineer-radio`, y pueden coexistir con él. Comparten la misma presentación,
locale, rol, severidad y texto. Solo una superficie realiza el anuncio live
accesible cuando ambas están visibles, evitando duplicados de lector de pantalla.
La preferencia de subtítulos es runtime en ENG-08 y vuelve al valor seguro
`enabled` al reiniciar. Su persistencia pertenecerá al contrato central de
Ajustes; este corte no crea un segundo fichero de configuración privado.

## Widget funcional

`engineer-radio` es un tipo funcional propio, registrado únicamente en
Vantare Crystal. Su documento conserva geometría, visibilidad y sistema visual;
el contenido live llega por `WidgetRuntimeInput` y el renderer recibe solo:

- rol y etiqueta localizada;
- categoría, cuando aporta información distinta;
- texto visual;
- severidad;
- identificador del mensaje.

El rol se expresa por texto y semántica accesible; el color nunca es el único
indicador. Sin presentación activa el renderer devuelve `null`, por lo que
Desktop y OBS mantienen fondo realmente transparente. Studio y el harness usan
una fixture explícita con marca `PREVIEW`; esa fixture nunca entra en runtime.

El vocabulario V3 de Go reconoce el tipo y el store lo conserva en roundtrip de
save/load, que es también la base de export/import de perfiles.

## Responsive y material

El contrato visual se prueba en `440x112`, `340x92` y `260x76`, con las cuatro
locales sobre superficies transparent, solid y grid: 12 capturas root-only.
Cada captura se compara contra un baseline fijo versionado, con cero píxeles
enmascarados. El material Crystal pertenece al widget y no incluye
fondos de página, decoración del harness ni elementos tomados de F1, CrewChief
u otros productos. `prefers-reduced-motion` elimina la animación de señal.

## Verificación

- parser y store strict TypeScript;
- paridad Wails/SSE, carrera clear/notificación y rehidratación exacta;
- routing audio/visual/both/disabled en Go;
- roundtrip de perfil Go y subtítulos independientes;
- registro funcional, feature gate y diseño oficial Crystal;
- harness determinista en cuatro locales y tres tamaños;
- capturas root-only en `docs/evidence/isa-178/` y baselines inmutables en
  `frontend/testdata/engineer-radio-baselines/`;
- frontend completo, build, lint focal, Go Engineer/App/Server/Telemetry, vet y
  race cuando el entorno lo permita.

## Fuera de alcance

TTS, STT, PTT, wake word, Pit Manager, canvas, inspector, shell, Vantare
Original y cambios de Telemetry Core.
