//! Uninstalled screen from the approved installer.
use super::{
    Context, Div, Installer, ParentElement, Styled, Window, card, heading, lead, px, style,
    wrap_path,
};
pub(super) fn render(view: &Installer, window: &Window, _cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    content = content
        .child(heading("Vantare se ha desinstalado"))
        .child(lead(
            "Tus datos siguen en este PC. Si vuelves a instalar, Vantare los recupera solo.",
            window,
        ))
        .child(
            card(280., 193., 398., 89.).child(
                style::mono(
                    12.,
                    12.,
                    374.,
                    70.,
                    format!(
                        "datos  {}",
                        wrap_path(&view.info.data_path.display().to_string())
                    ),
                    10.,
                    style::MUTED,
                )
                .line_height(px(18.)),
            ),
        );
    content
}
