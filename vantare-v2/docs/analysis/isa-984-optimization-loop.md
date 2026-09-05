# ISA-984 — Primera vuelta del bucle de optimización

Decisión: **no conservar cambios productivos de los dos prototipos probados**.
Añadir tres pruebas de comportamiento que detectan regresiones del prototipo
locale-active. No hay mejora nueva de rendimiento aceptada ni claim de ausencia
absoluta de regresiones. Telemetry Core queda fuera de valoración y cambios.

## Base y alcance

- Base: `origin/nightly@659b2c57dc2c7fc75962cc3c8e425ed1289266ec`.
- Candidato pendiente #977: `813b96c43028353a599903fb035268c354b58896`.
- Investigación inspector: issue #983, rama de investigación sin commits,
  worktree limpio eliminado después del ensayo.
- Este corte: issue #984, `vantareapp/isa-984-locale-load-gate` hacia nightly.
- Solo tests y evidencia Markdown; `roadmap:not-required`. No cambia planificación
  pública, interfaces, diccionarios, imports productivos, lockfile, Core o CI.
- Un auditor; sin subagentes, tareas en background, merge, promociones o release.

## Método y decisiones

| Hipótesis | Resultado nuevo | Decisión |
|---|---|---|
| Diferir edición completa en CompositeApp | Archivo afectado por ISA-894/#977; el ahorro previo no autoriza colisión | WAIT FOR ACTIVE MIGRATION |
| Diferir solo WidgetPropertyInspectorView en InPlaceInspectorPanel | Desktop gzip 352.848→350.578 bytes; Hub 603.019→603.524; OBS minificado sin cambio | REJECT: −2.270 bytes no compensan nuevos estados de espera/fallo |
| Cargar solo el idioma activo | 39 tests BASE PASS; prototipo 33 PASS/6 FAIL y tres errores de teardown. Chromium confirma problemas después de terminar las cargas | REJECT del prototipo actual; idea pendiente de contrato asíncrono seguro |
| Lazy por ruta en OrbitShell | #801 sigue OPEN/DRAFT en `4df90a22a535a44ff1a8f45903eed187b272efd7`; toca OrbitShell y SettingsOrbitPage | WAIT FOR ACTIVE MIGRATION |

El cierre de JS incluye HTML, runtime seleccionado e imports síncronos; gzip
nivel 9 y Brotli 11 sobre los archivos finales de Vite, no sobre código intermedio.
El inspector pasa de 1.269.071 a 1.261.466 bytes minificados; el Hub pasa de
2.209.218 a 2.209.502. Los tiempos del colector incluyen compresión y **no** son
benchmarks de tiempo puro de build. La variante de inspector usa fallback vacío
solo para medir un límite favorable del ahorro: no se acepta como UX final ni
se afirma paridad funcional. No se implementa al fallar ya el coste/beneficio.

## Idiomas: distinguir espera de regresión

Cinco fallos existentes comprobaban un setter síncrono. Por sí solos no prueban
que un futuro diseño asíncrono sea incorrecto. Un sexto muestra que
`translate("en", "onboarding.welcome")` devuelve la clave si el catálogo no está
cargado. Se añadieron pruebas que esperan todo el trabajo pendiente y se
contrastaron consumidores reales en Chromium:

| Escenario | BASE | Prototipo |
|---|---|---|
| Inglés guardado; consumidor fuera de provider | Fallback «Bienvenido a Vantare» | Clave cruda `onboarding.welcome` |
| Elegir inglés y después español, retrasando fetch inglés 150 ms | Locale y preferencia finales `es` | Locale y preferencia finales `en` |
| Desmontar proveedor anterior y elegir español en el siguiente | UI y preferencia finales `es` | UI `es`, preferencia sobrescrita a `en` por operación anterior |
| Fallo de módulo italiano al cambiar idioma | Catálogo ya incluido; italiano disponible | Promesa rechazada sin manejar; conserva español sin feedback de fallo |

