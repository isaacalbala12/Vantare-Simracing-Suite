use super::{Visual, model::*, style::Style};
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    standings,
    widget_settings::{columns::ColumnSetting, standings::Settings},
};
fn photo() -> Snapshot {
    vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .expect("fixture GPUI Eficiencia DTO v11")
}
fn content() -> ContentPlan {
    ContentPlan::new(
        Arc::new(standings::project(&photo(), Preferences::default())),
        String::new(),
        0,
    )
}
fn column(metric: Metric, preset: Preset) -> Column {
    Column {
        metric,
        preset,
        align: None,
        name_mode: NameMode::Full,
        max_chars: 16,
    }
}
#[test]
fn gpui_signature_reference_widths_heights_and_integrated_header() {
    let mut c = Config::reference();
    c.fit(10);
    assert_eq!((c.width, c.height), (440.0, 364.0));
    let p = plan(&c, &content());
    assert_eq!(p.widths, [30.0, 30.0, 200.0, 92.0, 88.0]);
    assert_eq!(p.identity_span, 3);
    assert!(!p.external_header);
    assert_eq!((p.head_row, p.table_top, p.visible_rows), (43.0, 0.0, 10));
    assert_eq!(
        p.row_tops,
        [
            0.0, 30.0, 60.0, 90.0, 120.0, 150.0, 180.0, 210.0, 240.0, 270.0
        ]
    );
}
#[test]
fn gpui_column_minima_presets_and_driver_name_branches_are_literal() {
    for (metric, minimum) in [
        (Metric::Position, 30.0),
        (Metric::DriverNumber, 30.0),
        (Metric::Gap, 86.0),
        (Metric::Interval, 76.0),
        (Metric::LastLap, 76.0),
        (Metric::BestLap, 76.0),
        (Metric::Pit, 32.0),
        (Metric::CurrentLap, 48.0),
        (Metric::VehicleClass, 54.0),
    ] {
        for (preset, extra) in [
            (Preset::Xs, 0.0),
            (Preset::Sm, 0.0),
            (Preset::Md, 6.0),
            (Preset::Lg, 12.0),
            (Preset::Auto, 0.0),
        ] {
            assert_eq!(column_width(&column(metric, preset)), minimum + extra);
        }
    }
    for (mode, plain, broadcast) in [
        (NameMode::Full, 188.0, 208.0),
        (NameMode::Initial, 140.0, 160.0),
        (NameMode::Surname, 124.0, 144.0),
        (NameMode::Truncate, 158.0, 158.0),
    ] {
        let mut c = column(Metric::DriverName, Preset::Auto);
        c.name_mode = mode;
        assert_eq!(column_width_for(&c, false), plain);
        assert_eq!(column_width_for(&c, true), broadcast);
        if mode == NameMode::Truncate {
            c.max_chars = 1;
            assert_eq!(column_width(&c), 96.0);
            c.max_chars = 128;
            assert_eq!(column_width(&c), 188.0);
        }
    }
    assert_eq!(identity_span(&[column(Metric::DriverName, Preset::Lg)]), 0);
    assert_eq!(
        identity_span(&[
            column(Metric::VehicleClass, Preset::Xs),
            column(Metric::DriverName, Preset::Xs)
        ]),
        2
    );
}
#[test]
fn gpui_broadcast_hidden_header_brand_and_footer_reservations() {
    let mut c = Config::reference();
    c.broadcast = true;
    c.fit(10);
    assert_eq!((c.width, c.height), (460.0, 392.0));
    let p = plan(&c, &content());
    assert!(p.external_header);
    assert_eq!(
        (p.loose_header, p.head_row, p.table_header),
        (46.0, 24.0, 24.0)
    );
    c.broadcast = false;
    c.show_session_header = false;
    c.brand_visible = Some(true);
    c.fit(10);
    assert_eq!(c.height, 372.0);
    let p = plan(&c, &content());
    assert_eq!((p.brand_band, p.table_top, p.head_row), (22.0, 22.0, 28.0));
    c.show_session_footer = false;
    c.fit(10);
    assert_eq!(c.height, 350.0);
    assert_eq!(c.footer_height(), 0.0);
    c.show_session_footer = true;
    c.footer_slots = vec!["track".into()];
    c.footer_rows = 2;
    assert_eq!(c.footer_height(), 43.0);
}
#[test]
fn gpui_settings_column_contract_and_default_last_lap_match_the_real_config() {
    let settings = Settings {
        row_count: 10,
        ..Settings::eficiencia()
    };
    let c = Config::from_settings(&settings);
    assert_eq!(c.row_count, 10);
    assert!(c.columns.iter().any(|c| c.metric == Metric::LastLap));
    assert!(
        !c.columns
            .iter()
            .any(|c| matches!(c.metric, Metric::Pit | Metric::BestLap))
    );
    let mut settings = settings;
    settings.columns = Some(vec![
        ColumnSetting {
            metric_id: "carNumber".into(),
            width_preset: "lg".into(),
            ..ColumnSetting::default()
        },
        ColumnSetting {
            metric_id: "currentLap".into(),
            ..ColumnSetting::default()
        },
        ColumnSetting {
            metric_id: "unknown".into(),
            ..ColumnSetting::default()
        },
        ColumnSetting {
            metric_id: "gap".into(),
            enabled: false,
            ..ColumnSetting::default()
        },
    ]);
    let c = Config::from_settings(&settings);
    assert_eq!(c.columns.len(), 2);
    assert_eq!(c.columns[0].metric, Metric::DriverNumber);
    assert_eq!(c.columns[0].preset, Preset::Lg);
    assert_eq!(c.columns[1].metric, Metric::CurrentLap);
}
#[test]
fn gpui_pit_rail_only_adds_thirty_four_pixels_when_enabled() {
    let settings = Settings {
        row_count: 10,
        ..Settings::eficiencia()
    };
    let mut v = Visual::new(&settings);
    assert_eq!(v.size(), (440.0, 364.0));
    let c = Arc::make_mut(&mut v.config);
    c.columns.push(column(Metric::Pit, Preset::Auto));
    c.fit(10);
    v.plan = Arc::new(plan(&v.config, &content()));
    assert_eq!(v.size(), (474.0, 364.0));
    let style = Style::compiled();
    assert_eq!(style.geometry.pit_rail_width, 34.0);
    assert_eq!(style.geometry.pit_badge_height, 26.0);
    assert_eq!(style.geometry.pit_radius, 3.0);
    assert_eq!(style.geometry.pit_glow_blur * 2.0, 8.0);
    assert_eq!(style.opacity.pit_glow, 0.22);
}
#[test]
fn gpui_multiclass_bands_reserve_unique_classes_and_keep_literal_row_tops() {
    let mut next = content();
    let all = next.rows.clone();
    next.rows = ["hypercar", "lmp2", "gte"]
        .iter()
        .flat_map(|class| {
            all.iter()
                .filter(move |r| r.class.as_ref() == *class)
                .take(2)
                .cloned()
        })
        .collect();
    assert_eq!(next.rows.len(), 6);
    let settings = Settings {
        row_count: 6,
        classification_mode: "multiclass".into(),
        ..Settings::eficiencia()
    };
    let mut v = Visual::new(&settings);
    assert!(v.ingest(Arc::new(next)));
    assert_eq!(v.size(), (440.0, 328.0));
    assert_eq!(v.plan.visible_rows, 6);
    assert_eq!(v.plan.row_tops, [28.0, 58.0, 116.0, 146.0, 204.0, 234.0]);
    assert_eq!(
        v.plan.class_bands,
        [
            (0.0, "hypercar".into()),
            (88.0, "lmp2".into()),
            (176.0, "gte".into())
        ]
    );
}
#[test]
fn gpui_unavailable_stale_metadata_and_reserved_rows_keep_the_geometry() {
    let mut v = Visual::new(&Settings {
        row_count: 10,
        ..Settings::eficiencia()
    });
    let first = Arc::new(content());
    assert!(v.ingest(first.clone()));
    let identity = Arc::as_ptr(&v.plan);
    let mut next = (*first).clone();
    next.sequence = 999;
    assert!(!v.ingest(Arc::new(next)));
    assert_eq!(identity, Arc::as_ptr(&v.plan));
    for source in [SourceState::Waiting, SourceState::Stale, SourceState::Lost] {
        let mut photo = photo();
        photo.state.source_state = source;
        let next = ContentPlan::new(
            Arc::new(standings::project(&photo, Preferences::default())),
            String::new(),
            0,
        );
        let expected = if source == SourceState::Stale {
            Status::Stale
        } else {
            Status::Disconnected
        };
        assert_eq!(next.status, expected);
        v.ingest(Arc::new(next));
        assert_eq!(v.size(), (440.0, 364.0));
        assert_eq!(v.plan.external_header, source != SourceState::Stale);
    }
}
#[test]
fn gpui_spanish_and_english_labels_are_not_rephrased() {
    for (language, gap, lap, best, track) in [
        (
            vantare_domain::format::Language::Es,
            "AL LÍDER",
            "VUELTA",
            "MEJOR V.",
            "PISTA",
        ),
        (
            vantare_domain::format::Language::En,
            "TO LEADER",
            "LAP",
            "BEST LAP",
            "TRACK",
        ),
    ] {
        let l = labels(language);
        assert_eq!(l.metric(Metric::Gap, false), gap);
        assert_eq!(l.metric(Metric::CurrentLap, false), lap);
        assert_eq!(l.metric(Metric::BestLap, false), best);
        assert_eq!(l.info(InfoMetric::Track), track);
    }
}

