//! Vantare pinta la escena de la vuelta rápida; los valores Live viven aquí.
use super::scene::Scene;
use crate::vantare::{
    Style, alpha,
    paint::{Face, WHITE, font},
};
use rune::{Align, Color, El, Live, el, text};
use std::sync::Arc;
use vantare_domain::fastest_lap::Kind;

pub(super) const WIDTH: f32 = 480.0;
pub(super) const HEIGHT: f32 = 104.0;

pub(super) struct Painter {
    style: Arc<Style>,
    opacity: Live<f32>,
    visual: Option<Scene>,
    view: El,
}

impl Painter {
    pub fn new(visual: Option<&Scene>) -> Self {
        let style = Style::compiled();
        let opacity = Live::new(visual.map_or(0.0, |scene| scene.opacity));
        Self {
            view: build_view(&style, visual, &opacity),
            opacity,
            visual: visual.cloned(),
            style,
        }
    }

    /// Un solo punto de decisión: la escena cambia (sin contar la opacidad) y
    /// se recompone; la opacidad entra por Live sin rehacer la vista.
    pub fn sync(&mut self, visual: Option<&Scene>) -> crate::widget::Update {
        let pixels = self.opacity.set(visual.map_or(0.0, |scene| scene.opacity));
        let build = changed(visual, self.visual.as_ref());
        if build {
            self.visual = visual.cloned();
            self.view = build_view(&self.style, self.visual.as_ref(), &self.opacity);
        }
        crate::widget::Update { build, pixels }
    }

    pub fn view(&self) -> El {
        self.view.clone()
    }
}

/// Compara escenas ignorando la opacidad; sin tipo espejo de la escena.
fn changed(new: Option<&Scene>, old: Option<&Scene>) -> bool {
    match (new, old) {
        (None, None) => false,
        (Some(new), Some(old)) => {
            new.kind != old.kind
                || new.title != old.title
                || new.class != old.class
                || new.time != old.time
                || new.driver != old.driver
                || new.caption != old.caption
                || new.improvement != old.improvement
                || new.lap != old.lap
                || new.sectors != old.sectors
        }
        _ => true,
    }
}

fn build_view(style: &Style, scene: Option<&Scene>, opacity: &Live<f32>) -> El {
    let root = el()
        .key("fastest-lap")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE);
    let Some(scene) = scene else {
        return root;
    };
    let baseline = style.fonts.display_baseline;
    let color = match scene.kind {
        Kind::Personal => style.colors.best_personal,
        Kind::Class => style.colors.purple,
    };
    let title_ink = font(style, Face::Display, 12.0, 16.0, 1.6, 600.0);
    let title_width = rune::text::measure(scene.title, &[], title_ink, None).0;
    let mut fading = el()
        .key("notice")
        .size(WIDTH, HEIGHT)
        .pin(Some(0.0), Some(0.0), None, None)
        .live_opacity(opacity)
        .child(panel(style))
        .child(band(color))
        .child(
            text(scene.title.to_owned())
                .key("title")
                .font(title_ink)
                .color(color)
                .size(title_width, 16.0)
                .pin(Some(16.0), Some(12.0 + baseline), None, None),
        );
    if let Some(class) = &scene.class {
        fading = fading.child(class_chip(style, class, 16.0 + title_width + 8.0, baseline));
    }
    fading = fading
        .child(
            text(scene.time.to_string())
                .key("time")
                .font(font(style, Face::Display, 40.0, 40.0, 0.5, 600.0))
                .color(time_ink())
                .size(300.0, 40.0)
                .pin(Some(16.0), Some(30.0 + baseline), None, None),
        )
        .child(
            text(scene.improvement.to_string())
                .key("improvement")
                .font(font(style, Face::Display, 22.0, 22.0, 0.0, 600.0))
                .color(color)
                .size(464.0, 22.0)
                .align(Align::End)
                .pin(Some(0.0), Some(12.0 + baseline), None, None),
        );
    if let Some(driver) = &scene.driver {
        fading = fading.child(
            text(driver.to_string())
                .key("driver")
                .font(font(
                    style,
                    Face::Body,
                    style.fonts.small,
                    16.0,
                    0.0,
                    style.fonts.regular_weight,
                ))
                .color(style.colors.header_em)
                .size(320.0, 16.0)
                .truncate()
                .pin(Some(16.0), Some(74.0), None, None),
        );
    }
    let mut steady = el()
        .key("steady")
        .size(WIDTH, HEIGHT)
        .pin(Some(0.0), Some(0.0), None, None)
        .child(
            text(scene.caption.to_owned())
                .key("caption")
                .font(font(style, Face::Mono, 10.0, 14.0, 0.0, 400.0))
                .color(style.colors.muted)
                .size(464.0, 14.0)
                .align(Align::End)
                .pin(Some(0.0), Some(32.0), None, None),
        )
        .child(
            text(scene.lap.to_string())
                .key("lap")
                .font(font(style, Face::Mono, 10.0, 14.0, 0.0, 400.0))
                .color(style.colors.muted)
                .size(464.0, 14.0)
                .align(Align::End)
                .pin(Some(0.0), Some(76.0), None, None),
        );
    for (index, state) in scene.sectors.iter().enumerate() {
        steady = steady.child(sector(style, index, *state, baseline));
    }
    root.child(fading).child(steady)
}

