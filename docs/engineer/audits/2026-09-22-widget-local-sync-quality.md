# Recuperación de widgets: calidad pendiente

Registro del 22/09/2026 en `vantareapp/isa-1221-widgets-local-sync`, contra `origin/nightly@1e9932c4`. Publicación de recuperación en borrador solicitada por Isaac. Este registro no concede excepción ni habilita integración.

Las 466 suites frontend pasan (3766 tests, 2 omitidos); el ratchet de calidad sigue bloqueado por los hallazgos listados. Resolver antes de promover a nightly.

## Revisión manual de los 55 avisos

Revisado el 22/09/2026 sobre `efd3f0751fb75469f956442aa5855c61a1b8d844`, comparado con `nightly@1e9932c4d8ca3d53a58d093449cfb840f7108e8f`. Se ejecutaron Knip 6.34.0, jscpd 5.1.2 y dependency-cruiser 18.2.0 en ambos árboles con Node 22.23.2. Además se rastrearon imports, manifest, consumidores de constantes y reglas CSS. No se ha modificado código productivo, política ni baseline durante esta revisión.

**Conclusión:** los 55 avisos se reproducen; no equivalen a 55 errores funcionales. Los 34 avisos Knip aparecen también al comparar directamente los dos árboles, los nueve pares de fragmentos de jscpd no tienen esas identidades en la base y los tres ciclos son nuevos. La mayor parte es deuda de la normalización Efficiency y de la recuperación de estilos. Se encontró además una regresión de validación no incluida en esos 55 avisos. La PR sigue sin estar lista para integrar.

### P2 — corregir la validación de IDs antes de integrar

`frontend/src/overlay/core/design-system-names.ts:56` consulta un objeto normal mediante una clave externa. `normalizeDesignSystemId("constructor")` devuelve la función `Object`; `normalizeDesignSystemId("__proto__")` devuelve el prototipo del objeto. Ambos valores son truthy y pasan la comprobación de `parseProfileDocumentV3` para `defaultVisualSystemId` (`profile-document.ts:591`). El mismo normalizador se usa al leer `visual.systemId` y las memorias.

Reproducción: dos pruebas de rechazo del normalizador y dos de rechazo del perfil fallan en el candidato (4/4); las dos pruebas equivalentes de lectura de perfil pasan en nightly base. El perfil de prueba es V3 mínimo con `layouts.general.widgets=[]` y `defaultVisualSystemId` igual a cada cadena. Los tests existentes cubrían `not-a-system`, pero no claves heredadas. Las sondas temporales se retiraron después de guardar el resultado.

Arreglo recomendado: exigir propiedad propia del diccionario (o usar `Map`) antes de devolver el ID. Añadir regresiones de rechazo al normalizador y a los límites de lectura de perfiles/memorias, manteniendo los alias válidos. No retirar validaciones para resolver los avisos.

### Knip: 34 avisos, con acciones distintas

| Grupo | Avisos | Qué se verificó | Acción mínima recomendada |
|---|---:|---|---|
| Alias nuevos de Efficiency | 23 | 6 archivos fachada sin entrada consumidora; 11 reexports de Relative no consumidos; 3 colecciones de opciones cuyo consumidor sigue usando `functional-study-options`; 1 reexport del manifest antiguo; 1 export de la lista de alias usado solo internamente; 1 constante con el mismo valor que su alias legado. | Conservar los IDs persistidos y los alias aceptados en URLs/perfiles. Reducir la superficie de reexports a consumidores reales o completar la adopción de nombres canónicos donde ya estaba prevista. La coincidencia de constantes es intencionada; no cambiar su valor para silenciar el aviso. |
| Exports internos | 8 | Las 6 constantes geométricas de Relative/Multiclass se usan dentro de sus módulos; el tipo y resolver de acento de clase se usan dentro de `functional-standings-multiclass.ts`. | No borrar los cálculos. Retirar solo exports innecesarios o consolidar el resolver equivalente con `functional-class-accent.ts`, conservando HYP/Hypercar/DP/LMP/P2/GT3/GTE. |
| Ventana de Standings | 2 | `STANDINGS_WINDOW_MAX_AROUND` e `isStandingsWindowAround` no tienen referencias fuera de su definición. El selector productivo y sus opciones sí se utilizan. | Retirar lo no consumido; no eliminar la selección de ventana ni su validación de entrada. |
| Renderer antiguo | 1 | `PedalsTelemetryFunctional.tsx` no está importado; `manifest.ts:100` registra `PedalsAdvancedEfficiency`. La fachada Efficiency también apunta al avanzado. | Retirar el componente obsoleto y revisar sus estilos específicos; no borrar el renderer avanzado ni cambiar el manifest por cumplir Knip. |

