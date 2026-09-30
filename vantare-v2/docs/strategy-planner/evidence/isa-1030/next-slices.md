# ISA-1030 — Siguientes cortes propuestos

No implementados ni autorizados por la mera creación de estos microplanes.
Cada corte parte de issue/base verificadas y usa worktree propio. El contrato de
#1028 mantiene Analysis como autoridad de lectura/derivación y Strategy como
consumidor. No incorporar cambios oportunistas de solver o UI en fiabilidad.

## 1. Recuperación de fuentes — reutilizar #819

Primer corte: store autorizado recuperable; dejar el estado cold-start y la UI
para un segundo corte de la misma issue. Archivos previstos: `authorized_store.go`
y `authorized_store_test.go` en `internal/telemetryanalysis`, más el patrón de
repositorio de Strategy solo para lectura. Hasta cuatro archivos de lógica/test.

1. Reproducir truncado/invalidez del primary con backup válido y ambos corruptos.
2. Reusar política existente de escritura atómica/backup si permite preservar
   identidad y autorización; nunca reconstruir autorización a partir de un scan.
3. Recuperar solo copia verificada, preservar corrupto y devolver causa tipada
   si no hay recuperación. No equiparar corrupción con biblioteca vacía.
4. Tests de reapertura, caída entre pasos y ausencia de pérdida silenciosa.
5. Ejecutar `go test ./internal/telemetryanalysis -count=1` y `go test ./...`.

Después, corte separado para transportar estado hasta Strategy y verificar el
mensaje real en Wails. El primer corte no cierra toda #819.

## 2. Cancelación real — reutilizar #821

Archivos previstos: `internal/strategy/coldstart/service.go`, `service_test.go`,
`lmu_importer.go`, `lmu_importer_test.go`; máximo un archivo adicional del bridge
si la cancelación no viaja por el contrato actual, justificándolo antes de editar.

1. Test con importador bloqueado que responde al contexto, sin `time.Sleep`.
2. Definir deadline por candidato y cancelación de operación; derivarlos del
   contexto padre, propagar al reader y recoger terminación del helper.
3. Probar que devuelve timeout/cancelación tipada, libera el servicio y admite
   reintento; no duplicar workers ni publicar éxito después de cancelar.
4. Ejecutar `go test ./internal/strategy/coldstart -count=1` y `go test ./...`.
5. Corte UI separado en `strategy-cold-start.ts` y su test para reflejar estado
   real del servidor. No aumentar el límite frontend como supuesto arreglo.

## 3. Diagnóstico del runtime — reutilizar #803

El empaquetado avanzó hasta #1012; auditar la versión instalada antes de reabrir
ese trabajo. Queda causa visible cuando no coincide/falta el reader. Preparar
test de composition root y contrato de status; límite inicial cinco archivos.
No aceptar un manifest distinto, descargar runtime o copiar archivos a la
instalación como fallback silencioso. El runtime del banco no cambia la app.

## 4. Contrato de correcciones — #1033

Corte documental con ADR y ejemplos, después microplan de implementación. Definir
fuente/revisión, scope, motivo, deshacer, conflicto y selección por familia sin
mezclar corrección con override de plan. Depende de #1028 y de semántica de #1030;
no depende de haber validado numéricamente toda la estrategia para escribirlo.

## 5. Criterios empíricos — permanece en #1030

Resolver relojes y señales en preparación; adjudicar incidentes/invalidación,
medir contaminación/descarte y proponer umbrales. Reservar carreras completas
nuevas. No abrir otra issue duplicada para esconder el gate que sigue pendiente.

## Dependencias posteriores ya demostradas

Antes de llamar óptimo al resultado, el adapter `orbitSolverInput` debe transportar
reglas de evento, inventario de neumáticos y perfiles de piloto que SolveV2 ya
admite. También falta contrato de resultados parciales. Son cortes posteriores
del maestro (#694/#1028), separados de F1/F2; no requieren rehacer el solver.
Después: asistente y pantalla editable, revisiones reproducibles, aceptación real.
Live e investigación OSS/Monte Carlo continúan aplazados.
