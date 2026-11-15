//! Compare against frozen pre-extraction UI definitions, never a regenerated oracle.
#[path = "frozen/inspector_settings.rs"]
mod frozen;
use serde_json::{Value, json};
use vantare_domain::widget_settings as native;
macro_rules! migration {
    ($name:ident, [$($sample:expr),* $(,)?]) => {
        #[test]
        fn $name() {
            assert_eq!(frozen::$name::Settings::UNSUPPORTED, native::$name::Settings::UNSUPPORTED);
            for input in [json!({}), $($sample),*] {
                let old: frozen::$name::Settings = serde_json::from_value(input.clone()).expect("old settings");
                let new: native::$name::Settings = serde_json::from_value(input).expect("new settings");
                assert_eq!(serde_json::to_vec(&old).expect("old bytes"), serde_json::to_vec(&new).expect("new bytes"));
                assert_eq!(serde_json::to_vec(&old.normalized()).expect("old normalized bytes"),
                    serde_json::to_vec(&new.normalized()).expect("new normalized bytes"));
            }
        }
    };
}
migration!(
    broadcast_tower,
    [
        json!({"rowCount":0,"showSof":true,"driverCarousel":true}),
        json!({"rowCount":99,"showWeather":true})
    ]
);
migration!(
    car_damage_numbers,
    [json!({"format":"future","showTyres":false})]
);
migration!(
    car_damage_visual,
    [
        json!({"view":"future","toggleKey":"F12","showPercent":false}),
        json!({"view":"numbers","toggleKey":"f01"}),
        json!({"toggleKey":"bad"})
    ]
);
migration!(
    delta_trace,
    [
        json!({"reference":"future","windowSeconds":0}),
        json!({"reference":"leader","windowSeconds":99,"showSectors":false,"showTrackMap":false}),
        json!({"windowSeconds":2.5})
    ]
);
migration!(
    fastest_lap,
    [
        json!({"durationSeconds":0,"showDriver":false}),
        json!({"durationSeconds":255})
    ]
);
migration!(
    head_to_head,
    [
        json!({"target":"future","showSectors":false}),
        json!({"target":"behind"})
    ]
);
migration!(
    input_telemetry,
    [
        json!({"historySeconds":0}),
        json!({"historySeconds":255,"showClutch":true})
    ]
);
migration!(
    track_map,
    [json!({"transparent":true,"showTrackLabel":false})]
);
migration!(
    multiclass_relative,
    [
        json!({"rowCount":0,"classMode":"future"}),
        json!({"rowCount":8,"classMode":"same","showClassDivider":true}),
        json!({"rowCount":99,"classMode":"other"})
    ]
);
migration!(
    pedals_telemetry,
    [
        json!({"steeringWheel":"future","showPosition":false}),
        json!({"steeringWheel":"ferrari-499p","showClutch":false})
    ]
);
migration!(radar, [json!({"showPhrases":false})]);
migration!(
    racing_flags,
    [
        json!({"textColor":"#000000"}),
        json!({"textColor":"#000000","contentVersion":1}),
        json!({"textColor":"#A1b2C3","contentVersion":2}),
        json!({"textColor":"no","hideWhenGreen":true})
    ]
);
migration!(
    track_weather,
    [json!({"vertical":true,"showAmbient":false,"showRain":false})]
);
migration!(
    session_alerts,
    [
        json!({"thresholds":[0,99,5,5,1,60,30,15,2],"durationSeconds":0,"volume":255,"miniLimit":0,"miniSize":"future","style":"future","companionFor":"parent-opaque"}),
        json!({"thresholds":[],"durationSeconds":255,"miniLimit":255,"miniSize":"l","style":"carmin"})
    ]
);

#[test]
fn threshold_orders_match_the_frozen_inspector() {
    for index in 0..5 {
        for minutes in [0, 1, 5, 60] {
            let mut old = frozen::session_alerts::Settings::default();
            let mut new = native::session_alerts::Settings::default();
            old.set_threshold(index, minutes);
            new.set_threshold(index, minutes);
            assert_eq!(
                serde_json::to_vec(&old).expect("old"),
                serde_json::to_vec(&new).expect("new")
            );
        }
    }
}
#[test]
fn default_flag_color_matches_the_compiled_design_source() {
    let style: Value =
        serde_json::from_str(include_str!("../../ui/styles/vantare.json")).expect("style");
    assert_eq!(
        native::racing_flags::Settings::default().text_color,
        style["colors"]["text"].as_str().expect("text color")
    );
}

#[test]
fn non_finite_trace_windows_keep_the_same_native_fallback() {
    for window in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let old = frozen::delta_trace::Settings {
            window_seconds: window,
            ..Default::default()
        };
        let new = native::delta_trace::Settings {
            window_seconds: window,
            ..Default::default()
        };
        assert_eq!(
            old.normalized().window_seconds.to_bits(),
            new.normalized().window_seconds.to_bits()
        );
        assert_eq!(new.normalized().window_seconds.to_bits(), 4.0_f64.to_bits());
    }
}
