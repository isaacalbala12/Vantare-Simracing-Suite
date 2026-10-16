//! Done screen from the approved installer.
use super::{Context, Div, Installer, Mode, ParentElement, Styled, Window, heading, lead, style};
pub(super) fn render(view: &Installer, window: &Window, _cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    content = content
        .child(heading(match view.mode {
            Mode::Update => "Vantare se ha actualizado",
            Mode::Repair => "Vantare está reparado",
            _ => "Vantare está instalado",
        }))
        .child(lead(
            "Ábrelo, elige tu simulador y tendrás los overlays en pista en un par de minutos.",
            window,
        ));
    for (i, (label, value)) in [
        ("Versión", format!("{} beta", view.info.version)),
        ("Carpeta", view.info.root.display().to_string()),
        (
            "Accesos",
            if view.info.desktop {
                "Menú Inicio y escritorio"
            } else {
                "Menú Inicio"
            }
            .into(),
        ),
        (
            "Con Windows",
            if view.info.autostart { "Sí" } else { "No" }.into(),
        ),
    ]
    .into_iter()
    .enumerate()
    {
        #[allow(clippy::cast_precision_loss)]
        let y = 199. + i as f32 * 26.;
        content = content
            .child(style::body(280., y, 96., 18., label, 12., style::FAINT))
            .child(style::mono(388., y, 290., 18., value, 11., style::MUTED).text_ellipsis());
    }
    content
}
