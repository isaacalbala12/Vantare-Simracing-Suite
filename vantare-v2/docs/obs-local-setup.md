# OBS en el mismo ordenador

Vantare sirve el overlay en loopback; OBS y Vantare deben ejecutarse en el mismo PC. El servidor rechaza `0.0.0.0` y direcciones LAN mediante `ValidateAddr` en [server.go](../internal/server/server.go). El [plan de doble PC](obs-lan-double-pc-plan.md) es una propuesta, no una receta disponible.

## Configuración

1. Abrir Vantare y el perfil deseado en Overlay Studio.
2. Copiar la URL de OBS que proporciona Studio. Usar esa URL para conservar el perfil y el puerto reales.
3. En OBS, añadir una fuente **Navegador**, pegar la URL y ajustar ancho/alto a la composición.
4. Esperar el guardado del perfil en Studio y comprobar el resultado en OBS.

La forma de la URL es `http://127.0.0.1:39261/overlay?profile=<archivo-del-perfil>`. El puerto predeterminado puede cambiar con `-http`; no inventar un ID ni abrir un puerto de red para resolver un perfil ausente.

## Diagnóstico

- **No conecta:** comprobar que Vantare está abierto y consultar `/health` en la misma dirección local. Salud HTTP no prueba que haya datos LMU.
- **Perfil no encontrado:** volver a copiar la URL desde Studio con el perfil abierto.
- **Overlay vacío:** comprobar widgets habilitados, perfil, tamaño de fuente y estado de telemetría. Un overlay transparente puede estar conectado y no tener contenido disponible.
- **No refleja una edición:** revisar confirmación/error de autoguardado y que ambas superficies usen el mismo perfil; refrescar la fuente de navegador si procede.
- **Audio Engineer:** consultar [configuración específica](engineer-obs-setup.md); la fuente gráfica no implica captura de audio del sistema.

## Referencia técnica

Overlay usa `/telemetry/overlay-v2/projection`; Engineer conserva `/engineer/stream`. Las antiguas rutas Overlay V1 y `/telemetry/stream` no son el contrato productivo actual. Ver [transporte](telemetry-core/projection-transport.md).
