//! Local preparation and exact retries. The model never runs on the tester's PC.
mod capture;
mod redaction;
use crate::{
    Error, Result,
    bridge::DataRequest,
    protocol::triage_document::{Attachment, Item, Packet, Preview, Selection},
};
use std::collections::VecDeque;

struct Prepared {
    account: String,
    until: u64,
    preview: Preview,
}
#[derive(Default)]
pub(crate) struct Triage {
    prepared: Option<Prepared>,
    logs: VecDeque<(u64, String)>,
}
pub(crate) struct Input<'a> {
    pub title: &'a str,
    pub body: &'a str,
    pub selection: Selection,
    pub consent: bool,
    pub private_names: &'a [String],
}
impl Triage {
    pub(crate) fn cancel(&mut self) {
        self.prepared = None;
        self.logs.clear();
    }
    pub(crate) fn record(&mut self, now: u64, failed: bool, operation: &str) {
        self.logs.push_back((
            now,
            format!(
                "{} services:{operation}",
                if failed { "ERROR" } else { "INFO" }
            ),
        ));
        while self.logs.len() > 2000
            || self
                .logs
                .front()
                .is_some_and(|(t, _)| now.saturating_sub(*t) > 1800)
        {
            self.logs.pop_front();
        }
    }
    fn summary(&self, now: u64) -> serde_json::Value {
        let recent: Vec<_> = self
            .logs
            .iter()
            .filter(|(at, _)| now.saturating_sub(*at) <= 1800)
            .collect();
        if recent.is_empty() {
            return serde_json::Value::Null;
        }
        let mut errors: Vec<_> = recent
            .iter()
            .rev()
            .filter(|(_, line)| line.starts_with("ERROR "))
            .take(20)
            .map(|(_, line)| {
                serde_json::json!({
                    "type":"ServicesCommandFailure", "message":line,
                    "first_line":line, "fingerprint":crate::content_hash(line.as_bytes())
                })
            })
            .collect();
        errors.reverse();
        let mut events: Vec<_> = recent
            .iter()
            .rev()
            .take(50)
            .filter_map(|(at, line)| {
                let at = chrono::DateTime::from_timestamp(i64::try_from(*at).ok()?, 0)?;
                Some(serde_json::json!({"name":line,"at":at.to_rfc3339()}))
            })
            .collect();
        events.reverse();
        // These are actual service operation outcomes, independent of PostHog.
        // There is no source of measured overlay percentiles in this service.
        serde_json::json!({"errors":errors,"events":events})
    }
    pub(crate) fn prepare(
        &mut self,
        account: &str,
        channel: &str,
        input: Input<'_>,
        now: u64,
    ) -> Result<Preview> {
        let Input {
            title,
            body,
            selection,
            consent,
            private_names,
        } = input;
        self.prepared = None;
        if !consent || !matches!(channel, "testers" | "nightly") {
            return Err(Error::Denied);
        }
        if title.trim().is_empty()
            || title.chars().count() > 120
            || body.trim().is_empty()
            || body.chars().count() > 1000
            || title.contains('\0')
            || body.contains('\0')
        {
            return Err(Error::Protocol);
        }
        let observed = capture::capture(selection.items.contains(&Item::System))?;
        let mut system = observed.system;
        clean_strings(&mut system, private_names);
        let items: Vec<_> = selection.items.iter().map(|item| item.key()).collect();
        let mut attachments = Vec::new();
        if selection.items.contains(&Item::AppLog) {
            let log = self
                .logs
                .iter()
                .filter(|(t, _)| now.saturating_sub(*t) <= 1800)
                .map(|(t, line)| format!("{t} {line}"))
                .collect::<Vec<_>>()
                .join("\n");
            let content = tail(&redaction::clean(&log, private_names), 262_144);
            if !content.is_empty() {
                attachments.push(Attachment {
                    kind: "app_log".into(),
                    sha256: crate::content_hash(content.as_bytes()),
                    content,
                });
            }
        }
        let accepted =
            chrono::DateTime::from_timestamp(i64::try_from(now).map_err(|_| Error::Clock)?, 0)
                .ok_or(Error::Clock)?
                .to_rfc3339();
        let id = crate::random_id()?;
        let mut packet = Packet {
            id: format!(
                "{}-{}-{}-{}-{}",
                &id[..8],
                &id[8..12],
                &id[12..16],
                &id[16..20],
                &id[20..32]
            ),
            title: redaction::clean(title, private_names),
            body: redaction::clean(body, private_names),
            context: serde_json::json!({"app_version":crate::product::VERSION,"app_channel":channel,
                "game":observed.game,"game_version":observed.game_version.filter(|v|v.bytes().all(|b|b.is_ascii_digit() || b==b'.')),
                "system":if selection.items.contains(&Item::System) {system} else {serde_json::json!({})},
                "telemetry_summary":if selection.items.contains(&Item::Session) {self.summary(now)} else {serde_json::Value::Null},"posthog_session_id":null,
                "consent":{"version":"triage-v2","items":items,"accepted_at":accepted}}),
            attachments,
        };
        fit_http_budget(&mut packet, channel)?;
        let preview = Preview {
            id: crate::random_id()?,
            channel: channel.into(),
            packet,
        };
        self.prepared = Some(Prepared {
            account: account.into(),
            until: now.saturating_add(1800),
            preview: preview.clone(),
        });
        Ok(preview)
    }
    pub(crate) fn send(
        &mut self,
        request: &DataRequest<'_>,
        channel: &str,
        id: &str,
        now: u64,
    ) -> Result<crate::protocol::testing_document::Participation> {
        let p = self.prepared.as_ref().ok_or(Error::Conflict)?;
        if p.preview.id != id
            || p.account != request.account_id()
            || p.preview.channel != channel
            || now >= p.until
        {
            return Err(Error::Conflict);
        }
        request
            .post(
                "rest/v1/rpc/testing_contribution_submit_v2",
                &p.preview.packet.rpc_payload(channel),
            )?
            .success()?;
        // Keep the exact payload on any uncertain response or refresh failure.
        let data =
            crate::testing::execute(request, channel, crate::protocol::Command::TestingRefresh)?;
        self.prepared = None;
        Ok(data)
    }
}
// Size the complete serialized RPC, including JSON escaping, before consented
// preview. HTTP keeps its existing limit for every caller and exact retry.
fn fit_http_budget(packet: &mut Packet, channel: &str) -> Result<()> {
    fn fits(packet: &Packet, channel: &str) -> Result<bool> {
        Ok(serde_json::to_vec(&packet.rpc_payload(channel))
            .map_err(|_| Error::Protocol)?
            .len()
            <= crate::http::REQUEST_LIMIT)
    }
    if fits(packet, channel)? {
        return Ok(());
    }
    for index in 0..packet.attachments.len() {
        let original = std::mem::take(&mut packet.attachments[index].content);
        packet.attachments[index].sha256 = crate::content_hash(b"");
        if !fits(packet, channel)? {
            continue;
        }
        let (mut low, mut high) = (0, original.len());
        while low < high {
            let mid = low + (high - low).div_ceil(2);
            let attachment = &mut packet.attachments[index];
            attachment.content = tail(&original, mid);
            attachment.sha256 = crate::content_hash(attachment.content.as_bytes());
            if fits(packet, channel)? {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        let attachment = &mut packet.attachments[index];
        attachment.content = tail(&original, low);
        attachment.sha256 = crate::content_hash(attachment.content.as_bytes());
        return Ok(());
    }
    Err(Error::TooLarge)
}
fn clean_strings(value: &mut serde_json::Value, names: &[String]) {
    match value {
        serde_json::Value::String(s) => *s = redaction::clean(s, names),
        serde_json::Value::Array(a) => {
            for v in a {
                clean_strings(v, names);
            }
        }
        serde_json::Value::Object(o) => {
            for v in o.values_mut() {
                clean_strings(v, names);
            }
        }
        _ => {}
    }
}
fn tail(text: &str, max: usize) -> String {
    let mut start = text.len().saturating_sub(max);
    while !text.is_char_boundary(start) {
        start += 1;
    }
    text[start..].to_owned()
}
#[cfg(test)]
mod tests;
