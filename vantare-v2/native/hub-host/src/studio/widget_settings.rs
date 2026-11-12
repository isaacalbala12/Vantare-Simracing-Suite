//! Closed settings payloads. Persisted data is owned by domain, never GPUI.
use super::WidgetKind;
use crate::protocol::HostError;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{DeserializeOwned, Error as _},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_domain::widget_settings as native;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum Data {
    Standings(native::standings::Settings),
    Relative(native::relative::Settings),
    Delta(native::delta::Settings),
    Pedals(native::pedals::Settings),
    FuelStrategy(native::fuel_strategy::Settings),
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[cfg_attr(any(test, feature = "bindings"), ts(transparent))]
#[serde(transparent)]
pub struct WidgetSettings(#[cfg_attr(any(test, feature = "bindings"), ts(inline))] Data);
// Data is private and immutable. Construction always normalizes the only float,
// Pedals.gap, into its finite range; every other field has reflexive equality.
impl Eq for WidgetSettings {}
impl<'de> Deserialize<'de> for WidgetSettings {
    fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        let value = match Data::deserialize(input)? {
            Data::Standings(s) => Data::Standings(s.normalized()),
            Data::Relative(s) => Data::Relative(s.normalized()),
            Data::Delta(s) => Data::Delta(s.normalized()),
            Data::Pedals(s) => Data::Pedals(s.normalized()),
            Data::FuelStrategy(s) => Data::FuelStrategy(s.normalized()),
        };
        Ok(Self(value))
    }
}
impl WidgetSettings {
    pub fn kind(&self) -> WidgetKind {
        match self.0 {
            Data::Standings(_) => WidgetKind::Standings,
            Data::Relative(_) => WidgetKind::Relative,
            Data::Delta(_) => WidgetKind::Delta,
            Data::Pedals(_) => WidgetKind::Pedals,
            Data::FuelStrategy(_) => WidgetKind::FuelStrategy,
        }
    }
    pub fn supports(kind: WidgetKind) -> bool {
        matches!(
            kind,
            WidgetKind::Standings
                | WidgetKind::Relative
                | WidgetKind::Delta
                | WidgetKind::Pedals
                | WidgetKind::FuelStrategy
        )
    }
    pub(crate) fn unnormalized_json(json: &str) -> Result<serde_json::Value, HostError> {
        serde_json::from_str::<Data>(json)
            .and_then(serde_json::to_value)
            .map_err(|_| HostError::Protected)
    }
    pub(crate) fn from_json(kind: WidgetKind, json: &str) -> Result<Option<Self>, HostError> {
        if !Self::supports(kind) {
            return Ok(None);
        }
        let value: Self = serde_json::from_str(json).map_err(|_| HostError::Protected)?;
        if value.kind() != kind {
            return Err(HostError::Protected);
        }
        Ok(Some(value))
    }
}

// A finite numeric newtype preserves Eq on the transport without changing the
// shared protocol. Its private field cannot acquire NaN after validation.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
#[serde(try_from = "f32", into = "f32")]
pub struct WidgetGap(f32);
impl Eq for WidgetGap {}
impl TryFrom<f32> for WidgetGap {
    type Error = &'static str;
    fn try_from(value: f32) -> Result<Self, Self::Error> {
        if value.is_finite() && (native::pedals::GAP_MIN..=native::pedals::GAP_MAX).contains(&value)
        {
            Ok(Self(value))
        } else {
            Err("invalid pedal gap")
        }
    }
}
impl From<WidgetGap> for f32 {
    fn from(value: WidgetGap) -> Self {
        value.0
    }
}

macro_rules! choice {
    ($name:ident, $allowed:expr, $typescript:literal) => {
        #[derive(Clone, Debug, PartialEq, Eq, Serialize)]
        #[cfg_attr(any(test, feature = "bindings"), derive(TS))]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = $typescript))]
        #[serde(transparent)]
        pub struct $name(String);
        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
                let value = String::deserialize(input)?;
                if ($allowed)(&value) {
                    Ok(Self(value))
                } else {
                    Err(D::Error::custom("unknown widget choice"))
                }
            }
        }
    };
}
choice!(
    StandingsScope,
    |v: &str| native::standings::STANDINGS_SCOPES.contains(&v),
    "typeof studioWidgetOptions.standings.scopes[number]"
);
choice!(
    StandingsClassification,
    |v: &str| native::standings::STANDINGS_CLASSIFICATION_MODES.contains(&v),
    "typeof studioWidgetOptions.standings.classifications[number]"
);
choice!(
    StandingsTemplate,
    |v: &str| native::standings::STANDINGS_TEMPLATES.contains(&v),
    "typeof studioWidgetOptions.standings.templates[number]"
);
choice!(
    TableSize,
    |v: &str| native::TABLE_SIZES.contains(&v),
    "typeof studioWidgetOptions.tableSizes[number]"
);
choice!(
    RelativeScope,
    |v: &str| native::relative::RELATIVE_SCOPES.contains(&v),
    "typeof studioWidgetOptions.relative.scopes[number]"
);
choice!(
    DeltaSize,
    |v: &str| native::delta::DELTA_SIZES.contains(&v),
    "typeof studioWidgetOptions.delta.sizes[number]"
);
choice!(
    DeltaReference,
    |v: &str| native::delta::DELTA_REFERENCES.contains(&v),
    "typeof studioWidgetOptions.delta.references[number]"
);
choice!(
    DeltaTemplate,
    |v: &str| native::delta::DELTA_TEMPLATES.contains(&v),
    "typeof studioWidgetOptions.delta.templates[number]"
);
choice!(
    FooterKey,
    |v: &str| native::FOOTER_KEYS.contains(&v),
    "typeof studioWidgetOptions.footerKeys[number]"
);
choice!(
    ColumnWidth,
    |v: &str| native::columns::COLUMN_WIDTHS.contains(&v),
    "typeof studioWidgetOptions.columns.widths[number]"
);
choice!(
    ColumnNameMode,
    |v: &str| native::columns::COLUMN_NAME_MODES.contains(&v),
    "typeof studioWidgetOptions.columns.names[number]"
);
choice!(
    ColumnAlign,
    |v: &str| native::columns::COLUMN_ALIGNS.contains(&v),
    "typeof studioWidgetOptions.columns.aligns[number]"
);
choice!(
    ColumnMetric,
    |v: &str| native::columns::LEGACY_TABLE_COLUMNS.contains(&v)
        || native::standings::STANDINGS_VANTARE_COLUMNS.contains(&v)
        || native::relative::RELATIVE_VANTARE_COLUMNS.contains(&v),
    "typeof studioWidgetOptions.columns.metrics[number]"
);
choice!(
    FooterMetric,
    |v: &str| native::standings::STANDINGS_FOOTER_METRICS.contains(&v),
    "typeof studioWidgetOptions.standings.footerMetrics[number]"
);

