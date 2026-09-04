# Carriles por ownership — ejecución actual secuencial

Base de análisis813b96c4, entrega puntual979 sobre nightly659b2c57. Start now no autoriza merge. Un archivo solo tiene un owner activo; las reservas futuras no son ownership simultáneo.

| Lane | Base SHA | Files owned | Start now | Depends on | Conflicts | Merge order |
|---|---|---|---|---|---|---|
|TOOLCHAIN-CI|659b2c57|scripts/performance/**, docs/audit/**; milestone huella-minima-banco|sí,978|ninguna|no editar workflows aquí|tooling independiente|
|HUB-BUNDLE|813b96c4|OrbitShell.tsx, futuro index.css|no|#801 owner del mismo carril; navegación/paridad|#801; CSS otrosPR|después de resolver#801|
|OVERLAY-BUNDLE|813b96c4|i18n/i18n.ts, i18n-context.ts, i18n-provider.tsx; futuras hojas locales|gate solamente|fallback/race/offline|locales compartidos|idiomas→editor; Composite se adquiere solo tras migración|
|REACT-RUNTIME|659b2c57|track-map-view-model-v2.ts y test|sí,979|ninguna; archivo igual en candidato|0 exactos inventario|review980|
|MEMORY-LIFECYCLE|813b96c4|ninguno de producto asignado; pruebas futuras en issue propia|no|Windows + owner de ventana|Composite/Obs reservados legacy|después de liberación|
|RUNTIME-PUBLISH|813b96c4|ninguno ahora; futura transferencia de telemetry_core_runtime.go|no|ISA894 termina y autoriza borde|no comparte archivo con LEGACY|policy→marshal seriales|
|STORAGE-STARTUP|813b96c4|SettingsService y ProfileDocumentStore (sin edición en curso)|no|baseline cold/Windows|main reservado|después de sondas|
|STRATEGY|813b96c4|internal/strategy/** (sin edición)|no|NO PERFORMANCE CHANGE RECOMMENDED|ruta principal pertenece HUB-BUNDLE|sin PR performance|
|ENGINEER|813b96c4|internal/engineer/**, internal/radio/** (sin edición)|no|paridad por familia/audio físico|migración propia|sin PR performance|
|LEGACY-RETIREMENT|813b96c4|CompositeApp.tsx, ObsOverlayApp.tsx, WidgetVisualHost.tsx, telemetry_core_runtime.go, cmd/vantare/main.go y contracts de ISA894|no por auditor|ISA894|zonas de exclusión|su propia secuencia R7|
|COMPOSITION|813b96c4|ninguno ahora; futuro main/auth bootstrap|no|liberación LEGACY y Clerk|#913/886/880|último y en issue separada|

Lockfiles y generated bindings: sin owner de edición en esta auditoría, exclusión global. Handoffs/plan/digest son contrato común serial: cada PR modifica únicamente su milestone semántico y regenera contra la base. Aunque Git pueda resolverlos, al integrar980/978 se regeneran y validan en orden; no son carriles simultáneos sobre roadmap.json.
