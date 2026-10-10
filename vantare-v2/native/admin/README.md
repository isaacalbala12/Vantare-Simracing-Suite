# Vantare Admin · miniapp privada (#1456)

Binario aparte del Hub, únicamente para el owner. No arranca núcleo, overlays,
licencias ni Testing Center. El backend `native-admin` comprueba owner en cada
petición y registra la auditoría; ocultar este ejecutable no concede seguridad.

Desde `native/`:

```powershell
cargo build -p vantare-admin --release --bin vantare-admin -j 2
./target/release/vantare-admin.exe
./target/release/vantare-admin.exe --demo --screen users
./target/release/vantare-admin.exe --demo --screen rollout
./target/release/vantare-admin.exe --demo --screen reports
```

`--demo` no hace red, no abre Account/Store y no modifica datos reales. Muestra
datos falsos identificados como DEMO, con una captura fixture falsa. Los cambios
simulados desaparecen al cerrar. `--help` describe los argumentos.

## Configuración pública de build

- `VANTARE_ADMIN_URL` (opcional): URL HTTPS exacta de `/functions/v1/native-admin` o
  `/v1/native-admin`. Sin variable usa el origen Supabase y `/functions/v1/native-admin`. No acepta credenciales, query ni fragmento.
- `VANTARE_SUPABASE_URL`: origen HTTPS de las capturas firmadas.
- Configuración OAuth ya existente de `vantare-services`:
  `VANTARE_CLERK_ISSUER`, `VANTARE_CLERK_CLIENT_ID`, `VANTARE_CLERK_REDIRECT` y
  `VANTARE_BUILD_CHANNEL`. Son valores públicos compilados, no secretos.
  Deben coincidir con los del Hub que guardó la sesión existente.

Reutiliza `Account`, descubrimiento OAuth, PKCE, callback, refresh y `Store` de
`vantare-services`. El acceso de Escritorio usa una raíz aislada y no requiere
cerrar el Hub. Si ejecutas el binario directamente sin configurar raíz, comparte
el almacén por defecto con el Hub: cierra el Hub en ese caso. No copia tokens ni
implementa otro flujo OAuth. Cerrar sesión no modifica roles ni concesiones.

## Contrato de cliente (v1)

POST con `Authorization: Bearer <OAuth>` y JSON `version: 1`, `action` y los
campos del contrato `contrato-admin.md` §2. Sin `apikey`. No hay llamadas directas
a tablas ni secretos Clerk/Supabase en el cliente.

Claves del servidor `supabase/functions/native-admin` y su migración:

| Acción | Datos dentro de `{version:1, ok:true, ...}` |
| --- | --- |
| `search_accounts` | `accounts: User[]` |
| `get_account` | `account: User` |
| `get_rollout` | `rollout: [{module, enabled_for_all}]` (exactamente cuatro) |
| `list_reports` | `reports: Report[]`, `next_cursor: string \| null` |
| `get_report` | `report` con `payload` y `screenshots: [{url, ...}]` firmadas |
| mutaciones | Sin datos adicionales; después se relee el detalle/rollout |

Usuarios carga al abrir la primera página de cuentas ya mapeadas a la instancia
Clerk configurada, por alta descendente. `search_accounts` acepta `query: ""`,
`limit` ≤50 y cursor UUID opcional; devuelve `next_cursor` null al terminar.
«Siguiente página» avanza. Con texto se filtra el directorio por nombre/correo
(hasta 50 coincidencias); limpiar el buscador vuelve al inicio.

El filtro local responde al teclear y la consulta remota espera 300 ms sin
cambios. Mientras llega la respuesta muestra «Buscando cuentas…». Las lecturas
confirmadas de cuentas, módulos y páginas se guardan hasta 30 s en memoria y se
refrescan en segundo plano cuando se consultan desde caché;
«Actualizar» fuerza una lectura remota. La caché se borra al cerrar sesión,
perder autorización o escribir; nunca se usa para ejecutar mutaciones.
Al abrir Usuarios se precargan módulos; al abrir Módulos se precargan reportes.
La red sigue fuera de GPUI y ambos sondeos se detienen en reposo.

El acceso de Escritorio activa `RUST_LOG=vantare_admin=info`: tiempos sanitizados
en `data/Vantare/native/services/admin-timings.log`, sin consultas, datos de cuenta,
tokens ni URLs. `vantare_admin=trace` añade duración de construcción de la vista y
espera hasta el siguiente frame GPUI (no mide presentación física DWM/GPU).
`--diagnose-owner`, con Admin cerrada y su raíz aislada configurada, prueba lecturas
reales de páginas y búsqueda por el nombre/correo de la propia cuenta: solo imprime
tiempos, recuentos y booleanos. No modifica roles, módulos ni reportes.

`User`: `account_id`, `email`, `name`, `created_at` (ISO), `last_seen_at`
(ISO o null), `roles`, `modules`, `reports_count`.
Listado de reportes: `report_id`, `email`, `module`, `app_version`, campos de texto,
`created_at` (ISO), `status`, `has_screenshots`. El detalle devuelve los campos de texto dentro de `payload` y objetos de capturas. Correos/nombres pueden ser null.
Módulos de acceso: `vantare.module.strategy`, `vantare.module.engineer`, `vantare.module.analysis`, `vantare.module.calendar`.
Estados existentes: `draft`, `submitted`, `validated`, `duplicate_linked`,
`incomplete`, `closed` (`20260802130100_testing_center_core.sql`).