// Omission is unchanged; explicit null is accepted only for nullable T.
fn some<'de, D: Deserializer<'de>, T: Deserialize<'de>>(input: D) -> Result<Option<T>, D::Error> {
    T::deserialize(input).map(Some)
}
// Domain's persisted enums deliberately support serde(other). Requests must not
// silently turn an unrecognized enum identifier into the persisted default.
fn closed<'de, D: Deserializer<'de>, T: DeserializeOwned + Serialize>(
    input: D,
) -> Result<Option<T>, D::Error> {
    let original = serde_json::Value::deserialize(input)?;
    let value: T = serde_json::from_value(original.clone()).map_err(D::Error::custom)?;
    if serde_json::to_value(&value).map_err(D::Error::custom)? != original {
        return Err(D::Error::custom("unknown widget enum"));
    }
    Ok(Some(value))
}
macro_rules! patch {
    ($name:ident { $($field:ident: $ty:ty => $decode:literal),* $(,)? }) => {
        #[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
        #[cfg_attr(any(test, feature = "bindings"), derive(TS))]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        pub struct $name {
            $(#[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = $decode)]
              pub $field: Option<$ty>,)*
        }
    };
}
patch!(WidgetColumnFormatPatch {
    mode: ColumnNameMode => "some",
    max_chars: Option<usize> => "some",
});
patch!(WidgetColumnStylePatch { align: Option<ColumnAlign> => "some" });
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetColumnPatch {
    pub metric: ColumnMetric,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "some"
    )]
    pub enabled: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "some"
    )]
    pub width_preset: Option<ColumnWidth>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "some"
    )]
    pub format: Option<WidgetColumnFormatPatch>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "some"
    )]
    pub style: Option<WidgetColumnStylePatch>,
}
patch!(StandingsWidgetPatch {
    design_system: native::look::Look => "closed",
    style: native::look::Tone => "closed",
    accent: native::look::Accent => "closed",
    row_count: usize => "some",
    columns: Option<Vec<WidgetColumnPatch>> => "some",
    practice_columns: Option<Vec<WidgetColumnPatch>> => "some",
    qualifying_columns: Option<Vec<WidgetColumnPatch>> => "some",
    class_scope: StandingsScope => "some",
    classification_mode: StandingsClassification => "some",
    player_window: bool => "some",
    window_around: usize => "some",
    show_session_header: bool => "some",
    template_id: StandingsTemplate => "some",
    show_session_footer: bool => "some",
    footer_first: FooterMetric => "some",
    footer_second: FooterMetric => "some",
    footer_slots: Option<Vec<FooterKey>> => "some",
});
patch!(RelativeWidgetPatch {
    design_system: native::look::Look => "closed",
    style: native::look::Tone => "closed",
    accent: native::look::Accent => "closed",
    columns: Option<Vec<WidgetColumnPatch>> => "some",
    range_ahead: usize => "some",
    range_behind: usize => "some",
    class_scope: RelativeScope => "some",
    footer_slots: Vec<FooterKey> => "some",
});
patch!(DeltaWidgetPatch {
    design_system: native::look::Look => "closed",
    style: native::look::Tone => "closed",
    accent: native::look::Accent => "closed",
    size: DeltaSize => "some",
    reference: DeltaReference => "some",
    template_id: DeltaTemplate => "some",
    transparent_background: bool => "some",
    show_bar: bool => "some",
    show_sectors: bool => "some",
});
patch!(PedalsWidgetPatch {
    design_system: native::look::Look => "closed",
    style: native::look::Tone => "closed",
    accent: native::look::Accent => "closed",
    gap: WidgetGap => "some",
    transparent_background: bool => "some",
    show_brake_peak: bool => "some",
});
patch!(FuelStrategyWidgetPatch {
    design_system: native::look::Look => "closed",
    style: native::look::Tone => "closed",
    accent: native::look::Accent => "closed",
    size: TableSize => "some",
    history_rows: u8 => "some",
    show_projection: bool => "some",
});

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum WidgetSettingsPatch {
    Standings(StandingsWidgetPatch),
    Relative(RelativeWidgetPatch),
    Delta(DeltaWidgetPatch),
    Pedals(PedalsWidgetPatch),
    FuelStrategy(FuelStrategyWidgetPatch),
}
impl WidgetSettingsPatch {
    pub fn kind(&self) -> WidgetKind {
        match self {
            Self::Standings(_) => WidgetKind::Standings,
            Self::Relative(_) => WidgetKind::Relative,
            Self::Delta(_) => WidgetKind::Delta,
            Self::Pedals(_) => WidgetKind::Pedals,
            Self::FuelStrategy(_) => WidgetKind::FuelStrategy,
        }
    }
}

