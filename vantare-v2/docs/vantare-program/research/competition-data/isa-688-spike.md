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

## Relectura de Nakama y RaceCenter — 2026-08-20

La investigación estática anterior de doX sí reconstruyó el contrato histórico
con bastante precisión: autenticación Steam de Nakama, sesión Bearer y RPC
`event_get` paginado por evento. No reconstruyó las dos credenciales necesarias:
el ticket Steam válido para LMU y la server key de Nakama. La documentación
oficial de Nakama exige un token Steam válido; un Steam ID por sí solo no sirve.
Steamworks, además, exige que la aplicación solicite el ticket para su propia
identidad Web API. Por tanto, la hipótesis antigua «Steam ID de SimHub + server
key» no está demostrada y no debe guiar una implementación.

La interfaz pública actual de RaceCenter aporta una pieza adicional:

- su política de privacidad, actualizada el 11 de agosto de 2026, declara que
  sincroniza rating, histórico y vueltas desde Nakama después de vincular la
  cuenta;
- su pantalla de vinculación indica que un activador lee
  `coherent_local_storage.json`, extrae el token de sesión actual de LMU y lo
  envía a RaceCenter para efectuar una vinculación persistente;
- el frontend consulta su propio `/api/nakama/events` sin autenticación y lo
  refresca cada 30 segundos; ese endpoint entrega catálogo de eventos, no el
  histórico completo de cada piloto.

Esto explica cómo RaceCenter salva el hueco de credenciales, pero no convierte
el mecanismo en un contrato oficial ni demuestra que el backend actual de LMU
sea Nakama de extremo a extremo. LMU 1.4 anunció que RaceOS sustituyó una capa
de terceros, y la observación local actual solo vio RaceOS. Los nombres internos
de RaceCenter pueden ser heredados o describir una capa aún situada detrás de
RaceOS.

### Superficie pública de RaceControl

RaceControl publica, sin iniciar sesión, páginas de eventos alojados con:

- inscritos y Grid Rating propio de SimGrid;
- resultados de clasificación y carrera;
- vueltas por piloto;
- standings y reglas de puntuación de campeonatos.

Esta superficie permite un colector de baja frecuencia para eventos públicos,
pero no se ha demostrado que enumere todas las carreras oficiales Daily/Weekly
ni expone el DR/SR oficial de LMU. El valor alrededor de 2.000 y las categorías
Bronze/Experienced Bronze pertenecen a Grid Rating: el HTML usa
`icon-grid-rating`, el sitio está operado mediante SimGrid y la documentación de
SimGrid fija 2.000 como base de su propio rating. No debe mezclarse con LMU.
`robots.txt` no declara restricciones, pero la accesibilidad pública no equivale
a permiso de republicación masiva. Antes de guardar nombres o perfiles de
terceros en una base pública se necesita revisión de términos, finalidad RGPD,
retención, rectificación, borrado y mecanismo de exclusión.

## Arquitectura viable sin custodiar credenciales

La opción recomendada para Vantare es híbrida:

1. Un conector local, voluntario y visible, se ejecuta únicamente cuando el
   usuario abre LMU. El token de sesión nunca sale del equipo, no se registra y
   solo vive en memoria durante la sincronización.
2. El conector consulta la superficie autorizada que se confirme para el propio
   usuario y normaliza localmente resultados, cambios DR/SR y participantes.
   Solo sube registros sanitizados y con procedencia, nunca tokens ni respuestas
   remotas completas.
3. Un worker barato ingiere una vez al día las páginas públicas permitidas de
   RaceControl y reconcilia eventos/resultados alojados. Su Grid Rating se
   conserva, si se usa, en un campo y namespace distintos; no puede sustituir
   al conector local para DR/SR o carreras oficiales que requieren sesión.
4. El backend conserva observaciones append-only y una proyección corregible.
   Una exclusión o detección de fraude invalida la proyección sin borrar la
   procedencia; los datos personales sí siguen su política de borrado.

Abrir LMU una vez al día puede activar el snapshot local. Una ejecución semanal
sirve para catálogo e histórico que el origen ya conserve, pero puede perder
cambios intermedios de rating. La paridad exacta con RaceCenter solo queda
demostrada si una prueba local identifica, sin extraer ni subir credenciales,
que la sesión actual permite obtener `event_get` o su equivalente RaceOS con
identidad estable, paginación y deltas DR/SR.

### Límites de implementación

- No copiar el modelo de RaceCenter de enviar el token LMU a un servidor.
- No almacenar token, refresh token, server key o respuesta de sesión.
- No usar `/api/nakama/*` de RaceCenter como fuente de Vantare.
- No reutilizar una credencial de LMU en un worker Cloudflare.
- No presentar el nombre histórico `event_get` como endpoint actual confirmado.

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

El siguiente experimento permitido es un analizador local de esquema para
`coherent_local_storage.json` que opere con consentimiento explícito y emita
solo nombres de claves, tipos y contadores. Requiere antes una revisión de
seguridad específica porque el archivo contiene una credencial. No se leerá ni
se implementará el intercambio remoto del token como parte de este checkpoint.

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
- Steamworks `ISteamUser`: https://partner.steamgames.com/doc/api/ISteamUser
- Nakama RPC: https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/code-samples/
- RaceControl, reglas y términos: https://www.racecontrol.gg/rules
- RaceControl, ejemplo público de resultados: https://www.racecontrol.gg/events/20443/results?race_id=219624
- RaceControl, ejemplo público de inscritos: https://www.racecontrol.gg/events/20443/drivers
- SimGrid, definición de Grid Rating: https://pits.thesimgrid.com/announcements/grid-rating-arrives-at-simgrid/
- Investigación previa doX: `docs/research/dox-lmu-plugin-identity-and-auth-flow.md`
- Decisión previa de producto: `docs/adr/0001-close-lmu-pilot-ratings.md`
