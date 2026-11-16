use super::{Visual, assets, model::*, render, style::Style};
use crate::eficiencia::{FONTS, color};
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
        }
    }
    fn clone_for_test(&self) -> Self {
        Self {
            config: self.config.clone(),
            content_plan: self.content_plan.clone(),
            plan: self.plan.clone(),
            assets: None,
        }
    }
}

fn visual() -> Visual {
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
fn paint(mut v: Visual, language: Language) -> Runtime<(Visual, Language)> {
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
fn named(rt: &Runtime<(Visual, Language)>, key: &str) -> ElementInfo {
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
    assert_eq!(brand.text_color, Some(color(0xf5f5f5, 1.0)));
    let rule = named(&rt, "session-rule");
    near(rule.rect[0], brand.rect[0] + brand.rect[2] + 8.0);
    assert_eq!(&rule.rect[1..], &[6.0, 1.0, 30.0]);
    assert_eq!(rule.fill, color(0xf5f5f5, 0.23));
    near(named(&rt, "session-kind").rect[1], 5.0); // baseline 12 - ascenso 7.
    near(named(&rt, "session-clock").rect[1], 17.0); // baseline 32 - ascenso 15.
    assert_eq!(
        named(&rt, "session-kind").text_color,
        Some(color(0xb8bac0, 1.0))
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
        assert!(title.starts_with(kind.text.unwrap().trim_end_matches('…')));
        assert_eq!(kind.text_color, Some(color(0xe2c568, 1.0)));
        assert_eq!(
            named(&rt, "session-clock").text_color,
            Some(color(0xb9b9bd, 1.0))
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
    assert_eq!(named(&rt, "session-rule").fill, color(0xf5f5f5, 0.10));
    assert_eq!(
        named(&rt, "session-class").text_color,
        Some(color(0xd6d6da, 1.0))
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
            assert_eq!(panel.fill, color(0x101113, 0.87));
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
    // GPUI view::shadow_strip: sigma 12.5, spread -12, dy 14, alpha 0.48.
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
