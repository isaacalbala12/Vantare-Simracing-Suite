//! Uninstall screen from the approved installer.
use super::{
    Context, Div, Installer, ParentElement, Styled, Window, card, heading, lead, px, style,
    wrap_path,
};
pub(super) fn render(view: &Installer, window: &Window, _cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    content = content
        .child(heading("¿Desinstalar Vantare?"))
        .child(lead(
            "Se quitan la app, los accesos directos y el registro de Windows.",
            window,
        ))
        .child(
            card(280., 197., 398., 108.)
                .child(
                    style::body(
                        16.,
                        14.,
                        364.,
                        20.,
                        "Tus datos se conservan en",
                        13.,
                        0xf5f5_f5ff,
                    )
                    .font_family("Installer Inter W600"),
                )
                .child(
                    style::mono(
                        16.,
                        40.,
                        364.,
                        58.,
                        wrap_path(&view.info.data_path.display().to_string()),
                        10.5,
                        style::MUTED,
                    )
                    .line_height(px(17.)),
                ),
        );
    content
}
