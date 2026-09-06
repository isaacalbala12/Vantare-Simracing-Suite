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
