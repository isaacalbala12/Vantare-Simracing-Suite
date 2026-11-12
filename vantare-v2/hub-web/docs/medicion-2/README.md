# Medición-2: banco aislado de QA

Encargo de Isaac del 12-11, VANTA-138 / #1995. Estos archivos son respaldo del
banco que se ejecuta en `D:/VantareServer/qa/isa-1995-measure-2/tools`. No se
importan desde la aplicación ni modifican sus valores por defecto. No se abre
un PR de optimización: Isaac decidirá después de leer el informe.

Se reutiliza exactamente la generación de medición-1 (UI `9401501ea` y su
anfitrión/peers Release), verificando sus hashes antes de copiarla. Una copia
instrumentada común sirve para todas las variantes; solo cambia un identificador
cerrado en un archivo de datos QA. El ASAR y el recurso de integridad del EXE se
regeneran, se comprueban los siete fuses y se vuelve a sellar el inventario.
No hay descargas, dependencias nuevas, cuentas ni servicios reales.

Preparación: `node --experimental-strip-types tools/prepare.mjs`, desde el banco
QA. La ejecución conservará el cerrojo y la sonda Win32/PerfProc de
`scripts/measure.ps1`; cinco pares alternados por experimento. Sin compilaciones
propias durante las muestras, un solo Hub a la vez y cierre de todos sus hijos.

Informe y muestras: `D:/VantareServer/evidence/hub-web/medicion-2/INFORME.md`.
Resultados completos: cinco series de opciones y una serie de fases de arranque,
N=5 pares alternados por serie (60 arranques válidos). La serie de fases usa
marcas explícitas y Paint Timing; los volcados nativos de CPU incompletos se
excluyen. Una tanda adicional se descartó por compilación ajena durante la reserva.
La serie final comprueba ausencia de builds antes, después y en 70 límites de fase.
Validación independiente en PowerShell desde los datos crudos, correcta en seis series.
No confundir el candidato histórico común con nightly actual. Ninguna opción se ha
aplicado al producto; el informe incluye ruido y límites de interpretación.

El respaldo incluye las 264 proyecciones JSON/JSONL de las seis series válidas
(1,58 MB; sin PNG ni configuración con bootstrap), más el registro de reserva.
Se verificó el respaldo con:
`pwsh -NoProfile -File qa-tools/validate-independent.ps1 -EvidenceRoot <esta carpeta>`.
Las capturas y las tandas incompletas quedan en la carpeta de evidencia local.
