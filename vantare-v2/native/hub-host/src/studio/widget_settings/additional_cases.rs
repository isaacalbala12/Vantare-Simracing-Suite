//! Native control vectors shared with Electron; no filesystem writes or painter.
use super::*;
use serde_json::{Value, json};
pub(crate) fn patches() -> Vec<Value> {
    vec![
        json!({"kind":"broadcast-tower","rowCount":3}),
        json!({"kind":"broadcast-tower","driverCarousel":true}),
        json!({"kind":"broadcast-tower","showWeather":true}),
        json!({"kind":"car-damage-numbers","showTyres":false}),
        json!({"kind":"car-damage-visual","view":"numbers"}),
        json!({"kind":"car-damage-visual","toggleKey":"f12"}),
        json!({"kind":"car-damage-visual","showAero":false}),
        json!({"kind":"delta-trace","reference":"leader"}),
        json!({"kind":"delta-trace","windowSeconds":8}),
        json!({"kind":"fastest-lap","showPersonal":false}),
        json!({"kind":"fastest-lap","showClass":false}),
        json!({"kind":"fastest-lap","showDriver":false}),
        json!({"kind":"fastest-lap","durationSeconds":15}),
        json!({"kind":"head-to-head","target":"behind"}),
        json!({"kind":"input-telemetry","historySeconds":1}),
        json!({"kind":"input-telemetry","showClutch":true}),
        json!({"kind":"track-map","transparent":true}),
        json!({"kind":"multiclass-relative","rowCount":9}),
        json!({"kind":"multiclass-relative","classMode":"other"}),
        json!({"kind":"multiclass-relative","showClassDivider":true}),
        json!({"kind":"pedals-telemetry","showClutch":false}),
        json!({"kind":"pedals-telemetry","steeringWheel":"ferrari-499p"}),
        json!({"kind":"radar","showPhrases":false}),
        json!({"kind":"racing-flags","showSectorFlags":false}),
        json!({"kind":"racing-flags","hideWhenGreen":true}),
        json!({"kind":"racing-flags","textColor":"#A1B2C3"}),
        json!({"kind":"track-weather","vertical":true}),
        json!({"kind":"session-alerts","soundZero":true}),
        json!({"kind":"session-alerts","miniFinal":false}),
        json!({"kind":"session-alerts","session":false}),
        json!({"kind":"session-alerts","calendar":false}),
        json!({"kind":"session-alerts","finished":false}),
        json!({"kind":"session-alerts","starts":false}),
        json!({"kind":"session-alerts","durationSeconds":15}),
        json!({"kind":"session-alerts","sound":false}),
        json!({"kind":"session-alerts","volume":100}),
        json!({"kind":"session-alerts","mini":false}),
        json!({"kind":"session-alerts","miniSession":false}),
        json!({"kind":"session-alerts","miniCalendar":false}),
        json!({"kind":"session-alerts","miniStart":false}),
        json!({"kind":"session-alerts","miniLimit":1}),
        json!({"kind":"session-alerts","miniSize":"l"}),
        json!({"kind":"session-alerts","style":"transparente"}),
        json!({"kind":"session-alerts","threshold":{"index":0,"minutes":60}}),
        json!({"kind":"session-alerts","threshold":{"index":1,"minutes":30}}),
        json!({"kind":"session-alerts","threshold":{"index":2,"minutes":15}}),
        json!({"kind":"session-alerts","threshold":{"index":3,"minutes":10}}),
        json!({"kind":"session-alerts","threshold":{"index":4,"minutes":2}}),
        json!({"kind":"session-alerts","threshold":{"index":0,"minutes":0}}),
        json!({"kind":"session-alerts","threshold":{"index":0,"minutes":1}}),
        json!({"kind":"session-alerts","threshold":{"index":4,"minutes":0}}),
        json!({"kind":"session-alerts","threshold":{"index":1,"minutes":60}}),
    ]
}
pub(crate) fn invalid() -> Vec<Value> {
    vec![
        json!({"kind":"broadcast-tower","rowCount":2}),
        json!({"kind":"broadcast-tower","rowCount":12}),
        json!({"kind":"broadcast-tower","showSof":true}),
        json!({"kind":"car-damage-numbers","format":"number"}),
        json!({"kind":"car-damage-visual","view":"future"}),
        json!({"kind":"car-damage-visual","toggleKey":"f13"}),
        json!({"kind":"car-damage-visual","toggleKey":"F1"}),
        json!({"kind":"delta-trace","windowSeconds":0}),
        json!({"kind":"delta-trace","windowSeconds":9}),
        json!({"kind":"delta-trace","windowSeconds":2.5}),
        json!({"kind":"delta-trace","showTrackMap":true}),
        json!({"kind":"delta-trace","showSectors":false}),
        json!({"kind":"fastest-lap","durationSeconds":2}),
        json!({"kind":"fastest-lap","durationSeconds":16}),
        json!({"kind":"head-to-head","target":"future"}),
        json!({"kind":"input-telemetry","historySeconds":0}),
        json!({"kind":"input-telemetry","historySeconds":9}),
        json!({"kind":"track-map","showTrackLabel":false}),
        json!({"kind":"multiclass-relative","rowCount":8}),
        json!({"kind":"multiclass-relative","classMode":"future"}),
        json!({"kind":"pedals-telemetry","steeringWheel":"future"}),
        json!({"kind":"pedals-telemetry","showPosition":true}),
        json!({"kind":"radar","path":"forbidden"}),
        json!({"kind":"racing-flags","textColor":"#00000000"}),
        json!({"kind":"racing-flags","textColor":"#gg0000"}),
        json!({"kind":"racing-flags","contentVersion":1}),
        json!({"kind":"track-weather","showAmbient":false}),
        json!({"kind":"track-weather","showWind":true}),
        json!({"kind":"track-weather","showRain":true}),
        json!({"kind":"track-weather","showTrack":true}),
        json!({"kind":"session-alerts","thresholds":[60]}),
        json!({"kind":"session-alerts","threshold":{"index":5,"minutes":1}}),
        json!({"kind":"session-alerts","threshold":{"index":0,"minutes":61}}),
        json!({"kind":"session-alerts","threshold":{"index":0,"minutes":1,"extra":true}}),
        json!({"kind":"session-alerts","threshold":null}),
        json!({"kind":"session-alerts","durationSeconds":3}),
        json!({"kind":"session-alerts","durationSeconds":16}),
        json!({"kind":"session-alerts","volume":101}),
        json!({"kind":"session-alerts","volume":71}),
        json!({"kind":"session-alerts","miniLimit":0}),
        json!({"kind":"session-alerts","miniLimit":4}),
        json!({"kind":"session-alerts","miniSize":"future"}),
        json!({"kind":"session-alerts","style":"future"}),
        json!({"kind":"session-alerts","companionFor":"other"}),
        json!({"kind":"broadcast-tower","unknown":true}),
        json!({"kind":"broadcast-tower","rowCount":null}),
        json!({"kind":"car-damage-numbers","unknown":true}),
        json!({"kind":"car-damage-numbers","showTyres":null}),
        json!({"kind":"car-damage-visual","unknown":true}),
        json!({"kind":"car-damage-visual","view":null}),
        json!({"kind":"delta-trace","unknown":true}),
        json!({"kind":"delta-trace","reference":null}),
        json!({"kind":"fastest-lap","unknown":true}),
        json!({"kind":"fastest-lap","showPersonal":null}),
        json!({"kind":"head-to-head","unknown":true}),
        json!({"kind":"head-to-head","target":null}),
        json!({"kind":"input-telemetry","unknown":true}),
        json!({"kind":"input-telemetry","historySeconds":null}),
        json!({"kind":"track-map","unknown":true}),
        json!({"kind":"track-map","transparent":null}),
        json!({"kind":"multiclass-relative","unknown":true}),
        json!({"kind":"multiclass-relative","rowCount":null}),
        json!({"kind":"pedals-telemetry","unknown":true}),
        json!({"kind":"pedals-telemetry","showClutch":null}),
        json!({"kind":"radar","unknown":true}),
        json!({"kind":"radar","showPhrases":null}),
        json!({"kind":"racing-flags","unknown":true}),
        json!({"kind":"racing-flags","showSectorFlags":null}),
        json!({"kind":"track-weather","unknown":true}),
        json!({"kind":"track-weather","vertical":null}),
        json!({"kind":"session-alerts","unknown":true}),
        json!({"kind":"session-alerts","soundZero":null}),
    ]
}
pub(crate) fn vectors() -> Vec<Value> {
    patches()
        .into_iter()
        .map(|patch| {
            let kind: WidgetKind =
                serde_json::from_value(patch["kind"].clone()).expect("native kind");
            let defaults = crate::widget_defaults::get(kind.id()).expect("native defaults");
            let before = WidgetSettings::from_json(kind, defaults.settings.get())
                .expect("projection")
                .expect("supported");
            let mut candidate = serde_json::to_value(&before).expect("before");
            let fields = patch.as_object().expect("patch");
            for (key, value) in fields {
                if key != "threshold" {
                    candidate[key] = value.clone();
                }
            }
            if let Some(threshold) = fields.get("threshold") {
                let threshold: ThresholdPatch =
                    serde_json::from_value(threshold.clone()).expect("threshold");
                let mut native: native::session_alerts::Settings =
                    serde_json::from_value(candidate.clone()).expect("native settings");
                native.set_threshold(usize::from(threshold.index), threshold.minutes);
                candidate["thresholds"] =
                    serde_json::to_value(native.thresholds).expect("thresholds");
            }
            let after = WidgetSettings::from_json(
                kind,
                &serde_json::to_string(&candidate).expect("candidate"),
            )
            .expect("native normalization")
            .expect("supported");
            json!({"before":before,"patch":patch,"after":after})
        })
        .collect()
}
