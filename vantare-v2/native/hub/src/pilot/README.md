# Perfil del piloto (#1612)

Ajustes → **Cuenta** muestra el perfil privado del piloto: foto con recorte
circular, nombre público, descripción corta, país, simuladores y coche/equipo
favoritos, con una tarjeta «Así te ves» y un acceso a la sección Cuenta
(sesión, plan y dispositivos, que no cambian aquí).

`pilot.rs` contiene `Draft`, catálogos, límites de texto y `Crop`.
`view.rs` contiene `PilotEditor`, que compone Orbit y emite `PilotEvent`.
No lee disco, red ni sesión.

## Contrato con servicios (pendiente de conectar)

| Editor → propietario | Qué hace el propietario |
| --- | --- |
| `Save(Draft)` | Copia los campos en `PilotProfile` (conserva `photo` y `extensions`), guarda y sincroniza; después llama a `mark_saved(draft)` o a `set_status(Some(error))`. |
| `ChoosePhoto` | Abre el selector, valida JPEG/PNG ≤ 5 MiB y ≤ 4096 px, decodifica y llama a `begin_crop(imagen, ancho, alto)`; si la rechaza, `set_status`. |
| `ApplyCrop(Crop)` | Recorta la original, genera el JPEG 256×256 y llama a `set_photo(Some(imagen))`. |
| `RemovePhoto` | Borra la foto y llama a `set_photo(None)`. |
| `OpenAccount` | Ya conectado: navega a la sección Cuenta. |

Al abrir Ajustes o tras sincronizar, el propietario llama a `load(draft)` y a
`set_photo`. Hoy `settings::State::pilot_editor` crea el editor vacío y
responde a todo salvo `OpenAccount` con «El guardado del perfil aún no está
conectado»: no simula guardados.

`Crop` es normalizado: `x`, `y` son la esquina en fracción del ancho y del alto;
`side` es el lado en fracción del lado corto (cuadrado en píxeles).

Los límites `NAME_MAX` (32), `DESCRIPTION_MAX` (160) y `FAVORITE_MAX` (48)
son una propuesta de UI: si el modelo fija otros, se cambian aquí.

## Bandera

`vantare_ui::pilot_flag` pinta banderas de franjas en widgets (`paint`) y el
Hub las reutiliza en `view::flag`. Los países sin franjas (Reino Unido, Brasil,
Japón…) devuelven `None` y se muestra el código ISO.
