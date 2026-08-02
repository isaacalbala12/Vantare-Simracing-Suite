# Testing Center — triage y outbox v1

Estado: TAU-05A / ISA-222 implementado en rama de issue. No hay llamada de red,
GitHub App, webhook, Codex, Discord, deploy ni migración remota.

## Frontera del corte

La migración `20260802160000_testing_center_triage_outbox.sql` añade tres tablas
privadas y una función exclusiva de `service_role`:

- `testing_center_triage_results`: decisión inmutable por reporte;
- `testing_center_issue_occurrences`: relación de todos los reportes con su
  issue técnica interna;
- `testing_center_effect_outbox`: una reserva durable
  `github_issue_create` por issue técnica;
- `testing_center_triage_report(report_id)`: valida completitud server-side,
  calcula fingerprints, vincula duplicados y reserva el efecto atómicamente.

Las tres tablas fuerzan RLS, no tienen policies ni grants para `anon` o
`authenticated`. El cliente no puede ejecutar triage, elegir issue, asignar a
Codex ni construir un body de GitHub.

## Completitud

Solo entra en triage un reporte `submitted`. Deben existir su payload validado
por TAU-04A y su evento durable de envío. Si falta cualquiera de esas piezas,
el reporte queda `incomplete`, recibe una decisión visible y no crea issue ni
reserva externa. Un draft o un identificador desconocido fallan cerrados.

La RPC de TAU-04A ya exige acción, resultado esperado, resultado observado,
versión, Windows, versión del SO y módulo. TAU-05A no vuelve opcionales esos
campos ni descarta silenciosamente el reporte.

## Fingerprints y deduplicación

- El fingerprint funcional usa acción normalizada, módulo y familia
  major/minor de versión.
- Un digest de compatibilidad separado exige coincidencia exacta del resultado
  esperado y observado tras normalizar únicamente mayúsculas y espacios.
- Si hay diagnóstico consentido, el fingerprint técnico usa canal, módulo,
  `errorCode` y el conjunto ordenado de pares `source:code` de logs
  `warn`/`error`. No incorpora mensajes libres. Códigos centinela genéricos
  como el actual `tester.report`, `unknown` o `none` no generan fingerprint
  técnico y nunca pueden unir dos reportes.
- Una coincidencia técnica exacta tiene prioridad. Sin ella, solo se vincula si
  coinciden a la vez fingerprint funcional y digest de compatibilidad.
- Solo se buscan issues internas activas. Una issue cerrada no se reabre
  silenciosamente.

La similitud textual, embeddings o heurísticas no fusionan reportes. El texto
del tester sigue siendo evidencia no confiable y no se convierte en
instrucciones.

## Exactly-once real de este corte

TAU-05A garantiza una única **reserva durable** de creación por issue técnica,
incluso ante concurrencia. Advisory locks por reporte y fingerprints, junto con
constraints únicas, serializan carreras compatibles. Cien reportes repetidos
producen una issue técnica interna, cien ocurrencias visibles y una reserva.

Esto todavía no afirma exactly-once sobre GitHub: no existe ninguna llamada
externa. TAU-05B debe proyectar un body seguro en dry-run y TAU-05C debe añadir
claim, marcador idempotente, GitHub App mínimo, webhook firmado y
reconciliación antes de activar un side effect real.

La pausa global se comprueba antes del triage. Una pausa por flujo bloquea una
nueva ocurrencia compatible antes de persistirla. Al fallar, el reporte queda
intacto y reintentable.

## Verificación local obligatoria

Desde la raíz Git, con Docker disponible:

```powershell
& .\supabase\tests\run-testing-center-triage-postgres.ps1
```

El runner usa un PostgreSQL Supabase desechable. Ejecuta core 72, access 56,
report 55 y triage 40; revierte TAU-05A, confirma el contrato TAU-04A, reaplica
el corte, prueba cien repeticiones y lanza dos transacciones concurrentes con el
mismo fingerprint. La salida válida termina en
`concurrent one-reservation PASS`.

No ejecutar contra una instancia compartida ni usar `supabase db reset`.

## Rollback

`supabase/rollbacks/20260802160000_testing_center_triage_outbox.down.sql`
revoca y elimina la función y las tres tablas de TAU-05A. Conserva reportes,
payloads, membresías y el resto del Testing Center. El rollback elimina
decisiones y reservas ya creadas; fuera del runner desechable exige decisión
humana y reconciliación previa.
