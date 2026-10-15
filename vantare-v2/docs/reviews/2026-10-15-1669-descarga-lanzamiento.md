# VANTA-90 · #1669 · descarga del lanzamiento

Verificado el 15-oct-2026, aproximadamente 22:56–23:04 Europe/Madrid.
Encargo: Review, sin cambiar producto, publicar releases ni desplegar.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1669.
Proyecto GitHub Vantare, `area:launcher`, sin milestone asignado. Plane VANTA-90.
Evidencia local: `C:/VantareServer/evidence/descarga-1669/RESULTADOS.md` y logs vecinos.

## Veredicto: NO FUNCIONA el recorrido web → instalador de lanzamiento

Con las tres ramas examinadas, el 26-oct a las 19:00 el botón no descargará un
instalador. Cambia correctamente la página servida, pero los botones activos
apuntan a la propia sección `#descarga`. Además, falta la release en el destino
público aprobado. Esto no se arregla esperando a que termine la cuenta atrás.

El instalador público anterior **0.0.975 sí instala, abre el Hub, reinstala y
desinstala en este servidor**. Es una prerelease con configuración de desarrollo;
no acredita el instalador elegido para el lanzamiento ni Windows limpio.

## Flujo de la web y reloj

Repositorio `isaacalbala12/vantare-simracing-suite-web`, instantáneas contrastadas
con `git ls-remote` de GitHub y leídas en el Mac:

- `master`: `d9f040ae584e8db52caf13ccc713da6c8d589f36`.
- `vantareapp/web-compra`: `6155d14ea2dc1a2a714db7158fc3e48ab940d398`.
- `vantareapp/web-seo-base`: `3898e372e463cf0ba1ea934b0e1e32be903768d3`.

`worker.mjs` selecciona `public/_launch/{before,during,after}/{idioma}/index.html`
al pedir `/`, `/en/`, `/it/` o `/pt/`. Usa `Date.now()` del Worker, con límites
`2026-10-26T19:00:00+01:00` y `2026-11-26T19:00:00+01:00`: 18:00 UTC en ambos
casos. Madrid ya estará en horario de invierno. Compra extrae la función a
`launch-clock.mjs`, manteniendo los límites. No hay despliegue manual al llegar
la hora si ese Worker y sus páginas ya están desplegados.

`public/r16.js` usa el reloj del cliente para la cuenta atrás y recarga al detectar
un estado distinto del HTML. El Worker conserva la autoridad sobre lo servido.
Un reloj de cliente incorrecto puede provocar recargas repetidas; no habilita una
descarga anticipada. La respuesta exige revalidación (`max-age=0, must-revalidate`).
Las rutas privadas `/_launch/*` devuelven 404; no son una previsualización pública.

Se analizaron las 36 páginas generadas: tres ramas × tres estados × cuatro idiomas.
Los tres enlaces principales, navegación, hero y `dlLink`, tienen este resultado:

- Antes: `https://discord.gg/wWjD7CPe74`, con `aria-disabled=true`.
- Durante: `#descarga`, con `aria-disabled=false`; el botón final vuelve a su sección.
- Después: exactamente el mismo bucle `#descarga`, sin URL de instalador.

Los templates `src/site/r16-{during,after}.html` llevan `id="dlLink"` antes de
`href="#descarga"`. La sustitución de `tools/build_r16.py` busca el orden inverso
`href="#descarga" id="dlLink"`; sí coincide en before. Ninguna rama conecta el
botón final con un `.exe`. El JS tampoco sustituye ese destino.
No se debe deducir el destino solo del generador: se verificó el HTML generado.

HTTP real, sin cookies ni autorización de GitHub:

- `https://vantare.app`: HEAD/GET 200, HTML, cabecera `X-Vantare-Launch-State: before`;
  los enlaces observados coinciden con before. DNS/TLS funcionan hoy.
- Discord: HEAD siguiendo redirección 301 → 200; es una invitación, no un instalador.
- `https://vantare.app/_launch/during/es/`: HEAD 404, conforme al Worker.
- `https://github.com/isaacalbala12/Vantare-Downloads/releases/latest/download/VantareSetup.exe`:
  HEAD 404. Es una sonda de disponibilidad, NO un enlace encontrado en la web.
