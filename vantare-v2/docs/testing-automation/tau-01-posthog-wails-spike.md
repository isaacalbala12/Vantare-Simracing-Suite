# TAU-01 — Spike PostHog en Wails con datos sintéticos

Fecha: 2026-08-02
Issue: ISA-206
Base: `nightly@523840972673c2567cef75240ebe5a768f7742fc`

## Objetivo y límites

Este corte valida el SDK web oficial `posthog-js` en un harness aislado que
reproduce el renderer Chromium/WebView2 de la aplicación. No conecta Vantare a
PostHog Cloud, no usa un token real, no captura datos de testers y no se importa
desde `main.tsx` ni desde otro entrypoint productivo.

`posthog-js@1.409.5` se añade únicamente como `devDependency`. Es una dependencia
real porque un mock no permitiría comprobar el consentimiento, el replay, el
enmascarado ni la degradación de red del SDK. La decisión de promoverla a
dependencia productiva queda fuera de TAU-01 y requiere aprobación explícita.

## Harness y controles verificados

El comando `pnpm --dir frontend test:posthog-wails-spike` levanta dos servidores
locales efímeros: Vite y un receptor HTTP que sustituye a PostHog. Playwright usa
un user-agent equivalente a Edge/WebView2 y comprueba:

- el SDK no se inicializa ni realiza peticiones antes del consentimiento;
- el consentimiento habilita eventos explícitos, excepciones y `$snapshot`;
- `maskAllInputs: true` y `maskTextSelector: "*"` ocultan inputs y texto;
- las URLs pierden query y fragment antes de iniciar el SDK;
- `before_send` redacta claves sensibles y conserva versión, SO y renderer;
- las excepciones pierden el mensaje original y conservan solo tipo permitido,
  nombre de archivo y línea/columna de un máximo de veinte frames;
- los identificadores anónimos del SDK y el token público de proyecto se
  conservan para no romper sesiones o ingestión; nunca se derivan de identidad;
- no se capturan bodies ni headers de red en el replay;
- `stopSessionRecording()` detiene nuevos snapshots;
- `opt_out_capturing()` detiene eventos, peticiones y un replay que seguía activo;
- un receptor que responde `503` no bloquea la interfaz;
- seis secretos sintéticos no aparecen en eventos ni en payloads HTTP tras
  decodificar content-encoding, formulario URL-encoded y base64 soportado;
- cuatro fixtures locales ejercitan gzip, deflate, URL-encoded y base64 aunque
  el receptor del SDK anuncie transporte sin compresión para el caso principal.

PostHog filtra navegadores automatizados. El harness desactiva exclusivamente
ese filtro mediante `opt_out_useragent_filter: true`; esta opción no debe copiarse
a configuración productiva. La comprobación sigue siendo útil para el renderer,
pero no sustituye una prueba manual dentro del ejecutable Wails real.

## Matriz de decisión

| Superficie | Decisión | Condiciones y trabajo posterior |
| --- | --- | --- |
| Errores del frontend | GO condicionado | Inicialización diferida, propiedades técnicas allowlistadas y excepción normalizada sin mensaje/stack crudos. |
| Session replay | GO condicionado | Enmascarado máximo, sin body/header/canvas, parada y revocación accesibles; validar el ejecutable Wails antes de activar. |
| Errores del backend Go | NO-GO directo | El SDK web no observa panics, errores ni logs del proceso Go. Hace falta un bridge propio que entregue solo un sobre diagnóstico sanitizado o evaluar un SDK/backend separado. |
| Funcionamiento offline | GO | La captura devuelve el control y la UI sigue respondiendo; la política de cola/reintentos productiva se decidirá en otro corte. |
| PostHog Cloud y datos reales | NO EVALUADO | TAU-01 no usa proyecto, credenciales, retención ni datos reales. |

## Arquitectura recomendada a partir del spike

1. La aplicación arranca sin importar ni inicializar PostHog.
2. Vantare conserva el estado de consentimiento; solo un consentimiento
   explícito y revocable habilita la carga del SDK.
3. Frontend y Go construyen un sobre técnico allowlistado antes de cualquier
   salida de la máquina.
4. El SDK aplica un segundo filtro `before_send` y el replay mantiene máscara
   máxima.
5. Un error de red nunca bloquea la app ni abre por sí mismo un issue.

La petición remota de configuración que el SDK realiza durante `init()` es la
razón práctica para diferir la inicialización completa, no solo para llamar a
`opt_out_capturing()` después.

## Evidencia y limitaciones

- Unit test de privacidad: 3/3.
- Playwright sintético: eventos, excepción, snapshot, stop, opt-out, privacidad
  y offline pasan.
- Build frontend: pasa.
- El reporte local se genera en
  `frontend/test-results/posthog-wails-spike/report.json` y no se versiona.

Limitación abierta: Chromium con user-agent WebView2 no es el ejecutable Wails
nativo. Antes de una activación productiva debe repetirse manualmente el flujo
en una build Windows y comprobar en el receptor que no aparecen datos sensibles.