Los casos de fallback, última intención y persistencia tras remount se prueban
permanentemente en `frontend/src/i18n/I18nProvider.ordering.test.tsx`. Los tres
fallan con el transform virtual y pasan al retirarlo. No se mockean proveedores,
diccionarios ni colaboradores internos. Se usan `I18nProvider`, `useI18n`, DOM y
la preferencia pública; `vi.dynamicImportSettled()` permite observar el estado
final y evita que un fallo sea solamente una aserción demasiado temprana.

Chromium usa una pantalla sintética con los módulos reales y el servidor Vite
local. Las interrupciones se inyectan en el fetch del módulo, fuera de la
interfaz del idioma. Es **MEASURED-MAC-AUXILIARY**: no certifica Hub autenticado,
Wails/WebView2, offline físico, FPS, memoria nativa o TTI. Los fallos pertenecen
al prototipo descartado, **no** al producto actual.

## Skills y revisión

Se localizaron y leyeron las once skills solicitadas; la de React instalada se
llama `vercel-react-best-practices`. `codebase-design` está en `.claude/skills`;
`domain-modeling` se leyó del repositorio fuente `mattpocock/skills`, blob
`9b97707e19ef1f590aada356f2b3f6bb881f91be`, sin instalar ni cambiar configuración.

Se aplicaron medición BASE/variante, interfaz pública como superficie de prueba,
ownership del idioma, coste de conceptos y evaluación de imports. Se mantuvo
el vocabulario vigente; no se creó un glosario paralelo ni una nueva autoridad.
TDD se usa aquí como prueba sensible al mutante: RED en prototipo, GREEN al
conservar BASE. No se presenta una retirada de prototipo virtual como un fix de
producto. No hay cambios Go ni nuevos trust boundaries que justifiquen trabajo
Go o findings de seguridad; import paths fijos, sin inputs de usuario o secretos.

## Validación y reproducción

- BASE original: 3 archivos/39 tests PASS.
- Regresiones nuevas contra prototipo: 3/3 FAIL, sin errores no manejados del
  harness; fallan por textos/elección/preferencia finales incorrectos.
- BASE con pruebas nuevas: 4 archivos/42 tests PASS.
- Suite completa: 434 archivos/3.298 tests PASS; aviso heredado HappyDOM
  AbortError de teardown registrado, exit 0.
- Build/typecheck y lint global PASS. Windows CI: resultado final en la issue
  y PR del SHA entregado; CI no ejecuta escenarios físicos de WebView2.

Desde `vantare-v2/frontend`, `pnpm exec vitest run
src/i18n/I18nProvider.ordering.test.tsx` ejecuta el gate retenido. Para el mutante,
usar `--config <paquete>/vitest-probe.mjs`; ajustar la raíz absoluta conservada
en esa config si se reproduce desde otro checkout. El transform procede de
la auditoría #981 y no escribe código productivo. Los paquetes locales contienen
scripts, grafos completos, hashes, variantes finales, logs y before/after:
`/Users/isaacalbala/Desktop/vantare-performance-loop-20260905/README.md`.

Los dos primeros intentos de preparar Chromium fallaron por JSX virtual y falta
de preámbulo HMR. Se corrigió el harness; solo los ensayos posteriores completos
sostienen los resultados. No se confunden esos errores con regresiones del producto.

## Siguiente trabajo concreto

Antes de aceptar idioma bajo demanda debe existir un contrato que conserve la
traducción síncrona usada por Settings, mantenga el fallback español, confirme
solo la última intención, invalide operaciones tras desmontaje y gestione fallo
sin perder la preferencia ni mostrar claves. Medir cada locale inicial y primera
apertura con el proveedor real; no basta con disminuir bytes ni cambiar tests
para que esperen más. No se acepta aquí ese rediseño ni se duplica #801.

El rollback de este PR solo elimina tests y evidencia. No toca el comportamiento
actual ni revierte #980. Los resultados negativos cierran estas hipótesis de la
vuelta inicial; futuras vueltas necesitan otra hipótesis medida y aislada.
