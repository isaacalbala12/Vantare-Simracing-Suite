# Fase 7b — Studio V4 a layout nativo (#1432)

Worker Codex; revisión pendiente de Claude Opus 5.5. Base de integración
`a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`, rama
`vantareapp/isa-1432-w-fase7b`. Notion inaccesible; excepción expresa de Isaac:
solo referencia GitHub, sin afirmar seguimiento Notion completado.

## Contrato

Entrada: un fichero Studio **V4** del almacén Wails
(`pkg/config/profile_v3_store.go`), máximo 5 MiB. No descubre AppData, no abre
DBs, no escribe en Wails ni convierte V2/V3 implícitamente. Referencias:
`frontend/src/overlay/core/profile-document.ts`, `layout-viewport.ts`,
`widget-visual-settings.ts` y `native/ui/src/layout.rs`.

El CLI `vantare-import-profile PERFIL.json CARPETA-NUEVA X Y ANCHO ALTO` crea
`layout.json` y `report.json` en una carpeta que **no puede existir**. Las
opciones son posicionales; coordenadas negativas admitidas. Los padres deben
existir. Ningún archivo previo se reemplaza. Si falla I/O, la carpeta parcial
queda para inspección; nunca se activa automáticamente.

`candidate.ps1 -Operation ImportLayout` usa el CLI empaquetado sobre una copia
SHA del perfil, prepara otra generación y activa `data/layout.json` mediante
la transacción existente. `Rollback` restaura la generación anterior, incluidos
sus datos. `ImportProfiles` sigue siendo archivo opaco. El recibo `import.json`
describe esa copia (`conversion=none`); `native/report.json` describe la
conversión funcional por separado. Múltiples perfiles no se fusionan.

## Semántica y límites explícitos

- Posiciones: `scale = min(anchoMonitor/anchoViewport, altoMonitor/altoViewport)`;
  centrado del viewport más origen global del monitor. Es el `contain` con
  letterbox de Wails, sin estirar ejes. Viewport ausente = 1920×1080, mismo
  valor del producto. Monitor explícito; `monitorIndex` se registra, no se usa
  para buscar pantallas. Con DPI, pasar el mismo espacio de coordenadas de los
  bounds GPUI; no prometer paridad física sin comprobar esa pantalla.
- Solo `layouts.general`. Layouts por sesión y `preservedWidgets` se reportan.
  Se conserva orden estable por `zIndex` como orden de instancias.
- `enabled` pasa a `visible`. Cualquier regla `visibleWhen` no vacía se importa oculta y se
  informa para revisión: no puede evaluarse en el documento nativo actual.
- `Settings` = contenido + apariencia efectiva (`baseSettings` y luego
  `appearanceOverrides`, fusión recursiva; arrays reemplazan). Apariencia tiene
  precedencia al colisionar con contenido. Se deserializa el enum productivo:
  ninguna copia del esquema ni cambio en widgets. Se conservan las claves
  camelCase que el widget admite; campos ausentes usan sus defaults productivos
  nativos. Opciones descartadas y valores normalizados
  aparecen por campo en el informe; tipos incorrectos en campos admitidos
  fallan, sin sustituirlos por defaults inventados.
- `opacity` del objeto efectivo (si se declara) pasa a la instancia, en 0..1;
  ausencia = 1. V4 no define una opacidad en `layout` o `behavior`; no se inventa
  una conversión de porcentaje o de alpha de colores.
- Se importan únicamente visuales `vantare-functional` (Eficiencia), versiones
  0/1; versiones futuras se omiten con informe. Original, Crystal, Endurance e
  iRacing se omiten. No se migra memoria de otros diseños ni procedencia.
- Cuatro tipos no portados: `pedals-telemetry-compact`, `race-schedule`,
  `delta-advanced`, `engineer-radio`. Se omiten con informe; no se sustituyen por
  otro tipo. Los 18 tipos actuales se prueban contra su `Settings` productivo.
- Escala, w/h y aspectLocked no tienen representación en layout v1. Se reporta
  cada widget; conserva tamaño intrínseco nativo. No garantiza mismo tamaño ni
  que quede entero en pantalla. Rendimiento V4 se reporta sin importar.
- IDs vacíos/duplicados, monitor/viewport inválidos, JSON roto, tamaño excesivo
  y opacidad fuera de rango fallan. Rutas `.env*` y enlaces/reparse rechazados.

Los fixtures son ejemplos creados para la prueba, sin datos personales. Los
golden fijan posiciones en monitor negativo, enabled, opacidad, camelCase,
prioridad de overrides, opciones desconocidas, cuatro tipos no portados y
diseño no Eficiencia. Son evidencia de conversión, no telemetría real ni
paridad visual LMU/OBS.

## Empaquetado

Todos los binarios workspace: `vantare`, `vantare-core`, `vantare-overlays`,
`vantare-hub`, `vantare-engineer`, `vantare-storage`, `vantare-workshop`,
`vantare-grabar-lmu`, `vantare-grabar-acc`, `vantare-import-profile`.
Cada exe tiene sidecar `<nombre>.exe.sha256` y entrada size/SHA en manifest.
El builder compara la lista con `cargo metadata`: si una integración añade
otro binario, falla hasta actualizar el inventario, nunca lo omite en silencio.
Instalación, actualización y rollback comprueban también todos los sidecars.

El bootstrap anterior de seis binarios no acepta este paquete ampliado. Usar
el instalador nuevo para una instalación aislada; este corte no actualiza
instalaciones del candidato anterior de seis binarios. El bootstrap instalado
no se reemplaza automáticamente.
Ese paso no es una actualización remota ni autoriza ejecutar scripts de un ZIP.

## Reproducción y límites de entrega

Verificación manual: tras ImportLayout, leer Status para obtener la generación
activa y abrir su `bin/vantare-hub.exe --studio --layout <generación>/data/layout.json`.
Revisar posición, enabled y opciones contra el informe (las dimensiones son
intrínsecas, no las de Wails). Cerrar Hub/overlays antes de Rollback y comprobar
que el SHA del layout anterior vuelve a ser el activo. Para probar overlays,
Start con argumentos explícitos de core y sin grupo de overlays usa ese layout;
un grupo explícito como `4` sigue seleccionando la campaña y prevalece.

Desde `native/`: fmt, clippy/test workspace offline con `-j 2`, y Build del
candidate con `--locked --workspace --bins -j 2`; `packaging/tests.ps1` contra
su directorio de artefactos desde **Windows PowerShell 5.1**. Las pruebas cubren
CLI real, todos los binarios/sidecars, instalación, actualización, interrupción
de proceso y rollback, incluida conversión V4 y reversión de layout previo.

No se demuestra apagón/disco físico, paridad de servicios, otros layouts,
migración de DB/Strategy, firma, Windows limpio/otra GPU ni sesión LMU/OBS.
El orquestador debe reconciliar Notion al recuperar acceso y revisar el diff
antes de integrar. No push, PR, merge, release ni promoción en este worker.
