use super::{Visual, assets, model::*, render, style::Style};
use crate::eficiencia::FONTS;
use rune::{ElementInfo, Env, ImageCache, Runtime, text::TextSystem};
use std::sync::Arc;
use vantare_domain::{
    FlagKind,
    format::{Language, Preferences},
    standings,
};

impl Visual {
    fn from_parts_for_test(config: Config, content_plan: Arc<ContentPlan>) -> Self {
        let plan = Arc::new(plan(&config, &content_plan));
        Self {
            config: Arc::new(config),
            content_plan,
            plan,
            assets: None,
            frame: Arc::default(),
        }
    }
    pub(super) fn clone_for_test(&self) -> Self {
        Self {
            config: self.config.clone(),
            content_plan: self.content_plan.clone(),
            plan: self.plan.clone(),
            assets: None,
            frame: self.frame.clone(),
        }
    }
}

pub(super) fn visual() -> Visual {
    let photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    let mut config = Config::reference();
    config.fit(10);
    let content = Arc::new(ContentPlan::new(
        Arc::new(standings::project(&photo, Preferences::default())),
        String::new(),
        0,
    ));
    Visual::from_parts_for_test(config, content)
}
pub(super) fn paint(mut v: Visual, language: Language) -> Runtime<(Visual, Language)> {
    let _fonts = rune::text::with_families("Inter W400", "Inter W400");
    v.attach_assets(&Arc::new(ImageCache::new(Arc::new(|| {}))));
    for image in v.capture_images() {
        image.wait().unwrap();
    }
    let size = v.size();
    let mut rt = Runtime::with_text(
        (v, language),
        |s, _| s.0.view(s.1),
        size,
        Env::new(true, 1.0),
        TextSystem::new(FONTS, ("Inter W400", "Inter W400")),
    );
    rt.frame(0.0);
    rt
}
pub(super) fn named(rt: &Runtime<(Visual, Language)>, key: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("{key}"))
}
fn near(a: f32, b: f32) {
    assert!((a - b).abs() < 0.02, "{a} != {b}");
}

#[test]
fn gpui_brand_and_session_baselines_logo_sizes_and_context_colours() {
    let rt = paint(visual(), Language::Es);
    assert_eq!(named(&rt, "session-logo").rect, [10.0, 9.0, 24.0, 24.0]);
    let brand = named(&rt, "session-brand");
    assert_eq!(brand.text.as_deref(), Some("VANTARE"));
    near(brand.rect[0], 40.0);
    near(brand.rect[1], 13.0); // baseline 25 - ascenso Inter 12.
    assert_eq!(brand.text_color.unwrap().hex(), "#f5f5f5ff");
    let rule = named(&rt, "session-rule");
    near(rule.rect[0], brand.rect[0] + brand.rect[2] + 8.0);
    assert_eq!(&rule.rect[1..], &[6.0, 1.0, 30.0]);
    assert_eq!(rule.fill.hex(), "#f5f5f53b");
    near(named(&rt, "session-kind").rect[1], 5.0); // baseline 12 - ascenso 7.
    near(named(&rt, "session-clock").rect[1], 17.0); // baseline 32 - ascenso 15.
    assert_eq!(
        named(&rt, "session-kind").text_color.unwrap().hex(),
        "#b8bac0ff"
    );
    assert_eq!(named(&rt, "class-chip").rect[1], 11.0); // snap(10.5).
    near(named(&rt, "session-class").rect[1], 16.0);
}

#[test]
fn gpui_stale_plain_brand_band_and_focus_header_branches() {
    let mut v = visual();
    Arc::make_mut(&mut v.content_plan).status = Status::Stale;
    for (language, title) in [
        (Language::Es, "DATOS ANTIGUOS"),
        (Language::En, "DATA OUT OF DATE"),
    ] {
        let rt = paint(v.clone_for_test(), language);
        let kind = named(&rt, "session-kind");
        assert!(!kind.text.as_ref().unwrap().is_empty());
        assert!(title.starts_with(kind.text.unwrap().trim_end_matches('…')));
        assert_eq!(kind.text_color.unwrap().hex(), "#e2c568ff");
        assert_eq!(
            named(&rt, "session-clock").text_color.unwrap().hex(),
            "#b9b9bdff"
        );
    }
    let mut v = visual();
    Arc::make_mut(&mut v.config).brand_visible = Some(false);
    v.plan = Arc::new(plan(&v.config, &v.content_plan));
    let rt = paint(v, Language::Es);
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("VANTARE"))
    );
    near(named(&rt, "session-kind").rect[0], 10.0);
    near(named(&rt, "session-clock").rect[1], 11.0); // baseline 27 - ascenso 16.
    let mut v = visual();
    v.set_study("v2-focus");
    let rt = paint(v, Language::Es);
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("flag-ribbon-0"))
    );
    assert_eq!(named(&rt, "session-rule").fill.hex(), "#f5f5f51a");
    assert_eq!(
        named(&rt, "session-class").text_color.unwrap().hex(),
        "#d6d6daff"
    );
    let mut v = visual();
    let c = Arc::make_mut(&mut v.config);
    c.show_session_header = false;
    c.brand_visible = Some(true);
    c.fit(10);
    v.plan = Arc::new(plan(c, &v.content_plan));
    let rt = paint(v, Language::Es);
    assert_eq!(named(&rt, "brand-logo").rect, [10.0, 2.0, 18.0, 18.0]);
    let brand = named(&rt, "brand-band-text");
    assert_eq!(&brand.rect[..2], &[34.0, 3.0]);
    assert_eq!(named(&rt, "brand-band-rule").rect, [0.0, 21.0, 440.0, 1.0]);
}

