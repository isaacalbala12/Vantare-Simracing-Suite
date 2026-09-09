# ISA-1088 — UI y DuckDB reales

Base 7b0afab9d06663f0dfd472c1de9b12ebd3a03e45; rama
vantareapp/isa-1088-recorded-session-ui; C:/tmp/vantare-isa1088.

## Cambios

Coordinador strategy-recorded-session.ts y test; StrategyRecordedSessions.tsx
y test; StrategyOrbitPage.tsx y wiring test; cuatro catálogos strategy-orbit.
Test nativo opt-in internal/app/strategy_recorded_real_integration_test.go.
Contrato, handoffs y roadmap actualizados. Sin nueva dependencia.

El panel abre con acción explícita, prepara referencias y permite confirmar el
reemplazo de selección. Reabre la referencia guardada, nunca cabeza automática.
Mantiene handles entre pestañas/carga/error/éxito. Salir del editor los libera.
Conserva fallos de limpieza y compensa Open tardío tras cancelación.

## Evidencia

- Frontend completo: 420 archivos / 3306 pruebas PASS, 326.46 s. Después,
  regresión de error del solver y selección por identidad: focal 20 PASS.
- Build y typecheck PASS; aviso heredado de chunks >500 KB.
- Lint completo detectó referencia en render y causa de error anidado. Corregidos;
  lint focal de los dos archivos PASS. Lint final completo pendiente al cierre
  del bloqueo de descubrimiento.
- Go global y vet app/Strategy/main PASS antes del export opt-in del catálogo.
- Dos carreras reales: Imola y Monza, ambas 98 canales. Preparación, proyección,
  nueva cabeza guardada, recuperación de revisión anterior, petición de entradas
  de Strategy, rechazo al cerrar y reapertura explícita PASS.
- Hash Imola: 35438326ecddd6ab660ed3aad70b076a73e3290236c0292f30657594c38c1eb0.
- Hash Monza: 08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538.
  Ambos originales coinciden antes/después. No fuentes reservadas abiertas.
- Runtime validado por confianza compilada, manifest
  700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869.
- Banco real usa autorización de licencia controlada, no simula parser/datos.
  Repositorio del consumidor controlado para la consulta. No certifica solver.

## Wails real y pendientes

Build diagnóstica sin tags production, configuración heredada del proceso,
perfil WebView local aislado y configs/data bajo bin del worktree. No se leen
ni copian .env. El comando de generación/limpieza de configuración embebida fue
rechazado por revisión automática (blocked by policy); se usó la vía de
diagnóstico que ya admite variables del proceso, sin generar ese archivo.

Hub abre. El catálogo de dos fuentes reales se creó por LMUImporter existente,
no con datos manuales. No se pulsó importar las 369 fuentes disponibles porque
incluye reserva independiente. Evento nuevo de Imola se guarda; calculate_orbit
alcanza 8 s: #1089. El error ya permite acceder a Sesiones (regresión RED/GREEN).
Buscar sesiones falla por límite nativo 128: corrección separada pendiente.
Un evento heredado previo también rechazó create_event/strategyDocument; no
se modificó ni se usa como evidencia de funcionamiento del evento nuevo.

El panel usa Orbit productivo; falta el porte A4 completo. No se declara
recorrido Wails completo, precisión física ni estrategia óptima certificada.
Logs privados: C:/tmp/isa1088-real-{imola,monza}.log, isa1088-go-test.log,
isa1088-frontend-test.log. Captura de trabajo C:/tmp/isa1088-wails.png.

## Repetir

El test nativo requiere ISA1088_REAL_SOURCE y ISA1088_RUNTIME_APP; por defecto
se omite. ISA1088_EXPORT_CATALOG permite exportar explícitamente el modelo real
mediante el importador existente al catálogo de una app diagnóstica aislada.
Nunca usar esa opción con un catálogo de usuario ni con la app destino abierta.
Para UI: evento nuevo, combinación, Sesiones, buscar dos veces tras estabilidad,
abrir fuente correcta y confirmar Usar estas sesiones. Verificar referencia
guardada y error al cerrar fuente. Pendiente de corregir límite de descubrimiento.

Sin push, PR, CI remota, merge, promoción o release. LMU intacto; solo se
iniciaron/cerraron procesos de esta build aislada, coordinados con overlays.
