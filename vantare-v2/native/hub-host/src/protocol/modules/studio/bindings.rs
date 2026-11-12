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
    declare::<OverlaySize>(&mut text);
    declare::<OverlayInstance>(&mut text);
    declare::<StudioView>(&mut text);
    declare::<InstancePatch>(&mut text);
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
    let requests = [
        Request::StudioGet {},
        Request::StudioVisibility {
            id: "widget-1".into(),
            visible: false,
            base_revision: revision.clone(),
        },
        Request::StudioAdd {
            kind: WidgetKind::Standings,
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
    let replies = [
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
    ui.push(UiToHost::Subscribe {
        topic: crate::protocol::Topic::Studio,
    });
    ui.push(UiToHost::Unsubscribe {
        topic: crate::protocol::Topic::Studio,
    });
    serde_json::json!({"host":host,"ui":ui,"invalidSettings":invalid_settings()})
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
            width: 300,
            height: 200,
        },
        settings: WidgetSettings::from_json(kind, source).expect("settings sample"),
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
    ] {
        let source = crate::widget_defaults::get(kind.id()).expect("defaults");
        let mut sample = value_for_settings(kind, source.settings.get());
        sample.revision = "0".repeat(64);
        host.push(HostToUi::Response {
            id: 1,
            result: Reply::StudioGet { value: sample },
        });
    }
    for value in [
        serde_json::json!({"kind":"standings","tablePreset":"compact"}),
        serde_json::json!({"kind":"relative","tablePreset":"expanded"}),
        serde_json::json!({"kind":"standings","rowCount":30}),
        serde_json::json!({"kind":"relative","columns":[{"metric":"driverName","format":{"mode":"full","maxChars":64}}]}),
        serde_json::json!({"kind":"delta","showBar":false}),
        serde_json::json!({"kind":"pedals","gap":12}),
        serde_json::json!({"kind":"fuel-strategy","historyRows":8}),
    ] {
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
    vec![
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
    ]
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
