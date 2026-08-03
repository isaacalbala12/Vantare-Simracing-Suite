# Testing Center: contratos Linear, rechazo y dossier Codex

Estado: contrato local de ISA-238. Sin red, credenciales, schema remoto, UI,
dispatch Codex, merge, deploy o promoción.

## Autoridad

```text
Vantare (entrada) -> Supabase (canónico) -> Linear (proyección)
                                           |
                                           `-> decisión humana -> Codex Cloud
GitHub = ramas, PR y CI; Discord = aviso anónimo; PostHog = evidencia privada
```

- Linear es el único tracker externo. GitHub Issues no es fallback.
- Identidad, rol, SHA, estado, labels y destinos se derivan server-side.
- Testers no acceden a Linear y ningún texto aportado por ellos controla
  assignee, priority, delegate, rama, base, comandos o promoción.
- Webhooks y comentarios solo reconcilian estado; nunca autorizan ejecución.

## Contratos

### `testing-center.linear-issue.v1`

Proyección cerrada, sanitizada y digestada de una issue técnica. El servidor
posee team, project, status, labels y marker. El contenido libre aparece solo
en bloques marcados como no confiables, con límites por bytes y redacción de
secretos, PII, rutas, URLs y menciones.

### `testing-center.rejection.v1`

Liga issue, candidato, canal, versión y SHA exactos. Las decisiones son
`accepted`, `rejected` y `cannot_verify`. Solo `rejected` admite detalles y
exige categoría cerrada, descripción, pasos, esperado, observado, frecuencia,
impacto bloqueante y consentimiento diagnóstico independiente. Nightly acepta
solo `primary_tester` u owner; Testers acepta testers autorizados. No se permite
autovalidación. Replay idéntico es idempotente; contenido distinto con la misma
clave es conflicto. Un SHA nuevo no hereda votos.

`actorId`, rol y autor de candidata se comparan con un contexto verificado
server-side separado del documento. El payload nunca puede autoatribuirse esos
campos. Tras `needs_owner` el agregado no vuelve a `queued`: una corrección crea
sub-issue y agregado nuevos.

### `testing-center.codex-dossier.v1`

Documento determinista sin LLM. Incluye issue original, sub-issue de corrección,
candidato/rechazo exactos, criterios, evidencia sanitizada y una selección
server-owned de repositorio, environment, rama nueva, SHA actual de `nightly` y
base de PR `nightly`. La estrategia única es `sub_issue_new_branch`.

Límites: 32 KiB, cinco paths y tres command IDs. No incluye URL de replay,
secretos, texto como instrucciones, retry, merge, deploy ni promoción. Si falta
un dato obligatorio queda `incomplete`; solo un dossier completo y revisable
puede presentarse a Isaac para selección humana en Codex Cloud.

## Disposiciones del owner

- `create_correction_subissue`
- `environment_issue`
- `create_separate_issue`
- `dismiss_with_reason`
- `stop_rollout`

`same_branch` está retirado. Si existe en datos previos, se muestra como legacy
no ejecutable y requiere decisión manual.

## Matriz de datos

| Sistema | Datos permitidos | Datos prohibidos |
| --- | --- | --- |
| Supabase | documento completo, identidad interna, consentimientos, votos, outbox, dossier y auditoría | credenciales en tablas o logs |
| Linear | resumen sanitizado, versión, SO allowlisted, criterios, estado, marker y enlaces restringidos aprobados | logs crudos, replay embebido, secretos, identidad pública del tester, instrucciones ejecutables |
| PostHog | error técnico allowlisted y replay consentido con masking | tokens, inputs, texto sensible, rutas locales o credenciales |
| Discord | issue recibida, canal/build y estado anónimo | texto libre, identidad, diagnóstico, logs, replay o enlaces privados |
| Codex | dossier fijo, evidencia sanitizada, ref/base/criterios server-owned | secretos, replay URL, texto libre como autoridad o permisos de promoción |

## Estados operativos

Supabase conserva el estado fino. Linear muestra únicamente la proyección
gruesa `linear_created`, `awaiting_owner`, `codex_in_progress`, `pr_in_review`,
`needs_changes` o `stopped`. Una señal externa puede solicitar reconciliación,
pero no cambiar por sí sola el estado canónico. `cannot_verify` conserva el
candidato pendiente. `rejected` bloquea el candidato exacto y conduce a
`needs_owner`. Una sub-issue aceptada produce un candidato nuevo sin votos
heredados.

## Gates de promoción

- Un `primary_tester` puede satisfacer el gate funcional Nightly con un voto.
- Los testers autorizados aportan evidencia funcional en Testers.
- Solo Isaac autoriza `nightly -> testers` y `testers -> master` sobre el SHA
  validado exacto.
- Un rechazo lleva a `needs_owner`; nunca a `queued` ni a un retry automático.
- Una corrección siempre nace como sub-issue/rama nueva desde `nightly` actual y
  vuelve a recorrer Nightly y Testers.

## Gate de activación futura

Antes de red: credencial OAuth de aplicación en secret manager, TTLs aplicados,
efecto GitHub superseded sin dual-write, dry-run convergente, webhook HMAC con
replay protection y corpus adversarial P0/P1/P2=0.