Las fachadas son nuevas, no los antiguos contratos persistidos. Que un nombre se haya creado para compatibilidad no demuestra que necesite exportarse desde todos los módulos. Los archivos fachada sin consumidores son `SessionInfo.tsx`, `efficiency-motion.ts`, `footer-slots.ts`, `index.ts`, `labels.ts` y `session-info-settings.ts`, dentro de `vantare-efficiency`.

### jscpd: 18 avisos = 9 pares de fragmentos similares

El detector trabaja por fragmentos de tokens; no todos los pares son byte a byte idénticos ni todas sus líneas deben borrarse. Cada par produce dos avisos.

| Pares | Localización en el candidato | Revisión y precaución |
|---:|---|---|
| 4 | `vantare-functional/tokens.css`: 31↔735, 36↔738, 43↔773, 53↔783 | Repetición de reglas de tabla/cabecera/identidad en el bloque de overrides aprobado. Consolidar solo declaraciones equivalentes respetando orden, especificidad y overrides de tamaños/estados. No retirar todo el bloque. |
| 2 | `vantare-crystal/isa93-parity-overrides.css`: 1 y 25 ↔ `vantare-functional/tokens.css`: 371 y 392 | Estilos parecidos del antiguo Pedals Telemetry. El renderer Functional correspondiente está desconectado; comprobar todas sus clases antes de retirar estilos. Crystal continúa activo y debe conservarse. |
| 1 | `vantare-functional/tokens.css:342` ↔ `vantare-iracing/iracing-tokens.css:20` | Apariencia intencionadamente similar de Pedals Advanced en dos sistemas activos. Compartir solo estructura común manteniendo tokens, identidad y personalización independientes. |
| 1 | `authoring/fixtures/authoring-v2-workshop-frame.ts`: 222↔273 | Cálculo de mínimos de Standings en dos momentos, antes/después de ajustar contenido/módulos. Se puede extraer el mismo cálculo; no borrar la segunda aplicación sin preservar la geometría final. |
| 1 | `pedals-telemetry-compact-view-model-v2.ts:56` ↔ `pedals-telemetry-view-model-v2.ts:18` | Lectura inicial de velocidad/RPM/marcha/steering y estado de fuente. Son dos contratos activos; mantener calidad, unidades, ceros válidos y estado desconectado si se comparte código. |

### dependency-cruiser: 3 ciclos de tipos

- `design-system-names.ts` importa **solo el tipo** `DesignSystemId` de `profile-document.ts`; el documento sí importa el normalizador como código.
- `delta-definition.ts` ↔ `delta-view-model.ts`: ambas aristas son imports de tipos (`DeltaViewModel` / `DeltaReference`).
- `fuel-strategy-definition.ts` ↔ `fuel-strategy-view-model.ts`: ambas aristas son imports de tipos (`FuelStrategyViewModel` / `FuelStrategySource`).

Todos los ciclos contienen al menos una arista que desaparece al compilar. No se ha demostrado un ciclo de inicialización JavaScript ni un bloqueo de ejecución. El gate sí prohíbe el acoplamiento circular del grafo de TypeScript. Solución mínima: ubicar los tipos compartidos en una capa de contrato sin imports hacia sus consumidores, manteniendo las validaciones en runtime y sin cambiar las reglas del analizador.

