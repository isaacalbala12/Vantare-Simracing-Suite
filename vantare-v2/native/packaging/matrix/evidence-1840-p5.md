# #1840 / VANTA-127 — ensayo previo de Cleanup, paso 5

Base nightly def6fbb0954df46340545d189830676b493c734b, con #1866 integrado.
Rama vantareapp/isa-1840-paso5-shell-sync. Ensayo autorizado por el orquestador
antes de implementar shell::sync; no cambia código de producto ni dependencias.

## Resultado: vía no acreditada; implementación detenida

Windows10.0.22631 (Windows11), volumen D: NTFS, archivo con atributo Archive,
sin ReadOnly. Helper QA compilado con el compilador .NET Framework existente;
invoca directamente CreateFileW y SetFileInformationByHandle, sin PowerShell
para la operación de borrado. No se ha compilado todavía un helper Rust nativo.

- Identidad incorrecta, SHA distinto y raíz distinta: rechazados antes de la
  API; cada copia conserva sus bytes y su carpeta.
- Caso normal, identidad/SHA/raíz propios válidos: abre el handle con DELETE y
  lectura, valida SHA mediante ese handle y llama FileDispositionInfoEx(21),
  flags DELETE|POSIX_SEMANTICS(3). Devuelve Win32 ERROR_ACCESS_DENIED(5).
  No se ha recogido NTSTATUS: no se afirma haber observado STATUS_CANNOT_DELETE.
- El nombre del EXE y la carpeta permanecen. Error explícito, salida1 y ruta
  del residuo registrada. Se detiene la campaña antes de ensayar más variantes,
  según la condición del orquestador. No se sustituye el fallo por otro método.

SHA de las copias: c821936b4e3027558193e9a10b53dc5a5872c01272620cf33e6c199702761d48.
Logs: D:/VantareServer/qa/isa-1840/p5-image-01.log,
p5-image-01/results.json y p5-image-environment.json. Raíz guardada:
D:/VantareServer/qa/isa-1840/p5-image-01. Conservados compiler y las cuatro
copias identity/hash/root/normal para inspección; ningún proceso queda vivo.
Consulta Get-Volume por D: no encontró MSFT_Volume; DriveInfo(D:).DriveFormat
confirmó NTFS. No hubo montaje, formato, escritura de registro o rutas reales.

## Condiciones adicionales y límites

- (a) IGNORE_READONLY_ATTRIBUTE(16) **no evaluado**: el caso normal ya falla sin
  ReadOnly; se detiene antes de probar flags19. No se concluye que el flag arregle
  la imagen mapeada ni que sea necesario para una imagen propia normal.
- (b) No se dispone de un volumen QA no NTFS ni de otro Windows que carezca de
  la API. No se simula su resultado como prueba física. La API fallida actual
  produce error/código/ruta de residuo explícitos; las otras plataformas quedan
  sin acreditar. El motor vigente conserva su exigencia de volumen local NTFS.
- (c) La comprobación de carpeta vacía y Directory.Delete está en el helper,
  después de desaparecer el nombre y cerrar el handle. **No alcanzada** porque
  la API falla; no se afirma que se haya borrado la carpeta con la imagen viva.
- El helper C# no sustituye una prueba con el EXE Rust de distribución. El
  resultado basta para parar esta vía experimental, sin deducir compatibilidad
  general del comportamiento de todas las imágenes PE o versiones de Windows.

## Reproducción manual aislada

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/matrix/cleanup-image-tests.ps1 -Root D:/VantareServer/qa/isa-1840/p5-image-NUEVO
```

Exige raíz nueva bajo el guard del servidor. Compila únicamente el fixture
cleanup-image-probe.cs bajo QA y ejecuta copias propias por handle de proceso,
con límite30s. No invoca Setup/Uninstall de producto ni toca registro/carpetas
del usuario. Es un diagnóstico manual **que falla de forma explícita** en este
entorno; no se conecta como gate verde ni se altera la matriz/baseline vigente.
Si se elige otra vía, esta evidencia sigue conservada como ensayo descartado.

## Decisión necesaria

Alternativas presentadas antes de escribir código de producto:

1. Conservar Uninstall.exe y un marcador ligado por hash junto a los datos
   conservados; Setup posterior los retira tras verificar propiedad y ausencia
   de proceso. No necesita trabajador ni deja EXE temporal, pero cambia el
   resultado observable de la desinstalación: queda ese residuo explícito.
2. Ejecutar una copia del mismo Uninstall en TEMP exclusivo, esperar al padre
   por handle y retirar el EXE raíz. Queda una copia completa del ejecutable en
   TEMP, con identidad/hash y política explícita de retirada posterior. No se
   promete que Windows la retire automáticamente; exige nuevo ciclo de vida.
3. Mantener excepcionalmente Cleanup PowerShell mientras se acuerda otra
   política. Conserva el resultado actual y cierra solo dos llamadas en este
   corte; incumple el objetivo de retirar las tres ahora y necesita autorización.

Ninguna alternativa aplicada. No se propone cmd, ADS, servicio, inyección,
desmapear la imagen, privilegios nuevos ni borrado al reiniciar con HKLM.
Producción sin cambios: no se anuncia una reducción de líneas del paso5.
Rust fmt/Clippy/Nextest y matriz completa no ejecutados: solo ensayo autorizado
de QA, fallido antes de implementar producto. Cola libre para VANTA-128.
