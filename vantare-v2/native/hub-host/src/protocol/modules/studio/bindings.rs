use crate::protocol::bindings::declare;
use crate::protocol::{Event, HostError, HostToUi, Reply, Request, UiToHost};
use crate::studio::*;
use std::fmt::Write as _;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    widget_settings_types(&mut text);
    declare::<WidgetKind>(&mut text);
    declare::<WidgetInfo>(&mut text);
    declare::<StudioState>(&mut text);
    declare::<StudioPlan>(&mut text);
    declare::<OffTrack>(&mut text);
    declare::<ShowIn>(&mut text);
    declare::<Coordinate>(&mut text);
    declare::<Point>(&mut text);
    declare::<GeometryChange>(&mut text);
    declare::<CanvasChoice>(&mut text);
    declare::<SizeMode>(&mut text);
    declare::<geometry::CanvasSource>(&mut text);
    declare::<CanvasView>(&mut text);
    declare::<CanvasPlacement>(&mut text);
    declare::<OverlaySize>(&mut text);
    declare::<FrequencyView>(&mut text);
    declare::<FrequencyChange>(&mut text);
    declare::<frequency::FrequencySource>(&mut text);
    declare::<OverlayInstance>(&mut text);
    declare::<StudioView>(&mut text);
    declare::<InstancePatch>(&mut text);
    geometry_constants(&mut text);
    crate::protocol::bindings::constants!(&mut text, "studioMonitorCases", monitor_vectors());
    frequency_constants(&mut text);
    writeln!(text,"export const studioLimits = {{instances:{INSTANCE_LIMIT},history:{HISTORY_LIMIT},opacityMin:{OPACITY_MIN},opacityMax:{OPACITY_MAX},id:{ID_LIMIT},size:{SIZE_LIMIT},label:{LABEL_LIMIT},about:{ABOUT_LIMIT}}} as const;").expect("limits");
    text.push_str("export const studioAddAvailable = true as const;\nexport const studioEditOnScreen = false as const;\n");
    writeln!(
        text,
        "export const studioCatalog = {} as const;",
        serde_json::to_string(
            &WidgetKind::CATALOG
                .iter()
                .map(|kind| kind.info(None))
                .collect::<Vec<_>>()
        )
        .expect("catalog")
    )
    .expect("catalog");
    writeln!(
        text,
        "export const studioKinds = {} as const;",
        serde_json::to_string(WidgetKind::ALL).expect("kinds")
    )
    .expect("kinds");
    let sizes: std::collections::BTreeMap<_, _> = WidgetKind::ALL
        .iter()
        .map(|kind| {
            let value = crate::widget_defaults::get(kind.id()).expect("generated defaults");
            (
                kind.id(),
                std::collections::BTreeMap::from([
                    ("height", value.size.height),
                    ("width", value.size.width),
                ]),
            )
        })
        .collect();
    writeln!(
        text,
        "export const studioSizes = {} as const;",
        serde_json::to_string(&sizes).expect("sizes")
    )
    .expect("sizes");
    let free: Vec<_> = WidgetKind::CATALOG
        .iter()
        .copied()
        .filter(|kind| {
            kind.info(Some(vantare_ipc::control::CatalogAccess::Free))
                .allowed
        })
        .collect();
    writeln!(
        text,
        "export const studioFreeKinds = {} as const;",
        serde_json::to_string(&free).expect("free kinds")
    )
    .expect("free kinds");
    let mut categories = vec!["Todos".to_owned()];
    for kind in WidgetKind::CATALOG {
        let category = kind.info(None).category;
        if !categories.contains(&category) {
            categories.push(category);
        }
    }
    writeln!(
        text,
        "export const studioCategories = {} as const;",
        serde_json::to_string(&categories).expect("categories")
    )
    .expect("categories");
    metadata(&mut text);
    text.lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}
