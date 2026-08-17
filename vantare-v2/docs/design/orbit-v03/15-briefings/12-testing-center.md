# Briefing 12 · Testing Center (`?channel=nightly&view=testing`)

## Objetivo
Aplicar Orbit a `hub/testing-center` sin cambiar su flujo: solo visible con canal testers/nightly (botón matraz en el rail, después de Roadmap).

## Estructura
- Cabecera: eyebrow = canal, h2 "Testing Center", lead; `SubtleStatus ok` "Borrador local".
- Grid `1fr | 300px`: **Formulario** (`Surface`: Módulo `Select` ancho completo; Qué hiciste / Qué esperabas (2 col); Qué ocurrió; Contexto adicional · opcional) · **Consentimiento** (`Surface`: título, "Nada se adjunta sin selección explícita y vista previa", checkboxes Diagnóstico preparado / Replay de telemetría (deshabilitado) / Logs de producto (deshabilitado), **Enviar reporte** primary ancho completo, "Descartar borrador" ghost).
- Topbar: eyebrow "Canal <canal>", h1 "Testing Center".

## Criterios de aceptación
- [ ] Con canal Stable el botón no aparece en el rail y `?view=testing` redirige con toast "Testing Center no está disponible en Stable".
- [ ] Enviar valida campos obligatorios y usa el flujo real; Descartar limpia el borrador.
- [ ] Sin scroll de página a 1080.

## Referencias
`06 § Testing Center`, `14 testing.*`, `hub/testing-center/*`.
