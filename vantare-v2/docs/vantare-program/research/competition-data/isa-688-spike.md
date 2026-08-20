# ISA-688 — spike Nakama/RaceOS para histórico y ratings LMU

Estado: en progreso. Rama aislada; sin integración de producto.

## Objetivo

Determinar la fuente online actual de Le Mans Ultimate para resultados,
histórico, identidades de piloto y observaciones DR/SR. El spike usa únicamente
una sesión propia y evidencia pasiva. No implementa autenticación remota,
scraping global, almacenamiento público ni ratings en Vantare.

## Reglas de custodia

- No leer ni emitir tokens, tickets, claves, cookies o cabeceras de autorización.
- No imprimir Steam IDs, UUID de eventos, nombres de piloto ni valores de perfil.
- No inspeccionar `.env*`, memoria privada del proceso ni tráfico TLS descifrado.
- Solo se guardan nombres de campos, tipos, contadores y estados sanitizados.
- Racecenter es referencia funcional, nunca fuente de ingestión.

## Evidencia inicial — 2026-08-20

Base Git verificada: `origin/nightly@3ee6d7269a76f6cea9deb5659f85fad2989abd8f`.

Observación local con LMU 1.4 en ejecución a las 18:36 CEST y repetida a las
19:01 CEST. Comando del informe repetido:

```powershell
go run ./cmd/lmu-online-surface-probe `
  -log-dir "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log" `
  -max-files 8
```

Resultados sanitizados de ambas observaciones:

- `Le Mans Ultimate` escuchaba en loopback `127.0.0.1:6397`.
- El proceso mantenía conexiones TLS con infraestructura resuelta para
  `raceos.gg`; la caché DNS enlazaba el dominio con uno de los destinos activos.
- Trazas recientes contenían llamadas a
  `https://raceos.gg/api/v1/notifications/global`.
- Ocho trazas recientes no contenían la palabra `Nakama`, cabeceras Bearer ni
  valores con forma JWT. Sí contenían un Steam ID; se contó pero no se mostró.
- El host histórico `lmu-prod.eu-central1-a.nakamacloud.io` continúa resolviendo
  y responde, pero el proceso LMU observado no mantenía una conexión con sus IP.
- `/navigation/state` expuso únicamente esquema local de navegación y un estado
  de usuario sin identidad deportiva, rating o token. Los endpoints `watch`
  estaban vacíos en el estado actual del juego.

### Interpretación provisional

RaceOS es la superficie observable actual. Nakama continúa disponible y
Racecenter declara usarlo, pero todavía no se ha demostrado si LMU 1.4 lo usa
directamente, si RaceOS actúa delante de Nakama o si Racecenter conserva un
contrato anterior/privado. No se atribuye histórico ni DR/SR a ninguna de las
dos capas hasta observar una sesión online real.

## Evidencia online — práctica RaceControl propia

El 2026-08-20 se entró en un servidor estándar gratuito de práctica propio, sin
usar Practice+, Upgrade, compra o inscripción en carrera.

Durante la sesión:

- `/navigation/state` indicó `PRACTICE1`, fase `GREEN` y `NAV_EVENT`.
- `/rest/watch/standings` pasó de vacío a un documento JSON de aproximadamente
  38–47 kB; `/rest/multiplayer/teams` expuso unos 8 kB y `sessionInfo` 875 B.
- Una búsqueda de nombres de campo contra una lista estática segura encontró
  `badge` 34 veces en `multiplayer/teams`. No encontró `rating`,
  `driverRating`, `safetyRating`, `driverRank`, `safetyRank`, `DR` o `SR` en
  `teams` ni `standings`.
- LMU mantenía diez conexiones establecidas: tres HTTPS y siete con otros
  puertos. Una IP activa coincidía en ese instante con la resolución DNS de
  RaceOS; ninguna coincidía con las IP resueltas entonces para el host Nakama
  histórico. Esto no atribuye por sí solo cada conexión a nivel de aplicación.
- Las ocho trazas recientes conservaron nueve menciones RaceOS y cero Nakama,
  joins, Bearer o JWT. La ruta segura observable siguió siendo
  `/api/v1/notifications/global`.

