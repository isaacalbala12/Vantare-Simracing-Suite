use super::*;
use crate::standings::{
    Standings, content,
    painting_tests::{config, host, paint, texts},
    tests::photos,
};
use crate::widget::Widget;
use rune::{ElementInfo, text::TextSystem};
use std::sync::Arc;
use vantare_domain::{format::Preferences, widget_settings::columns::ColumnSetting};
fn near(a: f32, b: f32) {
    assert!((a - b).abs() < 0.02, "{a} != {b}");
}
fn named(rt: &rune::Runtime<Standings>, value: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.text.as_deref() == Some(value))
        .unwrap_or_else(|| panic!("{value}: {:?}", texts(rt)))
}
fn projected() -> Standings {
    let mut w = Standings::new(&config("expanded"), Preferences::default());
    w.update(&photos()[0], 0.0);
    w
}
#[test]
fn gpui_flags_contract_and_efficiency_projection_do_not_change_vantare_header() {
    for enabled in [true, false] {
        let mut settings = config("expanded");
        settings.columns.as_mut().unwrap().push(ColumnSetting {
            metric_id: "currentLap".into(),
            enabled,
            ..ColumnSetting::default()
        });
        for c in settings.columns.as_mut().unwrap() {
            if c.metric_id == "interval" {
                c.enabled = enabled;
            }
        }
        let facts = content(&settings);
        assert_eq!(
            (facts.lap_visible, facts.interval_visible),
            (enabled, enabled)
        );
        let b = vantare_domain::standings::project_content(
            &photos()[0],
            Preferences::default(),
            &facts,
        );
        let plan = vantare_domain::standings::Plan::new(Arc::new(b), String::new(), 0);
        let me = plan.rows.iter().find(|r| r.is_player).unwrap();
        assert_eq!(plan.current_lap(me), if enabled { "13" } else { "—" });
        assert_eq!(plan.interval(me), if enabled { "+2.52s" } else { "—" });
        let rt = host(
            Standings::new(&settings, Preferences::default()),
            &photos()[0],
        );
        assert!(
            texts(&rt).contains(&"14/38".into()),
            "GPUI Vantare no consulta lap_visible"
        );
        assert_eq!(texts(&rt).contains(&"+2.518".into()), enabled);
    }
    let mut settings = config("standard");
    settings.columns = None;
    let facts = content(&settings);
    assert!(!facts.lap_visible && !facts.interval_visible);
    assert!(facts.footer_visible && facts.legacy_track_visible && !facts.footer_slots);
    assert_eq!(facts.footer_ids, ["track", "estimatedLaps"]);
    settings.footer_slots = Some(vec!["trackTemperature".into()]);
    let facts = content(&settings);
    assert!(facts.footer_slots && !facts.legacy_track_visible);
    assert_eq!(facts.footer_ids, ["trackTemperature"]);
    settings.show_session_footer = false;
    assert!(!content(&settings).footer_visible);
}
#[test]
fn gpui_header_right_edge_reserves_brand_and_its_twelve_pixel_margin() {
    let photo = photos().remove(0);
    let mut settings = config("standard");
    settings.brand_visible = Some(false);
    let rt = host(Standings::new(&settings, Preferences::default()), &photo);
    let right = named(&rt, "HY");
    near(right.rect[0] + right.rect[2], 508.0);
    settings.brand_visible = Some(true);
    let rt = host(Standings::new(&settings, Preferences::default()), &photo);
    let right = named(&rt, "HY");
    let brand = named(&rt, "VANTARE");
    near(brand.rect[0] + brand.rect[2], 508.0);
    // Kit::brand: símbolo 46*9/41, gap 4, margin 12; todos literales GPUI.
    near(
        right.rect[0] + right.rect[2],
        brand.rect[0] - 10.097_561 - 4.0 - 12.0,
    );
    assert!(right.rect[0] + right.rect[2] < brand.rect[0]);
}
#[test]
fn gpui_header_counts_ambiguous_class_names_and_rule_geometry() {
    let mut w = projected();
    w.scene.options.mode = Mode::AllClasses;
    let board = Arc::make_mut(w.scene.board.as_mut().unwrap());
    for g in &mut board.groups {
        g.short = "GT3".into();
    }
    let rt = paint(w);
    assert!(texts(&rt).iter().any(|s| s.ends_with("3 CLASES")));
    let mut w = projected();
    Arc::make_mut(&mut w.style).styles.neo.header_rule = 0.5;
    let rt = paint(w);
    let expected = rune::color::hex("#e14a5480").unwrap();
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.rect == [12.0, 28.0, 876.0, 1.0]
                && (e.fill.a - 0.5).abs() < 0.001
                && e.fill.r == expected.r)
    );
}
#[test]
fn gpui_player_presence_controls_highlight_and_best_personal_colour() {
    for present in [false, true] {
        for white in [0.0, 0.2] {
            let mut w = projected();
            Arc::make_mut(&mut w.style).styles.neo.player_white = white;
            let b = Arc::make_mut(w.scene.board.as_mut().unwrap());
            b.player_present = present;
            let me = Arc::make_mut(&mut b.groups[0].rows[2]);
            me.best_mark = Mark::Slower;
            me.best_lap = "3:33.333".into();
            let best = me.best_lap.clone();
            let rt = paint(w);
            let layers: Vec<_> = rt
                .elements()
                .into_iter()
                .filter(|e| e.rect == [6.0, 99.0, 888.0, 24.0])
                .collect();
            assert_eq!(layers.len(), usize::from(present));
            if present && white > 0.0 {
                let c = layers[0].fill;
                assert_eq!((c.r, c.g, c.b, c.a), (1.0, 1.0, 1.0, 0.2));
            }
            if present && white == 0.0 {
                let gradient = rt
                    .instances
                    .iter()
                    .find(|i| i.rect == [6.0, 99.0, 888.0, 24.0] && i.fill[3] > 0.0)
                    .unwrap();
                for (a, b) in gradient
                    .fill
                    .into_iter()
                    .zip(rune::color::hex("#e14a54").unwrap().premul(0.32))
                {
                    near(a, b);
                }
            }
            let best = named(&rt, &best);
            assert_eq!(
                best.text_color,
                Some(rune::color::hex(if present { "#4ade80" } else { "#a39a9c" }).unwrap())
            );
        }
    }
}
#[test]
fn gpui_class_leader_gained_loss_even_and_player_best_inks() {
    let mut w = projected();
    w.scene.options.mode = Mode::AllClasses;
    w.scene.options.rows = 30;
    let b = Arc::make_mut(w.scene.board.as_mut().unwrap());
    Arc::make_mut(&mut b.groups[0].rows[0]).gained = Some(-3);
    Arc::make_mut(&mut b.groups[0].rows[1]).gained = Some(0);
    w.scene.plan = super::super::layout::plan(w.scene.board.as_deref(), &w.scene.options, &w.style);
    let rt = paint(w);
    assert!(texts(&rt).contains(&"1º LMP2".into()));
    assert!(texts(&rt).contains(&"1º GT3".into()));
    assert_eq!(
        named(&rt, "▼3").text_color,
        Some(rune::color::hex("#ff7a82").unwrap())
    );
    assert_eq!(
        named(&rt, "–").text_color,
        Some(rune::color::hex("#5e5658").unwrap())
    );
}
#[test]
fn gpui_fit_uses_real_text_tolerance_and_tabular_kerning_features() {
    let _fonts = TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
    let style = Style::compiled();
    let o = Options::from_settings(&config("standard"));
    let plan = super::super::layout::plan(None, &o, &style);
    let p = Painter {
        options: &o,
        board: None,
        plan: &plan,
        style: &style,
        variant: o.variant(&style),
        accent: o.accent(&style),
        language: Language::Es,
        nodes: vec![],
    };
    let ink = p.ink(Face::Mono, 12.0, 0.0, WHITE);
    assert_eq!(p.fit("ABCDEFGH", &ink, 30.0), "ABC…");
    let width = p.width("ABCD", &ink);
    assert_eq!(p.fit("ABCD", &ink, width - 0.009), "ABCD");
    assert_eq!(p.fit("ABCD", &ink, width - 0.011), "AB…");
    assert_eq!(
        p.ink(Face::Body, 13.0, 0.0, WHITE).0.features,
        "'tnum' 1, 'kern' 1"
    );
}
#[test]
fn gpui_zero_alpha_panel_omits_shadows_and_border_work() {
    let mut w = projected();
    let v = &mut Arc::make_mut(&mut w.style).styles.neo;
    v.border.a = 0.0;
    v.border_accent = 0.0;
    v.shadow_alpha = 0.0;
    let rt = paint(w);
    assert!(
        rt.presented_pose("standings-panel")
            .unwrap()
            .shadows()
            .is_empty()
    );
    assert!(
        !rt.instances
            .iter()
            .any(|i| i.rect[2] == 900.0 && matches!(i.params[1], 0.0 | 4.0) && i.params[0] > 0.0)
    );
}
