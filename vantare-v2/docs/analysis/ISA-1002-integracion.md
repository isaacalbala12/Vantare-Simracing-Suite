# ISA-1002 — integración del candidato de rendimiento

Base nightly: `c18f2e6e92c587bd21eaabf2e0b7a753837af1a4`.
Fuente preservada: `8bff8d93` en ISA-996; no se altera su árbol medido.
Isaac autoriza merge sólo a nightly; no release ni testers/master.

## Reconciliación

Se incorpora el delta útil de 997/998/999 y E20, no se repite la retirada V1
ya integrada en #1001. Se preservan los renderers, semántica y feedback de
nightly. La caché limitada del mapa ISA-979 prevalece sobre la segunda caché
precalculada del candidato; no se duplican. Tokens Endurance permanecen los
de nightly. El shadow Go retirado por 998 y sus tests obsoletos no se restauran.

E20 sigue opt-in (`VANTARE_OVERLAY_SECTIONS=1`); cero restaura envío completo.
`VANTARE_OVERLAY_SOCKET_PULL=0` selecciona HTTP. GC respeta GOGC explícito.
No se reabren decisiones de arquitectura ni se cambian contratos del simulador.

## Evidencia y límites

El banco N3 visible del candidato está en `telemetria-v2-e20-cierre-996.md`.
No es una medición del árbol reconciliado. Los gates de integración se
registran en la PR sobre su SHA exacta, sin reutilizar los checks antiguos.
No se declara revisión independiente: integración y revisión personal sin
subagentes por instrucción de Isaac. La aceptación visual se hará en nightly.

## Rollback

Revertir el squash de esta PR mediante otra PR a nightly, conservando commits
posteriores. Nunca reset/force push del canal. No activar E20 es el rollback
de configuración más pequeño; no restituye las demás optimizaciones.

## Gates locales de integración

- Build frontend y typecheck por `tsc -b`: PASS.
- `go test ./...`: PASS (`C:/tmp/isa1002-go-test.log`).
- Lint global: PASS (`C:/tmp/isa1002-lint.log`).
- Frontend completo:415 archivos/3227 tests PASS con `vitest run --maxWorkers=2`
  (`C:/tmp/isa1002-frontend-final.log`). Primer intento:4 fallos, un texto del
  roadmap corregido y3 timeouts con ejecución concurrente. Sin relajar tests.
- Banco:26/26 tests PASS. No nueva sesión LMU ni nueva cifra de rendimiento.
- Diff revisado personalmente: entrega/base/ACK, revocación/origen del socket,
  ownership, publicación/frescura, borradores del Hub y conservación de fixes.
  No cambios en dependencias, workflows, persistencia o diseños de nightly.
- Diff-check productivo/documental PASS; los TXT crudos preservan espacios
  originales del nombre CPU. No se retocan muestras ni sus manifests.
- Estado remoto y SHA de merge: PR#1003. Sólo integrar tras CI verde en su HEAD.
