# Driver LMU: adquisición REST local

Estado: implementado en ISA-33 / TC-03D, pendiente de validación manual y sin wiring productivo.

## Alcance

El mismo `internal/telemetry/drivers/lmu.Driver` que posee `LMU_Data` posee ahora el canal REST local. Shared Memory y REST emiten observaciones separadas (`SourceSharedMemory` y `SourceREST`); este corte no decide autoridad, no fusiona campos y no sustituye listas o sesiones. La matriz de autoridad y la fusión pertenecen a ISA-34.

No se modifican Engineer, Overlay, Strategy, Wails, SSE ni el composition root. Tampoco se incorpora mock productivo o dependencia externa.

## Contrato operativo

- Base local por defecto: `http://127.0.0.1:6397`.
- Endpoints observados: `/rest/watch/standings` y `/rest/watch/sessionInfo`.
- Poll normal: 250 ms.
- Deadline independiente por request: 750 ms.
- TTL de cache: 2 s.
- Backoff exponencial acotado: máximo 2 s; se restablece después de un ciclo completo.
- Una única goroutine interna pertenece al `Run` del driver. Comparte su contexto, no publica después de cancelación y el driver espera su fin antes de retornar.
- El transporte HTTP es propiedad del driver, solo acepta destinos HTTP loopback, rechaza redirects antes de seguirlos y cierra conexiones idle durante teardown.

Cada endpoint conserva la hora real de intento, `LastSuccessUTC` de recepción y estado propio. Cada campo conserva la recepción real en `UpdatedUTC` y calidad `fresh`, `stale`, `missing` o `invalid`. La hora final del snapshot se captura después de ambos requests y gobierna TTL/freshness. Un fallo de un endpoint no borra un éxito independiente del otro.

`sessionInfo` se acepta de forma transaccional: primero valida todo el payload temporal y construye campos provisionales; solo entonces confirma campos y `LastSuccessUTC`. Un `CurrentEventTime` negativo, NaN, infinito o fuera de rango preserva íntegro el último cache válido. El tiempo de evento aceptado se emite como `SourceTime` observado. Su conversión separa segundos enteros y nanosegundos fraccionarios, valida el resto disponible de `time.Duration` y rechaza de forma conservadora valores ambiguos en el límite superior.

## Estados honestos

| Situación REST | Estado de canal | Efecto con Shared Memory live |
|---|---|---|
| Ambos endpoints válidos | `live` | driver `live`, capabilities `shared-memory` + `rest` |
| Solo una respuesta válida o respuesta malformada/vacía parcial | `partial` | driver `degraded`; cache independiente |
| Ambos endpoints 404/405/501 | `unsupported` | driver `degraded`; capability REST no se anuncia como disponible |
| Conexión rechazada o HTTP 5xx | `offline` | driver `degraded`; Shared Memory continúa |
| Deadline agotado | `timeout` | driver `degraded`; request cancelada |
| Último éxito supera 2 s | `stale` | driver `degraded`; valores preservados como `stale`, nunca `fresh` |

Un cuerpo vacío es diferente de JSON malformado. Valores fuera de rango quedan `invalid`; ausencia legítima conserva `missing`. No se convierte ausencia en cero.

## Privacidad

El decoder solo materializa campos neutrales necesarios para las observaciones. Nombres de piloto/equipo y el payload raw no salen del paquete, no se persisten y no se registran en diagnósticos. Los tests usan un servidor HTTP local determinista con aliases sintéticos.

## Verificación manual segura

La verificación reproducible no necesita arrancar ni cerrar LMU:

```powershell
go test ./internal/telemetry/drivers/lmu -run 'TestREST|TestDriverOwnsREST|TestDriverPublishesBoth' -count=20
go test ./internal/telemetry/... -count=1
```

Comprobar que pasan los casos de respuesta completa, parcial, vacía, unsupported, offline, timeout, stale, backoff y cancelación. `TestDriverOwnsRESTPollerAndWaitsForItsCancellation` demuestra que `Run` no retorna hasta que la request y el poller propios han terminado.

La prueba real read-only con LMU se reserva al gate humano: debe observar únicamente estado/capabilities y campos neutrales, sin guardar bodies REST ni nombres. No requiere cerrar LMU de forma forzada ni ejecutar acciones del pit menu.

## Rollback

Revertir el commit funcional de ISA-33. No existen migraciones, persistencia, configuración de usuario ni wiring productivo que revertir.
