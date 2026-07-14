# Comunicaciones de Vantare en Discord

Este documento define qué información puede publicar automáticamente Vantare y en qué canal. GitHub Actions es el único publicador; Linear se consulta en modo lectura.

## Canales

| Secreto | Canal | Uso |
|---|---|---|
| `DISCORD_RELEASE_WEBHOOK_URL` | Lanzamientos públicos | Solo una versión nueva publicada desde `master`. |
| `DISCORD_PROGRESS_WEBHOOK_URL` | Testers (`1519752249977340168`) | Cambios verificables que llegan a `develop`. |
| `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | desarrollo-vantare (`1519752544753291305`) | Resumen diario de proyectos grandes activos en Linear. El nombre histórico del secreto se conserva para no rotar el webhook. |
| `DISCORD_BUILD_WEBHOOK_URL` | Changelog | Changelog y descarga de una build beta validada; publicación manual. |

No se usa `DISCORD_WEBHOOK_URL` como fallback. Una configuración incompleta debe fallar cerrada para evitar publicar en el canal equivocado.

## Cambios para testers

Cada issue con comportamiento visible añade un JSON en `docs/changelog/fragments/`. El workflow solo procesa fragmentos incluidos en el push a `develop`; una rama de issue nunca publica. El fragmento contiene:

- resumen en lenguaje normal;
- notas técnicas;
- comprobaciones solicitadas;
- limitaciones conocidas.

El enlace al commit no se inserta en el mensaje para impedir que el unfurl de Discord parezca una segunda publicación. El SHA corto sigue identificando el corte.

## Desarrollo activo desde Linear

El digest consulta proyectos activos, no issues ni comentarios. Para autorizar texto público, la última actualización del proyecto debe contener esta marca:

```markdown
<!-- discord:development -->
Texto profesional y apto para publicación.
```

Todo texto anterior a la marca se considera interno. Los proyectos publicables se declaran explícitamente en `docs/discord-development-projects.json`; sin una actualización marcada se muestra solo nombre, progreso, URL y un texto neutro. Los proyectos no autorizados, terminados o pausados no aparecen. El workflow no modifica Linear.

La presentación es híbrida y determinista:

- un embed nativo conserva texto seleccionable, enlaces y accesibilidad;
- una tarjeta 1200×630 se genera desde HTML con el lenguaje visual de Vantare;
- Chrome captura el HTML dentro del runner, sin servicios de IA ni dependencias nuevas;
- el PNG se adjunta al mismo POST y el embed lo referencia mediante `attachment://vantare-development.png`;
- si no puede generarse la tarjeta, el workflow falla antes de publicar y no envía un mensaje parcial.

La referencia visual es `roadmap_v5.2.html`: fondo negro con iluminación roja, superficies translúcidas, Inter, mono técnico, bordes finos y jerarquía sobria. La tarjeta no reproduce la navegación de la app; adapta ese sistema a tres proyectos legibles en Discord.

## Gates

- Los tests y dry-runs nunca hacen POST.
- Antes de publicar, el workflow consulta los metadatos del webhook y comprueba el ID del canal conocido.
- Release comprueba que el tag pertenece al historial de `master`.
- Build beta y release son acciones explícitas; no se deducen de cambios documentales.
- Nada llega a `develop` sin la validación manual completa de Isaac.

## Validación ISA-95

El 2026-07-14 se verificaron en GitHub Actions los cuatro destinos con la versión pública vigente `v0.1.0.2`: release `29368648069`, testers `29368768778`, changelog beta `29368891135` y desarrollo activo final `29369095141`.

La extensión visual del 2026-07-15 se validó localmente con tests, dry-run y captura real de Chrome. El POST con imagen al canal de desarrollo permanece pendiente de validación manual antes de integrar.
