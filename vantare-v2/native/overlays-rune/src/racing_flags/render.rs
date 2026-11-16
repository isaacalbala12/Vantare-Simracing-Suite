//! Vantare pinta la tarjeta de banderas; todo es estático por escena.
use super::scene::Scene;
use crate::vantare::{
    Style, alpha,
    paint::{Face, WHITE, font},
};
use rune::{Color, El, Shape, TextStyle, canvas, el, text};
use std::sync::Arc;
use vantare_domain::FlagKind;

pub(super) const WIDTH: f32 = 340.0;
pub(super) const HEIGHT: f32 = 88.0;

pub(super) struct Painter {
    style: Arc<Style>,
    /// Escena normalizada (la bandera no cuenta en espera ni descalificado).
    visual: Option<Scene>,
}

impl Painter {
    pub fn new(visual: Option<&Scene>) -> Self {
        Self {
            style: Style::compiled(),
            visual: stable(visual),
        }
    }

    /// Un solo punto de decisión: se recompone cuando cambia la escena.
    pub fn sync(&mut self, scene: Option<&Scene>) -> crate::widget::Update {
        let normalized = stable(scene);
        let build = normalized != self.visual;
        if build {
            self.visual = normalized;
        }
        crate::widget::Update {
            build,
            pixels: false,
        }
    }

    pub fn view(&self) -> El {
        build_view(&self.style, self.visual.as_ref())
    }
}

/// Escena con la bandera normalizada cuando la tarjeta no la usa.
fn stable(scene: Option<&Scene>) -> Option<Scene> {
    scene.map(|scene| {
        let mut scene = scene.clone();
        if scene.quiet || scene.disqualified {
            scene.flag = None;
        }
        scene
    })
}

fn build_view(style: &Style, scene: Option<&Scene>) -> El {
    let root = el()
        .key("racing-flags")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE);
    let Some(scene) = scene else {
        return root;
    };
    let tone = tone(scene);
    let baseline = style.fonts.display_baseline;
    let mut card = el()
        .key("card")
        .size(WIDTH, HEIGHT)
        .pin(Some(0.0), Some(0.0), None, None)
        .child(panel(style));
    if !scene.quiet {
        card = card.child(band(tone));
    }
    card = card.child(swatch(scene, tone));
    let title_top = if scene.sectors_visible { 11.0 } else { 21.0 };
    let message_top = if scene.sectors_visible { 37.0 } else { 48.0 };
    let title_size = if scene.quiet { 16.0 } else { 20.0 };
    let title_font = font(style, Face::Display, title_size, 22.0, 1.4, 600.0);
    let (title, _) = fitted(&scene.title, 250.0, title_font);
    let message_font = font(
        style,
        Face::Body,
        12.0,
        16.0,
        0.0,
        style.fonts.regular_weight,
    );
    let (message, _) = fitted(&scene.message, 250.0, message_font);
    card = card
        .child(
            text(title)
                .key("title")
                .font(title_font)
                .color(ink(scene.text_color))
                .size(250.0, 22.0)
                .truncate()
                .pin(Some(76.0), Some(title_top + baseline), None, None),
        )
        .child(
            text(message)
                .key("message")
                .font(message_font)
                .color(ink(scene.text_color))
                .size(250.0, 16.0)
                .truncate()
                .pin(Some(76.0), Some(message_top), None, None),
        );
    if scene.sectors_visible {
        for (index, active) in scene.sectors.iter().enumerate() {
            card = card.child(chip(style, index, *active));
        }
    }
    root.child(card)
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
        .pin(Some(0.0), Some(0.0), None, None)
}

fn band(tone: Color) -> El {
    el().key("band")
        .size(250.0, 86.0)
        .radius(9.0)
        .pin(Some(1.0), Some(1.0), None, None)
        .linear_gradient(
            std::f32::consts::FRAC_PI_2,
            [(0.0, alpha(tone, 0.13)), (1.0, alpha(tone, 0.0))],
        )
}

/// El tono de la tarjeta: banda y placa. La sanción manda sobre la bandera.
fn tone(scene: &Scene) -> Color {
    if scene.waiting {
        return hex("#5a5052");
    }
    if scene.disqualified {
        return hex("#e14a54");
    }
    match scene.flag.as_ref() {
        Some(FlagKind::Yellow) => hex("#f5c518"),
        Some(FlagKind::Green) => hex("#22c55e"),
        Some(FlagKind::Red | FlagKind::Black) => hex("#e14a54"),
        Some(FlagKind::Blue) => hex("#4f8ef7"),
        Some(FlagKind::White | FlagKind::Checkered) => hex("#f2eeee"),
        _ => hex("#8e8587"),
    }
}

fn swatch_color(scene: &Scene, tone: Color) -> Color {
    if scene.quiet {
        alpha(WHITE, 0.08)
    } else if scene.disqualified || scene.flag.as_ref() == Some(&FlagKind::Black) {
        hex("#0b0b0b")
    } else {
        tone
    }
}