#[test]
fn gpui_flag_palette_and_ribbon_bounds_are_literal() {
    let style = Style::default();
    for (flag, rgb) in [
        (None, 0xb1b4bc),
        (Some(FlagKind::Other("unknown".into())), 0xb1b4bc),
        (Some(FlagKind::Green), 0x29c36f),
        (Some(FlagKind::Yellow), 0xffd03d),
        (Some(FlagKind::Blue), 0x4391ff),
        (Some(FlagKind::Red), 0xef303e),
        (Some(FlagKind::White), 0xffffff),
        (Some(FlagKind::Black), 0x0c0c0e),
        (Some(FlagKind::Checkered), 0xd1d1d6),
    ] {
        assert_eq!(render::flag_rgb(&style, flag.as_ref()), rgb);
    }
    for (broadcast, width, left, bottom, alphas) in [
        (false, 440.0, 310.0, 50.0, [0.28, 0.17]),
        (true, 460.0, 280.0, 46.0, [0.30, 0.23]),
        (true, 300.0, 250.0, 46.0, [0.30, 0.23]),
    ] {
        let bands = render::ribbon_bands(width, broadcast);
        assert_eq!(bands.len(), 2);
        for ((points, alpha), expected) in bands.iter().zip(alphas) {
            assert_eq!(*alpha, expected);
            assert!(points.len() >= 3);
            assert!(points.iter().all(|&(x, y)| x >= left - 0.001
                && x <= width + 0.001
                && y >= -0.001
                && y <= bottom + 0.001));
        }
    }
}

#[test]
fn gpui_panel_and_each_superposed_layer_stay_inside_signature_and_broadcast() {
    for broadcast in [false, true] {
        for status in [
            Status::Ready,
            Status::Stale,
            Status::Missing,
            Status::Disconnected,
        ] {
            let mut v = visual();
            Arc::make_mut(&mut v.content_plan).status = status;
            let c = Arc::make_mut(&mut v.config);
            c.broadcast = broadcast;
            c.fit(10);
            v.plan = Arc::new(plan(c, &v.content_plan));
            let size = v.size();
            let mut rt = paint(v, Language::Es);
            let panel = named(&rt, "efficiency-panel");
            assert_eq!(panel.fill.hex(), "#101113de");
            assert_eq!(panel.radius, 6.0);
            assert_eq!(
                named(&rt, "pit-shadow").rect,
                [size.0 - 34.0, 0.0, 34.0, size.1]
            );
            crate::testdata::assert_inside_window(&mut rt, size);
        }
    }
}

#[test]
fn gpui_shadow_uses_only_the_gaussian_tail_in_the_pit_rail() {
    let pixels = assets::shadow_strip(&Style::default(), 440.0, 364);
    assert_eq!(pixels.len(), 34 * 364 * 4);
    for pixel in pixels.as_chunks::<4>().0 {
        assert_eq!(&pixel[..3], &[0, 0, 0]);
    }
    // Regresión de la copia Rune de view::shadow_strip; NO son muestras GPUI.
    // Parámetros portados: sigma 12.5, spread -12, dy 14, alpha 0.48.
    let alpha = |x: usize, y: usize| pixels[(y * 34 + x) * 4 + 3];
    assert_eq!(
        [
            alpha(0, 0),
            alpha(0, 26),
            alpha(0, 100),
            alpha(10, 100),
            alpha(33, 100)
        ],
        [0, 10, 19, 4, 0]
    );
}

