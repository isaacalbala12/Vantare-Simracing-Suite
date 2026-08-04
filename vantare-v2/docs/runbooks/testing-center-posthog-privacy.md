# Testing Center — frontera de privacidad PostHog

Estado: contrato local validado en ISA-253 / TAU-07H1. No hay SDK, proyecto
PostHog, endpoint, secreto, captura de red ni session replay activados.

## Objetivo y autoridad

Este corte permite preparar evidencia técnica sin convertir PostHog en una
autoridad del workflow. Supabase conserva el consentimiento y la proyección
allowlisted; PostHog será, en un corte posterior, un almacén best-effort de
errores y replay. Linear sólo podrá recibir un enlace restringido después de
una autorización explícita del owner.

Una captura, una URL o una caída de PostHog nunca:

- impide enviar el reporte;
- asigna o reintenta Codex;
- crea ramas, commits o PR;
- aprueba una candidata; ni
- despliega, hace merge o promociona canales.

## Datos permitidos

`testing-center.posthog-evidence.v1` es una proyección cerrada. Sólo admite:

- `reportId` y `correlationId` opacos;
- canal `nightly` o `testers`;
- versión, SHA exacto y Windows 10/11 verificados server-side;
- módulo allowlisted;
- origen, código y nombre de error de catálogos cerrados;
- disponibilidad de replay, session ID y URL restringida; y
- flags explícitos de ausencia de mensaje, stack, logs, perfil y autoridad.

No admite título, descripción, texto libre, mensaje o stack de excepción,
console logs, body, headers, email, rutas locales, token, account/person ID,
perfil ni propiedades arbitrarias. Un campo adicional invalida todo el
contrato. El servidor vuelve a ligar reporte, canal, versión, SHA, SO y módulo
con sus fuentes canónicas; no confía en lo declarado por el cliente.

## Consentimiento y replay

El consentimiento de diagnóstico y el de replay son decisiones separadas,
append-only e idempotentes. Sólo el autor autenticado del reporte puede
cambiarlas. El diagnóstico debe haber sido mostrado en el preview del reporte
antes de consentirlo.

Reglas:

1. Sin consentimiento de diagnóstico no se crea evidencia PostHog.
2. Replay exige diagnóstico y un consentimiento adicional.
3. Revocar replay borra session ID, URL privada y autorización para Linear.
4. Revocar diagnóstico borra toda la evidencia local de ese reporte.
5. `master`, metadata desconocida o contexto que no coincide fallan cerrados.

La política preparada para el futuro SDK inicia recording deshabilitado, usa
persistencia en memoria y desactiva autocapture, pageviews, pageleave,
excepciones automáticas, performance, console logs, identificación, surveys y
dependencias externas. Replay enmascara todos los inputs y todo el texto; no
captura headers, bodies, canvas ni iframes cross-origin. Las superficies
sensibles deberán marcarse además con `ph-no-capture` antes del wiring real.

## Retención, acceso y borrado

- Metadata de error local: 30 días.
- Material de replay local: 7 días.
- Historial local de consentimiento: 30 días; sólo se elimina cuando ya no
  queda evidencia del reporte, y la ausencia posterior vuelve a fallar cerrada.
- Tablas privadas con RLS forzada; testers no pueden enumerarlas.
- Sólo `service_role` registra evidencia, autoriza enlaces y ejecuta expiry.
- Sólo un owner activo puede autorizar que el enlace restringido se proyecte a
  Linear. Autorizar no realiza la llamada a Linear.
- El worker de expiry limpia replay, elimina metadata vencida y sólo entonces
  elimina consentimientos vencidos sin evidencia asociada.

Estas TTL son la política Vantare y ya están verificadas localmente. Antes de
activar PostHog remoto hay que configurar y demostrar una retención compatible
en el proyecto real. La documentación oficial advierte que los cambios de
retención sólo afectan grabaciones nuevas y que el borrado remoto no es
inmediato. Si no puede demostrarse la TTL de siete días y un procedimiento de
borrado aceptable, session replay permanece apagado.

Referencias oficiales:

- [Configuración del SDK JavaScript](https://posthog.com/docs/libraries/js/config)
- [Privacidad de Session Replay](https://posthog.com/docs/session-replay/privacy)
- [Retención de Session Replay](https://posthog.com/docs/session-replay/recording-retention)

## Operación local

Prueba TypeScript focal:

```powershell
deno fmt --check supabase/functions/_shared/testing-center-posthog-privacy.ts supabase/functions/_shared/testing-center-posthog-privacy.test.ts
deno test supabase/functions/_shared/testing-center-posthog-privacy.test.ts
```

Prueba SQL aislada; usa un único PostgreSQL desechable y siempre lo elimina:

```powershell
./supabase/tests/run-testing-center-posthog-privacy-postgres.ps1
```

El rollback requiere pausa global y cero historial de consentimiento o
evidencia. Si existe historial, falla con
`testing_center_posthog_rollback_has_history`; no se borra automáticamente.

## Gates antes de conectar PostHog

Todos son obligatorios:

- aprobación explícita para añadir/pinnear el SDK;
- proyecto y región revisados, sin secretos en frontend;
- init imposible antes del consentimiento y `opt_out_capturing` comprobado;
- surfaces `ph-no-capture` auditadas en Wails real;
- masking, URL/query redaction y ausencia de console logs comprobados mediante
  una grabación sintética;
- retención y borrado remoto demostrados;
- caída/503 de PostHog no bloquea el formulario;
- URL sólo recuperable por backend autorizado y nunca incluida en Discord;
- piloto Nightly antes de Testers; y
- revisión humana antes de merge, deploy o promoción.

El spike ISA-206/TAU-01 sigue siendo una referencia no integrada. No se
cherry-pickea porque parte de una base histórica y su configuración del SDK
puede estar obsoleta. El wiring debe implementarse contra este contrato en un
microcorte posterior.
