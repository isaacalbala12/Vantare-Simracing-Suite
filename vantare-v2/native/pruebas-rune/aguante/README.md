# VANTA-141 / #2213: aguante (pieza 10)

`AGUANTE.ps1` se copia a la raíz del kit junto con PROCESOS, PREPARAR,
VENTANAS.cs y el muestreador de las piezas 7/9. No ejecutarlo en el servidor.
Requiere PowerShell 7 x64, volcado pequeño y archivo de paginación ya habilitados;
solo comprueba esa configuración, no la modifica.

Para cada motor: una ventana con 10 Relative durante cuatro horas. Solo usa
la grabación incluida y un pipe nuevo. El núcleo se cierra por EOF y reinicia
cada 65 s, porque el servicio sigue vivo cuando termina la grabación. Esos
intervalos y épocas nuevas quedan explícitos en el registro; no simulan una
sesión continua real. No se habilitan trazas por foto ni PresentMon durante
el aguante; muestras de familia, CPU y GPU cada 10 s.

H oculta la ventana propia; H de nuevo la muestra sin activarla. M confirma
que Isaac apagó físicamente el monitor y comprobó la vuelta. R confirma que
cambió y restauró la resolución (se comprueba resolución/frecuencia finales).
Son observaciones manuales: el guion no afirma haberlas verificado visualmente.
Q cancela, conserva evidencia y nunca aprueba una prueba incompleta.

El guion conserva CSV, cambios manuales con QPC, cierres de procesos y metadatos
de eventos del sistema/volcados, sin copiar el contenido de memoria. No borra
perfiles ni toca procesos ajenos. La temperatura CPU consta como no disponible;
TERMICA.ps1 comprueba GPU y contadores CPU según la decisión de Isaac.

En servidor, `resumir_aguante.py` calcula variación absoluta de memoria privada familiar:
mediana minutos 10–20 frente a últimos 10 minutos. Exige cobertura cada 10 s,
sin huecos >20 s y sin reutilización de PID. Una caída observada sigue siendo
fallo aunque falten datos. El analizador común exige variación absoluta <5%, cuatro
horas y todas las comprobaciones físicas. El PC no necesita Python.

Verificado: sintaxis PowerShell, dos pruebas Python sintéticas (memoria estable,
crecimiento, huecos, raíz ausente y PID reutilizado). Ejecución física pendiente
PC de juego. Las APIs de ventana del auxiliar común solo se compilan por cola;
no se invocan en servidor. Sin dependencias nuevas ni cambios del producto.

Si Windows se reinicia durante el aguante, RECUPERAR_AGUANTE.ps1 recoge
los eventos desde ejecucion-inicial.json sin reiniciar la prueba ni borrar CSV.
Una recuperación nunca da por completadas las cuatro horas.

### Actualización 13/11: recuperación y exclusión de campañas

Checkpoint previo a abrir la gráfica y recuperación tras reinicio, conservando
bugchecks aunque no existan las cuatro horas de muestras. Variación de memoria
absoluta, con signo original registrado aparte; no se recorta una caída a cero.
Tres pruebas Python PASS. Mutex común de la pieza 9 impide ejecutar otra
campaña o recogida simultánea. Out-File -NoClobber sustituye el parámetro
inexistente de Set-Content; sintaxis y contrato de parámetros verificados.
No se ha ejecutado el aguante en servidor ni PC; C# de ventanas pendiente de
compilación por cola. No implica validación gráfica ni adopción.
