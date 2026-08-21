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
  refresca cada 30 segundos. Una primera lectura solo había caracterizado ese
  catálogo; la auditoría profunda posterior identifica más rutas públicas.

Esto explica cómo RaceCenter salva el hueco de credenciales, pero no convierte
el mecanismo en un contrato oficial ni demuestra que el backend actual de LMU
sea Nakama de extremo a extremo. LMU 1.4 anunció que RaceOS sustituyó una capa
de terceros, y la observación local actual solo vio RaceOS. Los nombres internos
de RaceCenter pueden ser heredados o describir una capa aún situada detrás de
RaceOS.

### Auditoría profunda de RaceCenter — 2026-08-21

RaceCenter no es únicamente una interfaz HTML. Sus bundles públicos y las
peticiones de su propia UI revelan endpoints JSON sin autenticación suficientes
para reproducir gran parte de su experiencia visible:

- `/api/rankings` devuelve ranking paginado, nacionalidad, DR/SR actuales,
  cambios, número de carreras y última carrera. La consulta global observada
  contenía unos 225.000 pilotos clasificados;
- `/api/drivers/{id}/racecontrol` devuelve perfil DR/SR y agregados de carreras,
  victorias, podios, poles, vueltas y abandonos;
- `/api/drivers/{id}/race-history` devuelve histórico paginado con evento,
  circuito, posiciones general/de clase, split, vueltas, coche, equipo y deltas
  DR/SR;
- `/api/ratings/history` devuelve las series históricas DR y SR y sus estados
  actuales;
- `/api/live-players` devuelve pilotos activos con rating y última carrera;
- `/api/nakama/events` devuelve el catálogo actual de eventos, horarios,
  clases, vehículos y registros cuando existen;
- `/api/members-map` enlaza Steam IDs con perfiles internos de RaceCenter para
  aproximadamente 7.500 miembros.

Las respuestas comprobadas usan caché pública de 60 a 300 segundos y no
mostraron autenticación, contrato de versión, ETag, cabecera CORS ni límites de
consumo publicados. La UI pública de pilotos mostraba 7.494 perfiles en el
momento de la comprobación. Son cifras variables, no un compromiso de
cobertura. Una prueba sobre un perfil público devolvió tantas observaciones de
DR y SR como carreras históricas; esto demuestra profundidad histórica para
ese perfil, no para todos los pilotos.

La auditoría conserva solo rutas, esquemas y agregados. `/api/members-map` usa
Steam IDs como nombres dinámicos de propiedades JSON: un primer recorrido
genérico llegó a mostrarlos en la salida temporal de diagnóstico antes de
detectar esa forma. No se guardaron, copiaron ni versionaron esos valores. Todo
probe futuro debe tratar también las claves dinámicas como datos personales y
redactarlas antes de recorrer o imprimir el documento.

#### Qué permitiría técnicamente

Un worker servidor a servidor podría consultar estas rutas una vez al día y
mantener una réplica barata de rankings, perfiles, deltas, histórico y eventos.
La ausencia de CORS no afecta a ese worker. Esto ofrece una vía técnica para
paridad casi exacta con las funciones públicas de RaceCenter sin conocer su
backend Nakama/RaceOS y corrige la hipótesis anterior de que su API pública solo
exponía catálogo.

La unión con los rivales presentes en LMU continúa sin demostrarse. En la
práctica local observada, los 24 campos Steam ID de `standings` estaban vacíos o
a cero. El matching por nombre sería ambiguo y no es aceptable para asignar
rating. Debe probarse si una carrera clasificada entrega identidad estable o si
existe otra señal local autorizada.

#### Por qué no debe ser la fuente productiva sin permiso

- No existe una API pública documentada, versionada o con SLA; cualquier ruta,
  esquema, bloqueo o política de caché puede cambiar sin aviso.
- Las menciones legales de RaceCenter reservan su contenido y código y
  prohíben su reproducción sin autorización. Que una ruta responda sin login no
  concede licencia de copia o republicación.
- Una réplica global contendría identificadores, perfiles y rendimiento de
  terceros. Requiere base jurídica, finalidad, minimización, retención,
  rectificación, borrado y exclusión; el consentimiento de un usuario de
  Vantare no cubre al resto de pilotos ni licencia la base de RaceCenter.
- RaceCenter se declara no afiliado con Motorsport Games o LMU y advierte que
  los datos procedentes de terceros pueden ser incompletos o tardíos. Añadirlo
  como única fuente crea dependencia operativa y de calidad.

