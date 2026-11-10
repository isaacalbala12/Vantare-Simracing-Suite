# Paso 5b: cierre por cambio urgente de prioridad

Tanda Electron Release N=10 frío + N=10 caliente, mismo equipo y ambos slots reservados. Mediana (mínimo–máximo). Fuente sellada `80fc3acd5c9f268d2870b4870b519de6d6724c66`; medidor `fdacc27996f01fa6e39e8f3fe5af2ff8efd2b9ba`, ambos limpios. Datos originales: `measure-baseline-final/measurements.json` y `samples.json`. No son cifras del candidato v6 posterior ni del futuro marco corregido.

| Métrica | Objetivo | Medido |
|---|---|---|
| Ventana fría, ms | ≤900 | 9578.18 (4538.72–13367.50) |
| Ventana caliente, ms | ≤600 | 791.37 (772.08–884.20) |
| Working set total frío, MiB | ≤250 | 343.81 (338.30–346.65) |
| Working set total caliente, MiB | ≤250 | 340.34 (338.31–343.62) |
| Heap renderer frío/caliente, MiB | ≤60 | 5.45 (5.42–5.65) / 5.60 (5.51–5.70) |
| CPU reposo, % de un núcleo | Informar | 0 en las 20 ventanas de 5 segundos; resolución del contador, no prueba de consumo nulo |
| Primer recorrido frío/caliente, ms | Informar | 23.76 (13.41–34.64) / 6.65 (6.38–7.87) |
| Segundo recorrido + hashes frío/caliente, ms | Informar | 3813.86 (3725.04–7402.89) / 336.58 (334.27–353.71) |

La comparación GPUI de esa tanda NO es válida para memoria en Ajustes: sus 20 capturas muestran el aviso «Acceso sin verificar» sin controles. Sus estadísticas no deben usarse como comparación de producto. El dato histórico 343 ms no sustituye una medida comparable. El banco normal autorizado volvió a mostrar el mismo aviso; se detuvo la nueva tanda v6.

El candidato v6 posterior tiene 328.211.401 bytes sin comprimir y ZIP 150.971.338 bytes (SHA256 74f753347f5dd39e5937bfdbbdb8153494e2ddca75282b78853848d9f3405bb8). Asar intacto e índice/contenido manipulados: tres casos correctos en Windows (`asar-88a3286d7d074407/result.json`).

No cumplen arranque ni memoria. La variante QA de GPU software está preparada, pero no medida: Isaac prioriza ahora la paridad visual y pide no alargar 5b. No se elimina la verificación de hashes. Live con prueba nueva de todos los PID sigue pendiente; no se presenta el cierre normal como cierre Live. Windows 10: procedimiento listo en `hub-web/docs/windows-10-qa.md`; falta máquina/VM y ejecución.
