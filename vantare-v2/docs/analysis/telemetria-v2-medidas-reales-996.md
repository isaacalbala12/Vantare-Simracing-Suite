# ISA-996 — medidas propias con LMU, 2026-09-06

## Veredicto

Se ejecutaron seis capturas de 60 s y dos de 30 s, con licencia activa,
cuenta autenticada, build estable y cierre limpio. Son medidas exploratorias
reales, no aceptación de rendimiento óptimo ni comparación contra otra build.
No demuestran superar el HUD de LMU ni ausencia de impacto perceptible.

## Identidad y condiciones

- Autorización nueva de Isaac: «haz tus propias mediciones»; sustituye la
  reserva previa de prueba física exclusivamente humana para este banco.
- Worktree `C:/tmp/vantare-isa996-performance/vantare-v2`, rama
  `vantareapp/isa-996-cierre-rendimiento`, fuente `b8254121`, producto `db40f76e`.
- Build configurada con el procedimiento existente; sin mostrar/copiar env.
  `bin/vantare-isa996-measurement.exe`, SHA256
  `329b3f6705282415e1c4dcf95c83b9c9b5b5a7b4c5fa5dd430862f0833541ad6`.
- Dist SHA256 `795a8f794dca8e3625d53dfe6af45a88a67394d61c7183d97d3341418ab7776d`.
- Ryzen 7 3700X, 16 procesadores lógicos; pantalla observada 1920×1080;
  preflight rAF alrededor de 120 Hz. No se certificó DPI/cadencia efectiva.
- LMU v1.4130, Le Mans, Practice, cockpit parado en pitlane. HUD nativo activo
  en todas las condiciones. No conducción ni cambios de HUD. La IA seguía
  circulando: la escena no es un replay determinista.
- Perfil local `C:/tmp/isa996-redline-two.json`, derivado del fixture del banco:
  Standings Redline y Relative Redline Mirror; Delta excluido. Dos widgets
  comprobados por CDP y observación real; no se certifica todo el catálogo.
- Sin fijar política automática/Hz: configuración efectiva no acreditada.
  Tampoco se verificó el tamaño total de parrilla. El campo cars=54 de la
  segunda HubMin fue una inferencia incorrecta desde la posición mostrada:
  **no es un conteo verificado y no debe usarse**. Las otras corridas declaran 0
  (desconocido); se conservan crudos sin corregir retrospectivamente.
- Se coordinó exclusividad con ISA-1000 y cerró su candidato normalmente.
  Su PresentMon hijo terminó con él. Se detuvieron sólo los cinco procesos
  Edge de background identificados, sin ventanas; WebViews Microsoft del
  sistema preservados. Chrome/Steam/Codex y servicios residentes permanecían:
  el gate Edge no equivale a un PC completamente vacío.

## Seis capturas de 60 segundos

Orden: A0, HubMin, HubMin, A0, A0, HubMin. A0 significa **Vantare abierto sin
overlay**, no LMU solo. HubMin añade dos widgets y minimiza Hub. Por tanto
también cambia el estado del Hub: diferencia de condiciones, no coste puro
atribuible al renderer. LMU se activó antes de cada muestreo; sin capturas
durante las repeticiones salvo observación inicial de renderizado.

Memoria: suma por instante de host Go y WebViews que recoge el banco, después
media temporal. **Subtotal**, no total de todos los auxiliares: la selección
actual del banco no incluye procesos propios no-WebView como el sensor.
Working set sumado puede duplicar páginas compartidas. GPU dedicada es la
lectura por procesos, no utilización ni memoria física exclusiva garantizada.

| CSV (20260906) | Privada MiB | Working set MiB | GPU dedicada MiB | Frametime medio ms | p99 ms |
|---|---:|---:|---:|---:|---:|
| a0-004655 | 268.82 | 442.43 | 38.42 | 16.069 | 21.363 |
| hubmin-004827 | 409.75 | 605.63 | 78.31 | 16.678 | 23.453 |
| hubmin-005007 | 431.81 | 622.61 | 81.80 | 17.554 | 24.533 |
| a0-005139 | 356.95 | 484.73 | 89.22 | 17.967 | 27.693 |
| a0-005309 | 265.52 | 432.51 | 35.92 | 15.100 | 20.080 |
| hubmin-005441 | 418.56 | 610.46 | 74.02 | 16.755 | 24.059 |

26 instantes de procesos por corrida (contador GPU/CIM añade latencia al
muestreo nominal de un segundo). PresentMon: 3731/3594/3416/3337/3969/3578
frames respectivamente; cero dropped reportados. p99 por orden estadístico
`floor((N-1)*0.99)`. No prueba stutter inexistente. A0 cambia de 15.10 a
17.97 ms: variación suficiente para no aceptar diferencias pequeñas de FPS.
No hay baseline de build anterior ni condición LMU sin Vantare.

## CPU: error detectado y pareja adicional

Las seis primeras CPU **se descartan**: `[Math]::Max(0, $cpuPct)` selecciona
overload entero en PowerShell (reproducción 1.23→1). Corregido a `0.0`.
No se reinterpretan retrospectivamente los números redondeados.
Después, dos capturas adicionales de 30 s (13 instantes), con idéntica build:

| Condición | CPU máquina, subtotal | Privada MiB |
|---|---:|---:|
| HubMin 005745 | 6.393% | 478.28 |
| A0 005847 | 2.314% | 354.83 |

Una sola pareja: **exploratoria**, no mejora estadísticamente acreditada.
~1.02 y ~0.37 núcleos equivalentes respectivamente. La diferencia observada
es ~4.08 puntos CPU; no equivale a 4.08% de pérdida de FPS. El mayor consumo
de memoria de esta pareja se conserva, no se selecciona sólo la tanda menor.
No publico utilización GPU: los ceros del contador no acreditan coste nulo,
ni sumar motores heterogéneos demuestra un porcentaje global comparable.

## Tooling, pruebas y evidencia

Primer intento abortó antes de medir: A0 ya detenido no emite `emittedAt`.
Se lee esa propiedad sólo cuando realmente arrancó overlay. No se inventa PID
si el renderer existía antes de la ventana de activación: las corridas HubMin
quedan `renderer-unassigned`, sin desglose atribuido al overlay.
Dos regresiones ejecutan el fragmento PowerShell real: A0 sin propiedad y CPU
fraccionaria/clamp negativo. Suite banco 34/34 PASS; diff textual PASS.
No cambió producto ni fue necesaria otra build después de corregir tooling.
Review independiente Muse xhigh `ses_f8c694f90ffeDwRvDLiJmoRe9x`: APPROVE
del diff de los dos archivos de tooling, sin bloqueos; lectura estática,
los tests y las capturas los ejecutó main.

Crudos, PresentMon, licencia sanitizada, CDP, cierres y resúmenes por corrida:
- `C:/tmp/isa996-live-results/` (seis corridas válidas y preflight fallido).
- `C:/tmp/isa996-live-cpu-corrected/` (pareja CPU corregida).
- `C:/tmp/isa996-redline-two.json` (perfil exacto).
- `C:/tmp/isa996-measurement-build.log` (build).

Los flags automáticos `publishable=true` de los CSV no anulan estos límites.
Los datos permanecen locales: no se subieron crudos, nombres ni capturas.
Siguiente banco de aceptación: política y población verificadas, auxiliares
incluidos, atribución correcta, A/A reproducible y build anterior/HUD equivalente.
No se añade ahora otro sensor ni se modifica el producto para forzar un PASS.
Sin push, PR, integración, promoción ni release de ISA-996.
