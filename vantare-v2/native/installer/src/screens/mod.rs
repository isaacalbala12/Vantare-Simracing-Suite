//! Fixed geometry of the approved installer; operation data comes from Installer.
mod done;
mod error;
mod footer;
mod installed;
mod installing;
mod uninstall;
mod uninstalled;
mod welcome;
use crate::{
    controls::{self, Kind},
    model::{Mode, Screen, error_text},
    motion,
    style::{self, Icon},
    view::{Action, Installer},
};
use gpui::{
    AnimationExt, AnyElement, Context, Div, IntoElement, Window, div, linear_color_stop,
    linear_gradient, prelude::*, px, rgb, rgba,
};

fn card(x: f32, y: f32, w: f32, h: f32) -> Div {
    style::at(x, y, w, h)
        .bg(rgb(0x14_1415))
        .border_1()
        .border_color(rgba(0xffff_ff14))
        .rounded(px(10.))
}
fn heading(value: impl Into<gpui::SharedString>) -> Div {
    style::display(280., 96., 398., 62., value, 28., 0xf5f5_f5ff).text_ellipsis()
}
fn lead(value: impl Into<gpui::SharedString>, window: &Window) -> Div {
    // GPUI's approximate wrapper can break earlier than the full shaped line.
    // Use measured words so the approved browser and DirectWrite keep the same lines.
    let value: gpui::SharedString = value.into();
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in value.split_whitespace() {
        let candidate = if line.is_empty() {
            word.to_owned()
        } else {
            format!("{line} {word}")
        };
        if !line.is_empty()
            && style::text_width(&candidate, "Installer Inter W400", 13.5, window) > 398.
        {
            lines.push(std::mem::take(&mut line));
            word.clone_into(&mut line);
        } else {
            line = candidate;
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    style::body(280., 135., 398., 63., lines.join("\n"), 13.5, style::MUTED)
        .line_height(px(20.925))
        .whitespace_nowrap()
}
fn step_index(view: &Installer) -> usize {
    match view.screen {
        Screen::Welcome | Screen::Installed | Screen::Uninstall => 0,
        Screen::Done | Screen::Uninstalled => 2,
        _ => 1,
    }
}
fn mode_labels(mode: Mode) -> [&'static str; 3] {
    match mode {
        Mode::Update => ["Elegir", "Actualizar", "Listo"],
        Mode::Repair => ["Elegir", "Reparar", "Listo"],
        Mode::Remove => ["Confirmar", "Desinstalar", "Hecho"],
        _ => ["Preparar", "Instalar", "Listo"],
    }
}

fn steps(mut frame: Div, view: &Installer) -> Div {
    let index = step_index(view);
    let labels = mode_labels(view.mode);
    for (i, label) in labels.into_iter().enumerate() {
        #[allow(clippy::cast_precision_loss)]
        let x = 280. + i as f32 * (398. / 3. + 2.);
        let color = match i.cmp(&index) {
            std::cmp::Ordering::Less => 0x55_555a,
            std::cmp::Ordering::Equal if view.screen == Screen::Error => 0xff_d700,
            std::cmp::Ordering::Equal => style::RED,
            std::cmp::Ordering::Greater => 0x23_2325,
        };
        let width = (398. - 12.) / 3.;
        if i == index {
            // The current segment fills from the left on every new screen.
            frame = frame.child(style::swatch(x, 48., width, 3., 2., rgb(0x23_2325).into()));
            frame = frame.child(
                style::swatch(x, 48., width, 3., 2., rgb(color).into()).with_animation(
                    ("segment", view.transition),
                    style::eased(460, motion::ease_out),
                    move |bar, t| bar.w(px(width * t)),
                ),
            );
        } else {
            frame = frame.child(style::swatch(x, 48., width, 3., 2., rgb(color).into()));
        }
        #[allow(clippy::cast_precision_loss)]
        let lx = 280. + i as f32 * (398. / 3.);
        let label = style::body(
            lx,
            59.,
            398. / 3.,
            14.,
            label,
            11.,
            if i == index {
                0xf5f5_f5ff
            } else {
                style::FAINT
            },
        )
        .font_family("Installer Inter W500");
        frame = frame.child(match i {
            0 => label,
            1 => label.text_align(gpui::TextAlign::Center),
            _ => label.text_align(gpui::TextAlign::Right),
        });
    }
    frame
}

pub fn frame(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> AnyElement {
    let mut frame = div()
        .relative()
        .w(px(720.))
        .h(px(460.))
        .rounded(px(10.))
        .overflow_hidden()
        .bg(rgb(0x0c_0c0d))
        .border_1()
        .border_color(rgba(0xffff_ff24));
    frame = frame.child(side::render(view)).child(
        style::at(240., 394., 478., 64.)
            .bg(rgb(0x0f_0f10))
            .border_t_1()
            .border_color(rgba(0xffff_ff14)),
    );
    frame = steps(frame, view);
    let content = content(view, window, cx);
    // Forward screens arrive from the right, «Volver» from the left.
    let shift = if view.back { -14. } else { 14. };
    frame = frame.child(content.with_animation(
        ("screen", view.transition),
        style::eased(280, motion::ease_out),
        move |element, t| element.opacity(t).left(px((1. - t) * shift)),
    ));
    frame = frame.child(footer::render(view, window, cx));
    frame = frame
        .child(style::at(0., 0., 630., 36.).window_control_area(gpui::WindowControlArea::Drag));
    frame = frame.child(controls::button(
        view,
        Action::Minimize,
        "",
        630.,
        0.,
        44.,
        36.,
        Kind::Window,
        true,
        Some(Icon::Minimize),
        cx,
    ));
    frame
        .child(controls::button(
            view,
            Action::Close,
            "",
            674.,
            0.,
            44.,
            36.,
            Kind::Window,
            view.screen != Screen::Installing || view.can_cancel || view.finishing(),
            Some(Icon::Close),
            cx,
        ))
        .into_any_element()
}

mod side;

fn content(view: &Installer, window: &Window, cx: &mut Context<Installer>) -> Div {
    match view.screen {
        Screen::Welcome => welcome::render(view, window, cx),
        Screen::Installing => installing::render(view, window, cx),
        Screen::Done => done::render(view, window, cx),
        Screen::Error => error::render(view, window, cx),
        Screen::Installed => installed::render(view, window, cx),
        Screen::Uninstall => uninstall::render(view, window, cx),
        Screen::Uninstalled => uninstalled::render(view, window, cx),
    }
}
/// Fades an element in while it rises 6 px to `y`, starting `delay` into 480 ms.
fn rise(
    element: Div,
    id: impl Into<gpui::ElementId>,
    y: f32,
    delay: f32,
) -> gpui::AnimationElement<Div> {
    element.with_animation(
        id,
        style::eased(480, move |t| motion::ease_out(motion::delayed(t, delay))),
        move |element, t| element.opacity(t).top(px(y + (1. - t) * 6.)),
    )
}
fn wrap_path(value: &str) -> String {
    value
        .chars()
        .collect::<Vec<_>>()
        .chunks(54)
        .map(|chars| chars.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}
