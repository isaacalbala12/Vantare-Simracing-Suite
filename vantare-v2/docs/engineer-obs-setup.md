# Engineer en OBS local

Usar primero la [guía OBS del mismo PC](obs-local-setup.md). El servidor solo admite loopback; el plan de doble PC no es una función disponible. Añadir el widget `engineer-radio` al perfil que sirve el overlay y comprobar los permisos y el estado de Engineer en esa build.

## Contrato comprobado en código

- [server.go](../internal/server/server.go) registra `/engineer/stream` y `/api/engineer/health`.
- [engineer_sse.go](../internal/server/engineer_sse.go) publica SSE `event: engineer-stream` desde `SubscribeStream()`, con keep-alive cada 15 s. Un servicio no inicializado devuelve 503; un stream abierto no demuestra que haya mensajes ni audio disponible.
- [ObsOverlayApp](../frontend/src/overlay/ObsOverlayApp.tsx) usa el adaptador/store de presentación Engineer. El widget actual es [engineer-radio](../frontend/src/overlay/widget-types/engineer-radio/engineer-radio-definition.ts); la antigua forma `EngineerNotification` no es el contrato del evento actual.
- El endpoint de salud es diagnóstico. No demuestra paridad visual ni validación de LMU, voz o permisos.

## Prueba manual por build

1. Abrir un perfil de prueba con `engineer-radio` y copiar su URL OBS local.
2. Añadir esa URL como fuente de navegador en OBS y usar el tamaño del overlay.
3. Con Engineer habilitado y una sesión LMU válida, provocar un aviso reproducible admitido por sus capacidades. Anotar evento, datos disponibles y resultado; una fixture de Workshop solo valida presentación.
4. Confirmar que aparece el mensaje y desaparece cuando corresponde; comparar con la presentación en la app.
5. Refrescar/cerrar la fuente OBS y reabrirla; comprobar recuperación. Desconectar la red física no corta una conexión loopback y no es una prueba de reconexión SSE.

No se ha ejecutado esta prueba física en la revisión documental. [Handoff Engineer](vantare-program/handoffs/engineer-spotter.md) contiene la evidencia por corte.

[Guía EN9.4 original](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/engineer-obs-setup.md), con su contrato de notificaciones anterior.