- API de `Vantare-Downloads`: `[]`, cero releases. No existe todavía una URL
  definitiva aprobada y publicada para el botón. No usar `latest` para una prerelease.
- Instalador previo: `https://github.com/isaacalbala12/Vantare-Simracing-Suite/releases/download/native-beta-v0.0.975/VantareSetup.exe`:
  HEAD 302 → 200, 39.240.099 bytes; GET Range 302 → 206, solo 1.024 bytes,
  `Content-Range: bytes 0-1023/39240099`. Después se descargó entero para probarlo.

## Construcción, publicación, firma y actualizador

Base nativa auditada: `origin/nightly@ed66924c29299d78cb78a0125ecb5e2ab83ef049`.
`native/packaging/publish-beta.ps1` prepara Release offline/locked, versión y canal
`beta`; `candidate.ps1` construye el workspace sin admin, valida inventario y
empaqueta. NSIS produce `VantareSetup.exe`. El manifiesto de actualización se firma
con Ed25519 mediante `vantare-services`, con la semilla privada elegida por Isaac.
Solo imprime el comando de publicación; no publica. Publicación manual autorizada
en `isaacalbala12/Vantare-Downloads`, tag `native-beta-v<versión>`, Setup/ZIP/feed
y checksums según el script. La versión final y el SHA aún deben fijarse.

El feed nuevo lee las 100 releases más recientes de Downloads, admite prereleases,
excluye drafts y verifica firma, esquema, canal, versión, URL, tamaño y SHA. Elige
la mayor versión numérica. La activación por generaciones conserva datos y hace
rollback si el nuevo Hub no confirma arranque en 45 s. Cerrar/abrir desde el acceso
instalado es parte de la cadena; `--version` no demuestra este comportamiento.

La 0.0.975 instalada aún lee el repo de código. El contrato #1565 exige reinstalar
con el nuevo Setup para renovar el bootstrap hacia Downloads antes de privatizar.
No hay feed doble ni migración automática. Hoy ambos repos son públicos; la única
release nativa publicada es 0.0.975, en el repo de código. No confundirla con el
destino público nuevo, que sigue vacío.

`.github/workflows/release.yml` de nightly rechaza explícitamente el pipeline Wails
retirado. En `origin/master@1af75dab0e76f24922f5885d598ab2256b508dc6` todavía existe
el workflow antiguo Go/Wails, con tags `v*` y assets `vantare-amd64-installer.exe`.
No construye el instalador nativo. `releases/latest` del repo de código devuelve
la estable histórica Wails `v0.1.0.2`, del 29-jun: no es un atajo válido al lanzamiento.

Authenticode y firma del feed son distintos. Setup y los diez EXE examinados:
`NotSigned`. Packaging acepta el aviso SmartScreen para beta; el plan público
aplaza firma de código hasta que ingresos/usuarios la justifiquen. **No se inventa
un bloqueo por falta de certificado contrario a esa decisión.** SmartScreen real
desde navegador/MOTW en Windows limpio queda pendiente: ejecutar `/S` desde CLI
no lo atraviesa. Un futuro certificado tampoco demuestra por sí solo reputación.

#1591 / PR #1600 está OPEN/draft, no fusionado, HEAD
`95bff4956637db7748317a51db04bc8e02599d54`. Su entrega QA 0.0.978 no está en la ruta
`C:/tmp/1591-prueba-isaac/` de este servidor. Sus pruebas históricas y la aceptación
manual pendiente no se atribuyen a esta revisión. Isaac debe elegir si ese nuevo
instalador entra; mientras tanto, nightly todavía empaqueta NSIS.

## Prueba real de 0.0.975 en el servidor

Fuente declarada de la release: nightly `f49d71f4f1ab9d1a424d2bba18895ddcdf87b601`.
Setup SHA-256 medido y cotejado con sidecar:
`e0d1aafbbaf338b54709ed95c0dd6abf62ab352878dea24b770c8f7e114c61de`.
Los metadatos de release no son una atestación binaria independiente.