Veredicto: **GO técnico para un prototipo sin persistencia personal; NO-GO para
ingestión y republicación productiva sin autorización escrita de RaceCenter**.
Con autorización, el contrato debe fijar rutas o feed, atribución, frecuencia,
límites, rectificaciones/borrados y derecho de conservar histórico. Sin ella,
RaceCenter solo puede servir de referencia funcional y validación manual.

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

### Cómo está implementado RaceControl — comprobación 2026-08-21

La superficie pública permite separar dos sistemas que comparten marca, pero no
la misma fuente de rating:

1. **Hosted y comunidad:** las páginas `/events/{id}`, `/drivers`, `/results` y
   `/standings` se renderizan en servidor y comparten el modelo de SimGrid. El
   propio sitio enlaza los perfiles de piloto a SimGrid, muestra `Grid Rating`,
   declara «Website powered by SimGrid» y sirve la aplicación desde Heroku. El
   anuncio oficial de la integración confirma que SimGrid gestiona catálogo,
   inscripciones, resultados y standings de estos eventos. No es DR/SR de LMU.
2. **Cuenta y competición oficial:** el botón de acceso público envía un `POST`
   a `/users/auth/race_os`. En una sesión HTTP desechable, sin cuenta ni
   credenciales, respondió `302` hacia `steamcommunity.com/openid/login` con
   las claves estándar de Steam OpenID y retorno a
   `/users/auth/race_os/callback`. Esto confirma Steam OpenID como entrada web
   y una estrategia de servidor denominada `race_os`; no confirma su contrato
   interno posterior.
3. **RaceOS:** LMU V1.4 y RaceControl comparten la capa first-party RaceOS. La
   documentación oficial afirma que RaceOS sustenta daily races, championships,
   hosted servers y RaceControl. Por tanto, RaceControl puede obtener datos
   oficiales por integración interna servidor a servidor, sin necesitar el
   mecanismo de token local que usa RaceCenter.

El JavaScript público inspeccionado no contiene endpoints de DR/SR, histórico
oficial o RaceOS. Las páginas públicas son HTML renderizado en servidor y la
parte posterior al callback requiere autenticación. No puede confirmarse desde
fuera si RaceControl consulta una API privada, una base compartida o eventos
internos de RaceOS. La inferencia de mayor confianza es una integración
first-party no pública; presentarla como API utilizable por Vantare sería
incorrecto.

Consecuencia práctica:

- un worker diario sí puede leer, sujeto a permiso y política de datos, el HTML
  público de hosted/community para calendario, inscritos, vueltas, resultados y
  standings;
- ese worker no consigue el histórico oficial completo ni DR/SR de LMU;
- la paridad oficial requiere autorización para RaceOS o un conector local
  opt-in que consulte únicamente la sesión propia sin exportar credenciales;
- la autenticación web de RaceControl no es un precedente para automatizar
  cuentas: sus términos rechazan entradas automatizadas y su acceso posterior
  no es público.