### Orden de trabajo recomendado

1. Corregir y cubrir la regresión de validación de IDs.
2. Reducir exports/fachadas no consumidos y retirar el renderer obsoleto sin cambiar diseños activos.
3. Eliminar los ciclos de tipos con cambios acotados.
4. Consolidar duplicaciones preservando CSS y semántica de datos; comprobar las vistas afectadas.
5. Repetir ratchet, tests, compilación, lint y revisión visual antes de pedir integración.

Las 3766 pruebas anteriores siguen siendo evidencia de la suite existente, no prueba de ausencia de errores: las sondas de esta revisión exponen cuatro expectativas de rechazo que esa suite aún no cubre. Revisión completada; correcciones pendientes.

# Vantare quality report · registro original

- generated_at: 2026-09-22T10:48:03Z
- mode: check
- aggregate: FAIL
- policy_changed: False

## Analizadores
| analyzer | config | status | exit | findings | ms |
|---|---|---|---|---|---|
| staticcheck | darwin-dev | FAIL | 1 | 86 | 759 |
| govet | darwin-dev | PASS | 0 | 0 | 842 |
| deadcode | darwin-dev | PASS | 0 | 3742 | 1897 |
| go-mod-tidy | darwin-dev | FAIL | 0 | 1 | 0 |
| knip | darwin-dev | FAIL | 1 | 462 | 2743 |
| jscpd | darwin-dev | FAIL | 1 | 508 | 764 |
| dependency-cruiser | darwin-dev | FAIL | 0 | 3 | 1306 |
| staticcheck | windows-amd64 | FAIL | 1 | 108 | 491 |
| govet | windows-amd64 | PASS | 0 | 0 | 1016 |
| deadcode | windows-amd64 | PASS | 0 | 636 | 2257 |

## Ratchet
| analyzer | NEW | NEW blocking | RESOLVED | MOVED |
|---|---|---|---|---|
| staticcheck | 0 | 0 | 0 | 0 |
| govet | 0 | 0 | 0 | 0 |
| deadcode | 0 | 0 | 0 | 0 |
| go-mod-tidy | 0 | 0 | 0 | 0 |
| knip | 34 | 34 | 71 | 0 |
| jscpd | 18 | 18 | 24 | 0 |
| dependency-cruiser | 3 | 3 | 0 | 0 |

