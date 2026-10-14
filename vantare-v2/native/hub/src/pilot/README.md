# Perfil del piloto (#1612)

Ajustes → **Cuenta** muestra el perfil privado del piloto: foto con recorte
circular, nombre público, descripción corta, país, simuladores y coche/equipo
favoritos, con una tarjeta «Así te ves» y un acceso a la sección Cuenta
(sesión, plan y dispositivos, que no cambian aquí).

`pilot.rs` contiene `Draft`, catálogos, límites de texto y `Crop`.
`view.rs` contiene `PilotEditor`, que compone Orbit y emite `PilotEvent`.
No lee disco, red ni sesión.

## Contrato con servicios (#1612)

| Editor → propietario | Qué hace el propietario |
| --- | --- |
| `Save(Draft)` | Copia los campos en `PilotProfile` (conserva `photo` y `extensions`), guarda y sincroniza; después llama a `mark_saved(draft)` o a `set_status(Some(error))`. |
| `ChoosePhoto` | Abre el selector, valida JPEG/PNG ≤ 5 MiB y ≤ 4096 px, decodifica y llama a `begin_crop(imagen, ancho, alto)`; si la rechaza, `set_status`. |
| `ApplyCrop(Crop)` | Recorta la original, genera el JPEG 256×256 y llama a `set_photo(Some(imagen))`. |
| `RemovePhoto` | Borra la foto y llama a `set_photo(None)`. |
| `OpenAccount` | Ya conectado: navega a la sección Cuenta. |

El propietario `settings/pilot.rs` carga mediante el worker IPC existente, conserva
foto y campos futuros al guardar y muestra los errores reales. Services protege la
copia local con DPAPI y separa namespaces por issuer/subject; la cuenta local
permanece separada. Guardar y abrir con sesión intentan sincronizar mediante el
puente UUID ya verificado. Un fallo remoto conserva el perfil local y su marca
pendiente; CAS impide sobrescribir otro dispositivo. No se cambia el login.

El servicio conserva en el mismo blob protegido un UUID v4 `op_id`, el
documento/foto y la revisión CAS de la operación pendiente. Guardar B mientras
A tiene resultado incierto mantiene A intacto y B local; el reintento reenvía
A con la misma clave y contenido. El servidor devuelve su recibo original sin
reaplicar ni evaluar CAS de nuevo, incluso si otro dispositivo guardó después.
Solo tras confirmar A se crea la clave de B y se envía sobre esa revisión.
Después del último recibo se carga el perfil actual en la misma llamada si no
queda una edición pendiente; un recibo histórico no acredita frescura actual.
Un rechazo definitivo 22023 o un CAS obsoleto retira la operación de forma durable
y carga la revisión remota, conservando el borrador local. Reiniciar no recrea ni
envía ese intento: hay que corregir/revisar y volver a guardar. Fallos de transporte,
5xx ajenos al conflicto y éxitos ilegibles conservan la operación incierta.
Un CAS nuevo obsoleto mantiene el conflicto y la copia local. No se usa una
huella ni un SELECT para inferir confirmaciones. Los formatos locales anteriores
de QA preservan el pendiente; no recuperan confirmaciones antiguas sin op_id.

El selector valida JPEG/PNG ≤ 5 MiB y ≤ 4096 px fuera del hilo de UI. Solo el
JPEG de 256×256 (≤24 KiB) puede salir del PC; la original se conserva en memoria
hasta aplicar/descartar. El círculo lo pinta GPUI. Cambiar/quitar foto forma parte
del borrador y requiere Guardar; Descartar restaura la foto anterior.

`Crop` es normalizado: `x`, `y` son la esquina en fracción del ancho y del alto;
`side` es el lado en fracción del lado corto (cuadrado en píxeles).

Los límites `NAME_MAX` (32), `DESCRIPTION_MAX` (160) y `FAVORITE_MAX` (48)
son límites del formulario; el protocolo acepta 64/280/120 para conservar datos de lectores futuros.

## Bandera

`vantare_ui::pilot_flag` pinta banderas de franjas en widgets (`paint`) y el
Hub las reutiliza en `view::flag`. Los países sin franjas (Reino Unido, Brasil,
Japón…) devuelven `None` y se muestra el código ISO.
