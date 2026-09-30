//! Resumen del Hub sobre el calendario y la observación IPC existentes; sin I/O propio.
use super::Calendar;
use crate::orbit;
use gpui::{IntoElement, div, prelude::*, px};
use vantare_ipc::Subscriber;

/// La shell suministra los botones de navegación y la última observación de fuente.
/// No consume fotos ni crea una segunda suscripción al núcleo.
pub fn render(
    calendar: &Calendar,
    subscriber: Option<&Subscriber>,
    last_live: Option<bool>,
    studio: impl IntoElement,
    workshop: impl IntoElement,
) -> gpui::Stateful<gpui::Div> {
    let now = chrono::Utc::now();
    let (starts, error) = calendar.upcoming(now);
    let source = match last_live {
        Some(true) => "Última foto: fuente Live en estado Live",
        Some(false) => "Última foto: fuera de Live (replay, espera, obsoleta o perdida)",
        None => "Sin foto observada del núcleo",
    };
    let core = subscriber.map_or_else(
        || "Sin suscripción al núcleo".into(),
        |s| {
            format!(
                "Suscripción IPC · {} mensajes válidos recibidos",
                s.activity()
            )
        },
    );
    div().id("home").flex().flex_col().gap(px(orbit::GUTTER / 2.0))
        .child(orbit::callout("Tu espacio de trabajo: prepara los overlays y consulta las próximas carreras de las series que sigues."))
        .child(div().flex().flex_wrap().gap(px(orbit::GUTTER / 2.0))
            .child(orbit::card("Próximas carreras · 24 h").flex_1().min_w(px(orbit::COLUMN_W))
                .child(calendar.agenda(now, &starts, 5)))
            .child(orbit::card("Núcleo y fuente").flex_1().min_w(px(orbit::COLUMN_W)).child(orbit::card_body()
                .child(orbit::setting_row("Núcleo", "Contador acumulado; no demuestra conexión ni frescura actuales.", orbit::text(core, 13.5, 600, orbit::INK_2)))
                .child(orbit::setting_row("Fuente", "Último estado observado por la shell; independiente de Workshop.", orbit::text(source, 13.5, 600, orbit::INK_2))))))
        .child(orbit::card("Tu espacio de overlays").child(orbit::card_body()
            .child(orbit::setting_row("Overlay Studio", "Edita el layout, contenido y apariencia de tus overlays.", studio))
            .child(orbit::setting_row("Workshop", "Revisa los widgets con las escenas locales disponibles.", workshop))))
        .when_some(error, |view, error| view.child(orbit::callout(error)))
        .when_some(calendar.error.clone(), |view, error| view.child(orbit::callout(error)))
}
