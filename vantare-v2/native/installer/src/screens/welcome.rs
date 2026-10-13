//! Welcome screen from the approved installer.
use super::{
    Action, Context, Div, Installer, Kind, ParentElement, Styled, Window, card, controls, heading,
    lead, px, rgb, rgba, style,
};
pub(super) fn render(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    content = content.child(heading("Instalar Vantare")).child(lead(
        "Overlays, launcher y perfiles en una sola app. Tarda alrededor de un minuto.",
        window,
    ));
    options(content, view, window, cx)
}

fn options(
    mut content: Div,
    view: &Installer,
    window: &Window,
    cx: &mut Context<Installer>,
) -> Div {
    if view.options {
        content = content.child(card(280., 199., 398., 134.));
        for y in [243., 287.] {
            content = content.child(style::swatch(
                281.,
                y,
                396.,
                1.,
                0.,
                rgba(0xffff_ff14).into(),
            ));
        }
        content = content
            .child(
                style::body(294., 215., 80., 16., "Carpeta", 12.5, 0xf5f5_f5ff)
                    .font_family("Installer Inter W500"),
            )
            .child(
                style::at(376., 207., 216., 28.)
                    .bg(rgb(0x0a_0a0a))
                    .border_1()
                    .border_color(rgba(0xffff_ff14))
                    .rounded(px(6.))
                    .overflow_hidden()
                    .child(
                        style::mono(
                            9.,
                            4.,
                            197.,
                            18.,
                            view.info.root.display().to_string(),
                            10.5,
                            style::MUTED,
                        )
                        .text_ellipsis(),
                    ),
            )
            .child(controls::button(
                view,
                Action::Change,
                "Cambiar",
                600.,
                207.,
                64.,
                28.,
                Kind::Ghost,
                view.info.installed_version.is_none(),
                None,
                cx,
            ))
            .child(
                style::body(
                    294.,
                    259.,
                    250.,
                    16.,
                    "Acceso en el escritorio",
                    12.5,
                    0xf5f5_f5ff,
                )
                .font_family("Installer Inter W500"),
            )
            .child(controls::toggle(
                view,
                Action::Desktop,
                view.info.desktop,
                255.,
                cx,
            ))
            .child(
                style::body(
                    294.,
                    303.,
                    250.,
                    16.,
                    "Iniciar con Windows",
                    12.5,
                    0xf5f5_f5ff,
                )
                .font_family("Installer Inter W500"),
            )
            .child(controls::toggle(
                view,
                Action::Autostart,
                view.info.autostart,
                299.,
                cx,
            ));
    } else {
        content = destination(content, view, window);
    }
    content
}

fn destination(mut content: Div, view: &Installer, window: &Window) -> Div {
    let size = format!("{} MB", view.info.size.div_ceil(1_048_576));
    let size_width = style::text_width(&size, "Space Mono", 11., window);
    content = content.child(
        card(280., 199., 398., 60.)
            .child(style::body(
                14.,
                11.,
                240.,
                14.,
                "Se instalará en",
                11.,
                style::FAINT,
            ))
            .child(
                style::mono(
                    14.,
                    29.,
                    356. - size_width,
                    18.,
                    view.info.root.display().to_string(),
                    11.,
                    style::MUTED,
                )
                .text_ellipsis(),
            )
            .child(
                style::mono(
                    382. - size_width,
                    22.,
                    size_width,
                    18.,
                    size,
                    11.,
                    style::FAINT,
                )
                .text_align(gpui::TextAlign::Right),
            ),
    );
    content
}
