# Handoff vivo — plataforma, cuenta, releases y migración



## ISA-1052 — detalle y selección (2026-09-08)

C9: sesiones estimadas marcadas con ~ y explicación; selección ligada a serie,
instante y destino, validada con el motor/publicación actual. Nuevo target limpia
filtro/selección; no pierde horas históricas válidas. RED 7+2, focal133PASS/2skips,
build/tipos/lint/roadmap PASS; review ACCEPT3c85e2b8. Full frontend3276PASS,
2skips y4timeouts externos (#1025). Base C8 ec3a75f5, rama
vantareapp/isa-1052-calendar-detail-selection. Informe ISA-1052 en docs/analysis.
C6a/C6b aceptados, full Go PASS, candidatos #1051/#1053; C6c y Wails/rendimiento
pendientes. No merge/release, HUD/Studio intactos.


## ISA-1046 — clasificación de Mes (2026-09-08)

C8 de #1027 evita que las ocurrencias generadas aparezcan como especiales.
Identidad/fuente exacta y todas las series publicadas, sin usar título/filtro activo.
RED tres fallos; GREEN siete portables y contraste opt-in con 4596 eventos Go,
ocho PASS. Sin mutar documento ni tocar HUD/Studio/CSS. Base C7 411b5538;
C7 aceptado en review y candidato #1047, no integrado. Rama
vantareapp/isa-1046-calendar-month-classification. Review halló P2 Mes → Día:
cuatro regresiones RED, corregidas; especiales presentes con/sin series y sin
duplicar ocurrencias. 113 focales PASS, build/tipos/lint/roadmap PASS; review ACCEPT 6a1daf60.
Suite completa 3269 PASS, 2 skips, 3 FAIL fuera de Calendario: parser p99
(#1019), Relative Crystal 30 s y Pedals Redline missing 20 s (#1025).
Informe en docs/analysis/ISA-1046-calendar-month-classification.md.
Continúan C6/C9, Wails y medición A/A–A/B; sin merge ni release.

## ISA-1044 — días locales y slots (2026-09-08)

C7 de #1027: fechas civiles con setDate; cantidad por ventana real en vez de ocho;
hora repetida conserva instante y se identifica con UTC. Base C3 317ff133,
sin integración. Rama vantareapp/isa-1044-calendar-local-days. RED seis fallos,
focal 124 PASS y matriz UTC/Madrid/Nueva York. Checks finales/review en curso.
Informe docs/analysis/ISA-1044-calendar-local-days.md. Sin CSS, HUD o Studio.
C2/C3/C4a/C4b/C5 candidatos #1031/#1034/#1036/#1040/#1045; quedan C6, C8/C9,
Wails y rendimiento A/A–A/B. No merge ni release.

## ISA-1032 — vigencia en Inicio y Calendario (2026-09-08)

Corte C3 del plan #1027 aprobado por Isaac, dependiente de #1029 / PR #1031.
Rama `vantareapp/isa-1032-calendar-validity`, worktree
`C:/tmp/vantare-isa1032-calendar-validity`, base nightly `d6d0992f`.
El corte conserva schedule en el store y limita previews/motor a [inicio, fin).
Documentos antiguos sin vigencia verificable no producen nuevas salidas.
Regresión con el seed real: seis casos RED→GREEN (metadatos, desconocido,
caducado, preview inválido, cinco vistas y detalle). 112 focales PASS;
typecheck/lint/build PASS. Suite completa 3243 PASS/2 FAIL: timeouts 20 s en
PedalsRedline excluido, antecedente #1025; no se declara verde ni se debilita.
Go completo y roadmap 23+21 PASS. Review inicial P2 de conteo mensual en día
parcialmente vigente: RED 12 frente a 3; GREEN 3. Revisión final fc12ceee ACCEPT
para C3 sin nuevos P1/P2; build final PASS.
evidencia final en docs/analysis/ISA-1032-calendar-validity.md y #1032.

No integrar este frontend antes del backend #1031: la nightly base aún no emite
el metadato. C4 aporta estados visibles/acuse; C5–C11 siguen pendientes.
F4/F5/F6 de la auditoría no se declaran resueltos aquí. Sin Wails real ni ahorro
global, HUD/Studio intactos, sin merge o release. La PR #1031 tiene revisión
independiente C2 ACCEPT y Go/build locales PASS; CI remoto se verifica aparte.
