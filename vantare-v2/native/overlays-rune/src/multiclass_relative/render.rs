//! Paints the domain scene at the current GPUI coordinates. No clock or animation.
use crate::vantare::{
    Style, alpha,
    paint::{Face, WHITE, font},
};
use crate::widget::Update;
use rune::{Align, Color, El, LiveText, el, row, text};
use vantare_domain::{
    CarId,
    format::{Language, Preferences},
    geometry::Size,
    multiclass_relative::{Row, ViewModel},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Auxiliary {
    None,
    Closing,
    Near,
    Trend(bool),
}

fn auxiliary(row: &Row, fcy: bool) -> Auxiliary {
    if fcy {
        Auxiliary::None
    } else if row.fast_traffic {
        if row.nearby {
            Auxiliary::Near
        } else {
            Auxiliary::Closing
        }
    } else {
        row.trend
            .as_ref()
            .map_or(Auxiliary::None, |(_, good)| Auxiliary::Trend(*good))
    }
}

#[derive(PartialEq)]
struct RowStructure {
    id: CarId,
    slot: usize,
    class: String,
    intrinsic: [String; 3],
    player: bool,
    divider: bool,
    auxiliary: Auxiliary,
}

#[derive(PartialEq)]
struct Structure {
    fcy: bool,
    rows: Vec<RowStructure>,
}

pub(super) struct Painter {
    prefs: Preferences,
    style: std::sync::Arc<Style>,
    count: usize,
    header: LiveText,
    footer: LiveText,
    cells: Vec<[LiveText; 5]>,
    structure: Option<Structure>,
}

impl Painter {
    pub fn new(count: usize, prefs: Preferences, scene: &ViewModel) -> Self {
        let mut painter = Self {
            prefs,
            style: Style::compiled(),
            count,
            header: LiveText::new(""),
            footer: LiveText::new(""),
            cells: (0..count)
                .map(|_| std::array::from_fn(|_| LiveText::new("")))
                .collect(),
            structure: None,
        };
        painter.sync(scene);
        painter
    }

    pub fn sync(&mut self, scene: &ViewModel) -> Update {
        let es = self.prefs.language == Language::Es;
        let mut pixels = self.header.set(
            format!(
                "{} {} · ±{}",
                if es { "Tú en" } else { "You in" },
                scene.player_class,
                self.count / 2
            )
            .to_uppercase(),
        );
        pixels |= self.footer.set(footer(scene, es));
        for r in &scene.rows {
            let Some(cells) = self.cells.get(r.slot) else {
                continue;
            };
            let aux = match auxiliary(r, scene.fcy) {
                Auxiliary::None => String::new(),
                Auxiliary::Near => if es { "▲ encima" } else { "▲ near" }.into(),
                Auxiliary::Closing => if es { "▲ cerca" } else { "▲ closing" }.into(),
                Auxiliary::Trend(_) => r.trend.as_ref().expect("trend selected").0.clone(),
            };
            for (cell, value) in cells.iter().zip([
                r.place.clone(),
                if r.number == "—" {
                    r.number.clone()
                } else {
                    format!("#{}", r.number)
                },
                r.name.clone(),
                r.gap.clone(),
                aux,
            ]) {
                pixels |= cell.set(value);
            }
        }
        // One build decision; fixed-width text changes stay in Live values.
        let next = Structure {
            fcy: scene.fcy,
            rows: scene
                .rows
                .iter()
                .map(|r| RowStructure {
                    id: r.id,
                    slot: r.slot,
                    class: r.class_name.clone(),
                    intrinsic: [r.place.clone(), r.number.clone(), r.name.clone()],
                    player: r.is_player,
                    divider: r.divider,
                    auxiliary: auxiliary(r, scene.fcy),
                })
                .collect(),
        };
        let build = self.structure.as_ref() != Some(&next);
        self.structure = Some(next);
        Update {
            build,
            pixels: pixels || build,
        }
    }

    pub fn view(&self, scene: &ViewModel, size: Size) -> El {
        let s = &self.style;
        let v = &s.styles.neo;
        let border = if v.border_accent > 0.0 {
            alpha(s.accents.red, v.border_accent)
        } else {
            v.border
        };
        let mut root = el()
            .key("multiclass-relative")
            .size(size.width, size.height)
            .motion(rune::Spring::NONE)
            .child(
                el().size(size.width, size.height)
                    .radius(v.radius)
                    .border(1.0, border)
                    .linear_gradient(std::f32::consts::PI, [(0.0, v.top), (1.0, v.bottom)])
                    .shadow(
                        v.shadow_y,
                        v.shadow_blur,
                        alpha(
                            Color {
                                a: 1.0,
                                ..s.colors.shadow
                            },
                            v.shadow_alpha,
                        ),
                    ),
            );
        let muted = s.colors.muted;
        let title = if self.prefs.language == Language::Es {
            "RELATIVE MULTICLASE"
        } else {
            "MULTICLASS RELATIVE"
        };
        root = root.child(
            text(title)
                .font(font(s, Face::Body, 11.0, 18.0, 0.3, s.fonts.regular_weight))
                .color(muted)
                .h(18.0)
                .pin(Some(13.0), Some(11.0), None, None),
        );
        root = root.child(
            self.label(&self.header, Face::Body, 11.0, 18.0, muted)
                .w(size.width - 26.0)
                .font(font(s, Face::Body, 11.0, 18.0, 0.3, s.fonts.regular_weight))
                .align(Align::End)
                .pin(Some(13.0), Some(11.0), None, None),
        );
        for slot in 0..self.count {
            let y = 33.0 + slot as f32 * 24.0;
            let node = if let Some(r) = scene.rows.iter().find(|r| r.slot == slot) {
                self.car_row(r, scene.fcy, size.width)
            } else {
                self.skeleton(slot, size.width)
            };
            root = root.child(node.pin(Some(0.0), Some(y), None, None));
        }
        let foot = 39.0 + self.count as f32 * 24.0;
        root.child(rect(13.0, foot, size.width - 26.0, 1.0, 0.0, s.colors.line))
            .child(
                self.label(&self.footer, Face::Body, 11.0, 20.0, muted)
                    .w(size.width - 26.0)
                    .pin(Some(13.0), Some(foot + 7.0), None, None),
            )
    }

    fn label(&self, value: &LiveText, face: Face, size: f32, height: f32, ink: Color) -> El {
        let weight = match face {
            Face::Body => self.style.fonts.regular_weight,
            Face::Display => 600.0,
            Face::Mono => 400.0,
        };
        text(value.get().to_string())
            .live_text(value)
            .font(font(&self.style, face, size, height, 0.0, weight))
            .color(ink)
            .h(height)
            .truncate_fade_width(0.0)
    }

    fn car_row(&self, r: &Row, fcy: bool, width: f32) -> El {
        let s = &self.style;
        let v = &s.styles.neo;
        let Some(c) = self.cells.get(r.slot) else {
            return el();
        };
        let class = s.class(&r.class_name);
        let mut root = el()
            .key(format!("multiclass-car-{}", r.id.0))
            .size(width, 24.0);
        if r.is_player {
            // GPUI Kit::highlight uses geometry.row_height even though the pitch is 24.
            let x = v.padding_x - s.geometry.player_bleed;
            root = root.child(
                el().size(width - 2.0 * x, s.geometry.row_height)
                    .radius(v.player_radius)
                    .linear_gradient(
                        if v.player_vertical {
                            std::f32::consts::PI
                        } else {
                            std::f32::consts::FRAC_PI_2
                        },
                        [
                            (0.0, alpha(s.accents.red, v.player_from)),
                            (1.0, alpha(s.accents.red, v.player_to)),
                        ],
                    )
                    .pin(Some(x), Some(0.0), None, None),
            );
        }
        if r.divider {
            root = root.child(rect(13.0, 0.0, width - 26.0, 1.0, 0.0, s.colors.line));
        }
        root = root.child(rect(13.0, 4.0, 38.0, 16.0, 3.0, class.dot));
        let class_ink = if r.class_label == "GT3" {
            rune::color::hex("#06210f").expect("GPUI class ink")
        } else {
            WHITE
        };
        root = root.child(
            text(&r.class_label)
                .font(font(s, Face::Display, 11.0, 16.0, 1.0, 600.0))
                .color(class_ink)
                .size(38.0, 16.0)
                .align(Align::Center)
                .pin(Some(13.0), Some(4.0 + s.fonts.display_baseline), None, None),
        );
        root = root.child(
            self.label(&c[0], Face::Display, 14.0, 24.0, s.colors.muted)
                .pin(Some(61.0), Some(s.fonts.display_baseline), None, None),
        );
        root = root
            .child(rect(93.0, 4.0, 34.0, 16.0, 3.0, alpha(WHITE, 0.06)))
            .child(
                self.label(
                    &c[1],
                    Face::Mono,
                    11.0,
                    16.0,
                    rune::color::hex("#b0a7a9").expect("GPUI number ink"),
                )
                .pin(Some(97.0), Some(4.0 + s.fonts.mono_baseline), None, None),
            );
        let gap_ink = if fcy {
            s.colors.frozen
        } else if r.is_player {
            s.colors.text
        } else {
            s.colors.value
        };
        let aux = auxiliary(r, fcy);
        let mut line = row().size(width - 150.0, 24.0).child(
            // Rune cannot combine live_text and ellipsis. As in Relative, the name
            // is plain text and belongs to the one structure comparison above.
            text(c[2].get().to_string())
                .font(font(s, Face::Body, 13.0, 24.0, 0.0, s.fonts.regular_weight))
                .color(s.colors.text)
                .h(24.0)
                .key(format!("multiclass-name-{}", r.id.0))
                .grow(1.0)
                .min_w(0.0)
                .truncate(),
        );
        line = match aux {
            Auxiliary::None => line,
            Auxiliary::Trend(good) => line.child(
                self.label(
                    &c[4],
                    Face::Mono,
                    11.0,
                    24.0,
                    if good { s.colors.gain } else { s.colors.loss },
                )
                .w(58.0)
                .align(Align::End)
                .offset(0.0, s.fonts.mono_baseline),
            ),
            Auxiliary::Near | Auxiliary::Closing => {
                let near = aux == Auxiliary::Near;
                let label = self
                    .label(
                        &c[4],
                        Face::Mono,
                        11.0,
                        24.0,
                        if near {
                            WHITE
                        } else {
                            rune::color::hex("#ff8a8a").expect("GPUI traffic ink")
                        },
                    )
                    .key(format!("multiclass-traffic-{}", r.id.0));
                // Same right edge and name budget as GPUI's measured edge -= width + 20.
                let node = if near {
                    row().h(24.0).pl(10.0).child(
                        el().h(16.0)
                            .key(format!("multiclass-near-{}", r.id.0))
                            .pl(5.0)
                            .pr(5.0)
                            .radius(3.0)
                            .fill(Color {
                                a: 0.75,
                                ..rune::color::hex("#f25a5a").expect("GPUI nearby fill")
                            })
                            .child(label.offset(0.0, s.fonts.mono_baseline - 4.0))
                            .offset(0.0, 4.0),
                    )
                } else {
                    row()
                        .h(24.0)
                        .pl(20.0)
                        .child(label.offset(0.0, s.fonts.mono_baseline))
                };
                line.child(node)
            }
        };
        line = line.child(
            self.label(&c[3], Face::Mono, 12.0, 24.0, gap_ink)
                .key(format!("multiclass-gap-{}", r.id.0))
                .w(56.0)
                .align(Align::End)
                .offset(0.0, s.fonts.mono_baseline),
        );
        root.child(line.pin(Some(137.0), Some(0.0), None, None))
    }

    fn skeleton(&self, slot: usize, width: f32) -> El {
        let s = &self.style;
        let g = &s.geometry;
        let pad = s.styles.neo.padding_x;
        let top = (g.row_height - g.skeleton_bar) / 2.0;
        el().size(width, 24.0)
            .child(rect(pad, top, 16.0, g.skeleton_bar, 2.0, s.colors.skeleton))
            .child(rect(
                pad + 16.0 + g.cell_gap,
                (g.row_height - g.class_dot) / 2.0,
                g.class_dot,
                g.class_dot,
                g.class_dot / 2.0,
                s.colors.skeleton,
            ))
            .child(rect(
                pad + 16.0 + g.cell_gap * 2.0 + g.class_dot,
                top,
                110.0 + ((slot * 37) % 70) as f32,
                g.skeleton_bar,
                2.0,
                s.colors.skeleton,
            ))
            .child(rect(
                width - pad - 48.0,
                top,
                48.0,
                g.skeleton_bar,
                2.0,
                s.colors.skeleton,
            ))
    }
}

fn rect(x: f32, y: f32, w: f32, h: f32, radius: f32, color: Color) -> El {
    el().size(w, h)
        .radius(radius)
        .fill(color)
        .pin(Some(x), Some(y), None, None)
}

fn footer(scene: &ViewModel, es: bool) -> String {
    scene.status.clone().unwrap_or_else(|| {
        if scene.fcy {
            if es {
                "Gaps congelados · no adelantar"
            } else {
                "Frozen gaps · no overtaking"
            }
            .into()
        } else {
            let fast = scene.rows.iter().filter(|r| r.fast_traffic).count();
            format!(
                "▲ {fast} {}",
                if es {
                    "coches más rápidos a menos de 6 s"
                } else {
                    "faster cars within 6 s"
                }
            )
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scene() -> ViewModel {
        ViewModel {
            rows: vec![Row {
                id: CarId(2),
                slot: 1,
                class_name: "LMP2".into(),
                fast_traffic: true,
                nearby: false,
                trend: Some(("▲ 0.3".into(), true)),
                place: "P2".into(),
                class_label: "LMP2".into(),
                number: "7".into(),
                name: "A. Rival".into(),
                gap: "-2.0".into(),
                is_player: false,
                divider: true,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn static_traffic_trend_and_footer_follow_gpui_precedence() {
        let mut scene = scene();
        assert_eq!(auxiliary(&scene.rows[0], false), Auxiliary::Closing);
        assert_eq!(
            footer(&scene, true),
            "▲ 1 coches más rápidos a menos de 6 s"
        );
        scene.rows[0].nearby = true;
        assert_eq!(auxiliary(&scene.rows[0], false), Auxiliary::Near);
        scene.fcy = true;
        assert_eq!(auxiliary(&scene.rows[0], true), Auxiliary::None);
        assert_eq!(footer(&scene, false), "Frozen gaps · no overtaking");
        scene.status = Some("DATOS ANTIGUOS".into());
        assert_eq!(footer(&scene, true), "DATOS ANTIGUOS");
        scene.rows[0].fast_traffic = false;
        assert_eq!(auxiliary(&scene.rows[0], false), Auxiliary::Trend(true));
    }

    #[test]
    fn fixed_cells_do_not_rebuild_and_changed_geometry_does() {
        let mut scene = scene();
        let mut painter = Painter::new(7, Preferences::default(), &scene);
        scene.rows[0].gap = "-1.0".into();
        let gap = painter.sync(&scene);
        assert!(!gap.build && gap.pixels);
        assert_eq!(&*painter.cells[1][3].get(), "-1.0");
        scene.rows[0].name = "A longer driver name".into();
        assert!(painter.sync(&scene).build);
        scene.rows[0].place = "P20".into();
        assert!(painter.sync(&scene).build);
        scene.rows[0].number = "123".into();
        assert!(painter.sync(&scene).build);
        scene.rows[0].nearby = true;
        assert!(painter.sync(&scene).build);
        assert_eq!(&*painter.cells[1][4].get(), "▲ encima");
        scene.fcy = true;
        assert!(painter.sync(&scene).build);
        scene.rows.clear();
        assert!(painter.sync(&scene).build);
    }

    #[test]
    fn traffic_and_name_boxes_keep_gpui_edges_without_animation() {
        use rune::{Env, Runtime};
        let _fonts = rune::text::with_families("Inter", "Inter");
        for language in [Language::Es, Language::En] {
            for nearby in [false, true] {
                let mut scene = scene();
                scene.rows[0].nearby = nearby;
                let painter = Painter::new(
                    7,
                    Preferences {
                        language,
                        ..Default::default()
                    },
                    &scene,
                );
                let mut rt = Runtime::with_text(
                    (painter, scene),
                    |(painter, scene), _| {
                        painter.view(
                            scene,
                            Size {
                                width: 440.0,
                                height: 245.0,
                            },
                        )
                    },
                    (440.0, 245.0),
                    Env::new(true, 1.0),
                    rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
                );
                rt.frame(0.0);
                let elements = rt.elements();
                let find = |key: &str| {
                    elements
                        .iter()
                        .find(|e| e.key.as_deref() == Some(key))
                        .expect("cell")
                };
                let name = find("multiclass-name-2").target;
                let gap = find("multiclass-gap-2").target;
                let traffic = find("multiclass-traffic-2").target;
                assert_eq!(name[0], 137.0);
                assert!((gap[0] + gap[2] - 427.0).abs() < 0.01);
                assert!((name[0] + name[2] - (371.0 - traffic[2] - 20.0)).abs() < 0.01);
                if nearby {
                    let badge = find("multiclass-near-2").target;
                    assert!((badge[0] + badge[2] - 371.0).abs() < 0.01);
                }
                assert!(rt.wake_deadline().is_none());
                assert!(elements.iter().all(|e| !e.moving));
            }
        }
    }
}
