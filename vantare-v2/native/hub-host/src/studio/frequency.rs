//! Projection of existing overlay cadence, never a scheduler.
#[cfg(any(windows, test, feature = "bindings"))]
use super::WidgetKind;
use crate::settings::track::PerformanceLevel;
#[cfg(any(windows, test, feature = "bindings"))]
use crate::settings::track::{TABLE_HZ, WIDGET_HZ};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const FREQUENCY_CHOICES: [u16; 8] = [1, 4, 5, 10, 15, 20, 30, 60];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum FrequencySource {
    Level,
    Override,
    Snapshot,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrequencyView {
    pub override_hz: Option<u16>,
    pub applied_hz: u16,
    pub source: FrequencySource,
    #[cfg_attr(
        any(test, feature = "bindings"),
        ts(type = "import('./settings').PerformanceLevel")
    )]
    pub level: PerformanceLevel,
}
#[cfg(any(windows, test, feature = "bindings"))]
impl FrequencyView {
    pub(crate) fn new(kind: WidgetKind, level: PerformanceLevel, override_hz: Option<u16>) -> Self {
        let (applied_hz, source) = if kind == WidgetKind::RacingFlags {
            (0, FrequencySource::Snapshot)
        } else if let Some(hz) = override_hz {
            (hz, FrequencySource::Override)
        } else {
            (level_hz(kind, level), FrequencySource::Level)
        };
        Self {
            override_hz,
            applied_hz,
            source,
            level,
        }
    }
}
#[cfg(any(windows, test, feature = "bindings"))]
fn level_hz(kind: WidgetKind, level: PerformanceLevel) -> u16 {
    let index = match level {
        PerformanceLevel::Maximum => 0,
        PerformanceLevel::High => 1,
        PerformanceLevel::Balanced => 2,
        PerformanceLevel::Economy => 3,
        PerformanceLevel::Minimum => 4,
    };
    if matches!(
        kind,
        WidgetKind::Standings
            | WidgetKind::Relative
            | WidgetKind::MulticlassRelative
            | WidgetKind::BroadcastTower
    ) {
        TABLE_HZ[index]
    } else {
        WIDGET_HZ[index]
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stored_overrides_remain_distinct_from_inheritance_and_snapshot_updates() {
        for level in PerformanceLevel::ALL {
            for kind in WidgetKind::ALL {
                let inherited = FrequencyView::new(*kind, level, None);
                assert_eq!(inherited.override_hz, None);
                for hz in crate::settings::track::OVERRIDE_HZ {
                    let selected = FrequencyView::new(*kind, level, Some(hz));
                    assert_eq!(selected.override_hz, Some(hz));
                    if *kind == WidgetKind::RacingFlags {
                        assert_eq!(selected.applied_hz, 0);
                        assert_eq!(selected.source, FrequencySource::Snapshot);
                    } else {
                        assert_eq!(selected.applied_hz, hz);
                        assert_eq!(selected.source, FrequencySource::Override);
                        assert_eq!(inherited.source, FrequencySource::Level);
                    }
                }
            }
        }
    }
}
// A wrapper makes an omitted adjacent value an error; only explicit null removes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(ts_rs::TS))]
#[serde(transparent)]
pub struct FrequencyChange(Option<u16>);
impl FrequencyChange {
    pub fn value(self) -> Option<u16> {
        self.0
    }
}
impl<'de> Deserialize<'de> for FrequencyChange {
    fn deserialize<D: serde::Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        struct Nullable;
        impl serde::de::Visitor<'_> for Nullable {
            type Value = FrequencyChange;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("an inspector frequency or explicit null")
            }
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(FrequencyChange(None))
            }
            fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<Self::Value, E> {
                let hz = u16::try_from(value).map_err(E::custom)?;
                if !FREQUENCY_CHOICES.contains(&hz) {
                    return Err(E::custom("unsupported inspector frequency"));
                }
                Ok(FrequencyChange(Some(hz)))
            }
        }
        // Missing adjacent content must fail instead of invoking Option's default.
        input.deserialize_any(Nullable)
    }
}
#[cfg(test)]
mod input_tests {
    #[test]
    fn frequency_requires_explicit_content_and_only_null_removes_an_override() {
        let explicit: crate::studio::InstancePatch =
            serde_json::from_str(r#"{"field":"frequency","value":null}"#)
                .expect("explicit removal");
        assert!(
            matches!(explicit, crate::studio::InstancePatch::Frequency(value) if value.value().is_none())
        );
        for input in [
            r#"{"field":"frequency"}"#,
            r#"{"field":"frequency","value":"60"}"#,
            r#"{"field":"frequency","value":1.5}"#,
            r#"{"field":"frequency","value":-1}"#,
            r#"{"field":"frequency","value":65536}"#,
            r#"{"field":"frequency","value":0}"#,
            r#"{"field":"frequency","value":40}"#,
            r#"{"field":"frequency","value":null,"path":"arbitrary"}"#,
        ] {
            assert!(
                serde_json::from_str::<crate::studio::InstancePatch>(input).is_err(),
                "{input}"
            );
        }
    }
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) fn cases() -> Vec<serde_json::Value> {
    let mut cases = vec![];
    for level in PerformanceLevel::ALL {
        for kind in WidgetKind::ALL {
            for hz in [None, Some(0), Some(40), Some(60)] {
                cases.push(
                    serde_json::json!({"kind":kind,"level":level,"overrideHz":hz,
                    "view":FrequencyView::new(*kind, level, hz)}),
                );
            }
        }
    }
    cases
}

#[cfg(test)]
mod cadence_tests {
    use super::*;
    #[test]
    fn inherited_cadences_match_the_frozen_native_policy_for_every_kind_and_level() {
        for (index, level) in PerformanceLevel::ALL.into_iter().enumerate() {
            for kind in WidgetKind::ALL {
                let expected = match kind {
                    WidgetKind::RacingFlags => 0,
                    WidgetKind::Standings
                    | WidgetKind::Relative
                    | WidgetKind::MulticlassRelative
                    | WidgetKind::BroadcastTower => [30, 20, 15, 10, 5][index],
                    _ => [0, 60, 40, 30, 20][index],
                };
                assert_eq!(
                    FrequencyView::new(*kind, level, None).applied_hz,
                    expected,
                    "{kind:?}/{level:?}"
                );
            }
        }
    }
}