## NEW bloqueantes
- `knip` `vantare-v2/frontend/src/overlay/core/design-system-names.ts` duplicates [{'name': 'EFFICIENCY_SYSTEM_ID', 'line': 13, 'col': 14, 'pos': 504}, {'name': 'EFFICIENCY_LEGACY_SYSTEM_ID', 'line': 14, 'col': 14, 'pos': 571}]
- `knip` `vantare-v2/frontend/src/overlay/authoring/efficiency-study-options.ts` exports EFFICIENCY_STUDY_MODULES
- `knip` `vantare-v2/frontend/src/overlay/authoring/efficiency-study-options.ts` exports EFFICIENCY_STUDY_SLOTS
- `knip` `vantare-v2/frontend/src/overlay/authoring/efficiency-study-options.ts` exports EFFICIENCY_STUDY_STYLES
- `knip` `vantare-v2/frontend/src/overlay/core/design-system-names.ts` exports EFFICIENCY_SYSTEM_ALIASES
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/manifest.ts` exports vantareFunctionalManifest
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports EFFICIENCY_RELATIVE_FOOTER_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports EFFICIENCY_RELATIVE_META_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports EFFICIENCY_RELATIVE_PADDING_X
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports EFFICIENCY_RELATIVE_ROW_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports FUNCTIONAL_RELATIVE_BASE_WIDTH
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports FUNCTIONAL_RELATIVE_FOOTER_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports FUNCTIONAL_RELATIVE_META_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports FUNCTIONAL_RELATIVE_PADDING_X
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports FUNCTIONAL_RELATIVE_ROW_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports resolveFunctionalRelativeBaseHeight
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/relative-layout.ts` exports resolveFunctionalRelativeSlotsWidth
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/multiclass-layout.ts` exports FUNCTIONAL_MULTICLASS_PADDING_Y
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/multiclass-layout.ts` exports FUNCTIONAL_MULTICLASS_ROW_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/relative-layout.ts` exports FUNCTIONAL_RELATIVE_FOOTER_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/relative-layout.ts` exports FUNCTIONAL_RELATIVE_META_PX
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/relative-layout.ts` exports FUNCTIONAL_RELATIVE_PADDING_X
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/relative-layout.ts` exports FUNCTIONAL_RELATIVE_ROW_PX
- `knip` `vantare-v2/frontend/src/overlay/widget-types/standings/functional-standings-multiclass.ts` exports resolveFunctionalStandingsClassAccent
- `knip` `vantare-v2/frontend/src/overlay/widget-types/standings/standings-window.ts` exports STANDINGS_WINDOW_MAX_AROUND
- `knip` `vantare-v2/frontend/src/overlay/widget-types/standings/standings-window.ts` exports isStandingsWindowAround
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/SessionInfo.tsx` files src/overlay/design-systems/vantare-efficiency/SessionInfo.tsx
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/efficiency-motion.ts` files src/overlay/design-systems/vantare-efficiency/efficiency-motion.ts
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/footer-slots.ts` files src/overlay/design-systems/vantare-efficiency/footer-slots.ts
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/index.ts` files src/overlay/design-systems/vantare-efficiency/index.ts
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/labels.ts` files src/overlay/design-systems/vantare-efficiency/labels.ts
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-efficiency/session-info-settings.ts` files src/overlay/design-systems/vantare-efficiency/session-info-settings.ts
- `knip` `vantare-v2/frontend/src/overlay/design-systems/vantare-functional/PedalsTelemetryFunctional.tsx` files src/overlay/design-systems/vantare-functional/PedalsTelemetryFunctional.tsx
- `knip` `vantare-v2/frontend/src/overlay/widget-types/standings/functional-standings-multiclass.ts` types FunctionalStandingsClassAccent
- `jscpd` `vantare-v2/frontend/overlay/authoring/fixtures/authoring-v2-workshop-frame.ts` duplication 8a5c61821251
- `jscpd` `vantare-v2/frontend/overlay/authoring/fixtures/authoring-v2-workshop-frame.ts` duplication 8a5c61821251
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-crystal/isa93-parity-overrides.css` duplication c166fa0d1d1e
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-crystal/isa93-parity-overrides.css` duplication c2676351a6c2
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 252160e3c4b8
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 252160e3c4b8
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 455921b51265
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 455921b51265
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 5057fe4febf2
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 5057fe4febf2
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 67a3ef29191a
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 78d85ac59965
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication 78d85ac59965
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication c166fa0d1d1e
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-functional/tokens.css` duplication c2676351a6c2
- `jscpd` `vantare-v2/frontend/overlay/design-systems/vantare-iracing/iracing-tokens.css` duplication 67a3ef29191a
- `jscpd` `vantare-v2/frontend/overlay/widget-types/pedals-telemetry-compact/pedals-telemetry-compact-view-model-v2.ts` duplication 328a7455c463
- `jscpd` `vantare-v2/frontend/overlay/widget-types/pedals-telemetry/pedals-telemetry-view-model-v2.ts` duplication 328a7455c463
- `dependency-cruiser` `src/overlay/core/design-system-names.ts` no-circular src/overlay/core/profile-document.ts
- `dependency-cruiser` `src/overlay/widget-types/delta/delta-definition.ts` no-circular src/overlay/widget-types/delta/delta-view-model.ts
- `dependency-cruiser` `src/overlay/widget-types/fuel-strategy/fuel-strategy-definition.ts` no-circular src/overlay/widget-types/fuel-strategy/fuel-strategy-view-model.ts