#[test]
fn gpui_style_default_matches_every_field_of_the_standings_json() {
    // Literales de ui/styles/standings.json; el crate no depende de serde_json.
    let style = Style::default();
    assert_eq!(style.colors.ink.0, 0xf5f5f5, "colors.ink");
    assert_eq!(style.colors.muted.0, 0xb9b9bd, "colors.muted");
    assert_eq!(style.colors.panel.0, 0x101113, "colors.panel");
    assert_eq!(style.colors.loss.0, 0xd95360, "colors.loss");
    assert_eq!(style.colors.white.0, 0xffffff, "colors.white");
    assert_eq!(style.colors.black.0, 0x000000, "colors.black");
    assert_eq!(style.colors.flag_unknown.0, 0xb1b4bc, "colors.flag_unknown");
    assert_eq!(style.colors.flag_green.0, 0x29c36f, "colors.flag_green");
    assert_eq!(style.colors.flag_yellow.0, 0xffd03d, "colors.flag_yellow");
    assert_eq!(style.colors.flag_blue.0, 0x4391ff, "colors.flag_blue");
    assert_eq!(style.colors.flag_red.0, 0xef303e, "colors.flag_red");
    assert_eq!(style.colors.flag_black.0, 0x0c0c0e, "colors.flag_black");
    assert_eq!(
        style.colors.flag_checkered.0, 0xd1d1d6,
        "colors.flag_checkered"
    );
    assert_eq!(
        style.colors.broadcast_accent.0, 0xc1121f,
        "colors.broadcast_accent"
    );
    assert_eq!(style.colors.hypercar.0, 0xe63946, "colors.hypercar");
    assert_eq!(style.colors.lmp.0, 0x5b8bd6, "colors.lmp");
    assert_eq!(style.colors.gold.0, 0xe2c568, "colors.gold");
    assert_eq!(style.colors.session.0, 0xb8bac0, "colors.session");
    assert_eq!(style.colors.class_start.0, 0xe32530, "colors.class_start");
    assert_eq!(style.colors.class_end.0, 0xba0f1b, "colors.class_end");
    assert_eq!(style.colors.column_label.0, 0xbdbfc4, "colors.column_label");
    assert_eq!(style.colors.player.0, 0xbfc2ca, "colors.player");
    assert_eq!(style.colors.gain.0, 0x7fb686, "colors.gain");
    assert_eq!(
        style.colors.player_marker.0, 0xed2431,
        "colors.player_marker"
    );
    assert_eq!(style.colors.position.0, 0xb9bbc1, "colors.position");
    assert_eq!(style.colors.number.0, 0xa5a5ab, "colors.number");
    assert_eq!(style.colors.pace_gap.0, 0xbdbdc2, "colors.pace_gap");
    assert_eq!(style.colors.unit.0, 0xaaa9af, "colors.unit");
    assert_eq!(style.colors.lap.0, 0xe6e5e9, "colors.lap");
    assert_eq!(style.colors.best_lap.0, 0xc9b1e9, "colors.best_lap");
    assert_eq!(style.colors.best_sweep.0, 0xb990e8, "colors.best_sweep");
    assert_eq!(style.colors.best_marker.0, 0xbd9be8, "colors.best_marker");
    assert_eq!(style.colors.footer_label.0, 0xa7a9b0, "colors.footer_label");
    assert_eq!(style.colors.footer_value.0, 0xe8e8ed, "colors.footer_value");
    assert_eq!(style.colors.pit_ink.0, 0x151517, "colors.pit_ink");
    assert_eq!(style.geometry.row_height, 30.0, "geometry.row_height");
    assert_eq!(
        style.geometry.session_header_height, 42.0,
        "geometry.session_header_height"
    );
    assert_eq!(
        style.geometry.column_header_height, 28.0,
        "geometry.column_header_height"
    );
    assert_eq!(style.geometry.footer_height, 22.0, "geometry.footer_height");
    assert_eq!(
        style.geometry.brand_band_height, 22.0,
        "geometry.brand_band_height"
    );
    assert_eq!(
        style.geometry.pit_rail_width, 34.0,
        "geometry.pit_rail_width"
    );
    assert_eq!(
        style.geometry.broadcast_header_height, 46.0,
        "geometry.broadcast_header_height"
    );
    assert_eq!(
        style.geometry.broadcast_column_height, 24.0,
        "geometry.broadcast_column_height"
    );
    assert_eq!(
        style.geometry.class_band_height, 28.0,
        "geometry.class_band_height"
    );
    assert_eq!(style.geometry.radius, 6.0, "geometry.radius");
    assert_eq!(style.geometry.chip_radius, 4.0, "geometry.chip_radius");
    assert_eq!(
        style.geometry.chip_cut_radius, 1.0,
        "geometry.chip_cut_radius"
    );
    assert_eq!(style.geometry.pit_radius, 3.0, "geometry.pit_radius");
    assert_eq!(style.geometry.cell_padding, 8.0, "geometry.cell_padding");
    assert_eq!(
        style.geometry.broadcast_name_padding, 24.0,
        "geometry.broadcast_name_padding"
    );
    assert_eq!(
        style.geometry.position_padding, 4.0,
        "geometry.position_padding"
    );
    assert_eq!(
        style.geometry.footer_pair_gap, 5.0,
        "geometry.footer_pair_gap"
    );
    assert_eq!(style.geometry.footer_gap, 16.0, "geometry.footer_gap");
    assert_eq!(style.geometry.logo_size, 24.0, "geometry.logo_size");
    assert_eq!(
        style.geometry.brand_logo_size, 18.0,
        "geometry.brand_logo_size"
    );
    assert_eq!(
        style.geometry.player_marker_width, 2.0,
        "geometry.player_marker_width"
    );
    assert_eq!(
        style.geometry.player_marker_height, 20.0,
        "geometry.player_marker_height"
    );
    assert_eq!(
        style.geometry.pit_badge_height, 26.0,
        "geometry.pit_badge_height"
    );
    assert_eq!(style.geometry.pit_glow_blur, 4.0, "geometry.pit_glow_blur");
    assert_eq!(style.fonts.marker_size, 6.0, "fonts.marker_size");
    assert_eq!(
        style.fonts.session_label_size, 7.0,
        "fonts.session_label_size"
    );
    assert_eq!(
        style.fonts.column_label_size, 8.0,
        "fonts.column_label_size"
    );
    assert_eq!(style.fonts.badge_size, 9.0, "fonts.badge_size");
    assert_eq!(
        style.fonts.footer_value_size, 10.0,
        "fonts.footer_value_size"
    );
    assert_eq!(style.fonts.number_size, 11.0, "fonts.number_size");
    assert_eq!(style.fonts.brand_size, 12.0, "fonts.brand_size");
    assert_eq!(style.fonts.body_size, 14.0, "fonts.body_size");
    assert_eq!(style.fonts.clock_size, 15.0, "fonts.clock_size");
    assert_eq!(style.fonts.plain_clock_size, 17.0, "fonts.plain_clock_size");
    assert_eq!(style.fonts.regular_weight, 400.0, "fonts.regular_weight");
    assert_eq!(style.fonts.medium_weight, 500.0, "fonts.medium_weight");
    assert_eq!(style.fonts.semibold_weight, 600.0, "fonts.semibold_weight");
    assert_eq!(style.fonts.metric_weight, 650.0, "fonts.metric_weight");
    assert_eq!(style.fonts.bold_weight, 700.0, "fonts.bold_weight");
    assert_eq!(style.fonts.heavy_weight, 800.0, "fonts.heavy_weight");
    assert_eq!(style.fonts.tracking_scale, 1.0, "fonts.tracking_scale");
    assert_eq!(style.fonts.family, None, "fonts.family");
    assert_eq!(style.shadow.sigma, 12.5, "shadow.sigma");
    assert_eq!(style.shadow.spread, -12.0, "shadow.spread");
    assert_eq!(style.shadow.offset_y, 14.0, "shadow.offset_y");
    assert_eq!(style.shadow.alpha, 0.48, "shadow.alpha");
    assert_eq!(style.opacity.panel, 0.87, "opacity.panel");
    assert_eq!(style.opacity.frame, 0.12, "opacity.frame");
    assert_eq!(style.opacity.top_frame, 0.136, "opacity.top_frame");
    assert_eq!(style.opacity.player, 0.17, "opacity.player");
    assert_eq!(
        style.opacity.broadcast_player, 0.23,
        "opacity.broadcast_player"
    );
    assert_eq!(style.opacity.footer, 0.15, "opacity.footer");
    assert_eq!(style.opacity.pit_glow, 0.22, "opacity.pit_glow");
}

