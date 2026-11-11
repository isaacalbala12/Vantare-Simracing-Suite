//! Tester-only contribution preparation. Local prose never crosses this boundary.
use crate::{
    protocol::{AccessView, HostError, Reply, Request},
    testing,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::services_protocol::{self as core, triage_document as document};

pub const LOCAL_TITLE_MAX_CHARS: usize = 120;
pub const LOCAL_BODY_MAX_CHARS: usize = 1_000;
pub const PREVIEW_LIMIT: usize = core::MAX_FRAME;
const PRIVATE_TEXT: &str = "[contenido retirado por privacidad]";
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriageItem {
    System,
    Session,
    AppLog,
    TelemetryFragment,
    PosthogSession,
}
impl TriageItem {
    pub const ALL: [Self; 5] = [
        Self::System,
        Self::Session,
        Self::AppLog,
        Self::TelemetryFragment,
        Self::PosthogSession,
    ];
    fn core(self) -> document::Item {
        match self {
            Self::System => document::Item::System,
            Self::Session => document::Item::Session,
            Self::AppLog => document::Item::AppLog,
            Self::TelemetryFragment => document::Item::TelemetryFragment,
            Self::PosthogSession => document::Item::PosthogSession,
        }
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TriageSelection {
    pub items: Vec<TriageItem>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TriagePreview {
    pub id: String,
    pub payload: String,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Operation {
    Prepare,
    Send,
}
pub(crate) fn intent(
    request: &Request,
    access: &AccessView,
) -> Result<(Operation, core::Command), HostError> {
    if !testing::allowed(access) || !access.tester {
        return Err(HostError::Denied);
    }
    match request {
        Request::TriagePrepare {
            selection,
            consent: true,
        } => {
            let items: std::collections::BTreeSet<_> = selection
                .items
                .iter()
                .copied()
                .map(TriageItem::core)
                .collect();
            if items.len() != selection.items.len() {
                return Err(HostError::Rejected);
            }
            Ok((
                Operation::Prepare,
                core::Command::TriagePrepare {
                    title: String::new(),
                    body: String::new(),
                    selection: document::Selection { items },
                    consent: true,
                },
            ))
        }
        Request::TriageSend {
            preview_id,
            consent: true,
        } if testing::preview_id(preview_id) => Ok((
            Operation::Send,
            core::Command::TriageSend {
                preview_id: preview_id.clone(),
            },
        )),
        _ => Err(HostError::Rejected),
    }
}
pub(crate) fn complete(operation: Operation, reply: core::Reply) -> Result<Reply, HostError> {
    match (operation, reply) {
        (Operation::Prepare, core::Reply::TriagePreview { preview }) => {
            view(&preview).map(|value| Reply::TriagePrepare { value })
        }
        (Operation::Send, core::Reply::Testing { data }) => {
            match testing::complete(testing::Operation::Refresh, core::Reply::Testing { data })? {
                Reply::TestingRefresh { value } => Ok(Reply::TriageSend { value }),
                _ => Err(HostError::Rejected),
            }
        }
        _ => Err(HostError::Rejected),
    }
}
fn exact(value: &Value, names: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == names.len() && names.iter().all(|key| object.contains_key(*key))
    })
}
fn array(value: &Value, limit: usize, valid: impl Fn(&Value) -> bool) -> bool {
    value
        .as_array()
        .is_some_and(|values| values.len() <= limit && values.iter().all(valid))
}
fn one_of(value: &Value, options: &[&str]) -> bool {
    value.as_str().is_some_and(|text| options.contains(&text))
}
fn numeric(value: &Value) -> bool {
    value
        .as_f64()
        .is_some_and(|n| n.is_finite() && (0.0..=1_000_000_000.0).contains(&n))
}
fn timestamp(value: &Value) -> bool {
    fn valid(value: &str) -> Option<bool> {
        fn decimal(value: &str) -> Option<u32> {
            value
                .bytes()
                .all(|byte| byte.is_ascii_digit())
                .then(|| value.parse().ok())
                .flatten()
        }
        if !(20..=35).contains(&value.len()) || !value.is_ascii() {
            return None;
        }
        let number = |start, end| decimal(value.get(start..end)?);
        if value.get(4..5)? != "-"
            || value.get(7..8)? != "-"
            || value.get(10..11)? != "T"
            || value.get(13..14)? != ":"
            || value.get(16..17)? != ":"
        {
            return None;
        }
        let year = number(0, 4)?;
        let month = number(5, 7)?;
        let day = number(8, 10)?;
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 => {
                if leap {
                    29
                } else {
                    28
                }
            }
            _ => return None,
        };
        if day == 0
            || day > days
            || number(11, 13)? > 23
            || number(14, 16)? > 59
            || number(17, 19)? > 60
        {
            return None;
        }
        let tail = &value[19..];
        let zone = if let Some(fraction) = tail.strip_prefix('.') {
            let index = fraction.find(['Z', '+', '-'])?;
            if !(1..=9).contains(&index)
                || !fraction[..index].bytes().all(|byte| byte.is_ascii_digit())
            {
                return None;
            }
            &fraction[index..]
        } else {
            tail
        };
        Some(
            zone == "Z"
                || (zone.len() == 6
                    && matches!(zone.as_bytes()[0], b'+' | b'-')
                    && &zone[3..4] == ":"
                    && decimal(&zone[1..3])? <= 23
                    && decimal(&zone[4..6])? <= 59),
        )
    }
    value
        .as_str()
        .is_some_and(|value| valid(value) == Some(true))
}
fn version(value: &Value) -> bool {
    fn number(text: &str) -> bool {
        !text.is_empty()
            && text.len() <= 6
            && text.bytes().all(|b| b.is_ascii_digit())
            && (text.len() == 1 || !text.starts_with('0'))
    }
    let Some(text) = value.as_str().filter(|s| s.len() <= 64) else {
        return false;
    };
    if text == "otro" {
        return true;
    }
    let (release, build) = text
        .split_once('+')
        .map_or((text, None), |(a, b)| (a, Some(b)));
    let (core, pre) = release
        .split_once('-')
        .map_or((release, None), |(a, b)| (a, Some(b)));
    let parts: Vec<_> = core.split('.').collect();
    parts.len() == 3
        && parts.into_iter().all(number)
        && build.is_none_or(|s| s.split('.').all(number))
        && pre.is_none_or(|s| {
            let mut parts = s.split('.');
            matches!(
                parts.next(),
                Some("nightly" | "testers" | "alpha" | "beta" | "rc")
            ) && parts.all(number)
        })
}
fn optional_object(value: &Value, valid: impl Fn(&str, &Value) -> bool) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.iter().all(|(key, value)| valid(key, value)))
}
fn system(value: &Value) -> bool {
    optional_object(value, |key, value| match key {
        "os" => optional_object(value, |key, value| match key {
            "name" => one_of(value, &["Windows", "Linux", "macOS", "otro"]),
            "version" => version(value),
            "build" => value.as_str().is_some_and(|s| {
                s == "otro"
                    || (!s.is_empty() && s.len() <= 6 && s.bytes().all(|b| b.is_ascii_digit()))
            }),
            _ => false,
        }),
        "cpu" => optional_object(value, |key, value| {
            key == "cores" && value.as_u64().is_some_and(|n| n <= 1_000_000_000)
        }),
        "gpu" => array(value, 8, |value| {
            exact(value, &["driver_version"]) && version(&value["driver_version"])
        }),
        "displays" => array(value, 16, |value| {
            optional_object(value, |key, value| match key {
                "width" | "height" | "hz" | "dpi_scale" => numeric(value),
                "primary" => value.is_boolean(),
                _ => false,
            })
        }),
        "ram_gb" => numeric(value),
        "obs_active" => value.is_boolean(),
        "overlays_active" => array(value, 5, |value| {
            one_of(
                value,
                &["OBS", "Streamlabs", "SimHub", "CrewChief", "Vantare"],
            )
        }),
        _ => false,
    })
}
fn summary(value: &Value) -> bool {
    value.is_null()
        || (exact(value, &["errors", "events"])
            && array(&value["errors"], 20, |error| {
                exact(error, &["type", "message", "fingerprint"])
                    && error["type"] == "ServicesCommandFailure"
                    && error["message"] == error["type"]
                    && error["fingerprint"]
                        .as_str()
                        .is_some_and(testing::preview_id)
            })
            && array(&value["events"], 50, |event| {
                exact(event, &["name", "at"])
                    && one_of(
                        &event["name"],
                        &["ServicesCommandFailure", "ServicesCommandSuccess"],
                    )
                    && timestamp(&event["at"])
            }))
}
fn context(value: &Value, channel: &str) -> bool {
    exact(
        value,
        &[
            "app_version",
            "app_channel",
            "game",
            "game_version",
            "system",
            "telemetry_summary",
            "posthog_session_id",
            "consent",
        ],
    ) && version(&value["app_version"])
        && value["app_channel"] == channel
        && one_of(&value["game"], &["lmu", "acc", "none"])
        && (value["game_version"].is_null() || version(&value["game_version"]))
        && system(&value["system"])
        && summary(&value["telemetry_summary"])
        && value["posthog_session_id"].is_null()
        && exact(&value["consent"], &["version", "items", "accepted_at"])
        && value["consent"]["version"] == "triage-v2"
        && array(&value["consent"]["items"], TriageItem::ALL.len(), |value| {
            value.as_str().is_some_and(|key| {
                document::Item::ALL
                    .into_iter()
                    .any(|item| item.key() == key)
            })
        })
        && value["consent"]["items"].as_array().is_some_and(|items| {
            let unique: std::collections::BTreeSet<_> =
                items.iter().filter_map(Value::as_str).collect();
            unique.len() == items.len()
        })
        && timestamp(&value["consent"]["accepted_at"])
}
pub fn view(value: &document::Preview) -> Result<TriagePreview, HostError> {
    if !testing::preview_id(&value.id)
        || !testing::testing_id(&value.packet.id)
        || !matches!(value.channel.as_str(), "testers" | "nightly")
        || value.packet.title != PRIVATE_TEXT
        || value.packet.body != PRIVATE_TEXT
        || !context(&value.packet.context, &value.channel)
        || value.packet.attachments.len() > 1
        || value.packet.attachments.iter().any(|attachment| {
            if attachment.kind != "app_log"
                || attachment.content.len() > PREVIEW_LIMIT
                || attachment.sha256
                    != vantare_services::content_hash(attachment.content.as_bytes())
            {
                return true;
            }
            serde_json::from_str::<Value>(&attachment.content).map_or(true, |log| {
                !array(&log, 300, |record| {
                    exact(record, &["level", "module", "relative_ms"])
                        && one_of(&record["level"], &["INFO", "ERROR"])
                        && record["module"] == "services"
                        && record["relative_ms"]
                            .as_u64()
                            .is_some_and(|n| n <= 1_000_000_000)
                })
            })
        })
    {
        return Err(HostError::Rejected);
    }
    // Workspace feature unification may enable serde_json/preserve_order.
    // The JSON embedded in the wire remains deterministic in either build.
    let mut packet = value.packet.rpc_payload(&value.channel);
    packet.sort_all_objects();
    let payload = serde_json::to_string_pretty(&packet).map_err(|_| HostError::Rejected)?;
    if payload.len() > PREVIEW_LIMIT {
        return Err(HostError::Rejected);
    }
    Ok(TriagePreview {
        id: value.id.clone(),
        payload,
    })
}

#[cfg(test)]
#[path = "triage_tests.rs"]
mod tests;