#[test]
fn signature_ribbon_vertices_solve_the_gpui_half_planes_by_hand() {
    // view.rs:191-243: sin(131°)=.7547095802, -cos(131°)=.6560590290.
    // L=130*sin+50*(-cos)=130.91519688; centro=(375,25)·dir=299.41756831.
    // Planos: (282.39859271,304.65417618), (315.12739193,337.38297540).
    // Resolver x=(d-y*.6560590290)/.7547095802 en y=0/50 y el último y en x=440.
    let expected: &[&[(f32, f32)]] = &[
        &[
            (374.1818, 0.0),
            (403.67074, 0.0),
            (360.20641, 50.0),
            (330.71747, 50.0),
        ],
        &[
            (417.54789, 0.0),
            (440.0, 0.0),
            (440.0, 8.09494),
            (403.57249, 50.0),
            (374.08355, 50.0),
        ],
    ];
    for ((vertices, _), expected) in render::ribbon_bands(440.0, false).iter().zip(expected) {
        assert_eq!(vertices.len(), expected.len());
        for ((x, y), (ex, ey)) in vertices.iter().zip(*expected) {
            assert!(
                (x - ex).abs() < 0.001 && (y - ey).abs() < 0.001,
                "{vertices:?}"
            );
        }
    }
}

#[test]
fn gradients_retain_gpui_degrees_and_stops_in_the_public_instance_stream() {
    let mut v = visual();
    let c = Arc::make_mut(&mut v.config);
    c.broadcast = true;
    c.fit(10);
    v.plan = Arc::new(plan(c, &v.content_plan));
    let rt = paint(v, Language::Es);
    for (key, degrees, start, end) in [
        ("efficiency-panel-highlight", 120.0, 0.0, 0.38),
        ("flag-ribbon-background", 110.0, 0.55, 1.0),
        ("class-chip", 145.0, 0.0, 1.0),
    ] {
        let bounds = named(&rt, key).rect;
        let instance = rt
            .instances
            .iter()
            .find(|i| i.rect == bounds && i.uv[0] != 0.0 && i.uv[2] == 0.0 && i.uv[3] == 0.0)
            .expect(key);
        near(instance.uv[0].atan2(-instance.uv[1]).to_degrees(), degrees);
        near(instance.params[0], start);
        near(instance.params[3], end);
    }
}

#[test]
fn panel_and_outline_read_the_style_instead_of_compiled_constants() {
    let mut v = visual();
    let mut style = Style::default();
    style.colors.panel.0 = 0xff0000;
    style.colors.white.0 = 0x00ff00;
    style.geometry.radius = 9.0;
    style.opacity.panel = 0.4;
    style.opacity.frame = 0.3;
    style.opacity.top_frame = 0.2;
    v.set_style(Arc::new(style));
    let rt = paint(v, Language::Es);
    let panel = named(&rt, "efficiency-panel");
    assert_eq!(panel.fill.hex(), "#ff000066");
    assert_eq!(panel.radius, 9.0);
    let frame = named(&rt, "efficiency-frame-base");
    assert_eq!(frame.radius, 9.0);
    let base = rt
        .instances
        .iter()
        .find(|i| i.rect == frame.rect && i.params[0] == 1.0 && i.border[3] > 0.0)
        .unwrap();
    assert_eq!(
        base.border,
        rune::color::hex("#00ff00").unwrap().premul(0.3)
    );
    let top = named(&rt, "efficiency-frame-top");
    assert_eq!(top.rect[3], 9.0);
    let overlay = rt
        .instances
        .iter()
        .find(|i| i.rect == top.rect && i.border[3] > 0.0)
        .unwrap();
    near(overlay.border[3], 0.2);
    let highlight = named(&rt, "efficiency-panel-highlight");
    let gradient = rt
        .instances
        .iter()
        .find(|i| i.rect == highlight.rect && i.uv[0] != 0.0 && i.uv[2] == 0.0 && i.uv[3] == 0.0)
        .unwrap();
    assert_eq!(
        gradient.fill,
        rune::color::hex("#00ff00").unwrap().premul(0.03)
    );
}

#[test]
fn empty_class_keeps_the_chip_box_without_an_empty_text_node() {
    let mut v = visual();
    Arc::make_mut(&mut Arc::make_mut(&mut v.content_plan).board)
        .class_chip
        .clear();
    let rt = paint(v, Language::Es);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("class-chip"))
    );
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("session-class"))
    );
}

#[test]
fn gpui_logo_area_reduction_keeps_the_original_rgba_edges() {
    assert_eq!(assets::LOGO.len(), 24 * 24 * 4);
    // Oráculo: logo_24 original de GPUI, ejecutado sin modificar su bucle f32.
    for (x, y, rgba) in [
        (0, 0, [0, 0, 0, 0]),
        (11, 2, [233, 81, 81, 167]),
        (12, 3, [246, 76, 76, 252]),
        (4, 19, [214, 0, 0, 255]),
        (12, 12, [225, 7, 7, 182]),
        (23, 23, [127, 0, 0, 0]),
    ] {
        let offset = (y * 24 + x) * 4;
        assert_eq!(&assets::LOGO[offset..offset + 4], &rgba);
    }
}
