# Recuperación de widgets: calidad pendiente

Registro del 22/09/2026 en `vantareapp/isa-1221-widgets-local-sync`, contra `origin/nightly@1e9932c4`. Publicación de recuperación en borrador solicitada por Isaac. Este registro no concede excepción ni habilita integración.

Las 466 suites frontend pasan (3766 tests, 2 omitidos); el ratchet de calidad sigue bloqueado por los hallazgos listados. Resolver antes de promover a nightly.

# Vantare quality report

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
