use super::{
    Visual,
    model::*,
    paint_tests::{named, paint, visual},
};
use std::sync::Arc;
use vantare_domain::format::Language;

fn row_case(broadcast: bool) -> Visual {
    let mut v = visual();
    let content = Arc::make_mut(&mut v.content_plan);
    content.rows.truncate(1);
    content.rows[0].position = 7;
    let row = Arc::make_mut(&mut content.rows[0].row);
    row.is_player = true;
    row.driver = "Ana Pérez".into();
    row.number = "42".into();
    row.class = "GT3".into();
    row.laps = "13".into();
    row.classification_gap = "+2.500s".into();
    row.classification_interval = "+0.12s".into();
    row.last_lap_column = None;
    row.best_lap_column = None;
    row.last_lap = "1:42.321".into();
    row.best_lap = "1:41.000".into();
    content.session_best = Some((row.id, 101.0));
    let board = Arc::make_mut(&mut content.board);
    board.content.lap_visible = true;
    board.content.interval_visible = true;
    let c = Arc::make_mut(&mut v.config);
    c.broadcast = broadcast;
    c.row_count = 1;
    c.columns = [
        Metric::Position,
        Metric::DriverNumber,
        Metric::DriverName,
        Metric::Gap,
        Metric::BestLap,
        Metric::LastLap,
        Metric::CurrentLap,
        Metric::Interval,
        Metric::VehicleClass,
    ]
    .into_iter()
    .map(|metric| Column {
        metric,
        preset: Preset::Lg,
        align: None,
        name_mode: NameMode::Full,
        max_chars: 16,
    })
    .collect();
    c.fit(1);
    v.plan = Arc::new(plan(c, content));
    v
}
#[test]
fn gpui_each_cell_keeps_its_literal_text_and_css_baseline() {
    for language in [Language::Es, Language::En] {
        let rt = paint(row_case(false), language);
        let values: Vec<_> = rt.elements().into_iter().filter_map(|e| e.text).collect();
        for value in [
            "7",
            "42",
            "ANA PÉREZ",
            "+2.500",
            "s",
            "1:41.000",
            "1:42.321",
            "13",
            "+0.12s",
            "GT3",
        ] {
            assert!(values.iter().any(|v| v == value), "{value}: {values:?}");
        }
        assert_eq!(named(&rt, "cell-position").rect[1], 50.0); // 43+baseline(6.5,17,14)-14.
        assert_eq!(named(&rt, "cell-number").rect[1], 51.0); // 43+baseline(8,14,11)-11.
        assert_eq!(named(&rt, "player-marker").rect, [3.0, 48.0, 2.0, 20.0]);
        // Presets lg de GPUI: 42/42/200/98/88/88/60/88/66.
        let position = named(&rt, "cell-position");
        let number = named(&rt, "cell-number");
        assert!((position.rect[0] + position.rect[2] / 2.0 - 21.0).abs() < 0.02);
        assert!((number.rect[0] + number.rect[2] / 2.0 - 63.0).abs() < 0.02);
        assert_eq!(named(&rt, "cell-name").rect[0], 92.0);
        let gap = named(&rt, "cell-gap");
        let unit = named(&rt, "cell-gap-unit");
        assert!(((gap.rect[0] + unit.rect[0] + unit.rect[2]) / 2.0 - 333.0).abs() < 0.02);
        assert!((unit.rect[0] - (gap.rect[0] + gap.rect[2] + 2.0)).abs() < 0.02);
        // Última fila de capacidad: GPUI omite incluso los filetes del jugador.
        assert!(
            !rt.elements()
                .iter()
                .any(|e| e.key.as_deref() == Some("row-bottom-rule"))
        );
    }
}

#[test]
fn gpui_broadcast_lap_pills_keep_the_145_degree_gradient_and_twenty_six_pixel_box() {
    let rt = paint(row_case(true), Language::En);
    let pills: Vec<_> = rt
        .instances
        .iter()
        .filter(|i| {
            i.rect[1] == 72.0
                && i.rect[3] == 26.0
                && i.uv[0] != 0.0
                && i.uv[2] == 0.0
                && i.uv[3] == 0.0
        })
        .collect();
    assert_eq!(pills.len(), 2, "mejor y última vuelta");
    for pill in pills {
        assert!((pill.uv[0].atan2(-pill.uv[1]).to_degrees() - 145.0).abs() < 0.01);
        assert_eq!(pill.params[0], 0.0);
        assert_eq!(pill.params[3], 0.65);
        assert_eq!(pill.fill, rune::color::hex("#ffffff").unwrap().premul(0.09));
        assert_eq!(
            pill.border,
            rune::color::hex("#ffffff").unwrap().premul(0.03)
        );
    }
}
#[test]
fn gpui_colours_are_compared_with_srgb_hex_not_raw_linear_channels() {
    let rt = paint(row_case(false), Language::Es);
    for (key, expected) in [
        ("cell-position", "#ffffffff"),
        ("cell-number", "#a5a5abff"),
        ("cell-name", "#f5f5f5ff"),
        ("cell-gap", "#f5f5f5ff"),
        ("cell-gap-unit", "#aaa9afff"),
        ("player-marker", "#ed2431ff"),
    ] {
        let element = named(&rt, key);
        let colour = element.text_color.unwrap_or(element.fill);
        assert_eq!(colour.hex(), expected, "{key}");
    }
    let best = rt
        .elements()
        .into_iter()
        .find(|e| e.text.as_deref() == Some("1:41.000"))
        .unwrap();
    assert_eq!(best.text_color.unwrap().hex(), "#c9b1e9ff");
}
#[test]
fn gpui_driver_name_modes_and_the_only_width_ellipsis_are_literal() {
    for (mode, max, expected) in [
        (NameMode::Full, 16, "ANA PÉREZ"),
        (NameMode::Initial, 16, "A. PÉREZ"),
        (NameMode::Surname, 16, "PÉREZ"),
        (NameMode::Truncate, 5, "ANA …"),
    ] {
        let mut v = row_case(false);
        let c = Arc::make_mut(&mut v.config);
        let column = c
            .columns
            .iter_mut()
            .find(|c| c.metric == Metric::DriverName)
            .unwrap();
        column.name_mode = mode;
        column.max_chars = max;
        v.plan = Arc::new(plan(c, &v.content_plan));
        let rt = paint(v, Language::Es);
        assert_eq!(named(&rt, "cell-name").text.as_deref(), Some(expected));
    }
    let mut v = row_case(false);
    Arc::make_mut(&mut Arc::make_mut(&mut v.content_plan).rows[0].row).driver =
        "Alexander Alejandro Maximiliano de la Rosa Pérez".into();
    let rt = paint(v, Language::Es);
    let value = named(&rt, "cell-name").text.unwrap();
    assert!(
        value.ends_with('…') && value.matches('…').count() == 1,
        "{value}"
    );
}
#[test]
fn gpui_layers_fit_broadcast_signature_and_every_name_alignment() {
    for broadcast in [false, true] {
        for align in [Align::Left, Align::Center, Align::Right] {
            let mut v = row_case(broadcast);
            let c = Arc::make_mut(&mut v.config);
            for column in &mut c.columns {
                column.align = Some(align);
            }
            v.plan = Arc::new(plan(c, &v.content_plan));
            let size = v.size();
            let mut rt = paint(v, Language::En);
            crate::testdata::assert_inside_window(&mut rt, size);
            if broadcast {
                assert!(
                    !rt.elements()
                        .iter()
                        .any(|e| e.key.as_deref() == Some("player-marker"))
                );
                assert_eq!(named(&rt, "player-background").radius, 6.0);
            }
        }
    }
}