fn geometry_constants(text: &mut String) {
    crate::protocol::bindings::constants!(text, "studioDuplicateCases", duplicate_vectors());
    crate::protocol::bindings::constants!(text, "studioGeometryCases", geometry::cases::vectors());
    crate::protocol::bindings::constants!(
        text,
        "studioGeometryLimits",
        serde_json::json!({
        "minSize":geometry::MIN_SIZE,"maxSize":geometry::MAX_SIZE,"coordinateMax":f64::from(f32::MAX),
        "canvasMin":64,"canvasMax":SIZE_LIMIT,"snapScreenPx":7.0,"nudgeLimit":geometry::NUDGE_LIMIT,"epsilon":geometry::EPSILON})
    );
}
fn metadata(text: &mut String) {
    for (name, value) in [
        (
            "studioStates",
            serde_json::to_string(&[
                StudioState::Missing,
                StudioState::Protected,
                StudioState::Ready,
            ])
            .expect("states"),
        ),
        (
            "studioPlans",
            serde_json::to_string(&[
                StudioPlan::Unverified,
                StudioPlan::Free,
                StudioPlan::Launch,
                StudioPlan::Pro,
                StudioPlan::Founders,
            ])
            .expect("plans"),
        ),
        (
            "studioOffTracks",
            serde_json::to_string(&[OffTrack::Inherit, OffTrack::AlwaysVisible, OffTrack::Hide])
                .expect("off track"),
        ),
        (
            "studioAddKinds",
            serde_json::to_string(WidgetKind::CATALOG).expect("add kinds"),
        ),
        (
            "studioRevisionPattern",
            serde_json::to_string(REVISION_PATTERN).expect("revision"),
        ),
    ] {
        writeln!(text, "export const {name} = {value} as const;").expect("metadata");
    }
}
pub(crate) fn corpus() -> serde_json::Value {
    let revision = "0".repeat(64);
    let value = State::unavailable(
        StudioState::Ready,
        Some(vantare_ipc::control::CatalogAccess::Pro),
    );
    let mut requests = vec![
        Request::StudioGet {},
        Request::StudioVisibility {
            id: "widget-1".into(),
            visible: false,
            base_revision: revision.clone(),
        },
        Request::StudioAdd {
            kind: WidgetKind::Standings,
            at: None,
            base_revision: revision.clone(),
        },
        Request::StudioRemove {
            id: "widget-1".into(),
            base_revision: revision.clone(),
        },
        Request::StudioInstance {
            id: "widget-1".into(),
            patch: InstancePatch::Opacity(50),
            base_revision: revision.clone(),
        },
        Request::StudioUndo {
            base_revision: revision.clone(),
        },
        Request::StudioRedo {
            base_revision: revision,
        },
        Request::StudioTrack { show: false },
    ];
    geometry_requests(&mut requests);
    let replies = [
        Reply::StudioGeometry {
            value: value.clone(),
        },
        Reply::StudioCanvas {
            value: value.clone(),
        },
        Reply::StudioGet {
            value: value.clone(),
        },
        Reply::StudioVisibility {
            value: value.clone(),
        },
        Reply::StudioAdd {
            value: value.clone(),
            added: "widget-1".into(),
        },
        Reply::StudioDuplicate {
            value: value.clone(),
            added: "widget-2".into(),
        },
        Reply::StudioRemove {
            value: value.clone(),
        },
        Reply::StudioInstance {
            value: value.clone(),
        },
        Reply::StudioUndo {
            value: value.clone(),
        },
        Reply::StudioRedo {
            value: value.clone(),
        },
        Reply::StudioTrack {
            value: value.clone(),
        },
    ];
    let mut host: Vec<HostToUi> = replies
        .into_iter()
        .map(|result| HostToUi::Response { id: 1, result })
        .collect();
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::StudioConflict {
            current: value.clone(),
        },
    });
    host.push(HostToUi::Event {
        event: Event::Studio { value },
    });
    let mut ui: Vec<UiToHost> = requests
        .into_iter()
        .map(|request| UiToHost::Request { id: 1, request })
        .collect();
    settings_samples(&mut host, &mut ui);
    frequency_samples(&mut host, &mut ui);
    ui.push(UiToHost::Subscribe {
        topic: crate::protocol::Topic::Studio,
    });
    ui.push(UiToHost::Unsubscribe {
        topic: crate::protocol::Topic::Studio,
    });
    serde_json::json!({"host":host,"ui":ui,"invalidSettings":invalid_settings(),"invalidFrequencies":invalid_frequencies()})
}

