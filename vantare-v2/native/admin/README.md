# Vantare · Gestión privada (#1627)

Miniapp GPUI aparte del Hub, solo para Owner. Personas, Creadores, Informes y
Módulos, con entrada OAuth, fichas y confirmaciones. Sigue `admin-r1.html`
aprobado por Isaac y las decisiones de `datos-necesarios.md` §9 (copia en
`~/orq/admin-miniapp/`). No arranca núcleo, overlays ni telemetría live. El
servidor comprueba Owner en cada petición; esconder el ejecutable no lo protege.

## Compilar y abrir

Desde `native/`, usar la cola descrita en su README en Windows. Excepción
explícita del encargo #1627 para este Mac:

```sh
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$HOME/target-1627r3" cargo build -p vantare-admin --locked
"$HOME/target-1627r3/debug/vantare-admin" --demo --screen users
"$HOME/target-1627r3/debug/vantare-admin" --demo --screen creators
"$HOME/target-1627r3/debug/vantare-admin" --demo --screen reports
"$HOME/target-1627r3/debug/vantare-admin" --demo --screen rollout
"$HOME/target-1627r3/debug/vantare-admin" --demo --screen login
```

`--demo` no hace red ni abre Store; datos falsos de `fixtures/r1.json`, importados
del diseño aprobado. Simulación solo en memoria. `--scene` permite carga, vacío,
error, Ana, Owner, Eva y confirmaciones (lista completa en `--help`). Capturas de
informes son fixture de QA, no pruebas de Storage real.

## Instalación privada

Mac, con el binario compilado:

```sh
sh admin/instalar-macos.sh "$HOME/target-1627r3/debug/vantare-admin"
# Tercer argumento opcional --desktop; conserva un acceso ajeno existente.
sh admin/instalar-macos.sh "$HOME/target-1627r3/debug/vantare-admin" "$HOME/Applications/Vantare Gestión.app" --desktop
```

En Windows se conserva `admin/instalar-escritorio.ps1 -Executable <binario>`:
copia DLL/icono y crea acceso en Escritorio/Inicio. La raíz explícita conserva
el almacén privado de la instalación anterior. En ambos sistemas el arranque
directo usa un subdirectorio `admin` separado del Hub; `VANTARE_ADMIN_DATA_ROOT`
permite otra ruta absoluta. No copia ni inspecciona tokens del Hub. Diagnóstico
y sesión usan esa misma raíz privada. Cerrar sesión borra los datos en memoria
y no cambia roles/grants.

## Configuración y contrato

Valores públicos compilados existentes: `VANTARE_ADMIN_URL` opcional (endpoint
HTTPS exacto), `VANTARE_SUPABASE_URL`, `VANTARE_CLERK_ISSUER`,
`VANTARE_CLERK_CLIENT_ID`, `VANTARE_CLERK_REDIRECT`, `VANTARE_BUILD_CHANNEL`.
Reutiliza Account/PKCE/callback/refresh/Store. Nunca secretos en el cliente.
POST bearer OAuth, `version:1` y JSON cerrado; contrato actualizado en
[README del servidor](../../../supabase/functions/native-admin/README.md).

Cada escritura pide confirmación y espera ACK y relectura; no hay cambios
optimistas ni reintento automático. El Owner no tiene botones de bloqueo/borrado,
y el servidor también lo protege. Borrar exige correo exacto normalizado en app
y servidor; **su ejecución permanece pendiente de la barrera #1622**. Un fallo
parcial de bloqueo obliga a actualizar/repetir para terminar la cancelación.
Crear códigos y bloquear solo funcionan con servidor sandbox en este candidato.

Personas: consulta inicial paginada (50), búsqueda remota tras 300 ms sin teclear,
filtros sobre página cargada y recuentos globales. Módulos muestra fuente efectiva
(plan, rol, rollout, individual), con cambio únicamente del acceso propio.
Informes: incluye Spam y nota obligatoria al aceptar/rechazar/marcar spam; aceptación antes de arreglado y versión obligatoria;
se siguen leyendo estados históricos. Capturas firmadas solo del origen/bucket
Supabase configurados, sin OAuth/apikey, acotadas a 10 MiB, 4096×4096 y 64 MiB.

Creadores: céntimos y tasas calculados en servidor. El candidato conserva el anual sin prorratear, pendiente de la decisión de Isaac; las dos lecturas y ejemplo están en el handoff comercial.
Ejemplo aprobado CARLOSGT: 3,92 € ganados − 0,96 € pagados = 2,96 € pendientes.
Historial incompleto se advierte y desactiva el pago. «Apuntar pago» solo registra
que se ha pagado el saldo disponible de meses cerrados, no envía dinero. Facturas
históricas tienen fecha de factura; registros legacy netos se identifican y no
se mezclan bajo una afirmación de total con impuestos.

Caché de lecturas 30 s, borrada al escribir, salir o perder autorización; nunca
se usa para ejecutar cambios. HTTPS, timeout 8 s, redirects desactivados, JSON
≤512 KiB. 401/403 limpian datos privados; el resto distingue error de red,
conflicto, correo incorrecto, acción incompleta y límite de peticiones.
Tiempos locales sanitizados opt-in `RUST_LOG=vantare_admin=info` (render solo
`trace`), 1 MiB y una copia. `--diagnose-owner` realiza lecturas reales: queda fuera
de esta QA sin SaaS real y requiere sesión privada y autorización correspondientes.

## Verificación Mac y revisión Windows

```sh
cargo fmt --all -- --check
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$HOME/target-1627r3" cargo clippy -p vantare-admin -p vantare-services --all-targets --locked -- -D warnings
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$HOME/target-1627r3" cargo nextest run -p vantare-admin -p vantare-services --locked --build-jobs 4 -j 1
RUST_TEST_THREADS=2 CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$HOME/target-1627r3" cargo test --workspace --test lifecycle --locked
```

Windows pendiente: compilar con configuración pública y cola del repo; repetir
fmt/Clippy/Nextest/lifecycle, instalar acceso privado, comprobar DPI/teclado/scroll,
navegación de las cuatro pantallas, login/cierre y sesión independiente del Hub.
`capture-demo.ps1` captura las cinco pantallas a 1280×800, respetando reserva de
pantalla. Comparar con r1, incluyendo vacío/carga/error, Owner, bloquear, correo
incorrecto/correcto, nuevo creador/pago y estados de informes. No se afirma
paridad de píxeles ni QA de Windows desde Mac. Evidencia: `~/evidence/1627/`.

## Distribución

Miembro del workspace pero no miembro por defecto. Se entrega por separado a
Isaac: excluir `vantare-admin` del instalador público y usar lista explícita de
binarios, nunca glob de `target/release`. Este encargo no publica ni modifica el
Hub, el instalador público o los canales. Dependencias existentes, sin nuevos
motores gráficos, clientes HTTP ni SDK.
