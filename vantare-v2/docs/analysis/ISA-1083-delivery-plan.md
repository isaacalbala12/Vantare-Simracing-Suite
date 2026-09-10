# Entrega por partes: Functional y acceso por widget

Plan aprobado por Isaac el 2026-09-10 tras el análisis de integración y licencias.
Base de ISA-1083: `origin/nightly@b6b5754eee059bc239fce18c08b39adae8c553fa`.
Rama/worktree: `vantareapp/isa-1083-functional-standings`, `C:/tmp/vantare-isa1083`.

## Parte 1 — Standings utilizable, ISA-1083

### 1A. Guardado y recuperación
- [x] Regresión RED: guardar/reabrir perfil Functional y biblioteca de diseños.
- [x] Admitir Functional en el contrato compartido Go, preservando visual y memoria de sistemas.
- [x] Regresión GREEN y tests de config/servicio.
Archivos: `pkg/config/profile_v3.go`, `profile_v3_validate.go`, `profile_v3_store_test.go`, `internal/app/widget_design_service_test.go`.

### 1B. Selección en Studio
- [x] Prueba de seleccionar Functional y aplicar Broadcast desde un Standings normal.
- [x] Selector basado en sistemas compatibles del registro existente, con etiquetas actuales conservadas.
- [x] Verificar selección/diseños y contenido sin reset, tamaños mínimo/completo y módulos del inspector normal en tests y harness. La aplicación física se verifica en 1C.
Archivos: `DesignSection.tsx` y test; `standings-frame-layout.ts` reutiliza la normalización previa de Redline y añade mínimos Functional compartidos con Studio/Runtime/Workshop. Preview DOM imperativa y resize respetan esos mínimos, con regresiones. El aviso stale sin cabecera ocupa las etiquetas y no desplaza las filas. No introduce estado React transitorio ni cambia los documentos al renderizar.

### 1C. Acabado y cierre
- [x] Consolidar Broadcast desde el acabado aceptado, sin marcas rojas de fila; conservar Signature.
- [x] Tests frontend y Go, build/typecheck, lint, revisión independiente del diff. Guard visual con tres detecciones heredadas, reproducidas en la base; sin fallos nuevos.
- [ ] Studio real: aplicar, guardar y reabrir; Desktop/OBS: geometría y estados. Distinguir harness de Wails/LMU.
- [ ] Documentación/roadmap, commit, PR y CI; corregir los fallos propios.
- [ ] Integración a Nightly bajo la autorización de Isaac, trazada en #1098; registrar SHA remoto. Sin testers/master ni release.

No migrar los perfiles existentes al nuevo diseño ni introducir marcas comerciales obligatorias antes de la parte 2. Revertir esta entrega conserva los diseños previos; los perfiles que elijan Functional requieren la versión que lo admite.

## Parte 2 — Política unificada, ISA-1097

Depende de completar la parte 1. Rama y worktree propios desde su base integrada.

### 2A. Contrato de permisos y marca
- [ ] Matriz explícita por tipo/sistema, a partir de la licencia verificada existente. Original conserva su política; Functional/Crystal permiten marca obligatoria en Free y opcional en pago.
- [ ] Resolver con Isaac la discrepancia de Delta; pregunta enviada, no cambiar ese derecho mientras esté pendiente.
- [ ] Una decisión común de acceso/marca, calculada fuera de los renderizadores. Sin nuevas dependencias ni remodelación de Billing.

### 2B. Recorrido completo
- [ ] Catálogo, inspector, guardado/importación y ejecución Desktop/OBS respetan esa política; ocultar cabecera no quita marca obligatoria.
- [ ] Cambio de licencia actualiza superficies activas. Downgrade conserva el perfil e inactiva premium; permite retirar widgets bloqueados.
- [ ] Preferencia de mostrar marca solo tiene efecto si la licencia permite ocultarla. El renderer recibe presentación pura.

### 2C. Cierre
- [ ] Free/pago/transiciones/offline/expiración, importación con marca oculta, varios widgets, cabecera oculta y eliminación del bloqueado.
- [ ] Verificación de autoridad Go y paridad de superficies; pruebas completas aplicables, revisión, PR/CI y evidencia física por separado.
- [ ] Handoff y roadmap describen lo implementado; integración autorizada distinta de publicación.

Cada corte se verifica antes del siguiente. Las decisiones de licencia no se mezclan con el commit visual. La revisión independiente no modifica la rama de implementación. Todo bloqueo real se acota a la parte afectada.