fn duplicate_vectors() -> serde_json::Value {
    let cases = [
        ("offset", (48.5, 62.0), (1920.0, 1080.0)),
        ("fraction", (84.3, 126.7), (1920.0, 1080.0)),
        ("edge", (1900.0, 1060.0), (1920.0, 1080.0)),
        ("outside", (-60.0, -50.0), (1920.0, 1080.0)),
        ("custom", (700.0, 500.0), (800.0, 600.0)),
    ];
    serde_json::Value::Array(
        cases
            .into_iter()
            .map(|(name, position, canvas)| {
                let size = (338.0, 304.0);
                let expected = geometry::snap(
                    (
                        position.0 + 20.0 + size.0 / 2.0,
                        position.1 + 20.0 + size.1 / 2.0,
                    ),
                    size,
                    canvas,
                    &[],
                    0.0,
                )
                .expect("valid geometry vector")
                .position;
                serde_json::json!({
                    "name": name,
                    "position": position,
                    "size": size,
                    "canvas": canvas,
                    "expected": expected
                })
            })
            .collect(),
    )
}

fn geometry_requests(requests: &mut Vec<Request>) {
    requests.push(Request::StudioDuplicate {
        id: "widget-1".into(),
        base_revision: "0".repeat(64),
    });
    requests.push(Request::StudioCanvas {
        resolution: CanvasChoice::Monitor,
        base_revision: "0".repeat(64),
    });
    requests.push(Request::StudioCanvas {
        resolution: CanvasChoice::Custom {
            width: 2560_u32.into(),
            height: 1440_u32.into(),
        },
        base_revision: "0".repeat(64),
    });
    requests.push(Request::StudioAdd {
        kind: WidgetKind::Delta,
        at: Some(Point {
            x: 48_u32.into(),
            y: 62_u32.into(),
        }),
        base_revision: "0".repeat(64),
    });
    for change in [
        GeometryChange::Move {
            x: 48_u32.into(),
            y: 62_u32.into(),
        },
        GeometryChange::Resize {
            x: 48_u32.into(),
            y: 62_u32.into(),
            width: 338_u32.into(),
            height: 364_u32.into(),
        },
        GeometryChange::Anchor { column: 2, row: 2 },
        GeometryChange::AutoSize,
        GeometryChange::AspectLocked { value: false },
    ] {
        requests.push(Request::StudioGeometry {
            id: "widget-1".into(),
            change,
            base_revision: "0".repeat(64),
        });
    }
}
fn widget_settings_types(text: &mut String) {
    use crate::studio::widget_settings::*;
    use vantare_domain::widget_settings as native;
    declare::<native::look::Look>(text);
    declare::<native::look::Tone>(text);
    declare::<native::look::Accent>(text);
    declare::<native::columns::Format>(text);
    declare::<native::columns::Style>(text);
    declare::<native::columns::ColumnSetting>(text);
    declare::<native::standings::Settings>(text);
    declare::<native::relative::Settings>(text);
    declare::<native::delta::Settings>(text);
    declare::<native::pedals::Settings>(text);
    declare::<native::fuel_strategy::Settings>(text);
    additional_widget_types(text);
    crate::protocol::bindings::constants!(text, "studioWidgetKeys", WidgetSettings::schema_keys());
    declare::<WidgetSettings>(text);
    declare::<WidgetGap>(text);
    declare::<StandingsScope>(text);
    declare::<StandingsClassification>(text);
    declare::<StandingsTemplate>(text);
    declare::<TableSize>(text);
    declare::<RelativeScope>(text);
    declare::<DeltaSize>(text);
    declare::<DeltaReference>(text);
    declare::<DeltaTemplate>(text);
    declare::<FooterKey>(text);
    declare::<ColumnWidth>(text);
    declare::<ColumnNameMode>(text);
    declare::<ColumnAlign>(text);
    declare::<ColumnMetric>(text);
    declare::<FooterMetric>(text);
    declare::<WidgetColumnFormatPatch>(text);
    declare::<WidgetColumnStylePatch>(text);
    declare::<WidgetColumnPatch>(text);
    declare::<StandingsWidgetPatch>(text);
    declare::<RelativeWidgetPatch>(text);
    declare::<DeltaWidgetPatch>(text);
    declare::<PedalsWidgetPatch>(text);
    declare::<FuelStrategyWidgetPatch>(text);
    declare::<WidgetSettingsPatch>(text);

    let metrics: std::collections::BTreeSet<_> = native::columns::LEGACY_TABLE_COLUMNS
        .iter()
        .chain(native::standings::STANDINGS_VANTARE_COLUMNS)
        .chain(native::relative::RELATIVE_VANTARE_COLUMNS)
        .collect();
    let options = serde_json::json!({
        "standings": {
            "scopes": native::standings::STANDINGS_SCOPES,
            "classifications": native::standings::STANDINGS_CLASSIFICATION_MODES,
            "templates": native::standings::STANDINGS_TEMPLATES,
            "footerMetrics": native::standings::STANDINGS_FOOTER_METRICS,
            "rowsMin": native::standings::STANDINGS_ROWS_MIN,
            "rowsMax": native::standings::STANDINGS_ROWS_MAX,
            "rowsStep": native::standings::STANDINGS_ROWS_STEP,
            "columnsMax": native::standings::STANDINGS_COLUMNS_MAX,
            "windowAround": native::standings::STANDINGS_WINDOW_AROUND,
            "columns": native::standings::STANDINGS_VANTARE_COLUMNS
        },
        "relative": {
            "scopes": native::relative::RELATIVE_SCOPES,
            "rangeMin": native::relative::RELATIVE_RANGE_MIN,
            "rangeMax": native::relative::RELATIVE_RANGE_MAX,
            "rangeStep": native::relative::RELATIVE_RANGE_STEP,
            "columns": native::relative::RELATIVE_VANTARE_COLUMNS
        },
        "delta": { "sizes": native::delta::DELTA_SIZES,
            "references": native::delta::DELTA_REFERENCES, "templates": native::delta::DELTA_TEMPLATES },
        "columns": { "widths": native::columns::COLUMN_WIDTHS,
            "names": native::columns::COLUMN_NAME_MODES, "aligns": native::columns::COLUMN_ALIGNS,
            "metrics": metrics, "legacy": native::columns::LEGACY_TABLE_COLUMNS,
            "maxChars": native::columns::MAX_CHARS_LIMIT },
        "looks": native::look::Look::ALL,
        "tones": [native::look::Tone::Neo, native::look::Tone::Neutro],
        "accents": [native::look::Accent::Red, native::look::Accent::Amber, native::look::Accent::Green, native::look::Accent::White],
        "pedals": {"gapMin":native::pedals::GAP_MIN,"gapMax":native::pedals::GAP_MAX,"gapStep":native::pedals::GAP_STEP},
        "fuel": {"historyMin":native::fuel_strategy::FUEL_HISTORY_MIN,"historyMax":native::fuel_strategy::FUEL_HISTORY_MAX,"historyStep":native::fuel_strategy::FUEL_HISTORY_STEP},
        "tableSizes": native::TABLE_SIZES, "footerKeys": native::FOOTER_KEYS,
        "footerMax": native::FOOTER_ITEMS_MAX
    });
    crate::protocol::bindings::constants!(text, "studioWidgetOptions", options);
    let defaults: std::collections::BTreeMap<_, _> = WidgetKind::ALL
        .iter()
        .map(|kind| {
            let source = crate::widget_defaults::get(kind.id()).expect("native defaults");
            let value =
                WidgetSettings::from_json(*kind, source.settings.get()).expect("typed defaults");
            (kind.id(), value)
        })
        .collect();
    writeln!(
        text,
        "export const studioWidgetDefaults = {} as const;",
        serde_json::to_string(&defaults).expect("defaults")
    )
    .expect("defaults");
}

