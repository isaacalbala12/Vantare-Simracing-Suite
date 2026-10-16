//! Error screen from the approved installer.
use super::{
    Context, Div, Installer, ParentElement, Styled, Window, error_text, heading, lead, px, rgb,
    rgba, style,
};
pub(super) fn render(view: &Installer, window: &Window, _cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    let (title, description) = error_text(view.error);
    content = content
        .child(heading(title))
        .child(lead(description, window));
    if view.details {
        content = content.child(
            style::at(280., 209., 398., 133.)
                .bg(rgb(0x07_0707))
                .border_1()
                .border_color(rgba(0xffff_ff14))
                .rounded(px(8.))
                .child(style::mono(
                    12.,
                    10.,
                    374.,
                    20.,
                    format!("! Código {}", view.error),
                    10.5,
                    0xffd7_00ff,
                ))
                .child(style::mono(
                    12.,
                    32.,
                    374.,
                    90.,
                    format!(
                        "destino  {}\nregistro {}\n{}",
                        view.info.root.display(),
                        view.last_log
                            .as_deref()
                            .map_or_else(|| "—".into(), |p| p.display().to_string()),
                        view.diagnostic
                    ),
                    10.5,
                    style::MUTED,
                )),
        );
    }
    content
}
