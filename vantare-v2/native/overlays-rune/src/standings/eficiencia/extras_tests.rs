use super::{
    Visual,
    model::*,
    paint_tests::{named, paint, visual},
};
use std::sync::Arc;
use vantare_domain::{format::Language, standings::InfoCell};

fn refresh(v: &mut Visual) {
    v.plan = Arc::new(plan(&v.config, &v.content_plan));
}
fn cells(n: usize) -> Vec<InfoCell> {
    (0..n)
        .map(|i| InfoCell {
            id: format!("cell-{i}"),
            label: "AAA".into(),
            value: "000".into(),
            stale: false,
        })
        .collect()
}
fn classes(names: &[&str]) -> Visual {
    let mut v = visual();
    let mut next = (*v.content_plan).clone();
    next.rows.truncate(names.len());
    for (row, name) in next.rows.iter_mut().zip(names) {
        Arc::make_mut(&mut row.row).class = (*name).into();
    }
    let c = Arc::make_mut(&mut v.config);
    c.row_count = 7;
    c.multiclass = true;
    v.ingest(Arc::new(next));
    v
}
#[test]
fn gpui_fixed_size_separates_footer_reserve_and_multiclass_height() {
    let mut v = visual();
    let c = Arc::make_mut(&mut v.config);
    c.row_count = 7;
    c.show_session_footer = false;
    c.fit(7);
    assert_eq!(c.height, 252.0);
    assert_eq!(c.footer_height(), 0.0);
    c.show_session_footer = true;
    c.fit(7);
    assert_eq!(c.height, 274.0);
    assert_eq!(c.footer_height(), 22.0);
    c.footer_slots = (0..9).map(|i| format!("s{i}")).collect();
    c.footer_rows = 2;
    assert_eq!(c.footer_height(), 43.0);
    // Config::fit reserva el estilo (22); el plan descuenta el pie calculado.
    c.fit(7);
    assert_eq!(c.height, 274.0);
    let v = classes(&["HYP", "LMP2", "GTE"]);
    assert_eq!(v.config.height, 358.0); // 274 + 3*28.
}
#[test]
fn gpui_footer_rows_recalculate_for_more_than_five_slots_without_growing_the_fixed_box() {
    let mut v = visual();
    Arc::make_mut(&mut v.config).footer_slots = (0..9).map(|i| format!("s{i}")).collect();
    let mut next = (*v.content_plan).clone();
    Arc::make_mut(&mut next.board).footer_cells = cells(9);
    assert_eq!(crate::eficiencia::footer_rows(&cells(9), 416.0), 2);
    v.ingest(Arc::new(next));
    assert_eq!(v.config.footer_rows, 2);
    assert_eq!(v.config.footer_height(), 43.0);
    assert_eq!(v.config.height, 364.0);
    let mut next = (*v.content_plan).clone();
    Arc::make_mut(&mut next.board).footer_cells = cells(6);
    v.ingest(Arc::new(next));
    assert_eq!(v.config.footer_height(), 29.0);
}
#[test]
fn gpui_class_bands_keep_the_palette_geometry_and_nine_pixel_badge_font() {
    for (class, hex) in [
        ("HYPER", "#e63946ff"),
        ("DP", "#e63946ff"),
        ("LMP2", "#5b8bd6ff"),
        ("P2", "#5b8bd6ff"),
        ("GTE", "#e2c568ff"),
        ("GT3", "#e2c568ff"),
        ("OTHER", "#b9b9bdff"),
    ] {
        let rt = paint(classes(&[class]), Language::Es);
        assert_eq!(named(&rt, "class-band-0").rect, [0.0, 43.0, 440.0, 28.0]);
        let text = named(&rt, "class-band-label-0");
        assert_eq!(&text.rect[..2], &[20.0, 52.0]); // y+18-ascent(9).
        assert_eq!(text.text_color.unwrap().hex(), hex);
        assert_eq!(
            named(&rt, "class-band-tick-0").rect,
            [10.0, 50.0, 2.0, 14.0]
        );
        for y in [43.0,70.0] {
            assert!(rt.elements().iter().any(|e|e.rect==[0.0,y,440.0,1.0] && e.fill.hex()=="#f5f5f51a"));
        }
        let gradient = rt
            .instances
            .iter()
            .find(|i| i.rect == [0.0, 43.0, 440.0, 28.0] && i.uv[1] != 0.0 && i.params[3] == 1.0)
            .unwrap();
        let alpha = if class == "OTHER" { 0.05 } else { 0.11 };
        assert_eq!(gradient.fill, rune::color::hex(hex).unwrap().premul(alpha));
    }
    let rt = paint(classes(&["LMP2", "GTE"]), Language::Es);
    assert_eq!(named(&rt, "class-band-1").rect, [0.0, 101.0, 440.0, 28.0]);
}
#[test]
fn gpui_nine_slots_wrap_to_two_lines_with_muted_and_ink_colours() {
    let mut v = visual();
    let c = Arc::make_mut(&mut v.config);
    c.footer_slots = (0..9).map(|i| format!("s{i}")).collect();
    let mut next = (*v.content_plan).clone();
    let mut info = cells(9);
    info[8].stale = true;
    Arc::make_mut(&mut next.board).footer_cells = info;
    v.ingest(Arc::new(next));
    let rt = paint(v, Language::Es);
    assert_eq!(
        named(&rt, "footer-label-0").text_color.unwrap().hex(),
        "#b9b9bdff"
    );
    assert_eq!(
        named(&rt, "footer-value-0").text_color.unwrap().hex(),
        "#f5f5f5ff"
    );
    assert_eq!(
        named(&rt, "footer-value-8").text_color.unwrap().hex(),
        "#f5f5f599"
    );
    let first = named(&rt, "footer-value-0");
    let last = named(&rt, "footer-value-8");
    assert_eq!(last.rect[1] - first.rect[1], 15.0); // value_size(11)+4, no 14.
    assert_eq!(named(&rt, "footer-rule").rect, [0.0, 322.0, 440.0, 1.0]); // 364-(16+11+15).
}
#[test]
fn gpui_nonlegacy_id_uses_styled_cells_and_classic_metrics_are_centred() {
    let mut v = visual();
    Arc::make_mut(&mut v.config).footer_ids = vec!["time".into(), "none".into()];
    Arc::make_mut(&mut Arc::make_mut(&mut v.content_plan).board).footer_cells = vec![InfoCell {
        id: "time".into(),
        label: "TIEMPO".into(),
        value: "00:12".into(),
        stale: false,
    }];
    let rt = paint(v, Language::Es);
    assert_eq!(named(&rt, "footer-label-0").text.as_deref(), Some("TIEMPO"));
    assert_eq!(
        named(&rt, "footer-label-0").text_color.unwrap().hex(),
        "#b9b9bdff"
    );
    let mut v = visual();
    let board = Arc::make_mut(&mut Arc::make_mut(&mut v.content_plan).board);
    board.content.legacy_track_visible = true;
    board.track = "Le Mans".into();
    board.laps_remaining = "12".into();
    let rt = paint(v, Language::Es);
    let first = named(&rt, "footer-label-0");
    let last = named(&rt, "footer-value-1");
    assert!(((first.rect[0] + last.rect[0] + last.rect[2]) / 2.0 - 220.0).abs() < 0.02);
    assert_eq!(first.text_color.unwrap().hex(), "#a7a9b0ff");
    assert_eq!(last.text_color.unwrap().hex(), "#e8e8edff");
    assert_eq!(last.rect[1], 348.0); // base358-ascent(10).
    assert_eq!(
        named(&rt, "footer-background").rect,
        [0.0, 342.0, 440.0, 22.0]
    );
}
#[test]
fn gpui_pit_rail_uses_the_declared_header_plus_the_two_pixel_badge_inset() {
    let mut v = visual();
    let next = Arc::make_mut(&mut v.content_plan);
    next.rows.truncate(1);
    Arc::make_mut(&mut next.rows[0].row).in_pits = true;
    refresh(&mut v);
    let size = v.size();
    assert_eq!(size, (474.0, 364.0));
    let mut rt = paint(v, Language::Es);
    let badge = named(&rt, "pit-badge-0");
    assert_eq!(badge.rect, [440.0, 44.0, 34.0, 26.0]);
    assert_eq!(badge.fill.hex(), "#e2c568ff");
    let text = named(&rt, "pit-label-0");
    assert_eq!(text.text.as_deref(), Some("PIT"));
    assert_eq!(text.rect[1], 52.0);
    assert!((text.rect[0] + text.rect[2] / 2.0 - 456.5).abs() < 0.02);
    assert_eq!(text.text_color.unwrap().hex(), "#151517ff");
    assert!(
        rt.instances
            .iter()
            .any(|i| i.rect == badge.rect && i.radii == [0.0, 3.0, 3.0, 0.0])
    );
    assert!(rt.instances.iter().any(|i| i.rect==badge.rect && i.uv==[2.0,2.0,2.0,1.0]
        && i.border==rune::color::hex("#151517").unwrap().premul(1.0)));
    assert!(rt.instances.iter().any(|i|i.params[1]==1.0 && i.params[2]==2.0
        && i.fill==rune::color::hex("#e2c568").unwrap().premul(0.22))); // blur4 -> sigma2 en Rune.
    crate::testdata::assert_inside_window(&mut rt, size);
}
#[test]
fn gpui_missing_and_disconnected_paint_gold_notice_in_both_languages_without_rows() {
    for (language, titles) in [
        (Language::Es, ["SIN DATOS", "DESCONECTADO"]),
        (Language::En, ["NO DATA", "DISCONNECTED"]),
    ] {
        for (status, title) in [Status::Missing, Status::Disconnected]
            .into_iter()
            .zip(titles)
        {
            let mut v = visual();
            Arc::make_mut(&mut v.content_plan).status = status;
            refresh(&mut v);
            let rt = paint(v, language);
            let text = named(&rt, "unavailable");
            assert_eq!(text.text.as_deref(), Some(title));
            assert_eq!(&text.rect[..2], &[12.0, 94.0]); // table_top42 + loose42 +10.
            assert_eq!(text.text_color.unwrap().hex(), "#e2c568ff");
            assert_eq!(named(&rt,"footer-value-0").text.as_deref(),Some("—"));
            assert!(!rt.elements().iter().any(|e| {
                e.key
                    .as_deref()
                    .is_some_and(|k| k.starts_with("efficiency-row-"))
            }));
        }
    }
}
#[test]
fn every_e4_layer_stays_inside_the_gpui_box_for_each_footer_band_and_rail_combination() {
    for broadcast in [false, true] {
        for multiclass in [false, true] {
            for slots in [false, true] {
                for pit in [false, true] {
                    let mut v = classes(&["LMP2", "GTE"]);
                    let c = Arc::make_mut(&mut v.config);
                    c.multiclass = multiclass;
                    c.broadcast = broadcast;
                    if !pit {
                        c.columns.retain(|c| c.metric != Metric::Pit);
                    }
                    if slots {
                        c.footer_slots = (0..9).map(|i| format!("s{i}")).collect();
                    }
                    let mut next = (*v.content_plan).clone();
                    Arc::make_mut(&mut next.rows[0].row).in_pits = true;
                    Arc::make_mut(&mut next.board).footer_cells = cells(9);
                    v.ingest(Arc::new(next));
                    refresh(&mut v);
                    let size = v.size();
                    let mut rt = paint(v, Language::En);
                    assert_eq!(
                        rt.elements()
                            .iter()
                            .any(|e| e.key.as_deref() == Some("pit-badge-0")),
                        pit
                    );
                    crate::testdata::assert_inside_window(&mut rt, size);
                }
            }
        }
    }
}

