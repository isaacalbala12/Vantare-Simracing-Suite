# Versionado y gates de release

Vantare usa cuatro segmentos `major.phase.feature.patch`, con prefijo `v` en los tags. Las pre-releases añaden `-nightly.N` o `-testers.N`. Ejemplos de formato: `v0.4.2.0`, `v0.4.2.0-nightly.1`. No son instrucciones para publicar esas versiones.

- `major`: 0 durante desarrollo/beta; 1 para el lanzamiento estable.
- `phase`: etapa del roadmap.
- `feature`: corte funcional de la etapa.
- `patch`: corrección sin ampliar el alcance funcional.

## Versión de una build

Leer [VERSION](../VERSION) del commit exacto. La versión instalada se comprueba en la app y en los metadatos de su release; la versión del checkout no demuestra qué build está publicada. [sync_version.go](../build/sync_version.go) sincroniza los recursos de build. La [receta de artefactos](release-artifacts.md) explica el proceso real y sus gates.

Los tags distribuidos son inmutables. Una corrección usa un tag nuevo. Los documentos, auditorías y reviews no crean versión, tag ni publicación por sí solos.

## Etapas y aceptación

El [plan de beta y lanzamiento](plan-beta-publica-y-lanzamiento.md) mantiene la propuesta de etapas y sus dependencias; el [contrato de producto](vantare-program/product-contract.md) contiene las decisiones aprobadas. El [roadmap](roadmap/plan.md) es su expresión pública. Los rangos son planificación, no prueba de que una fase esté completada ni autorización de venta.

Usar las [checklists de release](release-checklists.md) para registrar aceptación por build. Studio es un editor único con autoguardado; no se exige recuperar los antiguos WidgetStudio/LayoutStudio. Polar es la autoridad comercial; la apertura de venta requiere sus gates, no una elección pendiente entre proveedores.

## Traza y publicación

1. Tarea y aceptación en Notion; rama y PR en GitHub.
2. Fragmentos de cambios visibles en `docs/changelog/fragments/ISA-N.json` y manifiesto del corte en `docs/releases/<tag>.json`.
3. Checks, artefactos, SHA y canal comprobados; autorización aplicable antes de promover o publicar.
4. [release.yml](../../.github/workflows/release.yml) valida el manifiesto y genera las notas mediante [release_notes.py](../../.github/scripts/release_notes.py). Un manifiesto o fragmento ausente bloquea; no hay fallback de notas genéricas desde `changelog.md`.
5. Tags estables contenidos en `master`; pre-releases desde su rama homónima. [Canales y excepción de hotfix](branch-channels.md), [runbook](release-beta-operations-runbook.md), [comunicaciones](discord-communications.md).

[Historia de versiones y gates anteriores](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/versioning-and-release-gates.md). Los checkpoints antiguos no describen la versión actual.
