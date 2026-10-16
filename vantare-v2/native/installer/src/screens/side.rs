//! Branding panel: source gradient, mark and centred message.
use super::*;
pub(super) fn render(view: &Installer) -> AnyElement {
    let panel = style::at(0., 0., 240., 458.)
        .border_r_1()
        .border_color(rgba(0xffff_ff14))
        .child(style::at(0., 0., 240., 192.36).bg(linear_gradient(
            180.,
            linear_color_stop(rgb(0x002b_0a0e), 0.),
            linear_color_stop(rgb(0x0014_0708), 1.),
        )))
        .child(style::at(0., 192.36, 240., 265.64).bg(linear_gradient(
            180.,
            linear_color_stop(rgb(0x0014_0708), 0.),
            linear_color_stop(rgb(0x000b_0b0b), 1.),
        )))
        .child(
            gpui::img(view.logo.clone())
                .absolute()
                .left(px(24.))
                .top(px(24.))
                .w(px(20.))
                .h(px(20.)),
        )
        .child(style::wordmark())
        .child(
            style::mono(
                24.,
                402.,
                192.,
                34.,
                format!("{} · beta\nPara tu usuario · sin admin", view.info.version),
                10.,
                style::FAINT,
            )
            .line_height(px(17.)),
        );
    let big = if view.screen == Screen::Installing {
        progress(view)
    } else {
        claim(view)
    };
    panel
        .child(big.with_animation(
            ("side", view.transition),
            gpui::Animation::new(std::time::Duration::from_millis(200)),
            |element, t| element.opacity(t).top(px((1. - t) * 6.)),
        ))
        .into_any_element()
}
fn progress(view: &Installer) -> Div {
    let small = match view.percent {
        100.. => 100.,
        10.. => 65.,
        _ => 33.,
    };
    let cap = if view.mode == Mode::Remove {
        "Quitando Vantare de este PC".into()
    } else {
        format!(
            "{} de {} MB",
            view.copied_bytes / 1_048_576,
            view.info.size.div_ceil(1_048_576)
        )
    };
    style::at(24., 0., 191., 380.)
        .child(
            style::mono(
                0.,
                182.25,
                172.,
                60.,
                view.percent.to_string(),
                54.,
                0xf5f5_f5ff,
            )
            .line_height(px(54.)),
        )
        .child(style::mono(small, 207.25, 40., 30., "%", 20., style::FAINT).line_height(px(20.)))
        .child(style::body(0., 246.25, 191., 40., cap, 12., style::MUTED).line_height(px(18.)))
}
fn claim(view: &Installer) -> Div {
    let (bright, muted, symbol, bright_lines, muted_lines) = match view.screen {
        Screen::Welcome => (
            "Vantare,".to_owned(),
            "creado por y\npara pilotos".to_owned(),
            None,
            1.,
            2.,
        ),
        Screen::Installed => (
            "Ya lo tienes.".to_owned(),
            format!(
                "Versión {}.",
                view.info.installed_version.as_deref().unwrap_or("—")
            ),
            None,
            1.,
            1.,
        ),
        Screen::Uninstall => (
            "¿Te vas?".to_owned(),
            "Tus datos se\nconservan.".to_owned(),
            None,
            1.,
            2.,
        ),
        Screen::Done => (
            "Listo para".to_owned(),
            "salir a pista.".to_owned(),
            Some(Icon::Check),
            1.,
            1.,
        ),
        Screen::Uninstalled => (
            "Hasta".to_owned(),
            "la próxima.".to_owned(),
            Some(Icon::Check),
            1.,
            1.,
        ),
        _ => (
            "Pausa.".to_owned(),
            if view.error == 2 {
                "Nada ha\ncambiado.".into()
            } else {
                "Tus datos se\nconservan.".into()
            },
            Some(Icon::Bang),
            1.,
            2.,
        ),
    };
    let bright_height = bright_lines * 29.16;
    let height = bright_height + muted_lines * 29.16 + if symbol.is_some() { 60. } else { 0. };
    let top = 224.5 - height / 2.;
    let text_top = top + if symbol.is_some() { 60. } else { 0. };
    let mut big = style::at(24., 0., 191., 380.);
    if let Some(icon) = symbol {
        let warn = view.screen == Screen::Error;
        big = big
            .child(style::swatch(
                0.,
                top,
                44.,
                44.,
                22.,
                rgba(if warn { 0xffd7_001f } else { 0x34d3_9924 }).into(),
            ))
            .child(style::icon(
                icon,
                12.,
                top + 12.,
                20.,
                rgb(if warn { 0x00ff_d700 } else { 0x0034_d399 }).into(),
            ));
    }
    big.child(
        style::display(0., text_top, 191., bright_height, bright, 27., 0xf5f5_f5ff)
            .line_height(px(29.16))
            .whitespace_nowrap(),
    )
    .child(
        style::display(
            0.,
            text_top + bright_height,
            191.,
            90.,
            muted,
            27.,
            style::FAINT,
        )
        .line_height(px(29.16))
        .whitespace_nowrap(),
    )
}