- Preflight: sin procesos Vantare, sin registro de instalación y raíz nueva.
  Instalación real `/S /D=C:\VantareServer\evidence\descarga-1669\installed-0.0.975`:
  exit 0, versión/registro/accesos correctos. Se usó la identidad real del Setup
  únicamente tras comprobar que no existía instalación previa. Ya se retiró.
- Diez EXE con `--version`: 10/10 exit 0, `Vantare Native 0.0.975 (beta)`.
- Primer arranque por `beta.ps1`, la cadena del acceso instalado: Hub real,
  supervisor/core/overlays/services presentes y `hub-ready` real en 7 s.
  No demuestra login, licencia remota, juego ni render correcto.
- Reinstalar el mismo Setup: exit 0, generación nueva y dato QA con hash idéntico.
  Arranque tras reparación: marcador NUEVO en 7 s, no una simulación de readiness.
- Una sonda inicial de ese segundo arranque aceptó un marker antiguo a los 0 s:
  se conserva como **inválida** en `repair-boot-stale-probe-invalid.log`, sin contar
  como PASS. Se corrigió el harness para exigir fecha posterior al arranque y se
  repitió; evidencia válida en `repair-boot-private-desktop.log`.
- Consulta real del feed antiguo: exit 0, estado `current`, «Estás al día», 0.0.975.
  No prueba actualización a otra versión: no hay una segunda release nativa publicada.
- Desinstalador real `/S`: exit 0; registro y ambos accesos retirados, sin state,
  cero EXE de producto restantes; dos copias del dato QA conservadas con sus hashes
  exactos. Cero procesos Vantare al terminar. Restos de datos/evidencia conservados.

Instalador silencioso con `WindowStyle Hidden`. Hub/runtime en desktop privado de
Windows, sin `SwitchDesktop`, ventanas movidas a x=-4000 con `SWP_NOACTIVATE`.
Monitor comprobado: 1920×1080 en (0,0). Se cerraron las ventanas propias al terminar.
No se tomó ninguna captura, de acuerdo con la cabecera y #1655.

No es Windows limpio: es el servidor de desarrollo con sus prerrequisitos.
No se certifican SmartScreen, DPI, GPU ajena ni upgrade firmado A→B/rollback live.
No se recompiló: había un instalador publicado suficiente para la prueba parcial;
recompilar no fija el SHA/canal aprobados ni crea una release disponible al público.
La candidata definitiva requiere configuración pública de producción y sesión de
firma del feed de Isaac, sin leer ni copiar secretos en esta revisión. Cualquier
build futura irá por la cola, una a una, `VANTARE_CARGO_MIN_GB=0` y target propio.

## Bloqueos y dueños

1. **Worker web, orquestado por Isaac:** enlazar `dlLink` de during/after a la URL
   exacta del Setup elegido en Downloads; regenerar los cuatro idiomas y añadir
   regresión sobre el HTML generado y el destino HTTP. Mantener before informativo.
2. **Isaac + orquestador:** fijar versión, canal, SHA integrado y NSIS frente a #1591;
   validar la candidata con configuración de producción. La 0.0.975 dev no sustituye
   esa decisión. #1591 no debe presentarse como integrado.