fn additional_widget_types(text: &mut String) {
    use crate::studio::widget_settings::*;
    use vantare_domain::widget_settings as native;
    declare::<native::broadcast_tower::Settings>(text);
    declare::<native::car_damage_numbers::Settings>(text);
    declare::<native::car_damage_visual::Settings>(text);
    declare::<native::delta_trace::Settings>(text);
    declare::<native::fastest_lap::Settings>(text);
    declare::<native::head_to_head::Settings>(text);
    declare::<native::input_telemetry::Settings>(text);
    declare::<native::track_map::Settings>(text);
    declare::<native::multiclass_relative::Settings>(text);
    declare::<native::pedals_telemetry::Settings>(text);
    declare::<native::radar::Settings>(text);
    declare::<native::racing_flags::Settings>(text);
    declare::<native::track_weather::Settings>(text);
    declare::<native::session_alerts::Settings>(text);
    declare::<BroadcastTowerWidgetPatch>(text);
    declare::<CarDamageNumbersWidgetPatch>(text);
    declare::<CarDamageVisualWidgetPatch>(text);
    declare::<DeltaTraceWidgetPatch>(text);
    declare::<FastestLapWidgetPatch>(text);
    declare::<HeadToHeadWidgetPatch>(text);
    declare::<InputTelemetryWidgetPatch>(text);
    declare::<TrackMapWidgetPatch>(text);
    declare::<MulticlassRelativeWidgetPatch>(text);
    declare::<PedalsTelemetryWidgetPatch>(text);
    declare::<RadarWidgetPatch>(text);
    declare::<RacingFlagsWidgetPatch>(text);
    declare::<TrackWeatherWidgetPatch>(text);
    declare::<SessionAlertsWidgetPatch>(text);
    declare::<DamageView>(text);
    declare::<ToggleKey>(text);
    declare::<HeadTarget>(text);
    declare::<MulticlassMode>(text);
    declare::<SteeringWheel>(text);
    declare::<MiniSize>(text);
    declare::<AlertStyle>(text);
    declare::<FlagColor>(text);
    declare::<ThresholdPatch>(text);
    crate::protocol::bindings::constants!(
        text,
        "studioAdditionalOptions",
        crate::studio::widget_settings::additional::options()
    );
    crate::protocol::bindings::constants!(
        text,
        "studioAdditionalCases",
        crate::studio::widget_settings::additional::cases::vectors()
    );
}

