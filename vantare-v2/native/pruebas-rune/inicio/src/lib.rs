//! Inicio de referencia: datos locales, sin cuentas ni servicios.
use rune::{Color, Cx, El, Family, Image, ImageCache, ScrollSpec, TextStyle, col, el, row, text};
use std::sync::OnceLock;
pub const FONTS: &[&[u8]] = &[
    include_bytes!("../assets/fonts/Inter-400.ttf"),
    include_bytes!("../assets/fonts/Inter-500.ttf"),
    include_bytes!("../assets/fonts/Inter-600.ttf"),
    include_bytes!("../assets/fonts/Inter-650.ttf"),
    include_bytes!("../assets/fonts/Inter-700.ttf"),
    include_bytes!("../assets/fonts/Inter-750.ttf"),
    include_bytes!("../assets/fonts/Inter-800.ttf"),
    include_bytes!("../assets/fonts/Rajdhani.ttf"),
    include_bytes!("../assets/fonts/SpaceMono.ttf"),
];
const PICTURES: &[&[u8]] = &[
    include_bytes!("../assets/standings.svg"),
    include_bytes!("../assets/pedals.svg"),
    include_bytes!("../assets/relative.svg"),
    include_bytes!("../assets/fuel-strategy.svg"),
    include_bytes!("../assets/delta.svg"),
    include_bytes!("../assets/home-preview-bg.svg"),
    include_bytes!("../assets/home.svg"),
    include_bytes!("../assets/launch.svg"),
    include_bytes!("../assets/studio.svg"),
    include_bytes!("../assets/roadmap.svg"),
    include_bytes!("../assets/testing.svg"),
    include_bytes!("../assets/circuit.svg"),
];
pub const NAV: [&str; 5] = ["Inicio", "Launcher", "Studio", "Roadmap", "Testing Center"];
struct Assets {
    _cache: ImageCache,
    images: Vec<Image>,
}
#[derive(Default)]
pub struct State {
    pub section: usize,
    assets: Option<Assets>,
}
pub fn setup(s: &mut State, wake: rune::Waker) {
    let cache = ImageCache::new(wake);
    let images = PICTURES
        .iter()
        .enumerate()
        .map(|(index, bytes)| {
            cache.svg(
                *bytes,
                [
                    190.0, 40.0, 136.0, 136.0, 136.0, 454.0, 24.0, 24.0, 24.0, 24.0, 24.0, 580.0,
                ][index],
                1.0,
            )
        })
        .collect();
    s.assets = Some(Assets {
        _cache: cache,
        images,
    });
}
fn tokens() -> &'static serde_json::Value {
    static TOKENS: OnceLock<serde_json::Value> = OnceLock::new();
    TOKENS.get_or_init(|| serde_json::from_str(include_str!("../assets/tokens.json")).unwrap())
}
fn hex(s: &str) -> Color {
    let s = s.strip_prefix('#').unwrap();
    let n = u32::from_str_radix(s, 16).unwrap();
    let (rgb, a) = if s.len() == 8 {
        (n >> 8, (n & 255) as f32 / 255.0)
    } else {
        (n, 1.0)
    };
    Color {
        r: ((rgb >> 16) & 255) as f32 / 255.0,
        g: ((rgb >> 8) & 255) as f32 / 255.0,
        b: (rgb & 255) as f32 / 255.0,
        a,
    }
}
fn color(key: &str) -> Color {
    hex(tokens()["themes"]["vantare"]["dark"][key].as_str().unwrap())
}
fn label(value: impl Into<String>, size: f32, weight: f32) -> El {
    text(value.into())
        .font(TextStyle::new(size, weight).lh(size * 1.4))
        .color(color("text-1"))
}
fn caps(value: &str) -> El {
    label(value, 14.0, 700.0).font(TextStyle {
        family: Family::Named("Rajdhani"),
        ..TextStyle::new(14.0, 700.0)
    })
}
fn picture(s: &State, index: usize, w: f32, h: f32) -> El {
    let e = el().size(w, h);
    if let Some(a) = &s.assets {
        e.pixels(a.images[index].pixels())
    } else {
        e
    }
}
fn button(value: &str, primary: bool) -> El {
    row()
        .h(36.0)
        .px(14.0)
        .center_y()
        .radius(6.0)
        .border(1.0, color("line-2"))
        .fill(color(if primary { "accent-fill" } else { "surface-2" }))
        .role("button")
        .label(value)
        .hit()
        .child(label(value, 14.0, 600.0))
}
fn card(title: &str, key: &str) -> El {
    col()
        .key(key)
        .padding(16.0)
        .gap(12.0)
        .radius(10.0)
        .border(1.0, color("line-1"))
        .fill(color("surface-1"))
        .child(caps(title))
}
fn profiles() -> &'static serde_json::Value {
    static PROFILES: OnceLock<serde_json::Value> = OnceLock::new();
    PROFILES
        .get_or_init(|| serde_json::from_str(include_str!("../assets/inicio-base.json")).unwrap())
}
fn home(s: &State) -> El {
    let search = row()
        .key("search")
        .h(52.0)
        .px(16.0)
        .gap(12.0)
        .center_y()
        .radius(10.0)
        .fill(color("surface-2"))
        .child(label("Busca, abre o lanza algo en Vantare…", 14.0, 400.0).grow(1.0))
        .child(button("Carrera LMU", false))
        .child(label("Ctrl K", 11.0, 400.0))
        .child(button("▶", true));
    let hero = col()
        .key("hero")
        .h(236.0)
        .padding(24.0)
        .gap(8.0)
        .radius(12.0)
        .gradient(color("wine"), color("bg-base"))
        .child(picture(s, 11, 580.0, 230.0).pin(None, Some(0.0), Some(0.0), None))
        .child(label("30/09 · ESPERANDO SIMULADOR", 10.0, 400.0))
        .child(label("Buenas tardes, Isaac", 46.0, 600.0).font(TextStyle {
            family: Family::Named("Rajdhani"),
            ..TextStyle::new(46.0, 600.0)
        }))
        .child(label(
            "Tu cabina está lista. Esperando simulador.",
            14.0,
            400.0,
        ))
        .child(el().grow(1.0))
        .child(
            row()
                .gap(8.0)
                .child(button("▶  Lanzar Carrera LMU   Ctrl L", true))
                .child(button("Abrir Studio", false)),
        );
    let preview = el()
        .key("layout-preview")
        .w_full()
        .h(228.0)
        .radius(8.0)
        .fill(color("bg-base"))
        .child(picture(s, 0, 190.0, 78.0).pin(Some(80.0), Some(12.0), None, None))
        .child(picture(s, 1, 40.0, 78.0).pin(None, Some(12.0), Some(80.0), None));
    let overlay = card("OVERLAY EN PISTA", "overlay-card")
        .grow(1.0)
        .min_w(0.0)
        .min_h(500.0)
        .child(preview)
        .child(label("Layout local", 22.0, 650.0))
        .child(label("Esperando simulador", 12.0, 400.0))
        .child(
            row()
                .gap(6.0)
                .child(button("Standings", false))
                .child(button("Pedales", false)),
        )
        .child(
            row()
                .gap(36.0)
                .child(label("—\nHz", 20.0, 600.0))
                .child(label("2\nWidgets visibles", 20.0, 600.0))
                .child(label("—\nCPU", 20.0, 600.0)),
        )
        .child(
            row()
                .gap(8.0)
                .child(button("Editar overlay", false))
                .child(button("Detener", false)),
        );
    let mut activity = card("ACTIVIDAD", "activity-card")
        .grow(1.0)
        .min_w(0.0)
        .min_h(500.0);
    for (index, p) in profiles()["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        activity = activity.child(
            row()
                .key(format!("activity-{index}"))
                .h(58.0)
                .gap(8.0)
                .center_y()
                .child(
                    col()
                        .grow(1.0)
                        .child(label(
                            format!("{} · último lanzamiento", p["name"].as_str().unwrap()),
                            14.0,
                            650.0,
                        ))
                        .child(label(
                            if index == 0 {
                                "05/10 · 18:02"
                            } else {
                                "04/10 · 20:41"
                            },
                            12.0,
                            400.0,
                        )),
                )
                .child(label("Launcher", 12.0, 500.0).color(color("accent-bright"))),
        );
    }
    col()
        .key("inicio")
        .w_full()
        .gap(12.0)
        .px(24.0)
        .py(16.0)
        .child(search)
        .child(hero)
        .child(row().gap(12.0).child(overlay).child(activity))
}
fn rail(s: &State) -> El {
    let mut status = col()
        .key("estado")
        .gap(12.0)
        .padding(20.0)
        .child(caps("ESTADO"));
    for (title, subtitle, badge) in [
        ("Le Mans Ultimate", "Esperando simulador", "Esperando"),
        ("Carrera LMU", "Perfil favorito", "Guardado"),
        ("Testing Center", "Acceso de tester", "Tester"),
        ("Beta para testers", "0.0.0", "Beta"),
    ] {
        status = status.child(
            row()
                .h(46.0)
                .gap(8.0)
                .center_y()
                .child(
                    col()
                        .grow(1.0)
                        .child(label(title, 14.0, 650.0))
                        .child(label(subtitle, 12.0, 400.0)),
                )
                .child(label(badge, 12.0, 400.0)),
        );
    }
    let names = [
        ("Standings multiclase", 0),
        ("Relative compacto", 2),
        ("Fuel y stint", 3),
        ("Delta y sectores", 4),
    ];
    let mut templates = col()
        .key("plantillas")
        .gap(12.0)
        .padding(16.0)
        .child(caps("PLANTILLAS"));
    for pair in names.chunks(2) {
        let mut line = row().gap(12.0);
        for (title, index) in pair {
            line = line.child(
                col()
                    .grow(1.0)
                    .min_w(0.0)
                    .gap(8.0)
                    .child(picture(s, *index, 136.0, 92.0))
                    .child(label(*title, 13.0, 650.0))
                    .child(label("Plantilla local · Abrir Studio", 10.0, 400.0)),
            );
        }
        templates = templates.child(line);
    }
    col()
        .w(320.0)
        .h_full()
        .fill(color("bg-sidebar"))
        .child(status)
        .child(templates)
}
pub fn view(s: &State, cx: &mut Cx<State>) -> El {
    cx.reduced_motion(true);
    let mut sidebar = col()
        .key("sidebar")
        .w(76.0)
        .h_full()
        .gap(12.0)
        .py(16.0)
        .align(rune::Align::Center)
        .fill(color("bg-sidebar"))
        .child(label("Λ", 30.0, 800.0).color(color("accent")));
    for (index, name) in NAV.iter().enumerate() {
        sidebar = sidebar.child(
            el().key(format!("nav-{index}"))
                .role("button")
                .label(*name)
                .hit()
                .size(48.0, 40.0)
                .radius(8.0)
                .fill(color(if s.section == index {
                    "active"
                } else {
                    "bg-sidebar"
                }))
                .child(picture(s, 6 + index, 24.0, 24.0).pin(Some(12.0), Some(8.0), None, None))
                .on_press(move |s: &mut State| s.section = index),
        );
    }
    let content = if s.section == 0 {
        home(s)
    } else {
        col()
            .key("other-section")
            .padding(24.0)
            .child(label(NAV[s.section], 32.0, 600.0))
    };
    let main = col()
        .grow(1.0)
        .min_w(0.0)
        .h_full()
        .child(
            row()
                .h(52.0)
                .px(28.0)
                .center_y()
                .child(caps(NAV[s.section]))
                .child(el().grow(1.0))
                .child(label("Esperando simulador", 12.0, 400.0)),
        )
        .child(
            row()
                .grow(1.0)
                .min_h(0.0)
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .h_full()
                        .scroll(ScrollSpec {
                            stick_bottom: false,
                        })
                        .child(content),
                )
                .child(rail(s)),
        );
    row()
        .w_full()
        .h_full()
        .fill(color("bg-base"))
        .child(sidebar)
        .child(main)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    fn runtime() -> Runtime<State> {
        let mut state = State::default();
        setup(&mut state, std::sync::Arc::new(|| {}));
        for image in &state.assets.as_ref().unwrap().images {
            image.wait().unwrap();
        }
        let mut rt = Runtime::with_text(
            state,
            view,
            (1440.0, 900.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(FONTS, ("Inter", "Space Mono")),
        );
        rt.frame(0.0);
        rt
    }
    #[test]
    fn canonical_profiles_and_home_structure_are_present_without_graphics() {
        let rt = runtime();
        let elements = rt.elements();
        for key in [
            "hero",
            "overlay-card",
            "activity-card",
            "estado",
            "plantillas",
            "sidebar",
        ] {
            assert!(rt.find(key).is_some(), "{key}");
        }
        for p in profiles()["profiles"].as_array().unwrap() {
            let expected = format!("{} · último lanzamiento", p["name"].as_str().unwrap());
            assert!(
                elements
                    .iter()
                    .any(|el| el.text.as_deref() == Some(expected.as_str()))
            );
        }
    }
    #[test]
    fn section_changes_and_returns_to_home_through_real_pointer_input() {
        let mut rt = runtime();
        let (x, y) = rt.find("nav-3").unwrap();
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(1.0 / 60.0);
        assert_eq!(rt.state.section, 3);
        assert!(rt.find("other-section").is_some());
        let (x, y) = rt.find("nav-0").unwrap();
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(2.0 / 60.0);
        assert_eq!(rt.state.section, 0);
        assert!(rt.find("hero").is_some());
    }
}
