# Operar una build y una release

Este runbook coordina preparación, publicación y recuperación. La construcción vive en [release-artifacts](release-artifacts.md), los permisos en [branch-channels](branch-channels.md) y la aceptación en [release-checklists](release-checklists.md). Revisado contra el workflow de nightly del 2026-09-14; no certifica una ejecución Windows ni el entorno remoto.

## Preparar el corte

1. Leer tarea y proyecto Notion, alcance, autorizaciones y SHA exacto. La ruta ordinaria es rama de issue → nightly → testers → master.
2. Elegir el canal y una versión nueva siguiendo [versionado](versioning-and-release-gates.md). No copiar tags antiguos de ejemplos ni reutilizar uno distribuido.
3. Crear/revisar el manifiesto `vantare-v2/docs/releases/<tag>.json` y sus fragmentos `vantare-v2/docs/changelog/fragments/ISA-N.json`. Las notas solo describen cambios incluidos y pruebas realmente hechas.
4. Desde la raíz Git, validar el corte y revisar el texto generado:

```bash
python .github/scripts/release_notes.py --tag '<tag-del-corte>' --check
python .github/scripts/release_notes.py --tag '<tag-del-corte>'
```

Sustituir el marcador por el tag acordado. El generador exige manifiesto, canal, título/resumen y fragmentos válidos. `docs/changelog.md` conserva historia; no se busca una sección Markdown para suplir un manifiesto ausente.

5. Pasar los gates de canal y la checklist aplicable. Para construir localmente, seguir la receta de artefactos completa, incluido el runtime DuckDB, preflight y smoke de login. Un ejecutable de desarrollo no constituye una release.

## Publicación autorizada

[release.yml](../../.github/workflows/release.yml) ofrece tres rutas:

| Ruta | Resultado |
|---|---|
| Dispatch desde nightly/testers, `publish_channel=none` | Artefacto interno de Actions; sin GitHub Release ni anuncio |
| Dispatch desde nightly/testers, canal homónimo y `release_tag` válido | Pre-release del canal con artefactos verificados y comunicaciones configuradas |
| Push de tag estable `v*` contenido en master | Release estable tras los gates y artefactos |

Para una build interna desde nightly:

```bash
gh workflow run 'Release build' --ref nightly -f publish_channel=none
```

Para publicar una pre-release aprobada, indicar en el dispatch `publish_channel`, `release_tag` y, si procede, `release_notes`. Este último input no sustituye al manifiesto que genera el cuerpo de GitHub Release. La rama y el canal deben coincidir. No existe un input `create_release`.

Comprobar después run, SHA, tag, release y los seis archivos oficiales. Actualizar Notion con el resultado observado. Un dispatch aceptado no demuestra build ni publicación completadas.

## Comunicaciones

El mismo workflow verifica la release antes de anunciarla. [discord-communications](discord-communications.md) es la referencia única para secretos públicos por nombre, destinos, formato y comportamiento de los mensajes. No mantener plantillas con una lista fija de funcionalidades ni copiar anuncios de la antigua beta.

Si falla un anuncio, revisar el job concreto, sus comprobaciones de destino y su política de reintento antes de repetir. La existencia de una release no autoriza duplicar el anuncio. No hay fallback a un webhook genérico.

## Diagnóstico y recuperación

| Fallo | Acción |
|---|---|
| Falta manifest/fragmento, tag incoherente o notas vacías | Corregir el corte en PR y repetir la validación del generador; no añadir un heading a `changelog.md` como reparación |
| Falla preflight, build, runtime o checksum | Corregir la causa y reconstruir desde la receta oficial; conservar evidencia del fallo |
| Falta un artefacto de la release | Comprobar el job build/upload antes de anunciar descargas |
| Destino Discord no válido o no configurado | Revisar el secreto dedicado y el ID de destino según el contrato de comunicaciones |
| Tag distribuido incorrecto o bug crítico | Conservarlo, registrar la incidencia y preparar una versión nueva |

Un hotfix crítico requiere la excepción expresamente aprobada en [canales](branch-channels.md): rama `vantareapp/hotfix-isa-<número>-<descripción>` desde master, PR con gates estrictos y posterior traslado del cambio a nightly. La ruta ordinaria mantiene todos los canales. Ningún rollback documental mueve tags ni restaura datos automáticamente.

## Soporte de cuenta y Billing

Usar [Billing](billing/README.md) para reconciliación, credenciales y acceso operativo. Polar es la autoridad comercial. Los antiguos comandos administrativos `grant`/`revoke` tienen helpers sin implementar en este checkout: no son una herramienta operativa para reparar una compra Polar. Los cambios monetarios, de cuenta o de datos requieren el procedimiento y autorización correspondientes.

[Runbook anterior completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/release-beta-operations-runbook.md), conservado como historia de sus versiones, avisos e iconos; no usar su soporte Stripe ni sus anuncios como instrucciones actuales.
