//! Window-scoped Overlay pull state. The Wails host may proxy the finished
//! response, but ACK, replay and latest-wins selection belong to Rust.
//! Section patches use the acknowledged frame as their base.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

pub const OVERLAY_MAX_BYTES: usize = 72 * 1024;
const MAX_SESSION_ID_BYTES: usize = 128;
const MAX_RETIRED_SESSIONS: usize = 32;
const STATUS_EVENT: &str = "telemetry:overlay-v2:status";
const SNAPSHOT_EVENT: &str = "telemetry:overlay-v2:snapshot";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeliveryError {
    InvalidPayload,
    InvalidRevision,
    PayloadTooLarge,
    InvalidSections,
    Exhausted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PullRequest<'a> {
    pub session_id: &'a str,
    pub ack: u64,
    pub sections: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    pub name: &'static str,
    pub data: Arc<[u8]>,
    pub base_revision: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PullResponse {
    pub session_id: String,
    pub delivery: u64,
    pub events: Vec<Event>,
}

impl PullResponse {
    pub fn encode_json(&self) -> Vec<u8> {
        let session = serde_json::to_vec(&self.session_id).expect("String JSON encoding");
        let mut output = Vec::with_capacity(
            session.len()
                + self
                    .events
                    .iter()
                    .map(|event| event.data.len())
                    .sum::<usize>()
                + 96,
        );
        output.extend_from_slice(b"{\"sessionId\":");
        output.extend_from_slice(&session);
        output.extend_from_slice(b",\"delivery\":");
        output.extend_from_slice(self.delivery.to_string().as_bytes());
        output.extend_from_slice(b",\"events\":[");
        for (index, event) in self.events.iter().enumerate() {
            if index != 0 {
                output.push(b',');
            }
            output.extend_from_slice(b"{\"name\":\"");
            output.extend_from_slice(event.name.as_bytes());
            output.push(b'"');
            if let Some(base) = event.base_revision {
                output.extend_from_slice(b",\"baseRevision\":");
                output.extend_from_slice(base.to_string().as_bytes());
            }
            output.extend_from_slice(b",\"data\":");
            output.extend_from_slice(&event.data);
            output.push(b'}');
        }
        output.extend_from_slice(b"]}");
        output
    }
}

#[derive(Clone)]
struct Publication {
    revision: u64,
    data: Arc<[u8]>,
}

struct Session {
    id: String,
    sections: u8,
    awaiting_ack: u64,
    pending: Option<PullResponse>,
    last_status: Option<Arc<[u8]>>,
    last_snapshot: Option<Arc<[u8]>>,
    last_snapshot_sections: Option<SnapshotSections>,
}

impl Session {
    fn new(id: &str, sections: u8) -> Self {
        Self {
            id: id.to_owned(),
            sections,
            awaiting_ack: 0,
            pending: None,
            last_status: None,
            last_snapshot: None,
            last_snapshot_sections: None,
        }
    }
}

#[derive(Clone)]
struct SnapshotSections {
    revision: u64,
    epoch: u64,
    session_id: String,
    fields: serde_json::Map<String, serde_json::Value>,
}

impl SnapshotSections {
    fn parse(json: &[u8]) -> Option<Self> {
        let update: serde_json::Value = serde_json::from_slice(json).ok()?;
        let revision = update.get("revision")?.as_u64()?;
        let frame = update.get("frame")?.as_object()?;
        let epoch = frame.get("epoch")?.as_u64()?;
        let session_id = frame.get("sessionId")?.as_str()?.to_owned();
        Some(Self {
            revision,
            epoch,
            session_id,
            fields: frame.clone(),
        })
    }

    fn difference(&self, base: &Self, json: &[u8]) -> Option<Vec<u8>> {
        if self.epoch != base.epoch
            || self.session_id != base.session_id
            || self.revision <= base.revision
        {
            return None;
        }
        let mut update: serde_json::Value = serde_json::from_slice(json).ok()?;
        let frame = update.get_mut("frame")?.as_object_mut()?;
        frame.retain(|key, value| base.fields.get(key) != Some(value));
        let encoded = serde_json::to_vec(&update).ok()?;
        (encoded.len() < json.len()).then_some(encoded)
    }
}

#[derive(Default)]
pub struct OverlayPull {
    status: Option<Publication>,
    snapshot: Option<Publication>,
    sessions: HashMap<String, Session>,
    retired: HashMap<String, VecDeque<String>>,
}

impl OverlayPull {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn has_consumers(&self) -> bool {
        !self.sessions.is_empty()
    }

    pub fn publish_status(&mut self, revision: u64, json: &[u8]) -> Result<(), DeliveryError> {
        Self::publish(&mut self.status, revision, json)
    }

    pub fn publish_snapshot(&mut self, revision: u64, json: &[u8]) -> Result<(), DeliveryError> {
        Self::publish(&mut self.snapshot, revision, json)
    }

    fn publish(
        destination: &mut Option<Publication>,
        revision: u64,
        json: &[u8],
    ) -> Result<(), DeliveryError> {
        if json.len() > OVERLAY_MAX_BYTES {
            return Err(DeliveryError::PayloadTooLarge);
        }
        if revision == 0
            || destination
                .as_ref()
                .is_some_and(|old| revision <= old.revision)
        {
            return Err(DeliveryError::InvalidRevision);
        }
        if serde_json::from_slice::<serde_json::Value>(json).is_err() {
            return Err(DeliveryError::InvalidPayload);
        }
        *destination = Some(Publication {
            revision,
            data: Arc::from(json),
        });
        Ok(())
    }

    /// An unacknowledged response is replayed exactly. Publications received
    /// while it is pending replace each other until that response is ACKed.
    pub fn pull(
        &mut self,
        sender: &str,
        request: PullRequest<'_>,
    ) -> Result<Option<PullResponse>, DeliveryError> {
        if sender.is_empty()
            || request.session_id.is_empty()
            || request.session_id.len() > MAX_SESSION_ID_BYTES
        {
            return Ok(None);
        }
        if request.sections > 1 {
            return Err(DeliveryError::InvalidSections);
        }
        if self
            .sessions
            .get(sender)
            .is_none_or(|session| session.id != request.session_id)
        {
            if request.ack != 0 || self.is_retired(sender, request.session_id) {
                return Ok(None);
            }
            if let Some(old) = self.sessions.remove(sender) {
                self.retire(sender, &old.id);
            }
            self.sessions.insert(
                sender.to_owned(),
                Session::new(request.session_id, request.sections),
            );
        }

        let session = self.sessions.get_mut(sender).expect("created session");
        if session.sections != request.sections {
            return Err(DeliveryError::InvalidSections);
        }
        if request.ack < session.awaiting_ack {
            if request.ack.checked_add(1) == Some(session.awaiting_ack) {
                return Ok(session.pending.clone());
            }
            return Ok(None);
        }
        if request.ack != session.awaiting_ack {
            return Ok(None);
        }
        session.pending = None;
        let status_changed = self
            .status
            .as_ref()
            .is_some_and(|status| session.last_status.as_deref() != Some(status.data.as_ref()));
        let snapshot_changed = self.snapshot.as_ref().is_some_and(|snapshot| {
            session.last_snapshot.as_deref() != Some(snapshot.data.as_ref())
        });
        if !status_changed && !snapshot_changed {
            return Ok(None);
        }
        let next_delivery = session
            .awaiting_ack
            .checked_add(1)
            .ok_or(DeliveryError::Exhausted)?;
        let mut events = Vec::with_capacity(2);
        if status_changed {
            let status = self.status.as_ref().expect("changed status exists");
            session.last_status = Some(status.data.clone());
            events.push(Event {
                name: STATUS_EVENT,
                data: status.data.clone(),
                base_revision: None,
            });
        }
        if snapshot_changed {
            let snapshot = self.snapshot.as_ref().expect("changed snapshot exists");
            let current = (session.sections == 1)
                .then(|| SnapshotSections::parse(&snapshot.data))
                .flatten();
            let patch = current.as_ref().and_then(|current| {
                session.last_snapshot_sections.as_ref().and_then(|base| {
                    current
                        .difference(base, &snapshot.data)
                        .map(|json| (base.revision, Arc::<[u8]>::from(json)))
                })
            });
            session.last_snapshot_sections = current;
            session.last_snapshot = Some(snapshot.data.clone());
            events.push(Event {
                name: SNAPSHOT_EVENT,
                data: patch
                    .as_ref()
                    .map_or_else(|| snapshot.data.clone(), |(_, json)| json.clone()),
                base_revision: patch.map(|(revision, _)| revision),
            });
        }
        session.awaiting_ack = next_delivery;
        let response = PullResponse {
            session_id: session.id.clone(),
            delivery: session.awaiting_ack,
            events,
        };
        session.pending = Some(response.clone());
        Ok(Some(response))
    }

    pub fn close(&mut self, sender: &str, session_id: &str) {
        if sender.is_empty() || session_id.is_empty() {
            return;
        }
        if self
            .sessions
            .get(sender)
            .is_some_and(|session| session.id == session_id)
        {
            self.sessions.remove(sender);
        }
        self.retire(sender, session_id);
    }

    pub fn close_sender(&mut self, sender: &str) {
        self.sessions.remove(sender);
        self.retired.remove(sender);
    }

    pub fn close_all(&mut self) {
        self.sessions.clear();
        self.retired.clear();
    }

    fn is_retired(&self, sender: &str, session_id: &str) -> bool {
        self.retired
            .get(sender)
            .is_some_and(|ids| ids.iter().any(|id| id == session_id))
    }

    fn retire(&mut self, sender: &str, session_id: &str) {
        if session_id.is_empty() || self.is_retired(sender, session_id) {
            return;
        }
        let ids = self.retired.entry(sender.to_owned()).or_default();
        ids.push_back(session_id.to_owned());
        if ids.len() > MAX_RETIRED_SESSIONS {
            ids.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request<'a>(session_id: &'a str, ack: u64) -> PullRequest<'a> {
        PullRequest {
            session_id,
            ack,
            sections: 0,
        }
    }

    #[test]
    fn late_window_receives_status_and_replays_until_ack() {
        let mut pull = OverlayPull::new();
        pull.publish_status(1, br#"{"revision":1,"source":{"state":"stopped"}}"#)
            .unwrap();
        assert!(!pull.has_consumers());
        let first = pull.pull("studio", request("s1", 0)).unwrap().unwrap();
        assert!(pull.has_consumers());
        assert_eq!(first.events.len(), 1);
        assert_eq!(first.events[0].name, STATUS_EVENT);
        assert_eq!(
            pull.pull("studio", request("s1", 0)).unwrap(),
            Some(first.clone())
        );
        let encoded: serde_json::Value = serde_json::from_slice(&first.encode_json()).unwrap();
        assert_eq!(encoded["sessionId"], "s1");
        assert_eq!(encoded["delivery"], 1);
        assert_eq!(encoded["events"][0]["data"]["source"]["state"], "stopped");
        assert!(pull.pull("studio", request("s1", 1)).unwrap().is_none());
    }

    #[test]
    fn slow_window_keeps_one_pending_response_then_gets_latest() {
        let mut pull = OverlayPull::new();
        pull.publish_status(1, br#"{"revision":1}"#).unwrap();
        let first = pull.pull("overlay", request("s", 0)).unwrap().unwrap();
        for revision in 2..=100 {
            pull.publish_snapshot(revision, format!("{{\"revision\":{revision}}}").as_bytes())
                .unwrap();
        }
        assert_eq!(pull.pull("overlay", request("s", 0)).unwrap(), Some(first));
        let latest = pull.pull("overlay", request("s", 1)).unwrap().unwrap();
        assert_eq!(latest.delivery, 2);
        assert_eq!(latest.events.len(), 1);
        assert_eq!(latest.events[0].name, SNAPSHOT_EVENT);
        assert_eq!(latest.events[0].data.as_ref(), br#"{"revision":100}"#);
    }

    #[test]
    fn old_session_cannot_replace_or_close_current_window() {
        let mut pull = OverlayPull::new();
        pull.publish_status(1, br#"{"revision":1}"#).unwrap();
        assert!(pull.pull("studio", request("old", 0)).unwrap().is_some());
        assert!(
            pull.pull("studio", request("current", 0))
                .unwrap()
                .is_some()
        );
        assert!(pull.pull("studio", request("old", 0)).unwrap().is_none());
        pull.close("studio", "old");
        pull.publish_status(2, br#"{"revision":2}"#).unwrap();
        let next = pull.pull("studio", request("current", 1)).unwrap().unwrap();
        assert_eq!(next.session_id, "current");
        pull.close("studio", "current");
        assert!(!pull.has_consumers());
    }

    #[test]
    fn bad_requests_and_payloads_fail_without_activating_delivery() {
        let mut pull = OverlayPull::new();
        assert!(pull.pull("", request("s", 0)).unwrap().is_none());
        assert!(pull.pull("studio", request("", 0)).unwrap().is_none());
        assert!(
            pull.pull("studio", request(&"s".repeat(129), 0))
                .unwrap()
                .is_none()
        );
        assert!(pull.pull("studio", request("s", 7)).unwrap().is_none());
        assert_eq!(
            pull.pull(
                "studio",
                PullRequest {
                    session_id: "s",
                    ack: 0,
                    sections: 2,
                }
            ),
            Err(DeliveryError::InvalidSections)
        );
        assert_eq!(
            pull.publish_snapshot(1, b"{"),
            Err(DeliveryError::InvalidPayload)
        );
        assert_eq!(
            pull.publish_snapshot(1, &vec![b'x'; OVERLAY_MAX_BYTES + 1]),
            Err(DeliveryError::PayloadTooLarge)
        );
        pull.publish_snapshot(1, br#"{"revision":1}"#).unwrap();
        assert_eq!(
            pull.publish_snapshot(1, br#"{"revision":1}"#),
            Err(DeliveryError::InvalidRevision)
        );
        assert!(!pull.has_consumers());
    }

    #[test]
    fn section_patch_uses_acknowledged_frame_and_resets_on_epoch_change() {
        let mut pull = OverlayPull::new();
        let request = |ack| PullRequest {
            session_id: "s",
            ack,
            sections: 1,
        };
        pull.publish_snapshot(
            1,
            br#"{"revision":1,"source":{"state":"live"},"frame":{"epoch":1,"sessionId":"a","player":{"speed":100},"standings":[1,2]}}"#,
        )
        .unwrap();
        let first = pull.pull("overlay", request(0)).unwrap().unwrap();
        assert_eq!(first.events[0].base_revision, None);
        pull.publish_snapshot(
            2,
            br#"{"revision":2,"source":{"state":"live"},"frame":{"epoch":1,"sessionId":"a","player":{"speed":101},"standings":[1,2]}}"#,
        )
        .unwrap();
        let second = pull.pull("overlay", request(1)).unwrap().unwrap();
        assert_eq!(second.events[0].base_revision, Some(1));
        let encoded: serde_json::Value = serde_json::from_slice(&second.encode_json()).unwrap();
        assert_eq!(encoded["events"][0]["baseRevision"], 1);
        assert_eq!(
            encoded["events"][0]["data"]["frame"]["player"]["speed"],
            101
        );
        assert!(
            encoded["events"][0]["data"]["frame"]
                .get("standings")
                .is_none()
        );

        pull.publish_snapshot(
            3,
            br#"{"revision":3,"source":{"state":"live"},"frame":{"epoch":2,"sessionId":"b","player":{"speed":1},"standings":[1,2]}}"#,
        )
        .unwrap();
        let third = pull.pull("overlay", request(2)).unwrap().unwrap();
        assert_eq!(third.events[0].base_revision, None);
        assert_eq!(third.events[0].data.as_ref(), br#"{"revision":3,"source":{"state":"live"},"frame":{"epoch":2,"sessionId":"b","player":{"speed":1},"standings":[1,2]}}"#);
    }

    #[test]
    fn section_mode_cannot_change_during_a_session() {
        let mut pull = OverlayPull::new();
        pull.publish_status(1, br#"{"revision":1}"#).unwrap();
        assert!(pull.pull("overlay", request("s", 0)).unwrap().is_some());
        assert_eq!(
            pull.pull(
                "overlay",
                PullRequest {
                    session_id: "s",
                    ack: 1,
                    sections: 1,
                }
            ),
            Err(DeliveryError::InvalidSections)
        );
        assert!(pull.pull("overlay", request("s", 1)).unwrap().is_none());
    }

    #[test]
    fn overlay_golden_sizes_preserve_full_wire_payload() {
        let goldens: [&[u8]; 4] = [
            include_bytes!(
                "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_1.golden.json"
            ),
            include_bytes!(
                "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json"
            ),
            include_bytes!(
                "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_44.golden.json"
            ),
            include_bytes!(
                "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_104.golden.json"
            ),
        ];
        for golden in goldens {
            let value: serde_json::Value = serde_json::from_slice(golden).unwrap();
            let compact = serde_json::to_vec(&value).unwrap();
            let revision = value["revision"].as_u64().unwrap();
            let mut pull = OverlayPull::new();
            pull.publish_snapshot(revision, &compact).unwrap();
            let response = pull
                .pull(
                    "overlay",
                    PullRequest {
                        session_id: "s",
                        ack: 0,
                        sections: 1,
                    },
                )
                .unwrap()
                .unwrap();
            assert_eq!(response.events[0].base_revision, None);
            assert_eq!(response.events[0].data.as_ref(), compact);
            let wire: serde_json::Value = serde_json::from_slice(&response.encode_json()).unwrap();
            assert_eq!(wire["events"][0]["data"], value);
        }
    }

    #[test]
    fn exhausted_counter_does_not_consume_a_dirty_snapshot() {
        let mut pull = OverlayPull::new();
        pull.pull("overlay", request("s", 0)).unwrap();
        let session = pull.sessions.get_mut("overlay").unwrap();
        session.awaiting_ack = u64::MAX;
        pull.publish_snapshot(1, br#"{"revision":1}"#).unwrap();
        assert_eq!(
            pull.pull("overlay", request("s", u64::MAX)),
            Err(DeliveryError::Exhausted)
        );
        assert!(pull.sessions["overlay"].last_snapshot.is_none());
        assert!(pull.sessions["overlay"].pending.is_none());
    }
}