3. **Isaac:** firma Ed25519 y autorización/publicación de los assets en Downloads.
   **Worker:** preparar/validar hashes, inventario, feed y origen sin publicar.
   Reinstalar clientes antiguos antes de privatizar el repo de código (#1565).
4. **Isaac/QA Windows:** VM u otro Windows limpio; descarga desde navegador,
   SmartScreen, instalación, Hub/login, desinstalación, upgrade real A→B con datos
   y rollback. La captura, si se necesita, debe usar la herramienta aprobada #1655.
5. **Isaac:** autorizar el despliegue web revisado antes del 26-oct; **worker web**:
   comprobar el dominio y el mismo enlace después. No hay bloqueo DNS/TLS observado.
   Certificado Authenticode: aplazado por decisión vigente; cambiarla corresponde a Isaac.

## Plan propuesto, día a día

- **15-oct:** revisión y pruebas anteriores terminadas; entregar bloqueos, evidencia y Plane Por revisar.
- **16-oct — worker web:** corregir enlaces y regresión de los 36 HTML; review del diff, sin desplegar.
- **17-oct — Isaac/orquestador:** elegir SHA/versión/canal y decidir #1591; cerrar dependencias de instalador.
- **18-oct — worker Windows + Isaac:** preparar Release con config productiva validada; Isaac firma feed; verificar hashes.
- **19-oct — QA Windows:** instalación desde cero, primer Hub/login y desinstalación en VM limpia; registrar fallos.
- **20-oct — QA/worker:** reinstalar desde 0.0.975 con datos, verificar renovación de bootstrap a Downloads.
- **21-oct — QA/worker + Isaac:** probar feed firmado A→B, reinicio, conservación de datos y rollback con dos candidatas aprobadas.
- **22-oct — worker:** corregir incidencias dentro de sus issues; repetir solo gates y escenarios afectados; revisión independiente.
- **23-oct — Isaac:** decidir aceptación y promociones necesarias; autorizar publicación y despliegue cuando sus pruebas estén cerradas.
- **24-oct — Isaac/QA:** publicación y despliegue autorizados; descarga anónima desde vantare.app y hashes exactos del Setup; comprobar aviso SmartScreen.
- **25-oct — QA/worker:** ensayo con reloj inyectado 18:59:59/19:00:00 Madrid y límite del 26-nov; cuatro idiomas, caché y URL final; congelar candidato.
- **26-oct — Isaac/QA:** 18:30 comprobar disponibilidad/TLS/hash; 18:59 confirmar before; 19:00 recargar y descargar desde dominio público;
  19:05 instalar ese mismo fichero en Windows limpio y verificar versión/Hub; cerrar solo con resultados reales.

Si el 25-oct faltan URL pública, candidato validado o upgrade, el veredicto sigue
siendo NO preparado; no convertir un test de reloj o un mock en aceptación.

## Evidencia y alcance de los checks

`web-branches-tests.log`: tests existentes de lanzamiento, **5/5 por rama, 15/15**,
y destinos extraídos de las 36 páginas. Esos tests hoy no comprueban la descarga:
su verde convive con el bloqueo de enlaces. `web-live-head.txt`, `web-live.html`,
`downloads-releases.json`, `native-releases.json`, `*-head.txt` y
`native-beta-range-headers.txt`: disponibilidad real. Cabeceras guardadas sin
cookies ni URLs temporales de redirección.

`installer-preflight.json`, `install.log`, `versions.json`,
`first-boot-private-desktop.log`, `repair.log`, `repair-boot-private-desktop.log`,
`update-check.log`, `uninstall.log`, `monitores.json` y `test-*.ps1`: pruebas reales
y harness reproducible. El harness aborta si hay instalación previa; no ejecutarlo
contra datos de usuario. Los binarios originales quedan en `native-0.0.975/`.

`python tools/quality/vantare_quality.py check`: PASS, 456 huellas.
`git diff --check`: PASS. Sin cambios de producto; fmt/check/Clippy/Nextest,
lifecycle y telemetría omitidos porque no se modifica ni recompila Rust.
No hay tests Go/React. Sin dependencias nuevas, secretos leídos, capturas,
merge, promoción, publicación ni despliegue. Acciones externas limitadas a
descargas/consultas, instalación QA autorizada y seguimiento GitHub/Plane.

Rama de entrega: `vantareapp/isa-1669-descarga`, base nightly
`ed66924c29299d78cb78a0125ecb5e2ab83ef049`; informe y handoff, sin corrección de código.
SHA final, PR, push, CI y verificación del estado final se registran en #1669 y
`C:/tmp/buzon/isa-1669.md` después del commit. El canal alcanzado sigue siendo la
rama de revisión; ninguna release nueva se ha publicado.
