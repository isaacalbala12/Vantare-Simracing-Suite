# Oráculo Go para la fase 1 nativa — ISA-1425

Desde `vantare-v2/`:

```powershell
go test -p 4 ./tools/native-oracle
go vet ./tools/native-oracle
go run ./tools/native-oracle -out tools/native-oracle/reproduccion
```

La salida debe ser **un directorio nuevo**. La herramienta no reemplaza un
oráculo congelado. Comparar su `manifest.json` y los 72 goldens con
`native/runtime/testdata/oracle/` antes de proponer una nueva congelación.
No versionar la carpeta de reproducción.

## Qué ejecuta

Exporta mediante `git archive` las fuentes Go productivas exactas de
`3ced668f22aa79819aefae059d28b15d52452274` (ISA-1403), junto con su
`go.mod`/`go.sum`, a una carpeta temporal. Excluye sus tests. Añade allí el test
puente `bridge/oracle_test.go`, compila y elimina la carpeta al terminar.
El puente pertenece al paquete `lmu` porque las APIs de build explícita y REST
son privadas. No usa `unsafe`, `go:linkname`, reflexión ni modifica producción.
No requiere herramientas ni dependencias nuevas.

No usa el Go de `f0254e1f`: esa base no admite la build `1.4.2.0` y el corpus
la exige. La referencia elegida sí tiene sus capturas y hashes pinneados. El
SHA completo está fijado en el código y en el manifiesto; no sigue una rama.
Es una referencia Go previa al corte nativo, no evidencia de que ese commit
esté integrado en nightly ni una aprobación de ISA-1403.

Camino productivo:

1. `lmu.parseWithBuild` → `Fusion.Merge` (SHM/REST).
2. `BatchMapper.WriteObservation` → `core.Reducer.Apply`.
3. `derive.Pipeline.Apply` → `overlayv2.BuildStandings` y `BuildSession`.

REST usa `pollREST` con los cuerpos reales grabados y los relojes de inicio y
fin de cada consulta, mediante un transporte HTTP en memoria. No llama al
juego ni necesita la red. Los fixtures aislados no tienen REST: el número
queda vacío, sin deducirlo del nombre del vehículo.

Los 12 `.bin` se procesan independientemente. Los menús que rechaza Go
conservan `go_rejection`, `session: null` y cero filas: no se inventa una
proyección. El corpus verifica el hash comprimido y el hash de **cada evento**,
reproduce sus 3.600 SHM y 239 REST en orden y congela el primer SHM en o después
de cada segundo 0..59. No salta eventos entre las muestras.

## Forma común

Cada golden conserva el ID Go completo y un ordinal de primera aparición,
calculado por identidad en el orden original del frame, nunca por posición.
Rust asigna `CarId(1..)` en ese mismo orden. La comparación verifica esos
ordinales además de piloto, número y clase. Este corpus no demuestra reutilizar
slots, relevo de piloto ni cambio de sesión.

Los tiempos pasan de segundos a milisegundos. Un gap es `{time_ms}` o `{laps}`:
cuando Go declara vueltas perdidas, estas tienen prioridad, como en `Gap` del
modelo nativo; su contador se compara exactamente. Las calidades compactas de
Overlay V2 se expanden, también en ceros y campos ausentes. `Estimated` de Rust
se representa `fresh`: Go expresa frescura y Rust autoridad; esa conversión
no afirma que una derivación sea una lectura observada. `invalid` no se
convierte silenciosamente en `missing`.

El manifiesto pinnea cada entrada, su build, su input SHA-256 y su golden
SHA-256; registra los 3.839 instantes originales para el replay nativo.
El test Rust fija además el SHA-256 del propio manifiesto y de las excepciones.
La tabla completa de goldens y el informe están en
[`native/runtime/testdata/oracle/README.md`](../../native/runtime/testdata/oracle/README.md).

## Límites de ejecución

Seguimiento: [GitHub #1425](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1425).
Notion no disponible; excepción de trabajo solo con GitHub autorizada por el
encargo del 2026-09-29. No se afirma actualización ni entrega en Notion.
Esta herramienta produce evidencia offline, no pruebas de adquisición live,
REST caído, cierre del juego, WebView2, GPUI, OBS ni rendimiento.
