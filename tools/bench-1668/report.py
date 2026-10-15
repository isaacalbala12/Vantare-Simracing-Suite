"""Render the requested Markdown evidence; missing measurements stay missing."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(sys.argv[1])
campaigns = sorted(p for p in root.iterdir() if p.is_dir() and (p / 'conditions.json').exists())
runs = []
if campaigns:
    for file in sorted(campaigns[-1].glob('*/summary.json')):
        runs.append(json.loads(file.read_text(encoding='utf-8-sig')))
lines = ['# VANTA-89 / GitHub #1668 — comparación de overlays con LMU', '',
         'Actualizado: ' + datetime.now(timezone.utc).isoformat(), '',
         '**Estado: campaña pendiente o parcial; no hay una comparación completa de las tres apps.**', '',
         'No interpretar N/D como consumo cero. La prueba corta de PresentMon es una verificación del instrumento, no una pasada válida.', '',
         '| Escenario / pasada | FPS medios | Frametime medio ms | p1 ms | p99 ms | CPU overlay % | WS overlay MiB | CPU PC % | RAM usada PC MiB | Válida |',
         '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
for scenario in ('Base', 'Vantare', 'RaceLab', 'TinyPedal'):
    found = [run for run in runs if run['scenario'] == scenario]
    if not found:
        lines.append(f'| {scenario} / 0 de 3 | N/D | N/D | N/D | N/D | N/D | N/D | N/D | N/D | Pendiente |')
    for index, run in enumerate(found, 1):
        columns = [f"{run[key]:.2f}" for key in ('fps', 'frametime_mean_ms', 'frametime_p1_ms',
                   'frametime_p99_ms', 'overlay_cpu_percent', 'overlay_working_set_mib',
                   'system_cpu_percent', 'system_used_mib')]
        lines.append('| ' + ' | '.join([f'{scenario} / {index}', *columns,
                     'Sí' if run['valid'] else 'NO: revisar muestras']) + ' |')
lines.extend(['', '## Método previamente fijado', '',
 'Windows 11 Pro 10.0.22631, Ryzen 5 1500X, 4c/8t, 16 GB; Radeon RX 6600 XT, driver 32.0.21045.5002; escritorio detectado 1920×1080. El juego debe confirmarse también a 1920×1080 sin bordes, misma cámara, gráficos, VSync/límite FPS y tráfico en todas las pasadas.', '',
 'Condición: práctica Hypercar, vista de cabina, parado en su box, motor al ralentí, sin pausa, sin menús ni Alt-Tab. Es una medición estacionaria: no representa conducir en pista. Isaac inicia el juego; el banco no lo lanza ni termina. PID 16280 ajeno intacto.', '',
 'Tres pasadas de 180 s por escenario y 30 s de calentamiento en cada una. Orden fijado: Base, Vantare, RaceLab, TinyPedal; TinyPedal, RaceLab, Vantare, Base; RaceLab, Base, TinyPedal, Vantare. Las posiciones RaceLab se omiten mientras no sea posible usarlo sin cuenta. Se espera 30 s sin cargo/rustc/nextest/link/cl; no se mata ningún proceso ajeno.', '',
 'Conjunto propuesto: Standings, Relative, Delta, Pedals. Vantare gratuito, Look Vantare; TinyPedal standings/relative/deltabest/pedal, restantes widgets desactivados; perfiles propios en bench. Mismos anclajes aproximados (30,40), (1300,40), (800,80), (1700,800). No se certifican igualdad de filas, superficie pintada, cadencia ni presencia de datos hasta verificarlos en sesión. Fuel y Radar se excluyen para conservar los cuatro widgets gratuitos de Vantare. RaceLab gratuito no configurado por requisito de cuenta.', '',
 'PresentMon 2.6.0 por PID de LMU, CSV v1, sesión ETW propia. FPS = 1000 / media de msBetweenPresents de la cadena con más muestras; se descarta su primer intervalo por empezar antes de captura. p1 y p99 son percentiles de frametime con interpolación lineal, no «1% low FPS». Incluye presents descartados: mide ritmo de presentación de la app, no garantiza FPS visibles ni latencia input→pantalla. Se conserva el número de cadenas; revisar cadenas secundarias antes de aceptar. No se mezclan las distribuciones de las pasadas.', '',
 'Recursos: aproximadamente una muestra por segundo. CPU de cada proceso por diferencia de TotalProcessorTime, dividida entre tiempo real y 8 procesadores lógicos (100% = todo el PC); se suma el árbol por nombres Vantare/TinyPedal/RaceLab. WS = working set no privado, sumado: páginas compartidas pueden contarse más de una vez. CPU total mediante GetSystemTimes; RAM total usada = física total menos libre. No se confunde WS con memoria privada. Acceso denegado o procesos que terminan pueden faltar; revisar CSV. Se guarda foreground_pid para comprobar que LMU mantuvo el foco. CPU/RAM y ETW tienen un pequeño desfase de arranque; no son eventos sincronizados por frame.', '',
 '## Versiones y procedencia', '',
 'Descargas oficiales y hashes en `downloads.json`; metadatos de releases en `C:/VantareServer/bench/*-release.json`.', '',
 '- Vantare: source origin/nightly `ed66924c29299d78cb78a0125ecb5e2ab83ef049`, rama propia de medición. Nightly ya incluye widgets reales; no se usa PR visual #1641 abierto ni datos sintéticos. Release pendiente hasta completar build-release.log; no usar debug/prueba para comparar rendimiento. Hashes de binarios deben guardarse tras construir.',
 '- RaceLab 8.4.4: instalador firmado válido, SHA-256 `CE7DF8C1AAB9F04653462F8AA61D271F2B0849AD34A3FBBD172B6D714DCB2EB0`. Extraído de instalador/nupkg oficial en bench/RaceLab/lib/net45, sin ejecutar instalador, sin registro de cuentas ni pagos. Arranque/overlays no verificados. [Web oficial](https://racelab.app/) indica crear cuenta; [login oficial](https://auth.racelab.app/Account/Login). No se mide una pantalla de login como overlays activos.',
 '- TinyPedal 2.51.0 portable Windows, SHA-256 ZIP `D3BDA2D87888ED0B7633C7E183C6E21277C76850EA2AB47FD80461107817147B`. [Release oficial](https://github.com/TinyPedal/TinyPedal/releases/tag/v2.51.0). Extraído en bench, perfil aislado por APPDATA; ventana principal desactivada al inicio. Requiere Enable Plugins en LMU; no se cambia la instalación del juego.',
 '- PresentMon 2.6.0 x64: firma válida, SHA-256 `B2A706BC6AD475749E3B7E3409263AA1E6906D45BDCF993F6DBC0F660188F1AF`. [Release oficial](https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0). Prueba de 5 s: exit 0 y CSV de LMU generado.', '',
 '## Límites y siguiente paso', '',
 'No hay evidencia suficiente para afirmar qué producto consume menos ni para hacer marketing comparativo. No se han capturado imágenes de apps ni escritorio. Faltan Release Vantare, verificación visual de cuatro widgets con datos reales, confirmación READY de Isaac, campaña completa sin otras cargas y revisión de foco/sesión/configuración. REST LMU no respondía durante preparación aunque el proceso existía; detectar proceso no prueba que haya sesión.', '',
 'Ejecutar `run.ps1` en PowerShell oculto. Espera READY.json y sesión REST; no inicia LMU. `READY.json` requiere condition="boxes-cockpit-idle", resolution="1920x1080", widgets_verified=true, solo después de comprobarlo realmente. Crear `STOP` en evidencia para cancelar esperas; una captura en marcha termina antes de cerrar procesos propios. Borrar STOP/READY antes de otra campaña deliberadamente. Conservar CSV, run.json y summary.json; ejecutar report.py de nuevo permite reconstruir esta tabla.'])
(root / 'RESULTADOS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