fn value_for_settings(kind: WidgetKind, source: &str) -> StudioView {
    let mut value = State::unavailable(
        StudioState::Ready,
        Some(vantare_ipc::control::CatalogAccess::Pro),
    );
    value.instances.push(OverlayInstance {
        id: "widget-1".into(),
        kind,
        visible: true,
        locked: false,
        opacity: 100,
        show_in: ShowIn {
            practice: true,
            qualifying: true,
            race: true,
        },
        off_track: OffTrack::Inherit,
        size: OverlaySize {
            width: 300_u32.into(),
            height: 200_u32.into(),
        },
        x: 48_u32.into(),
        y: 62_u32.into(),
        size_mode: SizeMode::Auto,
        aspect_locked: true,
        canvas_placement: CanvasPlacement::Inside,
        settings: WidgetSettings::from_json(kind, source).expect("settings sample"),
        frequency: FrequencyView::new(
            kind,
            crate::settings::track::PerformanceLevel::default(),
            None,
        ),
    });
    value
}

fn settings_samples(host: &mut Vec<HostToUi>, ui: &mut Vec<UiToHost>) {
    for kind in [
        WidgetKind::Standings,
        WidgetKind::Relative,
        WidgetKind::Delta,
        WidgetKind::Pedals,
        WidgetKind::FuelStrategy,
        WidgetKind::BroadcastTower,
        WidgetKind::CarDamageNumbers,
        WidgetKind::CarDamageVisual,
        WidgetKind::DeltaTrace,
        WidgetKind::FastestLap,
        WidgetKind::HeadToHead,
        WidgetKind::InputTelemetry,
        WidgetKind::TrackMap,
        WidgetKind::MulticlassRelative,
        WidgetKind::PedalsTelemetry,
        WidgetKind::Radar,
        WidgetKind::RacingFlags,
        WidgetKind::TrackWeather,
        WidgetKind::SessionAlerts,
    ] {
        let source = crate::widget_defaults::get(kind.id()).expect("defaults");
        let mut sample = value_for_settings(kind, source.settings.get());
        sample.revision = "0".repeat(64);
        host.push(HostToUi::Response {
            id: 1,
            result: Reply::StudioGet { value: sample },
        });
    }
    for value in crate::studio::widget_settings::additional::cases::patches().into_iter().chain([
        serde_json::json!({"kind":"standings","tablePreset":"compact"}),
        serde_json::json!({"kind":"relative","tablePreset":"expanded"}),
        serde_json::json!({"kind":"standings","rowCount":30}),
        serde_json::json!({"kind":"relative","columns":[{"metric":"driverName","format":{"mode":"full","maxChars":64}}]}),
        serde_json::json!({"kind":"delta","showBar":false}),
        serde_json::json!({"kind":"pedals","gap":12}),
        serde_json::json!({"kind":"fuel-strategy","historyRows":8}),
    ]) {
        ui.push(UiToHost::Request {
            id: 1,
            request: Request::StudioInstance {
                id: "widget-1".into(),
                patch: InstancePatch::Settings(Box::new(
                    serde_json::from_value(value).expect("sample settings patch"),
                )),
                base_revision: "0".repeat(64),
            },
        });
    }
}