// Compute the maximum envelope overhead from the real transport, not a second
// copy of its JSON schema. Only the tiny empty view is cloned once.
pub(crate) fn fits_view(view: &super::StudioView) -> bool {
    use crate::protocol::{Event, HostToUi, Reply};
    use std::sync::OnceLock;
    static OVERHEAD: OnceLock<usize> = OnceLock::new();
    let overhead = *OVERHEAD.get_or_init(|| {
        let empty = super::State::unavailable(super::StudioState::Missing, None);
        let size = serde_json::to_vec(&empty).expect("empty view").len();
        let messages = [
            HostToUi::Failure {
                id: u32::MAX,
                error: HostError::StudioConflict {
                    current: empty.clone(),
                },
            },
            HostToUi::Response {
                id: u32::MAX,
                result: Reply::StudioVisibility {
                    value: empty.clone(),
                },
            },
            HostToUi::Response {
                id: u32::MAX,
                result: Reply::StudioAdd {
                    value: empty.clone(),
                    added: "\u{1}".repeat(super::ID_LIMIT),
                },
            },
            HostToUi::Event {
                event: Event::Studio { value: empty },
            },
        ];
        messages
            .iter()
            .map(|m| serde_json::to_vec(m).expect("empty envelope").len() - size)
            .max()
            .expect("envelopes")
    });
    struct Counter {
        remaining: usize,
    }
    impl std::io::Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.remaining = self
                .remaining
                .checked_sub(bytes.len())
                .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut counter = Counter {
        remaining: crate::frame::LIMIT.saturating_sub(overhead),
    };
    serde_json::to_writer(&mut counter, view).is_ok()
}

