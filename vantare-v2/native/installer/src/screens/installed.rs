//! Installed screen from the approved installer.
use super::{
    Action, Context, Div, FluentBuilder, Installer, InteractiveElement, Mode, ParentElement,
    StatefulInteractiveElement, Styled, Window, card, heading, lead, px, rgb, rgba, style,
};
pub(super) fn render(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    content = content
        .child(heading("Vantare ya está instalado"))
        .child(lead(
            "Elijas lo que elijas, tus perfiles, layouts y cuenta no se tocan.",
            window,
        ));
    for (mode, action, y, title, description) in [
        (
            Mode::Update,
            Action::Update,
            177.,
            "Actualizar",
            "Instala la versión nueva encima.",
        ),
        (
            Mode::Repair,
            Action::Repair,
            245.,
            "Reparar",
            "Vuelve a copiar los archivos actuales.",
        ),
    ] {
        content = content.child(choice(
            view,
            window,
            cx,
            mode,
            action,
            y,
            title,
            description,
        ));
    }
    content
}

#[allow(clippy::too_many_arguments)] // Approved card geometry and its operation.
fn choice(
    view: &Installer,
    window: &Window,
    cx: &mut Context<Installer>,
    mode: Mode,
    action: Action,
    y: f32,
    title: &'static str,
    description: &'static str,
) -> impl gpui::IntoElement {
    let enabled = view.info.allows(mode);
    let selected = view.mode == mode;
    let focus = &view
        .focuses
        .iter()
        .find(|(a, _)| *a == action)
        .expect("fixed card")
        .1;
    let mut row = card(280., y, 398., 60.)
        .id(action.id())
        .border_color(if selected {
            rgba(0xff3b_3b73)
        } else {
            rgba(0xffff_ff14)
        })
        .bg(rgb(if selected { 0x16_1011 } else { 0x14_1415 }));
    if enabled {
        row = row
            .cursor_pointer()
            .track_focus(focus)
            .focusable()
            .hover(|s| s.border_color(rgba(0xffff_ff24)))
            .focus_visible(|s| s.border_2().border_color(rgb(style::RED)))
            .on_click(cx.listener(move |view, _, window, cx| view.action(action, window, cx)))
            .on_key_down(
                cx.listener(move |view, event: &gpui::KeyDownEvent, window, cx| {
                    if event.keystroke.key == "space" {
                        view.action(action, window, cx);
                        cx.stop_propagation();
                    }
                }),
            );
    } else {
        row = row.opacity(0.38);
    }
    row = row
        .child(
            style::at(14., 21., 16., 16.)
                .rounded_full()
                .border_1()
                .border_color(if selected {
                    rgb(style::RED)
                } else {
                    rgba(0xffff_ff38)
                })
                .when(selected, |d| {
                    d.child(style::swatch(3., 3., 8., 8., 4., rgb(style::RED).into()))
                }),
        )
        .child(
            style::body(44., 11., 120., 18., title, 13., 0xf5f5_f5ff)
                .font_family("Installer Inter W600"),
        )
        .child(style::body(
            44.,
            30.,
            280.,
            18.,
            description,
            12.,
            style::MUTED,
        ));
    if mode == Mode::Update {
        row = row.child(
            style::at(120., 13., 105., 16.)
                .rounded(px(4.))
                .bg(rgb(0x4a_0012))
                .child(
                    style::body(7., 1., 94., 14., "RECOMENDADO", 10., 0xffb3_b8ff)
                        .font_family("Installer Inter W700"),
                ),
        );
    }
    let previous = view.info.installed_version.as_deref().unwrap_or("—");
    let value = if mode == Mode::Update {
        format!("{previous} → {}", view.info.version)
    } else {
        previous.into()
    };
    let width = style::text_width(&value, "Space Mono", 11., window);
    row = row.child(style::mono(
        383. - width,
        21.,
        width,
        18.,
        value,
        11.,
        if selected { style::MUTED } else { style::FAINT },
    ));
    row
}
