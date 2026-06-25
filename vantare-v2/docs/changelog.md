# Changelog

Changelog publico para testers y Discord.

Solo se publican versiones funcionales confirmadas. Planes, reviews, analisis y cambios puramente documentales no requieren entrada propia salvo que se agrupen en una version funcional.

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
