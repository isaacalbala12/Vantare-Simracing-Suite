//! Vantare pinta la tarjeta de banderas; todo es estático por escena.
use super::scene::Scene;
use crate::vantare::{
    Style, alpha,
    paint::{Face, WHITE, font},
};
use rune::{Color, El, Shape, canvas, el, text};
use std::sync::Arc;
use vantare_domain::FlagKind;

pub(super) const WIDTH: f32 = 340.0;
pub(super) const HEIGHT: f32 = 88.0;

/// Lo que decide recomponer la vista: todo lo visible de la tarjeta.
#[derive(PartialEq)]
struct Structure {
    waiting: bool,
    quiet: bool,
    flag: Option<FlagKind>,
    title: Arc<str>,
    message: Arc<str>,
    text_color: u32,
    sectors_visible: bool,
    sectors: [bool; 3],
}

impl Structure {
    fn of(scene: &Scene) -> Self {
        Self {
            waiting: scene.waiting,
            quiet: scene.quiet,
            // En espera o sin banderas la tarjeta no usa la bandera: no recomponer.
            flag: if scene.quiet {
                None
            } else {
                scene.flag.clone()
            },
            title: scene.title.clone(),
            message: scene.message.clone(),
            text_color: scene.text_color,
            sectors_visible: scene.sectors_visible,
            sectors: scene.sectors,
        }
    }
}

pub(super) struct Painter {
    style: Arc<Style>,
    structure: Option<Structure>,
    view: El,
}

impl Painter {
    pub fn new(scene: Option<&Scene>) -> Self {
        let style = Style::compiled();
        Self {
            view: view(&style, scene),
            structure: scene.map(Structure::of),
            style,
        }
    }

    /// Un solo punto de decisión: recomponer cuando cambia algo visible.
    pub fn sync(&mut self, scene: Option<&Scene>) -> crate::widget::Update {
        let structure = scene.map(Structure::of);
        let build = structure != self.structure;
        if build {
            self.structure = structure;
            self.view = view(&self.style, scene);
        }
        crate::widget::Update {
            build,
            pixels: false,
        }
    }

    pub fn view(&self) -> El {
        self.view.clone()
    }
}

fn view(style: &Style, scene: Option<&Scene>) -> El {
    let root = el()
        .key("racing-flags")
        .size(WIDTH, HEIGHT)
        .motion(rune::Spring::NONE);
    let Some(scene) = scene else {
        return root;
    };
    let tone = tone(scene);
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
    card = card
        .child(
            text(scene.title.to_string())
                .key("title")
                .font(font(style, Face::Display, title_size, 22.0, 1.4, 600.0))
                .color(ink(scene.text_color))
                .size(250.0, 22.0)
                .truncate()
                .pin(Some(76.0), Some(title_top), None, None),
        )
        .child(
            text(scene.message.to_string())
                .key("message")
                .font(font(style, Face::Body, 12.0, 16.0, 0.0, 400.0))
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

/// El color de la tarjeta: banda y placa, con el negro siempre en rojo.
fn tone(scene: &Scene) -> Color {
    if scene.waiting {
        return hex("#5a5052");
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

fn swatch(scene: &Scene, tone: Color) -> El {
    let black = scene.flag.as_ref() == Some(&FlagKind::Black);
    let fill = if scene.quiet {
        alpha(WHITE, 0.08)
    } else if black {
        hex("#0b0b0b")
    } else {
        tone
    };
    let mut node = el()
        .key("swatch")
        .size(48.0, 34.0)
        .radius(4.0)
        .fill(fill)
        .pin(Some(14.0), Some(27.0), None, None);
    if scene.quiet {
        node = node.child(el().size(46.0, 32.0).radius(3.0).fill(hex("#151213")).pin(
            Some(1.0),
            Some(1.0),
            None,
            None,
        ));
        if scene.waiting {
            node = node.child(
                el().size(8.0, 8.0)
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
                    el().size(8.0, if row == 4 { 2.0 } else { 8.0 })
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
                .font(font(style, Face::Display, 10.0, 14.0, 1.0, 600.0))
                .color(if active {
                    hex("#1a1205")
                } else {
                    hex("#8e8587")
                })
                .size(24.0, 14.0)
                .pin(Some(8.0), Some(0.0), None, None),
        )
}

fn ink(value: u32) -> Color {
    rune::color::hex(&format!("#{value:06x}")).expect("color de texto validado")
}

fn hex(value: &str) -> Color {
    rune::color::hex(value).expect("canonical racing-flags color")
}