fn swatch(scene: &Scene, tone: Color) -> El {
    let fill = swatch_color(scene, tone);
    let mut node = el()
        .key("swatch")
        .size(48.0, 34.0)
        .radius(4.0)
        .fill(fill)
        .pin(Some(14.0), Some(27.0), None, None);
    if scene.quiet {
        node = node.child(
            el().key("quiet-inner")
                .size(46.0, 32.0)
                .radius(3.0)
                .fill(hex("#151213"))
                .pin(Some(1.0), Some(1.0), None, None),
        );
        if scene.waiting {
            node = node.child(
                el().key("waiting-dot")
                    .size(8.0, 8.0)
                    .radius(4.0)
                    .fill(alpha(hex("#8e8587"), 0.6))
                    .pin(Some(20.0), Some(13.0), None, None),
            );
        }
    } else if scene.flag.as_ref() == Some(&FlagKind::Blue) {
        let points = vec![[2.0, 29.0], [6.0, 33.0], [46.0, 5.0], [42.0, 1.0]];
        node = node.child(
            canvas(Shape::new().fill(points, alpha(WHITE, 0.75)))
                .key("blue-stripe")
                .size(48.0, 34.0)
                .pin(Some(0.0), Some(0.0), None, None),
        );
    } else if scene.flag.as_ref() == Some(&FlagKind::Checkered) {
        for row in 0..5 {
            for column in 0..6 {
                let color = if (row + column) % 2 == 0 {
                    hex("#111111")
                } else {
                    hex("#f2eeee")
                };
                node = node.child(
                    el().key(format!("checkered-{row}-{column}"))
                        .size(8.0, if row == 4 { 2.0 } else { 8.0 })
                        .fill(color)
                        .pin(
                            Some(column as f32 * 8.0),
                            Some(row as f32 * 8.0),
                            None,
                            None,
                        ),
                );
            }
        }
    }
    node
}

fn chip(style: &Style, index: usize, active: bool) -> El {
    let x = 76.0 + index as f32 * 35.0;
    el().key(format!("sector-{index}"))
        .size(32.0, 14.0)
        .radius(3.0)
        .fill(if active {
            hex("#f5c518")
        } else {
            alpha(WHITE, 0.06)
        })
        .pin(Some(x), Some(59.0), None, None)
        .child(
            text(["S1", "S2", "S3"][index])
                .key(format!("sector-label-{index}"))
                .font(font(style, Face::Display, 10.0, 14.0, 1.0, 600.0))
                .color(if active {
                    hex("#1a1205")
                } else {
                    hex("#8e8587")
                })
                .size(24.0, 14.0)
                .pin(Some(8.0), Some(style.fonts.display_baseline), None, None),
        )
}

/// Recorte con «…» como el productivo, para los textos de GPUI.
fn fitted(value: &str, max: f32, ink: TextStyle) -> (String, f32) {
    let measure = |text: &str| rune::text::measure(text, &[], ink, None).0;
    if measure(value) <= max + 0.01 {
        return (value.to_owned(), measure(value));
    }
    let chars: Vec<char> = value.chars().collect();
    for keep in (0..chars.len()).rev() {
        let candidate: String = chars[..keep].iter().collect::<String>() + "…";
        if measure(&candidate) <= max + 0.01 {
            return (candidate.clone(), measure(&candidate));
        }
    }
    (String::new(), 0.0)
}

fn ink(value: u32) -> Color {
    rune::color::hex(&format!("#{value:06x}")).unwrap_or(WHITE)
}

fn hex(value: &str) -> Color {
    rune::color::hex(value).unwrap_or(Color::TRANSPARENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(flag: Option<FlagKind>, disqualified: bool) -> Scene {
        Scene {
            waiting: false,
            quiet: flag.is_none() && !disqualified,
            disqualified,
            flag,
            title: Arc::from("BANDERA"),
            message: Arc::from("MENSAJE"),
            text_color: 0x00ec_e6e7,
            sectors_visible: false,
            sectors: [false; 3],
        }
    }

    #[test]
    fn a_disqualified_penalty_rules_the_tone_and_the_plate() {
        let green = card(Some(FlagKind::Green), false);
        assert_eq!(tone(&green), hex("#22c55e"));
        assert_eq!(swatch_color(&green, tone(&green)), hex("#22c55e"));
        assert_eq!(tone(&card(Some(FlagKind::Black), false)), hex("#e14a54"));
        let black = card(Some(FlagKind::Black), false);
        assert_eq!(swatch_color(&black, tone(&black)), hex("#0b0b0b"));
        // Sanción con bandera distinta de negra: manda la sanción.
        let disqualified = card(Some(FlagKind::Green), true);
        assert_eq!(tone(&disqualified), hex("#e14a54"));
        assert_eq!(
            swatch_color(&disqualified, tone(&disqualified)),
            hex("#0b0b0b")
        );
    }
}