fn invalid_settings() -> Vec<serde_json::Value> {
    use serde_json::json;
    let mut values = vec![
        json!({"kind":"standings","tablePreset":"unknown"}),
        json!({"kind":"relative","tablePreset":null}),
        json!({"kind":"relative","tablePreset":1}),
        json!({"kind":"delta","tablePreset":"standard"}),
        json!({"kind":"pedals","tablePreset":"standard"}),
        json!({"kind":"fuel-strategy","tablePreset":"standard"}),
        json!({"kind":"standings","tablePreset":"compact","columns":null}),
        json!({"kind":"standings","tablePreset":"compact","style":"neo"}),
        json!({"kind":"relative","tablePreset":"compact","rangeAhead":2}),
        json!({"kind":"relative","tablePreset":"compact","columns":[]}),
        json!({"kind":"delta","brandVisible":false}),
        json!({"kind":"delta","size":"unknown"}),
        json!({"kind":"pedals","gap":13}),
        json!({"kind":"pedals","gap":null}),
        json!({"kind":"standings","rowCount":0}),
        json!({"kind":"standings","windowAround":3}),
        json!({"kind":"relative","columns":[{"metric":"driverName"},{"metric":"driverName"}]}),
        json!({"kind":"relative","columns":[{"metric":"driverName","format":{"maxChars":65}}]}),
        json!({"kind":"delta","executable":"x"}),
    ];
    values.extend(crate::studio::widget_settings::additional::cases::invalid());
    values
}
#[cfg(test)]
mod invalid_tests {
    #[test]
    fn shared_negative_settings_corpus_is_rejected_by_rust() {
        for input in super::invalid_settings() {
            let rejected =
                serde_json::from_value::<crate::studio::WidgetSettingsPatch>(input.clone())
                    .map_or(true, |patch| patch.validate().is_err());
            assert!(rejected, "{input}");
        }
    }
}