#[test]
fn host_bounds_include_absence_pause_and_each_real_settings_combination() {
    use crate::widget::Widget;
    use vantare_domain::{Quality,SourceState,format::Preferences,
        widget_settings::{columns::ColumnSetting,standings::Settings}};
    let photo=vantare_ipc::snapshot_from_json(include_str!("../../../../ui/fixtures/standings.snapshot.json")).unwrap();
    let assets=Arc::new(rune::ImageCache::new(Arc::new(||{})));
    for broadcast in [false,true] { for multiclass in [false,true] { for footer in [false,true] {
        for slots in [false,true] { for pit in [false,true] {
            let mut columns=[("position","xs"),("driverNumber","sm"),("driverName","lg"),("gap","md"),("bestLap","lg")].into_iter()
                .map(|(metric,preset)|ColumnSetting{metric_id:metric.into(),width_preset:preset.into(),..ColumnSetting::default()}).collect::<Vec<_>>();
            if pit { columns.push(ColumnSetting{metric_id:"pit".into(),..ColumnSetting::default()}); }
            let settings=Settings{row_count:7,columns:Some(columns),show_session_footer:footer,
                template_id:if broadcast {"broadcast"} else {"signature"}.into(),
                classification_mode:if multiclass {"multiclass"} else {"normal"}.into(),class_scope:"all-classes".into(),
                footer_slots:slots.then(||["track","trackTemperature","airTemperature","remaining","rain","wetness","totalLaps","estimatedLaps"].into_iter().map(String::from).collect()),
                ..Settings::eficiencia()};
            for state in [SourceState::Live,SourceState::Stale,SourceState::Waiting,SourceState::Lost,SourceState::Paused] {
                let mut w=super::control::Eficiencia::new(&settings,Preferences::default());
                w.attach_assets(&assets);
                let mut snapshot=photo.clone();
                snapshot.state.cars[0].in_pits=Quality::Reliable(true);
                if state==SourceState::Paused { w.update(&snapshot,0.0); }
                snapshot.state.source_state=state;
                let predicted=w.size_for(Some(&snapshot));
                w.update(&snapshot,0.1);
                assert_eq!(w.size(),predicted);
                for image in w.capture_images() { image.wait().unwrap(); }
                let mut rt=rune::Runtime::with_text(w,|s,_|s.view(),(predicted.width,predicted.height),rune::Env::new(true,1.0),rune::text::TextSystem::new(crate::eficiencia::FONTS,("Inter W400","Inter W400")));
                rt.frame(0.0);
                assert_eq!(rt.elements().iter().any(|e|e.key.as_deref()==Some("footer-rule")),footer);
                assert_eq!(rt.elements().iter().any(|e|e.key.as_deref()==Some("pause-band")),state==SourceState::Paused);
                crate::testdata::assert_inside_window(&mut rt,(predicted.width,predicted.height));
            }
        }}
    }}}
}