impl WidgetSettingsPatch {
    pub(crate) fn validate(&self) -> Result<(), HostError> {
        fn range(value: Option<usize>, min: usize, max: usize) -> Result<(), HostError> {
            if value.is_some_and(|v| !(min..=max).contains(&v)) {
                Err(HostError::Denied)
            } else {
                Ok(())
            }
        }
        fn columns(
            kind: WidgetKind,
            value: &Option<Option<Vec<WidgetColumnPatch>>>,
        ) -> Result<(), HostError> {
            let Some(Some(items)) = value else {
                return Ok(());
            };
            if kind == WidgetKind::Standings
                && items.len() > native::standings::STANDINGS_COLUMNS_MAX
            {
                return Err(HostError::Denied);
            }
            let mut seen = std::collections::HashSet::new();
            for item in items {
                let metric = item.metric.as_str();
                let accepted = native::columns::LEGACY_TABLE_COLUMNS.contains(&metric)
                    || match kind {
                        WidgetKind::Standings => {
                            native::standings::STANDINGS_VANTARE_COLUMNS.contains(&metric)
                        }
                        WidgetKind::Relative => {
                            native::relative::RELATIVE_VANTARE_COLUMNS.contains(&metric)
                        }
                        _ => false,
                    };
                if !accepted
                    || !seen.insert(metric)
                    || item.format.as_ref().is_some_and(|v| {
                        v.max_chars
                            .flatten()
                            .is_some_and(|n| n > native::columns::MAX_CHARS_LIMIT)
                    })
                {
                    return Err(HostError::Denied);
                }
            }
            Ok(())
        }
        fn footer(items: &[FooterKey]) -> Result<(), HostError> {
            let mut seen = std::collections::HashSet::new();
            if items.len() > native::FOOTER_ITEMS_MAX
                || items.iter().any(|v| !seen.insert(v.as_str()))
            {
                Err(HostError::Denied)
            } else {
                Ok(())
            }
        }
        match self {
            Self::Standings(p) => {
                range(
                    p.row_count,
                    native::standings::STANDINGS_ROWS_MIN,
                    native::standings::STANDINGS_ROWS_MAX,
                )?;
                if p.window_around
                    .is_some_and(|v| !native::standings::STANDINGS_WINDOW_AROUND.contains(&v))
                {
                    return Err(HostError::Denied);
                }
                for value in [&p.columns, &p.practice_columns, &p.qualifying_columns] {
                    columns(self.kind(), value)?;
                }
                if let Some(Some(items)) = &p.footer_slots {
                    footer(items)?;
                }
            }
            Self::Relative(p) => {
                range(
                    p.range_ahead,
                    native::relative::RELATIVE_RANGE_MIN,
                    native::relative::RELATIVE_RANGE_MAX,
                )?;
                range(
                    p.range_behind,
                    native::relative::RELATIVE_RANGE_MIN,
                    native::relative::RELATIVE_RANGE_MAX,
                )?;
                columns(self.kind(), &p.columns)?;
                if let Some(items) = &p.footer_slots {
                    footer(items)?;
                }
            }
            Self::FuelStrategy(p) => range(
                p.history_rows.map(usize::from),
                usize::from(native::fuel_strategy::FUEL_HISTORY_MIN),
                usize::from(native::fuel_strategy::FUEL_HISTORY_MAX),
            )?,
            Self::Delta(_) | Self::Pedals(_) => {}
        }
        Ok(())
    }
}