La UI de RaceControl sí presenta DR/SR en su lista de inscritos. La observación
solo demuestra que los endpoints REST locales contienen standings y `badge`, y
que no usan ninguno de los nombres de campo DR/SR/rating incluidos en la lista
segura comprobada. No permite descartar que esos datos estén codificados con
otra clave o representación. Los valores DR/SR exactos y el histórico siguen
sin una fuente identificada y autorizada.

## Herramienta reproducible

`cmd/lmu-online-surface-probe` recibe una ruta de logs explícita y consulta
solo el REST loopback de LMU. Su salida JSON contiene:

- contadores de menciones RaceOS/Nakama y joins de evento;
- rutas RaceOS/Nakama sin query ni subdominio, conservando solo segmentos de
  una lista estática segura y sustituyendo todos los demás;
- contadores de posibles Bearer/JWT/Steam ID, nunca sus valores;
- rutas y tipos del JSON local, nunca valores ni claves no incluidas en una
  lista estática segura;
- estados cerrados para timeout, respuesta vacía o cuerpo no JSON.

Los archivos se nombran `trace-1`, `trace-2`, etc. en vez de publicar su nombre
real. Si una traza supera 16 MiB, se analiza su ventana final —la actividad más
reciente— y el informe marca `truncated: true`; el recuento describe solo esa
ventana y nunca se interpreta como ausencia en todo el archivo.

Ejemplo:

```powershell
go run ./cmd/lmu-online-surface-probe `
  -log-dir "<LMU>\UserData\Log" `
  -max-files 8
```

La ruta no se descubre automáticamente para evitar recorrer datos personales
sin una acción explícita. La herramienta rechaza redirects, HTTPS y cualquier
host REST que no sea loopback. Rechaza un directorio enlazado y omite entradas
que ya son enlaces al enumerarlas; una sustitución local concurrente entre la
validación y la apertura permanece como riesgo residual de bajo nivel.

## Gate restante

La comparación antes/durante la práctica ya se completó. Cualquier observación
posterior debe limitarse a destinos, contadores y esquema, y detenerse si exige
recuperar una clave, token o valor personal.

El gate siguiente exige demostrar un identificador estable y paginación de
histórico sin eludir controles. La observación online ya demuestra standings de
sesión y presencia del campo `badge`, pero no identifica la representación ni
fuente de DR/SR exactos o histórico; por tanto, la paridad global permanece
`condicional`.

## Verificación del checkpoint

- `go test ./cmd/lmu-online-surface-probe`: PASS.
- `go vet ./cmd/lmu-online-surface-probe`: PASS.
- `pnpm --dir frontend build`: PASS; conserva el aviso heredado de bundle mayor
  de 500 kB.
- `go test ./...`: todos los paquetes ejecutados pasan salvo
  `TestBranchDiffContainsNoFrontendFile`. La guardia compara cualquier HEAD con
  la rama fija `vantareapp/isa-372-tc-integration`; por eso atribuye a ISA-688
  un cambio previo de `frontend/.eslintignore` que ya forma parte de `nightly`.
  El diff de ISA-688 contra `origin/nightly` no contiene archivos frontend. No
  se modificó ni se debilitó esa prueba.
- `git diff --check`: PASS.
- Revisión independiente tras corregir redacción de URLs/claves, ventana de
  trazas grandes, arrays y nombres de archivo: `ACCEPT`, sin P0/P1/P2; el único
  P3 documental sobre junctions/TOCTOU quedó alineado en este checkpoint.

## Fuentes

- Racecenter, política de privacidad: https://racecenter.fr/politique-de-confidentialite
- LMU V1.4 / RaceOS: https://lemansultimate.com/le-mans-ultimate-goes-stateside-with-us-track-dlc-and-v1-4-update/
- Nakama Authentication: https://heroiclabs.com/docs/nakama/concepts/authentication/
- Investigación previa doX: `docs/research/dox-lmu-plugin-identity-and-auth-flow.md`
- Decisión previa de producto: `docs/adr/0001-close-lmu-pilot-ratings.md`