No adivina variantes del JSON: si el backend no coincide, muestra error de
protocolo. 401 exige login; 403 deniega acceso y limpia datos privados; 429/5xx
declaran desconexión. Un error de escritura puede tener resultado incierto:
actualiza los datos antes de repetir. No hay reintentos automáticos de mutaciones.

HTTPS obligatorio, timeout global de 8 s, redirects desactivados, JSON ≤512 KiB.
Capturas: solo URLs firmadas del origen Supabase configurado y ruta del bucket
`testing-center-evidence`, ≤10 MiB, máximo tres, PNG/JPEG, sin bearer ni apikey.
Se descargan fuera del hilo GPUI y se muestran dentro de la app; solo memoria.
Pulsa una captura (o Enter/Espacio al enfocarla) para ampliarla; «Volver al
reporte» cierra el visor sin abrir aplicaciones externas.
La decodificación también está acotada a 4096×4096 y 64 MiB; una imagen inválida
no impide consultar el texto del reporte y muestra un error de captura.
HTTP loopback está permitido únicamente en los tests de esta crate.

## Empaquetado público (#1454)

`admin` es miembro del workspace para los gates, pero **no** miembro por defecto.
El publicador debe usar una lista explícita de binarios públicos y excluir
`vantare-admin.exe`; nunca copiar `target/release/*.exe`. La compilación privada
anterior produce un ejecutable para entregar a Isaac por separado. Esta tarea no
cambia scripts del worker #1454 ni incluye Admin en un instalador.
Si el publicador construye todo el workspace, puede usar
`cargo build --workspace --exclude vantare-admin --release -j 2`; la lista de
archivos del instalador sigue siendo explícita para no recoger binarios viejos.

## Verificación y límites

```powershell
cargo check --workspace --all-targets -j 2
cargo nextest run --workspace --build-jobs 2 -j 2 -E 'package(vantare-admin)'
```

Tests con servidor HTTP real local: acciones, bearer, 401, 403, errores, límites,
URLs y descarga sin credenciales. Estado puro: confirmación/cancelación, guardando,
error sin cambios optimistas, relectura tras ACK, limpieza al denegar acceso.
UI: buscar usuario y seleccionarlo; confirmar/cancelar Tester y módulos; cambiar
rollout con aviso global; filtrar reportes, abrir detalle/capturas y cambiar estado.

Capturas físicas demo a 1280×800: `./admin/capture-demo.ps1` (binario debug ya
compilado). Espera la reserva de pantalla y toma `Global\VantareParityCapture`.
Lee/aplica primero `C:/tmp/fase2/notas-1456.md`; si existe, pasa su SHA256 en
`-ReviewedNotesHash`. Conserva cada primera captura como `primera-<pantalla>.png`.
No existe referencia Wails de esta miniapp nueva: se revisa estructura y
legibilidad sobre Orbit; no se declara paridad por porcentaje.

Cliente contrastado con el código desplegado. Pendientes de prueba contra producción: login owner real, auditoría, caducidad/renovación de URLs y permisos reales.
Demo y servidor local no demuestran eso. Ante una captura caducada vuelve a
seleccionar el reporte para obtener URLs nuevas. Solo paginación hacia delante
en reportes; búsquedas de usuarios limitadas a 50, afinar query si hay más.
No hay borrado de cuentas/datos ni edición del rol owner. Sin Notion en este
encargo por indicación de Isaac: seguimiento operativo pendiente de reconciliar
por el orquestador en la tarea existente, sin duplicarla.

El kit Orbit se reutiliza desde la biblioteca Hub existente; no se extraen ni
duplican sus controles. Las dependencias ya estaban resueltas en el workspace;
no se añade otro motor gráfico ni librería HTTP.

## Compatibilidad beta (#1456, 2026-10-05)

La búsqueda requiere un correo/nombre no vacío (máximo 200 bytes); al abrir
Usuarios se espera a la búsqueda, sin petición vacía. Los módulos mostrados son
accesos efectivos, incluyendo rol y rollout. Conceder/revocar modifica solo la
concesión individual: una revocación puede mantener el acceso por otra vía.

## Instalar como app privada en Windows (#1456)

Después de compilar Admin con la configuración pública real, ejecuta una vez:

```powershell
./admin/instalar-escritorio.ps1
```

Copia el ejecutable, sus DLL presentes y el icono a `%LOCALAPPDATA%/Vantare Admin`.
Crea «Vantare Admin» en el Escritorio y menú Inicio. Isaac abre ese acceso con
doble clic, sin escribir comandos ni ver consola. El lanzador oculto crea el
proceso con `CREATE_NO_WINDOW`; GPUI conserva su ventana normal. La sesión vive
en `data/Vantare/native/services` dentro de esa instalación, separada de la beta.
Reinstalar actualiza binario/icono/accesos y conserva la sesión. Cierra Admin
antes de actualizar; no afecta al Hub, núcleo ni overlays. Es instalación privada,
no se incorpora al instalador público ni configura un servicio o tarea residente.