fn panel(style: &Style) -> El {
    let v = &style.styles.neo;
    let border = if v.border_accent > 0.0 {
        alpha(style.accents.red, v.border_accent)
    } else {
        v.border
    };
    el().key("panel")
        .size(WIDTH, HEIGHT)
        .radius(v.radius)
        .border(if border.a > 0.0 { 1.0 } else { 0.0 }, border)
        .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
        .shadow(
            v.shadow_y,
            v.shadow_blur,
            alpha(
                Color {
                    a: 1.0,
                    ..style.colors.shadow
                },
                v.shadow_alpha,
            ),
        )
}

fn band(color: Color) -> El {
    el().key("band")
        .size(280.0, 102.0)
        .radius(9.0)
        .pin(Some(1.0), Some(1.0), None, None)
        .linear_gradient(
            std::f32::consts::FRAC_PI_2,
            [(0.0, alpha(color, 0.26)), (1.0, alpha(color, 0.0))],
        )
}

fn class_chip(style: &Style, name: &str, x: f32, baseline: f32) -> El {
    let (label, text_width) = fitted(style, name);
    let width = text_width + 12.0;
    el().key("class")
        .size(width, 14.0)
        .radius(3.0)
        // Como GPUI: el color se busca con el nombre ya recortado.
        .fill(style.class(&label).dot)
        .pin(Some(x), Some(12.0), None, None)
        .child(
            text(label)
                .key("class-label")
                .font(font(style, Face::Display, 10.0, 14.0, 0.0, 600.0))
                .color(WHITE)
                .size(width - 12.0, 14.0)
                .pin(Some(6.0), Some(baseline), None, None),
        )
}

fn sector(style: &Style, index: usize, state: Option<bool>, baseline: f32) -> El {
    let fill = match state {
        Some(true) => style.colors.purple,
        Some(false) => style.colors.green,
        None => alpha(WHITE, 0.08),
    };
    let x = 371.0 + index as f32 * 33.0;
    el().key(format!("sector-{index}"))
        .size(30.0, 16.0)
        .radius(3.0)
        .fill(fill)
        .pin(Some(x), Some(55.0), None, None)
        .child(
            text(["S1", "S2", "S3"][index])
                .key(format!("sector-label-{index}"))
                .font(font(style, Face::Display, 10.0, 16.0, 1.0, 600.0))
                .color(style.colors.text)
                .size(22.0, 16.0)
                .pin(Some(8.0), Some(baseline), None, None),
        )
}

/// Recorte con puntos suspensivos, como el productivo, para el chip de clase.
fn fitted(style: &Style, value: &str) -> (String, f32) {
    let ink = font(style, Face::Display, 10.0, 14.0, 0.0, 600.0);
    let measure = |text: &str| rune::text::measure(text, &[], ink, None).0;
    if measure(value) <= 92.0 + 0.01 {
        return (value.to_owned(), measure(value));
    }
    let chars: Vec<char> = value.chars().collect();
    for keep in (0..chars.len()).rev() {
        let candidate: String = chars[..keep].iter().collect::<String>() + "…";
        if measure(&candidate) <= 92.0 + 0.01 {
            return (candidate.clone(), measure(&candidate));
        }
    }
    (String::new(), 0.0)
}

fn time_ink() -> Color {
    rune::color::hex("#faf7f7").expect("canonical fastest-lap time ink")
}