#[test]
fn gpui_real_settings_enable_pit_and_keep_the_narrow_driver_remainder() {
    let columns = [
        ("position", "xs"),
        ("driverNumber", "sm"),
        ("driverName", "lg"),
        ("gap", "md"),
        ("bestLap", "lg"),
        ("pit", "auto"),
    ]
    .into_iter()
    .map(|(id, width)| ColumnSetting {
        metric_id: id.into(),
        width_preset: width.into(),
        ..ColumnSetting::default()
    })
    .collect();
    let settings = Settings {
        row_count: 10,
        columns: Some(columns),
        ..Settings::eficiencia()
    };
    let mut visual = Visual::new(&settings);
    visual.ingest(Arc::new(content()));
    assert_eq!(visual.size(), (474.0, 364.0));
    assert_eq!(visual.plan.widths, [30.0, 30.0, 200.0, 92.0, 88.0]);
    let settings = Settings {
        row_count: 10,
        columns: Some(vec![
            ColumnSetting {
                metric_id: "driverName".into(),
                width_preset: "sm".into(),
                format: vantare_domain::widget_settings::columns::Format {
                    mode: "initial".into(),
                    ..Default::default()
                },
                ..ColumnSetting::default()
            },
            ColumnSetting {
                metric_id: "lastLap".into(),
                width_preset: "md".into(),
                ..ColumnSetting::default()
            },
            ColumnSetting {
                metric_id: "pit".into(),
                ..ColumnSetting::default()
            },
        ]),
        ..Settings::eficiencia()
    };
    let mut config = Config::from_settings(&settings);
    config.fit(10);
    let p = plan(&config, &content());
    assert!(p.pit_enabled);
    assert_eq!(config.width, 238.0);
    assert_eq!(p.widths, [156.0, 82.0]);
    let mut visual = Visual::new(&settings);
    visual.ingest(Arc::new(content()));
    assert_eq!(visual.size(), (272.0, 392.0));
}
#[test]
fn gpui_six_footer_slots_use_fifteen_plus_fourteen_per_estimated_row() {
    let settings = Settings {
        row_count: 10,
        footer_slots: Some(
            ["track", "position", "gap", "interval", "lastLap", "bestLap"]
                .into_iter()
                .map(String::from)
                .collect(),
        ),
        ..Settings::eficiencia()
    };
    let mut visual = Visual::new(&settings);
    assert_eq!(visual.config.footer_slots.len(), 6);
    let mut next = content();
    let cells = ["track", "gap"]
        .into_iter()
        .map(|id| standings::InfoCell {
            id: id.into(),
            label: "Á".repeat(40),
            value: "0".repeat(20),
            stale: false,
        })
        .collect::<Vec<_>>();
    // 2*(40*5,5+20*7,5+26)=792; ancho interior 440-24=416 -> 2 filas.
    assert_eq!(crate::eficiencia::footer_rows(&cells, 416.0), 2);
    Arc::make_mut(&mut next.board).footer_cells = cells;
    visual.ingest(Arc::new(next));
    assert_eq!(visual.config.footer_rows, 2);
    assert_eq!(visual.config.footer_height(), 43.0);
    assert_eq!(visual.size(), (440.0, 364.0));
    assert_eq!(visual.plan.visible_rows, 9);
}
#[test]
fn gpui_remaining_labels_keep_the_literal_pace_and_source_status_texts() {
    use vantare_domain::format::Language;
    for (language, expected) in [
        (
            Language::Es,
            [
                "AL MEJOR",
                "INTERVALO",
                "ÚLT. VUELTA",
                "DATOS ANTIGUOS",
                "DESCONECTADO",
                "SIN DATOS",
            ],
        ),
        (
            Language::En,
            [
                "TO BEST",
                "INTERVAL",
                "LAST LAP",
                "DATA OUT OF DATE",
                "DISCONNECTED",
                "NO DATA",
            ],
        ),
    ] {
        let l = labels(language);
        assert_eq!(
            [
                l.pace_gap,
                l.interval,
                l.last_lap,
                l.stale,
                l.disconnected,
                l.missing
            ],
            expected
        );
        assert_eq!(l.metric(Metric::Gap, true), expected[0]);
        assert_eq!(l.metric(Metric::Interval, false), expected[1]);
        assert_eq!(l.metric(Metric::LastLap, false), expected[2]);
    }
}
