# ADR 0007: Linear como proyección operativa del Testing Center

> **Deprecado.** Linear fue retirado el 2026-08-20; los issues viven en GitHub Issues de este repositorio. Documento conservado como historico.

- Estado: aceptado para contratos locales; integraciones remotas apagadas.
- Fecha: 2026-08-03.
- Issue: ISA-238 / TAU-07D.

## Contexto

Supabase ya conserva el estado canónico de reportes, candidatos, votos,
deduplicación, pausas y efectos. El prototipo anterior reservaba un efecto
inerte `github_issue_create`, pero mantener GitHub Issues y Linear activos
crearía dos bandejas, dos identidades y resultados ambiguos. Los testers deben
trabajar únicamente desde Vantare; GitHub debe quedar limitado a código, PR y
CI.

Los spikes ISA-237 demostraron que una tarea Codex Cloud puede partir de una
ref exacta, pero no que pueda continuar de forma fiable una rama ya integrada:
la rama interna aparece como `work` y la PR resultante no conservó el head/base
esperado. La identidad segura es el SHA verificado, no el nombre mostrado dentro
del contenedor.

## Decisión

1. Supabase es la autoridad canónica y Linear la única proyección operativa
   externa. No habrá dual-write ni fallback a GitHub Issues.
2. Testers reportan y validan solo en Testing Center. No reciben acceso ni
   credenciales de Linear.
3. GitHub aloja ramas, commits, checks y PR; sus comentarios o eventos no
   autorizan Codex ni promociones.
4. Cada corrección rechazada crea una sub-issue y una rama nueva determinista
   desde el SHA actual de `nightly`. `same_branch` queda retirado; datos legacy,
   si aparecen, son solo lectura y requieren owner.
5. Una aprobación funcional no promueve. Un `primary_tester` basta para aprobar
   Nightly y testers autorizados votan en Testers, pero Isaac debe autorizar
   cada paso `nightly -> testers -> master`.
6. Rechazo, comentario, webhook, timeout o salida ambigua nunca reintentan ni
   redelegan. Pasan a `needs_owner`.
7. El dossier para Codex es cerrado, determinista, versionado y digestado. El
   texto libre se trata como evidencia no confiable. Isaac selecciona de forma
   humana repositorio/ref y revisa la PR.

## Actor y credencial de Linear

La integración futura usará una aplicación OAuth de Linear dedicada y un actor
de aplicación, no la cuenta de un tester ni una API key personal de producción.
La credencial vive exclusivamente en el gestor de secretos del backend. El
cliente de Vantare, Supabase tables, logs, Linear, Discord y el dossier nunca la
reciben. La activación, rotación y revocación son gates humanos.

Referencias oficiales para el corte de integración: [OAuth 2.0 de
Linear](https://linear.app/developers/oauth-2-0-authentication), [webhooks de
Linear](https://linear.app/developers/webhooks) y [límites de
uso](https://linear.app/developers/rate-limiting). TAU-07E/F deberá volver a
verificarlas antes de implementar porque son políticas externas modificables.

## Retirada segura de `github_issue_create`

TAU-07D no modifica schema ni filas. TAU-07E deberá realizar una transición
aditiva y auditable:

1. pausar efectos externos;
2. impedir nuevas reservas GitHub;
3. reconciliar o expirar claims existentes;
4. conservar completados legacy como evidencia inmutable;
5. marcar pendientes/fallidos como superseded, sin mutarlos a Linear;
6. crear un efecto nuevo `linear_issue_create:<technical_issue_id>`;
7. imponer un único destino externo activo por issue;
8. demostrar dry-run y reconciliación antes de habilitar red.

No se permite dual-write, renombrar el efecto existente ni usar GitHub como
fallback si Linear falla.

Los estados visibles en Linear son una proyección gruesa y reversible. Un
webhook firmado, comentario, cambio de assignee o mención nunca crea una rama,
elige un SHA, delega Codex, acepta un candidato ni promueve una build.

## Retención y privacidad

Son gates para cortes futuros, no afirmaciones de configuración actual:

| Dato | Política máxima propuesta |
| --- | --- |
| borrador local | hasta enviar/descartar; purga por inactividad |
| diagnóstico y logs en Supabase | 30 días |
| reporte y ocurrencias | issue abierta más ventana de cierre aprobada |
| dossier completo | cierre más 30 días; después solo digest/auditoría |
| votos y auditoría | 24 meses |
| PostHog replay | 7 días; apagado si el TTL no puede garantizarse |
| errores PostHog | 30 días |
| Linear sanitizado | hasta cierre y purga/archivo definidos |

Discord nunca contiene datos sensibles, por lo que su seguridad no depende de
una política de borrado. La retención real de Codex Cloud debe documentarse
antes del piloto. Si un proveedor no permite aplicar el TTL requerido, esa
captura permanece deshabilitada.

## Consecuencias

- Menos automatización inicial, pero una sola cola operativa y gates humanos
  inequívocos.
- Cada rechazo genera una rama y PR nuevas, aumentando trazabilidad y evitando
  reescrituras o continuación sobre una base ambigua.
- TAU-07E puede implementar Linear de forma aditiva sin activar red ni tocar el
  historial GitHub legacy.
- Ningún webhook o sistema externo se convierte en autoridad de producto.
