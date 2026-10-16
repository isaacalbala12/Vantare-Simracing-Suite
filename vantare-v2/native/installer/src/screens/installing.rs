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
    content = content.child(heading(title)).child(
        style::at(280., 149., 398., 4.)
            .bg(rgb(0x1f_1f21))
            .rounded(px(2.))
            .overflow_hidden()
            .child(
                style::at(0., 0., 398. * f32::from(view.percent) / 100., 4.)
                    .bg(linear_gradient(
                        90.,
                        linear_color_stop(rgb(0x9a_0606), 0.),
                        linear_color_stop(rgb(style::RED), 1.),
                    ))
                    .rounded(px(2.)),
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
            .font_family("Installer Inter W500"),
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
        content = content.child(if i < current {
            circle
                .bg(rgb(0x34_d399))
                .border_color(rgb(0x34_d399))
                .child(style::icon(Icon::Check, 1., 1., 12., rgb(0x06_2b1e).into()))
        } else {
            circle
        });
        if i == current {
            content = content.child(
                style::swatch(284., y + 8., 6., 6., 3., rgb(style::RED).into()).with_animation(
                    ("pulse", i),
                    gpui::Animation::new(std::time::Duration::from_secs(1)).repeat(),
                    |d, t| d.opacity(1. - 0.7 * (std::f32::consts::PI * t).sin().abs()),
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