fn frequency_constants(text: &mut String) {
    use crate::protocol::bindings::constants;
    use crate::settings::track::{MAX_WIDGET_ID_BYTES, MAX_WIDGET_OVERRIDES, OVERRIDE_HZ};
    constants!(
        text,
        "studioFrequencyOptions",
        serde_json::json!({
            "choices":frequency::FREQUENCY_CHOICES,"stored":OVERRIDE_HZ,
            "maxOverrides":MAX_WIDGET_OVERRIDES,"maxIdBytes":MAX_WIDGET_ID_BYTES,
            "tableKinds":["standings","relative","multiclass-relative","broadcast-tower"],
            "snapshotKinds":["racing-flags"]
        })
    );
    constants!(text, "studioFrequencyCases", frequency::cases());
}

fn frequency_samples(host: &mut Vec<HostToUi>, ui: &mut Vec<UiToHost>) {
    for value in frequency::FREQUENCY_CHOICES
        .into_iter()
        .map(Some)
        .chain(std::iter::once(None))
    {
        ui.push(UiToHost::Request {
            id: 1,
            request: Request::StudioInstance {
                id: "widget-1".into(),
                base_revision: "0".repeat(64),
                patch: serde_json::from_value(
                    serde_json::json!({"field":"frequency","value":value}),
                )
                .expect("frequency patch"),
            },
        });
    }
    for kind in [
        WidgetKind::Standings,
        WidgetKind::Pedals,
        WidgetKind::RacingFlags,
    ] {
        for hz in [None, Some(0), Some(40), Some(60)] {
            let source = crate::widget_defaults::get(kind.id()).expect("native default");
            let mut value = value_for_settings(kind, source.settings.get());
            value.instances[0].frequency = FrequencyView::new(
                kind,
                crate::settings::track::PerformanceLevel::default(),
                hz,
            );
            host.push(HostToUi::Response {
                id: 1,
                result: Reply::StudioGet { value },
            });
        }
    }
}
fn invalid_frequencies() -> Vec<serde_json::Value> {
    use serde_json::json;
    let mut values = vec![
        json!({"field":"frequency"}),
        json!({"field":"frequency","value":null,"path":"arbitrary"}),
    ];
    for value in [
        json!(0),
        json!(40),
        json!(2),
        json!(61),
        json!(-1),
        json!(1.5),
        json!("60"),
        json!(true),
        json!([]),
        json!({}),
    ] {
        values.push(json!({"field":"frequency","value":value}));
    }
    values
}
#[cfg(test)]
mod frequency_corpus_tests {
    #[test]
    fn invalid_frequency_requests_are_rejected_by_the_native_decoder() {
        for value in super::invalid_frequencies() {
            assert!(
                serde_json::from_value::<crate::studio::InstancePatch>(value.clone()).is_err(),
                "{value}"
            );
        }
    }
}

fn monitor_vectors() -> serde_json::Value {
    let mut cases = Vec::new();
    for (name, physical, dpi, custom) in [
        ("native", (0, 0, 2560, 1440), 96, None),
        ("preset", (0, 0, 2560, 1440), 96, Some((1920_u32, 1080_u32))),
        (
            "scaled-preset",
            (-3840, 0, 0, 2160),
            144,
            Some((1280_u32, 720_u32)),
        ),
    ] {
        let monitor =
            monitor::Monitor::from_physical(physical, dpi, true).expect("closed synthetic monitor");
        let size = monitor.size_view().expect("finite logical dimensions");
        let mut value = State::unavailable(StudioState::Ready, None);
        value.canvas = Some(if let Some((width, height)) = custom {
            CanvasView {
                width: width.into(),
                height: height.into(),
                source: geometry::CanvasSource::Custom,
            }
        } else {
            CanvasView {
                width: size.width,
                height: size.height,
                source: geometry::CanvasSource::Monitor,
            }
        });
        value.monitor = Some(Box::new(size));
        cases.push(serde_json::json!({"name":name,"value":value}));
    }
    cases.push(serde_json::json!({"name":"disconnected","value":State::unavailable(StudioState::Protected,None)}));
    serde_json::Value::Array(cases)
}
