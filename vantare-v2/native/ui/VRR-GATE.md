# Gate físico VRR · PC de juego de Isaac

**Pendiente. Ejecutar solo cuando lo indique el orquestador.** El servidor remoto no aprueba este gate.

## Material y duración

A es el GPUI anterior; B es #2009. Usar Release de producto, sin `paint-stats`, estrés ni captura. Son **24 capturas**: dos motores × tres rondas × cuatro estados. Cada una tiene 10 s de preparación y 60 s de registro: **28 minutos**, más preparación y cambios; reservar **45–60 minutos**.

Estados: `cerrado`, `visible`, `oculto`, `restaurado`. En la segunda ronda invertir visible/oculto; conservar todas las pasadas. Mantener la misma escena/repetición del juego y configuración en los dos motores.

## Obtener y cambiar el ejecutable B

En el servidor, desde cada worktree A/B limpio, con target D: propio configurado:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml --locked --release -p vantare-ui --bin vantare-overlays -j 4
```

Entregar por motor `vantare-overlays.exe`, SHA de fuente, perfil/features, log y SHA-256. No usar `overlay-replay.exe` ni un ejecutable dev. A conserva `acc6619b1` como ancestro de producto; cualquier añadido diagnóstico se identifica por separado.

En el PC, cerrar la Suite y su supervisor para evitar que relance otro overlay. Crear una carpeta de prueba elegida por Isaac, fuera de la instalación, con un único núcleo de referencia. Su ruta y hash no cambian durante la prueba. Exportar **solo el layout JSON**, sin copiar carpetas de cuenta o credenciales.

Conservar los originales de A/B en subcarpetas. Copiar A como `vantare-overlays.exe` al directorio del núcleo de prueba. Para B, salir del overlay por la bandeja, esperar su terminación y copiar B sobre **ese mismo nombre y ruta**. No sustituir archivos de la instalación. Así se conserva también la ruta del núcleo vecino que comprueba el cliente de derechos.

Preparar estas variables con rutas de este PC: `$Slot`, `$EngineA`, `$EngineB`, `$Layout`, `$PresentMon`, `$Out`. `$Out` debe ser nuevo; no hay una unidad fija. El juego sigue abierto durante la prueba.

Para mantener abierta la entrada del núcleo independiente del supervisor:

```powershell
$Pipe = 'VantareVRR.' + [guid]::NewGuid().ToString('N')
$Info = [Diagnostics.ProcessStartInfo]::new((Join-Path $Slot 'vantare-core.exe'))
$Info.UseShellExecute = $false
$Info.CreateNoWindow = $true
$Info.RedirectStandardInput = $true
foreach ($Arg in @('--live','--simulator','lmu','--pipe',$Pipe)) { $Info.ArgumentList.Add($Arg) }
$Core = [Diagnostics.Process]::new()
$Core.StartInfo = $Info
if (!$Core.Start()) { throw 'No arrancó el núcleo de prueba' }
```

Tras copiar A o B al slot, iniciar el overlay con el mismo layout y pipe:

```powershell
$Ui = Start-Process -FilePath (Join-Path $Slot 'vantare-overlays.exe') -ArgumentList @('--layout',$Layout,'--fuente',"pipe:$Pipe") -PassThru
```

Comprobar widgets y datos reales. Un aviso de derechos o componentes incompatibles invalida la prueba; no saltarse esa comprobación. Registrar hashes del slot antes de cada motor. Al acabar, salir del overlay y cerrar `$Core.StandardInput`; esperar su salida. No arrancar dos núcleos con el mismo pipe.

## Configuración y captura confirmada

1. Anotar Windows, GPU/driver, monitor/conexión, resolución, Hz y rango VRR, G-Sync/FreeSync en ventana sin bordes, V-Sync, optimización de juegos en ventana y límite FPS. Mantenerlos iguales. Elegir un límite dentro del rango VRR, con margen frente al techo. Cerrar OBS y otros overlays.
2. Usar **PresentMon 2.3.1 x64 de consola**, sin su overlay gráfico. Guardar versión, hash y `--help`. Los flags siguientes están confirmados en el [README de esa versión](https://github.com/GameTechDev/PresentMon/blob/v2.3.1/README-ConsoleApplication.md).
3. Desde una consola con permisos ETW, sustituir el nombre del juego si cambia y usar CSV/sesión únicos:

```powershell
$Game = 'LeMansUltimate.exe'
$Csv = Join-Path $Out 'A-r1-visible.csv'
& $PresentMon --process_name $Game --process_name vantare-overlays.exe --output_file $Csv --delay 10 --timed 60 --terminate_after_timed --session_name VantareVRR_A_r1_visible
```

Volver al juego durante los 10 s de espera, sin menús sobre la escena. Repetir para cada estado, ronda y motor. Conservar también frames no mostrados. El comando usa los flags de 2.3.1; no añade el de metadatos de pantalla de versiones posteriores.

4. `cerrado`: overlay terminado. `visible`: abrir el layout. `oculto`: «Ocultar overlays» en bandeja y comprobar que desaparecen todas sus ventanas. `restaurado`: mostrarlas de nuevo. Mantener núcleo y escena. Observar VRR durante cada minuto, preferiblemente con los Hz dinámicos del OSD del monitor; registrar si se usa el indicador del driver y mantenerlo igual en todas las pasadas.
5. Separar filas de juego/overlay. Para el juego, escoger PID y swapchain principal por mayor cantidad de filas. Exigir **≥55 s útiles y ≥1000 frames** por captura. Calcular p99 por rango más próximo de `MsBetweenPresents`, ignorando solo ausentes/no finitos. Contar el porcentaje de filas con `PresentMode` igual a `Hardware: Independent Flip` o `Hardware Composed: Independent Flip`. Los nombres y columnas están documentados en la fuente anterior.

## Pasa/no pasa, declarado antes de medir

- Cerrado debe tener **≥95 %** de frames en esos modos Independent Flip; de lo contrario, el entorno no permite evaluar esta regresión.
- Visible, oculto y restaurado deben mantener **≥95 % en cada captura**. La mediana de B visible/restaurado no puede caer más de **1 punto porcentual** frente a A en el mismo estado.
- P99 del juego: mediana de B visible/restaurado **≤1,05× A**; ninguna ronda pareada de B puede superar **1,10× A**. Si la propia escena no repite dentro de ese margen, resultado **inconcluso**, conservando todas las pasadas.
- VRR debe observarse activo durante los 60 s de todos los estados. Anotar pérdidas y frecuencia fija inesperada. `PresentMode` por sí solo no prueba VRR físico; si no se puede confirmar, el gate queda **pendiente**.
- «Sin regresión frente a A» exige todos los puntos, sin recortes de layout ni cambios de configuración. Que ocultar recupere VRR es una mitigación; no aprueba visible.

Guardar los 24 CSV, hashes, configuración y observación VRR por captura; tabla A/B por estado con p99, porcentaje Independent Flip y VRR observado. No cambiar MPO, registro ni ajustes globales del driver para hacer pasar el gate. [DXGI flip model](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/for-best-performance--use-dxgi-flip-model) explica Independent Flip, reverse composition y MPO.
