# Fase E — Cuenta y comunidad

> Objetivo: auth, sync de layouts, Community Layouts y calendario Discord.
> Entregable: `v0.6.0-alpha.1`
> Orden: My Account → Sync → Community Layouts → Calendario + notificaciones.

## Implementaciones

| # | Implementación | Estado |
|---|---|---|
| 1 | Supabase project + tablas | `pending` |
| 2 | Login/registro en hub | `pending` |
| 3 | Sesión persistida localmente | `pending` |
| 4 | Sync de layouts a la nube | `pending` |
| 5 | Descarga de layouts desde otros dispositivos | `pending` |
| 6 | Merge simple de conflictos | `pending` |
| 7 | API Community Layouts | `pending` |
| 8 | Marketplace de layouts en hub | `pending` |
| 9 | Bot de Discord para leer calendario | `pending` |
| 10 | Parser de eventos de Discord | `pending` |
| 11 | Calendario en hub | `pending` |
| 12 | Notificaciones de eventos próximos | `pending` |
| 13 | Tests E2E de auth y sync | `pending` |
| 14 | Documentación y release v0.6.0-alpha.1 | `pending` |

## Notas

- My Account y sync son infraestructura; sin ellos el marketplace no tiene identidad de usuario.
- Calendario Discord requiere permiso de lectura en el canal correspondiente.
- Esta fase transforma la app de local-first a servicio con nube.

## Criterios de cierre

- [ ] Login/registro funcional.
- [ ] Sync de layouts entre dispositivos.
- [ ] Marketplace básico de layouts.
- [ ] Calendario y notificaciones funcionando.
- [ ] Tests pasando.
- [ ] Build ok.
- [ ] CHANGELOG actualizado.
- [ ] Tag `v0.6.0-alpha.1` y release.
