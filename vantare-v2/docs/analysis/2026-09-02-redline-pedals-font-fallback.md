# ISA-962 — Pedals Redline: desbordamiento del valor con fuente fallback

Fecha: 2026-09-02. Microcorte R-FIX2b del cierre Redline. Base candidata:
`7e0e4d731cf4e4099d3bf802ce2ade7ff70a68f9`. Fix aislado:
`b3f60b03dbc03a0ff203fc629f50b3f90f6e7dae`.

## Reproducción y causa

El [run CI 33657242122](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/33657242122)
falla exclusivamente la contención de saturación de Pedals: ocho píxeles en
x=328, y=369..376. El well termina en y=276,5886; el defecto está en el valor
inferior, no en su sombra `inset`. El slot acaba en x=327,84375.

La pila productiva declara Barlow Semi Condensed, Roboto Condensed, Arial Narrow,
Segoe UI y sans-serif. El equipo local seleccionaba Roboto-Bold y no reproducía
el fallo. Se probó la alternativa genérica ya declarada, sin instalar fuentes,
modificar geometría ni inventar píxeles. Chromium seleccionó Arial Black para
peso 800 y reprodujo exactamente las ocho coordenadas y valores RGBA de CI.
Esto acredita la causa reproducida; CI no registró su fuente de plataforma.

| Observación (frame 520×420, DPR 1) | Antes | Después |
| --- | --- | --- |
| Peso del valor | 800 | 700 |
| Fuente efectiva del fallback local | Arial Black | Arial Bold |
| Ancho del slot | 135,755 px | 135,755 px |
| Ancho del valor `100%` | 139,276 px | 118,151 px |
| Píxeles cambiados fuera de well/slot | 8 | 0 |
| Tamaño de fuente | 11 px | 11 px |

El arreglo cambia únicamente el peso de `.ven-pred-slot b` (valores Redline).
No altera tamaño de letra, anchos, clipping, máscara ni tolerancia. No toca la
sombra, títulos, otros diseños o lógica de telemetría.

## Regresión y evidencia

- Test productivo con pila configurada, fallback Segoe UI y fallback genérico.
- RED previo: 4 PASS / 1 FAIL. GREEN: 5/5 PASS.
- La misma comparación conserva `changedOutsideLocalBacking === 0` y añade
  contención explícita del rectángulo del valor dentro del slot.
- Capturas PNG/JSON antes/después vistas por el orquestador en
  `C:\tmp\pedals-redline-glyph-red` y `C:\tmp\pedals-redline-glyph-green`.
- El test permite conservar estos artefactos con la variable de diagnóstico
  `VANTARE_REDLINE_GLYPH_EVIDENCE`, sin habilitarla por defecto.
- Suite local: 441 archivos / 3423 tests PASS, código cero; se registra el
  `AbortError` de teardown Happy DOM emitido sin fallo de suite. Typecheck y
  build y lint PASS; build conserva el aviso de chunks grandes ya existente.

Comando focal desde el directorio de la app:

```powershell
pnpm --dir frontend exec vitest run src/overlay/design-systems/vantare-endurance/pedals/PedalsRedline.layout.test.tsx
```

Estas pruebas usan el harness Chromium con fixture existente. No son evidencia
Wails/LMU ni certifican ahorro de recursos. CI del fix y cierre físico
S3 → S4 → S5 → S2 siguen pendientes; no autorizan merge por sí solas.
