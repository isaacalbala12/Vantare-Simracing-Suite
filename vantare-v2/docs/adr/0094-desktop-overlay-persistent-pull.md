# ADR 0094 — Pull V2 desktop persistente y publicación por cambio

Fecha: 2026-09-06. ISA-996. Estado: experimento arquitectónico autorizado por
Isaac; candidato local conservado tras medidas, **sin integración ni release**.

## Problema y evidencia

La aplicación completa con seis widgets supera el objetivo de CPU. Descargar
el Hub minimizado mantiene borradores/reapertura y ahorra recursos, pero no
basta. El ingeniero publica dos eventos Wails por observación aunque su estado
sea idéntico: 639 status y 639 stream en diez segundos, sólo un estado distinto.
El pull desktop ejecuta además una petición HTTP por lectura sobre el servidor
virtual Wails. Cambiar sólo a HTTP loopback no mejora; ExecJS duplica la RAM.

E8 deduplica publicaciones idénticas sin dejar de consumir observaciones.
E9 conserva el protocolo y cambia sólo el adaptador a socket persistente.
E11 usa GOGC=300: tres capturas de 60s con 30s de calentamiento, seis widgets
reales y 54 vehículos LMU live: CPU 2,91167 /2,75480 /2,69391; memoria privada
409,42 /408,26 /402,96 MiB. Son CPU propia agregada de Go, WebViews y auxiliares,
no CPU del juego ni porcentaje de un solo núcleo. Datos completos y límites
en [el informe](../analysis/telemetria-v2-seis-widgets-cpu-996.md).

## Decisión local

- `OverlayPullTransport` sigue siendo dueño único de sesión, ACK, replay,
  retención latest-wins y consumidores. Se reutiliza el cliente actual de
  cadencias y validación. No cambia el contrato generado ni el de OBS.
- Adaptador WebSocket local por defecto en el candidato. Se conserva HTTP
  como control explícito con `VANTARE_OVERLAY_SOCKET_PULL=0`; no se mezcla ni
  se conmuta silenciosamente tras un error. No introduce otra telemetría.
- Bootstrap sólo por la ruta Wails de la ventana. Listener127.0.0.1 efímero;
  validación exacta de host/origen, token aleatorio por ventana en subprotocolo
  (no URL, logs ni persistencia), un socket por ventana, entradas de1KiB,
  timeout y cierre/revocación. Reconectar conserva el ACK pendiente.
- La biblioteca coder/websocket ya estaba resuelta por el repositorio. No se
  añaden versiones o dependencias. Se mantiene stdlib para JSON y net/http.
- Engineer sólo omite estados íntegramente iguales; no omite observaciones,
  facts, notificaciones ni audio. Cambios Active/lifecycle/configuración y
  snapshots iniciales siguen entregándose. El control temporal E8 se retira.
- GC de Go permanece activo con valor inicial300 si el usuario no definió
  GOGC. Respeta GOGC explícito y no modifica GOMEMLIMIT. Cuesta unos20MiB
  privados frente al control socket/GC100; no es una caché ilimitada ni GC off.

## Riesgos y límites

La cifra no garantiza consumo en otros equipos, escenas, perfiles ni todos los
picos instantáneos. No prueba superioridad frente al HUD de LMU. Fuel/Weather
usan sus renderers Original; no hay renderer Endurance correspondiente en esta
base. La prueba es seis widgets concretos, no todo el catálogo simultáneo.

El socket amplía la superficie local de entrada y depende de poder abrir una
conexión loopback; fallos son explícitos y tienen control HTTP manual. Antes
de integrar se deben revisar diff/seguridad y evidencia de la build final.
GOGC mayor intercambia RAM por CPU; capturas cortas no sustituyen sesiones
largas ni certifican un máximo de RAM. No se propone cambiar afinidad, prioridad,
frecuencia, permisos de red del sistema o seguridad del navegador.

## Verificación y vuelta atrás

Tests cubren replay/reconexión, emisor/origen, campos ajenos, tamaños, ventana
cerrada, timeout/cancelación y GC explícito. El banco captura también estado
V2 y seis widgets al final, fuera del intervalo de CPU. Mantener crudos y SHA.
Build final sin overrides: medias3,00740 /2,82336 /2,80766%, media conjunta
2,87947% /410,33MiB; primera ligeramente sobre3 y picos de muestra hasta4,12457%.
Estado/evidencia en handoff e informe; objetivo medio local, no techo garantizado.
Para comparar en desarrollo: HTTP con la variable anterior y GC100 explícito;
para revertir el cambio integrado, volver al commit/build anterior verificado.