Fuentes primarias: anuncio de
[RaceControl powered by SimGrid](https://news.racecontrol.gg/news/your-brand-new-racecontrol-gg-for-le-mans-ultimate-powered-by-simgrid-is-coming-on-december-10th/),
[LMU V1.4 y RaceOS](https://lemansultimate.com/le-mans-ultimate-goes-stateside-with-us-track-dlc-and-v1-4-update/)
y [reglas de RaceControl](https://www.racecontrol.gg/rules).

### Observación pasiva adicional — 2026-08-21

Con LMU abierto en menú se repitió el probe sanitizado sobre ocho trazas. Todas
mantuvieron `raceos.gg/api/v1/notifications/global`, cero menciones Nakama,
cero Bearer/JWT y ningún join de evento. El REST local indicó estado de usuario
sin identidad deportiva; `teams` estaba vacío y `sessionInfo`/`standings` sin
cuerpo. Esta repetición confirma el patrón anterior, pero no añade una ruta de
histórico o rating porque no había una sesión de pista activa.

## Arquitectura viable sin custodiar credenciales

La opción recomendada para Vantare sigue siendo híbrida:

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

Si RaceCenter concede autorización escrita, su feed público puede sustituir en
este diseño la recolección de RaceControl para DR/SR e histórico y reducir la
necesidad de abrir LMU diariamente. Hasta entonces, la viabilidad técnica de
sus endpoints no cambia la frontera de custodia ni de permiso.

### Límites de implementación

- No copiar el modelo de RaceCenter de enviar el token LMU a un servidor.
- No almacenar token, refresh token, server key o respuesta de sesión.
- No usar ninguna ruta interna de RaceCenter como fuente productiva de Vantare
  sin permiso escrito y contrato de uso.
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

El siguiente experimento autorizado era un analizador local de esquema para
`coherent_local_storage.json` con consentimiento explícito y salida limitada a
nombres de claves, tipos y contadores. La revisión de seguridad y su ejecución
se completaron en el checkpoint siguiente. No se expuso ni se implementó el
intercambio remoto del token.

## Experimento de almacenamiento de sesión — 2026-08-21

Se implementó `cmd/lmu-session-schema-probe` como herramienta independiente,
sin red y fail-closed. Exige ruta explícita, nombre exacto del archivo y
`-confirm-sensitive-file`; rechaza enlaces/junctions, archivos no regulares,
JSON múltiple, más de 4 MiB, profundidad mayor de 32, más de 100.000 nodos o
2.048 rutas de esquema. Lee mediante un único handle y comprueba identidad,
tamaño y fecha antes/después. No descubre rutas, no crea copias ni escribe
informes en disco.

La salida conserva únicamente:

- tipos y rutas de una allowlist estática, con el resto como `<field>`;
- contadores de marcadores y candidatos sensibles;
- nombres y tipos de claims JWT de una allowlist estática, nunca sus valores;
- conteo de JWT expirados/vigentes, nunca la fecha exacta ni una huella.

Observación propia reproducible:

```powershell
go run ./cmd/lmu-session-schema-probe `
  -file "<LMU>\coherent_local_storage.json" `
  -confirm-sensitive-file
```

Resultados sanitizados:

1. Antes de abrir LMU, el archivo tenía 4.097 bytes, cuatro valores con forma
   JWT y un único esquema de payload repetido cuatro veces: `uid:string`,
   `usn:string`, `exp:number` y una claim de nombre redactado. Los cuatro
   figuraban expirados.
2. Tras abrir LMU 1.4, entrar en Online/RaceControl y ver el catálogo, el archivo
   no había sido reescrito y el informe seguía mostrando cuatro JWT expirados.
3. El cierre normal de LMU sí reescribió el archivo, conservando los mismos
   tamaño, estructura, número de JWT y estado expirado. No se conservaron hashes
   ni valores, por lo que no se afirma que los bytes o tokens fueran idénticos.

La documentación oficial de Nakama muestra precisamente `uid`, `usn` y `exp`
como claims de su sesión JWT. La coincidencia de esquema confirma material de
sesión Nakama en el almacenamiento local con alta confianza. No confirma una
sesión utilizable: LMU pudo abrir Online con esos cuatro JWT expirados y no creó
uno vigente en el archivo. La inferencia más consistente con las trazas es que
la autenticación activa actual reside en RaceOS, memoria u otro almacenamiento,
mientras Coherent conserva estado Nakama histórico.

### Veredicto del experimento

- **Confirmado:** `coherent_local_storage.json` contiene cuatro JWT con esquema
  de sesión Nakama y LMU lo reescribe al cerrar.
- **Confirmado:** entrar en Online no dejó ningún JWT Nakama vigente en el
  archivo observado.
- **No confirmado:** qué claim fue redactada, qué función tiene cada uno de los
  cuatro JWT, si RaceCenter usa aún esos valores o cómo consigue una vinculación
  persistente.
- **Bloqueado por custodia:** no se intentará enviar, refrescar, validar ni usar
  ningún JWT contra Nakama/RaceOS, y no se copiará el modelo del activador de
  RaceCenter.

El archivo real, sus valores, hashes y rutas absolutas no se versionaron. Las
capturas temporales de control de ventana se eliminaron al terminar.

## Experimento de ticket Steam y doX — 2026-08-21

Una segunda prueba, con LMU dentro de RaceControl y después en una práctica
online propia, identifica la credencial activa sin leer memoria de proceso ni
descifrar TLS:

- el frontend público actual de RaceCenter lee exactamente
  `http://localhost:6397` → `nakama.session.auth-token` del archivo Coherent y
  contempla explícitamente los errores `nakama_token_invalid` y
  `steamid_mismatch`;
- ese campo exacto existe localmente, pero su JWT estaba expirado y el archivo
  no se modificó al entrar en RaceControl;
- el REST local actual de LMU expone
  `/rest/profile/getAuthSessionTicket`, con un único campo no vacío
  `authSessionTicket`;
- el análisis estático del plugin doX instalado, versión 1.9.1, confirma que
  `AuthenticateNakama` lee ese endpoint local y envía el ticket a
  `/v2/account/authenticate/steam?create=false&sync=false`;
- ya autenticado, el plugin contiene el flujo de evento actual mediante
  `/v2/rpc/event_get` y consulta perfiles con `/v2/user?usernames=`. No se
  encontró en ese binario una ruta de histórico personal;
- al reiniciar SimHub con doX habilitado mientras LMU permanecía en la práctica,
  se observó una conexión TLS del proceso al host Nakama oficial unos doce
  segundos después. doX se ejecutó dentro del uso personal permitido por su
  instalación; Vantare no copió, mostró ni reutilizó su clave embebida;
- la traza de la práctica añadió la ruta RaceOS sanitizada
  `/api/v1/event/<id>/<id>/<id>`, además de notificaciones globales.

Esta evidencia corrige dos hipótesis anteriores: el ticket Steam sí está
disponible por una superficie REST local explícita y la autenticación Nakama
funciona actualmente. También delimita lo demostrado: doX acredita acceso a
evento y perfiles/rating de sus participantes, no el backfill completo de las
carreras anteriores del usuario. El contrato adicional que usa el backend de
RaceCenter para sincronizar histórico continúa sin estar publicado ni
identificado. No se enumerarán RPC desconocidos ni se reutilizará una clave de
terceros para intentar descubrirlo.

### Veredicto actualizado

- **GO técnico probado:** un conector local puede obtener un ticket Steam
  efímero cuando LMU está abierto y alcanzar Nakama con el contrato correcto.
- **GO condicional:** ratings de participantes del evento actual, sujeto a
  autorización y a disponer de una clave/contrato propios o sancionados.
- **Aún no probado:** importación histórica completa por usuario, paginación,
  retención y deltas de carreras anteriores.
- **NO-GO:** copiar la clave propietaria de doX, enumerar RPC o enviar tickets a
  un backend de Vantare sin autorización y diseño de custodia aprobado.

## Verificación del checkpoint

Checks del experimento de sesión del 2026-08-21:

- `go test -count=20 ./cmd/lmu-session-schema-probe`: PASS.
- `go vet ./cmd/lmu-session-schema-probe`: PASS.
- `go test -race ./cmd/lmu-session-schema-probe`: no ejecutable porque el
  toolchain del repo mantiene CGO desactivado; el comando es secuencial y no se
  cambió el toolchain para este spike.
- `go test ./...`: todos los paquetes ejecutados pasan salvo el mismo
  `TestBranchDiffContainsNoFrontendFile` heredado. La prueba compara contra la
  rama fija `vantareapp/isa-372-tc-integration` y atribuye a ISA-688 el
  `frontend/.eslintignore` ya presente en su base `origin/nightly`; el diff de
  ISA-688 contra su base no contiene frontend y no se modificó esa prueba.
- `git diff --check`: PASS.

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

- Racecenter, directorio público de pilotos: https://racecenter.fr/drivers
- Racecenter, política de privacidad: https://racecenter.fr/politique-de-confidentialite
- Racecenter, menciones legales: https://racecenter.fr/mentions-legales
- LMU V1.4 / RaceOS: https://lemansultimate.com/le-mans-ultimate-goes-stateside-with-us-track-dlc-and-v1-4-update/
- Nakama Authentication: https://heroiclabs.com/docs/nakama/concepts/authentication/
- Nakama Session Management: https://heroiclabs.com/docs/nakama/concepts/session/management/
- Steamworks `ISteamUser`: https://partner.steamgames.com/doc/api/ISteamUser
- Nakama RPC: https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/code-samples/
- RaceControl, reglas y términos: https://www.racecontrol.gg/rules
- RaceControl, ejemplo público de resultados: https://www.racecontrol.gg/events/20443/results?race_id=219624
- RaceControl, ejemplo público de inscritos: https://www.racecontrol.gg/events/20443/drivers
- SimGrid, definición de Grid Rating: https://pits.thesimgrid.com/announcements/grid-rating-arrives-at-simgrid/
- Investigación previa doX: `docs/research/dox-lmu-plugin-identity-and-auth-flow.md`
- Decisión previa de producto: `docs/adr/0001-close-lmu-pilot-ratings.md`
