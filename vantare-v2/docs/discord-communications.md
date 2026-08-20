# Comunicaciones de Vantare en Discord

Este documento define qué información puede publicar automáticamente Vantare y en qué canal. GitHub Actions es el único publicador y todas las fuentes se consultan en modo lectura.

## Canales

| Secreto | Canal | Uso |
|---|---|---|
| `DISCORD_RELEASE_WEBHOOK_URL` | Lanzamientos públicos | Solo una versión nueva publicada desde `master`. |
| `DISCORD_PROGRESS_WEBHOOK_URL` | Nightly/Testers (`1519752249977340168`) | Cambios verificables de la pre-release, identificados por canal. |
| `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | desarrollo-vantare (`1519752544753291305`) | Resumen diario de las fases o milestones activos. El nombre histórico del secreto se conserva para no rotar el webhook. |
| `DISCORD_BUILD_WEBHOOK_URL` | Changelog (`1519747444315914512`) | Changelog técnico y descarga de una build ya publicada y verificada. |

No se usa `DISCORD_WEBHOOK_URL` como fallback. Una configuración incompleta debe fallar cerrada para evitar publicar en el canal equivocado.

## Cambios para testers

Cada issue con comportamiento visible añade un JSON en `docs/changelog/fragments/`. Una pre-release contiene un manifiesto en `docs/releases/<tag>.json` que selecciona exactamente los fragmentos del corte. Una rama de issue nunca publica. Nightly y Testers comparten destino, pero la tarjeta declara inequívocamente el canal. El fragmento contiene:

- resumen en lenguaje normal;
- notas técnicas;
- comprobaciones solicitadas;
- limitaciones conocidas, que puede ser una lista vacía cuando honestamente no existe ninguna.

El enlace al commit no se inserta en el mensaje para impedir que el unfurl de Discord parezca una segunda publicación. El SHA corto sigue identificando el corte.

## Desarrollo activo

El digest diario resuelve su fuente en cascada, siempre en lectura:

1. `vantare-v2/docs/roadmap/roadmap.json` (lo genera `roadmap_digest.py`, ISA-378). Se publican solo las fases con estado `in-progress`; `done`, `planned` y `future` se descartan. El nombre es `phaseLabel · title`, el progreso viene de `progress` (0-100) y el texto de `summary`; los campos localizados se leen en español. Si el archivo no existe o no parsea, se pasa al siguiente nivel sin fallar.
2. Milestones abiertos de GitHub del propio repositorio: el progreso es `closed/total` de sus issues y el texto es la descripción del milestone.
3. Si no hay ninguna de las dos, se publica el embed honesto de "sin novedades".

Solo se publican nombre, progreso, URL y el texto del propio milestone o fase; las menciones masivas se neutralizan. El workflow no escribe en ninguna fuente.

## Sistema visual compartido

Los cinco mensajes usan una presentación híbrida y determinista:

- un embed nativo conserva texto seleccionable, enlaces y accesibilidad;
- una tarjeta 1200×630 se genera desde HTML con el lenguaje visual de Vantare y contenido específico para cada audiencia;
- Chrome captura el HTML dentro del runner, sin servicios de IA ni dependencias nuevas;
- el PNG se adjunta al mismo POST y el embed lo referencia mediante un nombre estable por canal;
- si no puede generarse la tarjeta, el workflow falla antes de publicar y no envía un mensaje parcial.

La referencia visual es `roadmap_v5.2.html`: fondo negro con iluminación roja, superficies translúcidas, Inter, mono técnico, bordes finos y jerarquía sobria. Las tarjetas no reproducen la navegación de la app.

| Canal | Tarjeta | Contenido visual |
|---|---|---|
| Release | `vantare-release.png` | Versión estable y tres novedades principales del changelog canónico. |
| Nightly | `vantare-nightly.png` | Primera validación privada, cambios incluidos y comprobaciones. |
| Testers | `vantare-testers.png` | Build candidata, cambios visibles y comprobación principal. |
| Desarrollo | `vantare-development.png` | Tres proyectos activos con progreso. |
| Changelog | `vantare-changelog.png` | Versión, validación solicitada e integridad SHA-256. |

El embed siempre conserva el contenido completo, enlaces, checksum y contexto técnico. La imagen resume; nunca es la única fuente de información. La publicación falla antes del POST si Chrome no genera un PNG no vacío.

## Contrato editorial

Cada tarjeta responde una pregunta concreta de su audiencia:

- Release: qué versión salió y cuáles son sus cambios más importantes.
- Nightly: qué entra en la primera validación privada y qué debe comprobarse.
- Testers: qué cambió tras el feedback y qué debe comprobar el grupo amplio.
- Desarrollo: qué proyectos avanzan y cuál es su estado público.
- Changelog: qué versión descargar, qué validar y cómo comprobar su integridad.

Reglas obligatorias:

- español claro, salvo nombres propios y términos técnicos reconocibles como SHA-256;
- datos procedentes del changelog, fragmento o descripción pública del milestone o de la fase, nunca beneficios inventados;
- una idea útil por tarjeta;
- sin tarjetas de relleno, eslóganes vacíos ni mensajes como «próximo proyecto»;
- sin etiquetas internas como `Development pulse`, `Public preview`, `Building in public` o `Tester briefing`;
- si no hay novedades, se muestra un único estado vacío honesto;
- el texto completo y los enlaces permanecen en el embed accesible.

## Gates

- Los tests y dry-runs nunca hacen POST.
- Antes de publicar, el workflow consulta los metadatos del webhook y comprueba el ID del canal conocido.
- Release estable comprueba que el tag pertenece al historial de `master`.
- Las pre-releases validan rama, canal y patrón del tag, construyen los seis artefactos y solo después publican Discord.
- El ID esperado del canal es obligatorio: no existe publicación con destino desconocido.
- Nada llega a `nightly` sin la aprobación inicial explícita de Isaac.
- Nada llega a `master` sin la validación final explícita de Isaac.

## Validación ISA-95

El 2026-07-14 se verificaron en GitHub Actions los cuatro destinos con la versión pública vigente `v0.1.0.2`: release `29368648069`, testers `29368768778`, changelog beta `29368891135` y desarrollo activo final `29369095141`.

La revisión v2 sustituye los cuatro workflows antiguos para evitar que ramas obsoletas publiquen mensajes, elimina la carrera entre build y anuncio y añade tarjetas independientes para Nightly y Testers.
