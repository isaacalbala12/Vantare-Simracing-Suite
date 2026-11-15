//! Closed controls for the remaining native inspector families (D106).
use super::*;

pub const DAMAGE_VIEWS: &[&str] = &["car", "numbers"];
pub const TOGGLE_KEYS: &[&str] = &[
    "", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
];
pub const TARGETS: &[&str] = &["ahead", "behind"];
pub const CLASS_MODES: &[&str] = &["all", "same", "other"];
pub const MINI_SIZES: &[&str] = &["s", "m", "l"];
pub const ALERT_STYLES: &[&str] = &["neo", "carmin", "limpio", "transparente"];

choice!(
    DamageView,
    |v: &str| DAMAGE_VIEWS.contains(&v),
    "typeof studioAdditionalOptions.damage.views[number]"
);
choice!(
    ToggleKey,
    |v: &str| TOGGLE_KEYS.contains(&v),
    "typeof studioAdditionalOptions.damage.toggleKeys[number]"
);
choice!(
    HeadTarget,
    |v: &str| TARGETS.contains(&v),
    "typeof studioAdditionalOptions.headToHead.targets[number]"
);
choice!(
    MulticlassMode,
    |v: &str| CLASS_MODES.contains(&v),
    "typeof studioAdditionalOptions.multiclassRelative.classModes[number]"
);
choice!(
    SteeringWheel,
    |v: &str| vantare_domain::pedals_telemetry::WHEELS.contains(&v),
    "typeof studioAdditionalOptions.pedalsTelemetry.wheels[number]"
);
choice!(
    MiniSize,
    |v: &str| MINI_SIZES.contains(&v),
    "typeof studioAdditionalOptions.sessionAlerts.miniSizes[number]"
);
choice!(
    AlertStyle,
    |v: &str| ALERT_STYLES.contains(&v),
    "typeof studioAdditionalOptions.sessionAlerts.styles[number]"
);
choice!(FlagColor, valid_color, "string");
fn valid_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThresholdPatch {
    pub index: u8,
    pub minutes: u8,
}

patch!(BroadcastTowerWidgetPatch { row_count: u8 => "some", driver_carousel: bool => "some", show_weather: bool => "some" });
patch!(CarDamageNumbersWidgetPatch { show_tyres: bool => "some" });
patch!(CarDamageVisualWidgetPatch { view: DamageView => "some", toggle_key: ToggleKey => "some", show_aero: bool => "some" });
patch!(DeltaTraceWidgetPatch { reference: DeltaReference => "some", window_seconds: u8 => "some" });
patch!(FastestLapWidgetPatch { show_personal: bool => "some", show_class: bool => "some", show_driver: bool => "some", duration_seconds: u8 => "some" });
patch!(HeadToHeadWidgetPatch { target: HeadTarget => "some" });
patch!(InputTelemetryWidgetPatch { history_seconds: u8 => "some", show_clutch: bool => "some" });
patch!(TrackMapWidgetPatch { transparent: bool => "some" });
patch!(MulticlassRelativeWidgetPatch { row_count: u8 => "some", class_mode: MulticlassMode => "some", show_class_divider: bool => "some" });
patch!(PedalsTelemetryWidgetPatch { show_clutch: bool => "some", steering_wheel: SteeringWheel => "some" });
patch!(RadarWidgetPatch { show_phrases: bool => "some" });
patch!(RacingFlagsWidgetPatch { show_sector_flags: bool => "some", hide_when_green: bool => "some", text_color: FlagColor => "some" });
patch!(TrackWeatherWidgetPatch { vertical: bool => "some" });
patch!(SessionAlertsWidgetPatch {
    sound_zero: bool => "some", mini_final: bool => "some", session: bool => "some",
    calendar: bool => "some", finished: bool => "some", starts: bool => "some",
    duration_seconds: u8 => "some", sound: bool => "some", volume: u8 => "some",
    mini: bool => "some", mini_session: bool => "some", mini_calendar: bool => "some",
    mini_start: bool => "some", mini_limit: u8 => "some", mini_size: MiniSize => "some",
    style: AlertStyle => "some", threshold: ThresholdPatch => "some",
});

fn range(value: Option<u8>, min: u8, max: u8) -> Result<(), HostError> {
    if value.is_some_and(|v| !(min..=max).contains(&v)) {
        Err(HostError::Denied)
    } else {
        Ok(())
    }
}
pub(super) fn validate(patch: &WidgetSettingsPatch) -> Result<(), HostError> {
    match patch {
        WidgetSettingsPatch::BroadcastTower(p) => range(p.row_count, 3, 11),
        WidgetSettingsPatch::DeltaTrace(p) => range(p.window_seconds, 1, 8),
        WidgetSettingsPatch::FastestLap(p) => range(p.duration_seconds, 3, 15),
        WidgetSettingsPatch::InputTelemetry(p) => range(p.history_seconds, 1, 8),
        WidgetSettingsPatch::MulticlassRelative(p) => {
            if p.row_count.is_some_and(|v| ![7, 9].contains(&v)) {
                Err(HostError::Denied)
            } else {
                Ok(())
            }
        }
        WidgetSettingsPatch::SessionAlerts(p) => {
            range(p.duration_seconds, 4, 15)?;
            range(p.mini_limit, 1, 3)?;
            range(p.volume, 0, 100)?;
            if p.volume.is_some_and(|v| v % 5 != 0)
                || p.threshold
                    .as_ref()
                    .is_some_and(|v| v.index >= 5 || v.minutes > 60)
            {
                return Err(HostError::Denied);
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) fn options() -> serde_json::Value {
    serde_json::json!({
        "broadcastTower":{"rowsMin":3,"rowsMax":11,"rowsStep":1},
        "damage":{"views":DAMAGE_VIEWS,"toggleKeys":TOGGLE_KEYS},
        "deltaTrace":{"references":native::delta::DELTA_REFERENCES,"secondsMin":1,"secondsMax":8,"secondsStep":1},
        "fastestLap":{"secondsMin":3,"secondsMax":15,"secondsStep":1},
        "headToHead":{"targets":TARGETS},
        "inputTelemetry":{"secondsMin":1,"secondsMax":8,"secondsStep":1},
        "multiclassRelative":{"rows":[7,9],"classModes":CLASS_MODES},
        "pedalsTelemetry":{"wheels":vantare_domain::pedals_telemetry::WHEELS},
        "racingFlags":{"colorPattern":"^#[0-9a-fA-F]{6}$","colorLength":7},
        "sessionAlerts":{"secondsMin":4,"secondsMax":15,"secondsStep":1,"volumeMin":0,"volumeMax":100,"volumeStep":5,
            "miniLimitMin":1,"miniLimitMax":3,"miniSizes":MINI_SIZES,"styles":ALERT_STYLES,
            "thresholdSlots":5,"thresholdMin":0,"thresholdMax":60,"thresholdStep":1,"startSignalsAvailable":false}
    })
}

#[cfg(any(test, feature = "bindings"))]
#[path = "additional_cases.rs"]
pub(crate) mod cases;
