# Testing Center — UI, preview y retry v1

Estado: TAU-04C / ISA-220 y TAU-07H2 / ISA-242 implementados en ramas de issue.
No hay merge, promoción, build distribuida, deploy Edge, migración remota,
PostHog real, Linear real, Codex o Discord.

## Acceso y autoridad

La pestaña aparece solo cuando coinciden dos señales independientes: el canal
real embebido en la build (`nightly` o `testers`) y la capability firmada de
ese mismo canal. Tener ambas capabilities no convierte una build `testers` en
`nightly`; `master`, valores desconocidos y metadata ausente fallan cerrados.
La RPC de TAU-04A vuelve a derivar usuario, membresía y rol en servidor. Un
cliente no puede elevarse cambiando estado React ni el payload.

CI inyecta `VANTARE_BUILD_CHANNEL` mediante `-X main.buildChannel=...`. Las
builds etiquetadas públicas y el valor local por defecto usan `master`. Para
probar el canal en desarrollo hay que compilar explícitamente con
`VANTARE_BUILD_CHANNEL=nightly` o `testers`; no existe override en runtime.

## Flujo del reporte

1. Al abrir, se recuperan únicamente los cinco campos permitidos por TAU-04B.
2. Acción, resultado esperado y observado requieren entre 3 y 2.048 bytes;
   contexto admite 4.096 bytes y el módulo usa una enumeración cerrada.
3. Los cambios se guardan en orden. Un save anterior nunca puede sobrescribir
   en disco a uno posterior y la clave idempotente nace siempre en Go.
4. Diagnóstico y logs son opt-ins separados, no se guardan y arrancan apagados.
5. Si se autoriza diagnóstico, Go prepara un paquete efímero de TAU-03 usando
   el canal de la build, nunca uno elegido por frontend. La UI muestra el JSON
   completo y vuelve a calcular SHA-256 antes de aceptarlo.
6. El envío guarda primero el estado final, llama la RPC con la misma clave y
   conserva todo ante error/offline. Solo tras respuesta válida se intenta
   borrar el draft.
7. El identificador `report_<sha256>` queda visible y copiable. Si el borrado
   local falla, se muestra una advertencia y no se oculta el estado.

## Privacidad y limitaciones honestas

- El texto libre puede contener PII introducida por el tester; la UI lo avisa.
- El paquete diagnóstico no persiste en backend Go ni en el draft local.
- Esta versión no dispone de un collector productivo de logs. El control sigue
  visible para mantener el contrato de consentimiento, muestra cero disponibles
  y permanece deshabilitado. No se crean logs sintéticos.
- El envío real necesita la migración TAU-04A aplicada y una sesión Supabase con
  membresía Testing Center. Este corte no despliega ni muta entornos remotos.
- Session replay también aparece deshabilitado y se explica como no disponible:
  TAU-07H1 preparó su frontera de privacidad, pero no existe SDK ni captura real.

## Validación de correcciones

- La segunda vista lista como máximo 20 candidatas del canal real de la build.
  Solo muestra versión, SHA abreviado, módulo y texto saneado del reporte.
- El frontend envía únicamente candidata, SHA, decisión y, al rechazar, cuatro
  campos estructurados más impacto y consentimiento diagnóstico. Nunca envía
  actor, rol, autor, rama, estado o disposición owner.
- `testing-center-feedback` autentica la sesión, deriva membresía y candidata en
  servidor, impide auto-validación y valida el SHA actual antes de llamar al RPC
  service-role endurecido de TAU-07G.
- Nightly exige `primary_tester` u `owner`; Testers admite también `tester`.
  `No puedo verificar` registra evidencia neutral. Un rechazo incompleto se
  conserva en pantalla y no produce efecto.
- No existen controles de merge, promoción, redelegación o disposición owner en
  esta UI. Un rechazo queda `needs_owner` para decisión humana.

## Verificación

Desde `vantare-v2`:

```powershell
go test ./internal/app -run 'TestTestingCenter' -count=20
go test ./internal/testingcenter/diagnostic ./internal/testingcenter/reportdraft ./internal/app
go vet ./internal/testingcenter/diagnostic ./internal/testingcenter/reportdraft ./internal/app ./cmd/vantare
pnpm --dir frontend test -- src/hub/testing-center src/hub/navigation.test.ts src/hub/components/Topbar.test.tsx src/hub/components/V52Shell.test.tsx src/hub/HubApp.test.tsx
pnpm --dir frontend build
pnpm --dir frontend visual:testing-center
deno check --no-lock ../supabase/functions/testing-center-feedback/index.ts ../supabase/functions/testing-center-feedback/index.test.ts
deno test --no-check --no-lock ../supabase/functions/testing-center-feedback/index.test.ts
```

El harness visual valida 390, 768, 1.024 y 1.440 px, ambas vistas, cero overflow,
opt-ins apagados, replay/logs no disponibles, igualdad exacta preview/transporte,
clave estable, borrado tras éxito y consola limpia.

## Rollback

Revertir el commit de ISA-220 retira pestaña, cliente, bridge diagnóstico y
harness. Las tablas/RPC de TAU-04A, el draft de TAU-04B y el paquete puro de
TAU-03 permanecen intactos. No hay datos remotos creados por este corte.
