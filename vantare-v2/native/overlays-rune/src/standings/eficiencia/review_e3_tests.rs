use super::super::{
    model::*,
    paint_tests::{named, paint},
    table_tests::row_case,
};
use super::Eficiencia;
use crate::widget::Widget;
use rune::{ElementInfo, Runtime};
use std::sync::Arc;
use vantare_domain::{
    CarId, SourceState,
    format::{Language, Preferences},
    widget_session::Session,
    widget_settings::{columns::ColumnSetting, standings::Settings},
};
fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.02, "{a} != {b}");
}
fn text(rt: &Runtime<(super::Visual, Language)>, value: &str) -> ElementInfo {
    rt.elements()
        .into_iter()
        .find(|e| e.text.as_deref() == Some(value))
        .expect(value)
}
fn two_rows(player: bool, broadcast: bool) -> super::Visual {
    let mut v = row_case(broadcast);
    let p = Arc::make_mut(&mut v.content_plan);
    Arc::make_mut(&mut p.rows[0].row).is_player = player;
    let mut second = p.rows[0].clone();
    second.id = CarId(999);
    Arc::make_mut(&mut second.row).id = CarId(999);
    Arc::make_mut(&mut second.row).is_player = false;
    p.rows.push(second);
    let c = Arc::make_mut(&mut v.config);
    c.row_count = 2;
    c.fit(2);
    v.plan = Arc::new(plan(c, p));
    v
}
#[test]
fn pause_uses_the_gpui_host_rectangle_alpha_and_baseline_sixteen() {
    let columns = [
        ("position", "xs"),
        ("driverNumber", "sm"),
        ("driverName", "lg"),
        ("gap", "md"),
        ("bestLap", "lg"),
        ("pit", "auto"),
    ]
    .into_iter()
    .map(|(metric, preset)| ColumnSetting {
        metric_id: metric.into(),
        width_preset: preset.into(),
        ..ColumnSetting::default()
    })
    .collect();
    let settings = Settings {
        row_count: 6,
        columns: Some(columns),
        ..Settings::eficiencia()
    };
    let mut w = Eficiencia::new(&settings, Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    w.update(&photo, 0.0);
    photo.state.source_state = SourceState::Paused;
    w.update(&photo, 0.1);
    let mut rt = Runtime::with_text(
        w,
        |s, _| s.view(),
        (474.0, 266.0),
        rune::Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
    );
    rt.frame(0.0);
    let elements = rt.elements();
    let band = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("pause-band"))
        .unwrap();
    assert_eq!(band.rect, [0.0, 244.0, 474.0, 22.0]);
    let title = elements
        .iter()
        .find(|e| e.text.as_deref() == Some("EN PAUSA"))
        .unwrap();
    assert_eq!(&title.rect[..2], &[8.0, 249.0]); // base244+16 menos ascenso11.
    assert_eq!(title.rect[3], 14.0);
    close(
        title.rect[2],
        crate::eficiencia::width("EN PAUSA", crate::eficiencia::font(11.0, 600, 0.02)),
    );
    assert_eq!(band.fill.hex(), "#101113f2");
    assert_eq!(band.fill.a, 0.95);
    crate::testdata::assert_inside_window(&mut rt, (474.0, 266.0));
}
#[test]
fn switching_session_reingests_the_same_board_with_all_multiclass_bands() {
    let settings = Settings {
        row_count: 6,
        classification_mode: "multiclass".into(),
        class_scope: "all-classes".into(),
        practice_columns: Some(vec![ColumnSetting {
            metric_id: "driverName".into(),
            width_preset: "sm".into(),
            ..ColumnSetting::default()
        }]),
        ..Settings::eficiencia()
    };
    let mut w = Eficiencia::new(&settings, Preferences::default());
    let photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    w.update(&photo, 0.0);
    let board = w.visual.content_plan.board.clone();
    let identity = w.visual.content_plan.identity.clone();
    w.switch_session(Session::Practice);
    assert!(w.board.is_none());
    assert_eq!(w.visual.content_plan.status, Status::Disconnected);
    w.visual.ingest(Arc::new(ContentPlan::new(
        board.clone(),
        identity,
        photo.sequence,
    )));
    assert!(Arc::ptr_eq(&w.visual.content_plan.board, &board));
    assert_eq!(w.visual.plan.visible_rows, 6);
    assert_eq!(
        w.visual.plan.row_tops,
        [28.0, 58.0, 116.0, 146.0, 204.0, 234.0]
    );
    assert_eq!(w.visual.plan.class_bands.len(), 3);
}
#[test]
fn gpui_column_labels_keep_signature_and_broadcast_positions_and_rules() {
    let rt = paint(row_case(false), Language::Es);
    let gap = text(&rt, "AL LÍDER");
    close(gap.rect[0] + gap.rect[2] / 2.0, 333.0);
    assert_eq!(gap.rect[1], 16.0); // baseline24-size8.
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.rect == [325.0, 29.0, 17.0, 1.0] && e.fill.hex() == "#f5f5f559")
    );
    assert_eq!(named(&rt, "heading-rule-0").rect, [0.0, 42.0, 284.0, 1.0]);
    assert_eq!(named(&rt, "heading-rule-0").fill.hex(), "#f5f5f51a");
    let grad = rt
        .instances
        .iter()
        .find(|i| i.rect == [0.0, 0.0, 284.0, 43.0] && i.uv[1] != 0.0 && i.params[3] == 1.0)
        .unwrap();
    close(
        grad.uv[0].atan2(-grad.uv[1]).to_degrees().rem_euclid(360.0),
        180.0,
    );
    assert_eq!(grad.fill, rune::color::hex("#ffffff").unwrap().premul(0.02));
    assert_eq!(grad.border, [0.0; 4]);
    let rt = paint(row_case(true), Language::En);
    let label = text(&rt, "POS");
    close(label.rect[0] + label.rect[2] / 2.0, 21.0);
    assert_eq!(label.rect[1], 53.0); // table_top46+baseline15-ascent8.
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.rect == [0.0, 46.0, 42.0, 24.0] && e.fill.hex() == "#00000021")
    );
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.rect[2..] == [17.0, 1.0] && e.fill.a == 0.35)
    );
    let mut v = row_case(false);
    let c = Arc::make_mut(&mut v.config);
    c.show_session_header = false;
    c.fit(1);
    v.plan = Arc::new(plan(c, &v.content_plan));
    let rt = paint(v, Language::Es);
    assert_eq!(named(&rt, "driver-heading").text.as_deref(), Some("PILOTO"));
    assert_eq!(&named(&rt, "driver-heading").rect[..2], &[8.0, 10.0]);
}
#[test]
fn gpui_nonplayer_top_three_and_player_row_alphas_are_literal() {
    let mut v = two_rows(false, false);
    v.set_study("default");
    let width = v.config.width;
    let rt = paint(v, Language::Es);
    assert_eq!(
        named(&rt, "cell-position").text_color.unwrap().hex(),
        "#b9bbc1ff"
    );
    assert_eq!(named(&rt, "row-bottom-rule").fill.hex(), "#f5f5f51a");
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.rect == [0.0, 43.0, width, 30.0] && e.fill.hex() == "#ffffff08")
    );
    for (broadcast, alpha, top) in [(false, 0.17, 43.0), (true, 0.23, 70.0)] {
        let v = two_rows(true, broadcast);
        let width = v.config.width;
        let rt = paint(v, Language::Es);
        assert_eq!(
            named(&rt, "player-background").fill,
            rune::color::hex("#bfc2ca").unwrap().alpha(alpha)
        );
        assert!(
            rt.elements()
                .iter()
                .any(|e| e.rect == [0.0, top, width, 1.0] && e.fill.hex() == "#ffffff21")
        );
        assert_eq!(named(&rt, "row-bottom-rule").fill.hex(), "#ffffff14");
    }
}
#[test]
fn gpui_remaining_metric_cells_pace_stale_and_bilingual_labels_are_literal() {
    for (language, gap, lap) in [
        (Language::Es, "AL MEJOR", "VUELTA"),
        (Language::En, "TO BEST", "LAP"),
    ] {
        let mut v = row_case(false);
        let content = Arc::make_mut(&mut v.content_plan);
        content.status = Status::Stale;
        content.session_best = None;
        Arc::make_mut(&mut content.board).gap_to_best_lap = true;
        let rt = paint(v, language);
        text(&rt, gap);
        text(&rt, lap);
        assert_eq!(text(&rt, "+2.500").text_color.unwrap().hex(), "#bdbdc2ff");
        assert_eq!(text(&rt, "1:41.000").text_color.unwrap().hex(), "#f5f5f5ff");
        assert_eq!(text(&rt, "1:42.321").text_color.unwrap().hex(), "#e6e5e9ff");
        for (value, right) in [("1:42.321", 550.0), ("13", 610.0), ("+0.12s", 698.0)] {
            let e = text(&rt, value);
            close(e.rect[0] + e.rect[2], right);
            assert_eq!(e.rect[1], 50.0);
        }
        let class = text(&rt, "GT3");
        close(class.rect[0] + class.rect[2] / 2.0, 739.0);
        assert_eq!(class.text_color.unwrap().hex(), "#f5f5f5ff");
    }
    let rt = paint(row_case(true), Language::En);
    for bounds in [[408.0, 72.0, 76.0, 26.0], [496.0, 72.0, 76.0, 26.0]] {
        assert!(
            rt.instances
                .iter()
                .any(|i| i.rect == bounds && i.params[3] == 0.65)
        );
    }
}
