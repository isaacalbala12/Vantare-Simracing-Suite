# Changelog

Changelog publico para testers y Discord.

Solo se publican versiones funcionales confirmadas. Planes, reviews, analisis y cambios puramente documentales no requieren entrada propia salvo que se agrupen en una version funcional.

## v0.3.9.2

**Nuevo**

- Flujo inicial de changelog publico y publicacion automatica en Discord al crear tags `v*`.
- Documento de UX mock/live/demo para alpha testers.

**Mejorado**

- El indicador global de fuente de telemetria en la barra superior ahora incluye `title` y `aria-label`.
- Los tests del selector mock de `Standings` usan `aria-pressed` en lugar de clases visuales.

**Corregido**

- Menor riesgo de regresion visual en el selector `Práctica` / `Qualy` / `Carrera`.

**Para testers**

- Sin LMU abierto, comprobad que la fuente se entiende como `Mock` o fallback.
- En `Widgets` -> `Standings`, cambiad `Práctica` / `Qualy` / `Carrera` y confirmad que no activa `Guardar`.
- En una release taggeada, Discord deberia recibir automaticamente esta entrada del changelog.

## v0.3.9.1

**Nuevo**

- Los perfiles recomendados de Vantare pueden guardarse como copia propia editable.

**Mejorado**

- `Relative` y `Standings` redimensionan proporcionalmente en el editor de layout, overlay desktop y OBS.
- Los perfiles legacy con cajas deformadas se muestran con el aspecto correcto desde el primer render.
- La version visible de la app pasa a `v0.3.9.1`.

**Corregido**

- Guardar un recomendado como copia propia genera IDs unicos y convierte a schema v2.
- Guardar una copia recomendada ya no muta el perfil original.
- `Standings` ya no queda ligeramente recortado al redimensionar.

**Para testers**

- Probad `Mis perfiles` -> `Editar layout` con `Relative` y `Standings`.
- Probad resize horizontal, vertical y diagonal.
- Probad `Recomendados por Vantare` -> guardar como perfil propio.
- Reportad si algun overlay queda cortado, deformado o con espacio vacio raro.
