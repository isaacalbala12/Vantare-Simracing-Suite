//! Installing screen from the approved installer.
use super::*;
pub(super) fn render(view: &Installer, _window: &Window, _cx: &mut Context<Installer>) -> Div {
    let mut content = style::at(0., 0., 718., 394.);

    let title = match view.mode {
        Mode::Update => format!("Actualizando a la {}", view.info.version),
        Mode::Repair => "Reparando Vantare".into(),
        Mode::Remove => "Desinstalando Vantare".into(),
        _ => "Instalando Vantare".into(),
    };
    let fill = 398. * view.meter.shown() / 100.;
    content = content.child(heading(title)).child(
        style::at(280., 149., 398., 4.)
            .bg(rgb(0x1f_1f21))
            .rounded(px(2.))
            .overflow_hidden()
            .child(
                style::at(0., 0., fill, 4.)
                    .bg(linear_gradient(
                        90.,
                        linear_color_stop(rgb(0x9a_0606), 0.),
                        linear_color_stop(rgb(style::RED), 1.),
                    ))
                    .rounded(px(2.))
                    .overflow_hidden()
                    .child(sheen(fill)),
            ),
    );
    let names = if view.mode == Mode::Remove {
        vec![
            "Vantare cerrado",
            "Quitar archivos",
            "Accesos directos",
            "Registro de Windows",
        ]
    } else {
        vec![
            "Vantare cerrado",
            "Extraer el paquete",
            "Verificar el paquete",
            "Copiar archivos",
            "Accesos directos",
            "Registro de Windows",
        ]
    };
    let current = if view.mode == Mode::Remove {
        match view.step.as_str() {
            "copy" => 1,
            "shortcuts" => 2,
            "register" => 3,
            "done" => 4,
            _ => 0,
        }
    } else {
        view.active_step()
    };
    let phrases = if view.mode == Mode::Remove {
        vec![
            "Comprobando que Vantare está cerrado…",
            "Quitando archivos…",
            "Quitando accesos directos…",
            "Quitando el registro de Windows…",
        ]
    } else {
        vec![
            "Comprobando que Vantare está cerrado…",
            "Extrayendo el paquete…",
            "Verificando el paquete…",
            "Copiando archivos…",
            "Creando accesos directos…",
            "Registrando Vantare en Windows…",
        ]
    };
    content = content
        .child(
            style::body(
                280.,
                163.,
                398.,
                18.,
                phrases.get(current).copied().unwrap_or("Hecho"),
                12.5,
                0xf5f5_f5ff,
            )
            .font_family("Installer Inter W500")
            .with_animation(
                ("phrase", current),
                style::eased(240, motion::ease_out),
                |phrase, t| phrase.opacity(t).left(px(280. + (1. - t) * 8.)),
            ),
        )
        .child(style::swatch(
            280.,
            195.,
            398.,
            1.,
            0.,
            rgba(0xffff_ff14).into(),
        ));
    checklist(content, names, current)
}

fn checklist(mut content: Div, names: Vec<&'static str>, current: usize) -> Div {
    for (i, label) in names.into_iter().enumerate() {
        #[allow(clippy::cast_precision_loss)]
        let y = 209. + i as f32 * 24.;
        let circle = style::at(280., y + 4., 14., 14.)
            .rounded_full()
            .border_1()
            .border_color(if i == current {
                rgb(style::RED)
            } else {
                rgba(0xffff_ff38)
            });
        if i < current {
            // A finished step pops in green; GPUI shows it settled under reduced motion.
            content = content.child(
                circle
                    .bg(rgb(0x34_d399))
                    .border_color(rgb(0x34_d399))
                    .child(style::icon(Icon::Check, 1., 1., 12., rgb(0x06_2b1e).into()))
                    .with_animation(
                        ("tick", i),
                        style::eased(320, motion::back_out),
                        move |circle, t| {
                            let side = 14. * (0.55 + 0.45 * t);
                            let inset = (14. - side) / 2.;
                            circle
                                .left(px(280. + inset))
                                .top(px(y + 4. + inset))
                                .size(px(side))
                                .opacity(t.clamp(0., 1.))
                        },
                    ),
            );
        } else {
            content = content.child(circle);
        }
        if i == current {
            content = content.child(
                style::swatch(284., y + 8., 6., 6., 3., rgb(style::RED).into()).with_animation(
                    ("pulse", i),
                    gpui::Animation::new(std::time::Duration::from_millis(1400))
                        .repeat()
                        .with_easing(gpui::pulsating_between(0.35, 1.)),
                    Styled::opacity,
                ),
            );
        }
        content = content.child(style::body(
            304.,
            y + 3.,
            374.,
            19.,
            label,
            12.5,
            match i.cmp(&current) {
                std::cmp::Ordering::Equal => 0xf5f5_f5ff,
                std::cmp::Ordering::Less => style::MUTED,
                std::cmp::Ordering::Greater => style::FAINT,
            },
        ));
    }
    content
}

/// Soft highlight sweeping the filled part so a long step still reads as alive.
/// Under reduced motion GPUI keeps it at its start, outside the bar.
fn sheen(fill: f32) -> impl IntoElement {
    let half = |x: f32, from: u32, to: u32| {
        style::at(x, 0., 36., 4.).bg(linear_gradient(
            90.,
            linear_color_stop(rgba(from), 0.),
            linear_color_stop(rgba(to), 1.),
        ))
    };
    style::at(-72., 0., 72., 4.)
        .child(half(0., 0xffff_ff00, 0xffff_ff59))
        .child(half(36., 0xffff_ff59, 0xffff_ff00))
        .with_animation(
            "sheen",
            gpui::Animation::new(std::time::Duration::from_millis(1600))
                .repeat()
                .with_easing(gpui::ease_in_out),
            move |light, t| light.left(px(-72. + t * (fill + 72.))),
        )
}
