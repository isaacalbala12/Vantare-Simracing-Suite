# Arquitectura

## Resumen

Vantare v2 es una app local-first:

```text
UI React/TypeScript
-> runtime Wails
-> servicios Go
-> dominio/configuracion/telemetria
-> adaptadores: LMU shared memory, REST local LMU, filesystem, ventanas, HTTP/SSE
```

La regla principal es mantener la logica estable en Go y la experiencia visual en TypeScript.

## Responsabilidades

## TypeScript / React

Vive en `frontend/`.

Debe encargarse de:

- Hub visual.
- Overlays Studio.
- Edicion visual de widgets y layouts.
- Render de overlays.
- Estados de UI.
- Tests de componentes y flujos frontend.

No debe absorber logica pesada de telemetria, procesos, filesystem o ventanas.

## Go

Vive en `cmd/`, `internal/` y `pkg/`.

Debe encargarse de:

- ciclo de vida de la app,
- puente Wails,
- servicios de perfiles/configuracion,
- telemetria LMU,
- normalizacion/diff/pipeline,
- control de ventanas overlay,
- servidor HTTP/SSE cuando aplique,
- actualizador,
- CLI/debug tools.

## Estructura principal

- `cmd/vantare/`: entrada principal de la app Wails.
- `cmd/lmu-debug/`: herramienta de debug LMU.
- `internal/app/`: servicios de app, bridge y ciclo de vida.
- `internal/telemetry/`: lectura, normalizacion y emision de telemetria.
- `internal/window/`: gestion de ventanas.
- `internal/server/`: servidor local/overlay cuando aplica.
- `pkg/config/`: carga/guardado/esquema de perfiles.
- `pkg/models/`: tipos compartidos de datos.
- `frontend/src/hub/`: UI del Hub.
- `frontend/src/hub/overlays/`: Overlays Studio.
- `frontend/src/hub/preview/`: piezas heredadas/reutilizadas del editor visual.
- `frontend/src/overlay/`: render de overlay.

## Direccion de dependencias

- UI llama a servicios por Wails/eventos.
- Go no debe depender de React.
- Dominio/configuracion no debe depender de UI.
- Adaptadores externos deben quedar en paquetes concretos, no dispersos.
- Los componentes de UI pueden reutilizar helpers, pero no duplicar reglas core.

## Overlays Studio

Separacion obligatoria:

- `Widgets`: edita aspecto/comportamiento del widget.
- `Perfiles especificos`: edita posicion, tamano, orden/layout y composicion del perfil.
- `Recomendados por Vantare`: presets read-only hasta que se guarden como perfil propio.
- `Comunidad`: proximamente.

Riesgo a evitar: volver a mezclar controles de layout dentro de `Widgets`.

## Principios para cambios futuros

- Reutilizar componentes existentes antes de crear nuevas capas.
- No crear abstracciones "por si acaso".
- No crear servicios globales sin necesidad.
- Si una parte empieza a tocar demasiadas responsabilidades, dividir con un plan pequeno.
- Documentar decisiones importantes como ADR.
