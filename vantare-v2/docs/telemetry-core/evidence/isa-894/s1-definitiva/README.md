# Paquete auditable S1 definitiva

Contenido publicado:

- `on/`: S1 ON de 20 minutos, cinco checkpoints.
- `off/`: S1 OFF de 20 minutos, cinco checkpoints.
- `cdp-isolation-off/`: diagnóstico OFF de 10 minutos sin polling periódico,
  tres checkpoints.
- `SHA256SUMS`: hashes de todos los ficheros del paquete.
- `recalcular.mjs`: recalcula paridad, V1 OFF, delivery y la reducción
  post-warm-up a partir de las crudas publicadas.

Cada fase contiene `sesion.json`, `procesos.csv`, `resumen.json` regenerado y
los JSON de `checkpoints/`. No se publican logs, perfiles de usuario,
screenshots ni configuración de licencia.

## Custodia y sanitización

SHA-256 de los `sesion.json` originales antes de sanitizar:

- ON: `b01206dbe788443239a983346e223d9f97ac7e5fb2de56d0e976e255c9b8a3be`.
- OFF: `3f60ef7d53e24c66c0a77b642e9e6adff2c99b4b8acd82ad56fb17e1a1ec1131`.
- Aislamiento CDP OFF:
  `1f153e3f1368f016181a64f3de34c3b0541189a27e7b649fad5491e7aa2fdd7c`.

La sanitización es limitada y reproducible: solo sustituye prefijos absolutos
de las dos worktrees y del perfil Windows por `<measurement-worktree>`,
`<collector-worktree>`, `<session-root>` y `<user-profile>`. No cambia
timestamps, PID, contadores, muestras, diagnósticos, hashes de exe/dist ni
valores de telemetría. Los CSV se publican byte a byte sin modificación.

## Verificación

Desde `vantare-v2`:

```powershell
node docs/telemetry-core/evidence/isa-894/s1-definitiva/recalcular.mjs

$root = 'docs/telemetry-core/evidence/isa-894/s1-definitiva'
Get-Content "$root/SHA256SUMS" | ForEach-Object {
  if ($_ -notmatch '^([0-9a-f]{64})  (.+)$') { throw "línea inválida: $_" }
  $actual = (Get-FileHash (Join-Path $root $Matches[2]) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Matches[1]) { throw "hash distinto: $($Matches[2])" }
}
```

El parser devuelve veredicto global `fail` porque memoria falla; eso es
esperado. Los criterios recalculados deben conservar ON 6.074/0, OFF sin V1 y
shadow nulo, p99 67,6/49,1 ms y reducción renderer post-warm-up del 75,0 %.
