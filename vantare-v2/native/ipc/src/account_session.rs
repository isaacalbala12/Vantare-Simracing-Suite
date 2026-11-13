//! Opt-in observation of an account scope. No credential, identity or access grant.
use crate::control::{self, Policy};
use serde::{Deserialize, Serialize};
use std::{io, path::PathBuf};

/// Read-only authority location; it cannot carry a mutator nonce.
#[derive(Clone)]
pub struct AuthorityLink {
    pub pipe: String,
    pub image: PathBuf,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct AccountGeneration(String);
impl std::fmt::Debug for AccountGeneration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AccountGeneration([redacted])")
    }
}
impl TryFrom<String> for AccountGeneration {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            Ok(Self(value))
        } else {
            Err("invalid account generation")
        }
    }
}
impl From<AccountGeneration> for String {
    fn from(value: AccountGeneration) -> Self {
        value.0
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccountObservation {
    pub generation: AccountGeneration,
    pub policy: Policy,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ControlResponse {
    pub version: u32,
    pub sequence: u64,
    pub observation: Option<AccountObservation>,
}
impl ControlResponse {
    pub fn validate(self, now_ms: u64) -> io::Result<Option<AccountObservation>> {
        if self.version != control::VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                control::VersionMismatch,
            ));
        }
        if self.sequence != 1
            || self
                .observation
                .as_ref()
                .is_some_and(|o| !o.policy.observable_at(now_ms))
        {
            return Err(io::ErrorKind::InvalidData.into());
        }
        Ok(self.observation)
    }
}
/// Single read-only RPC, authenticated by the existing peer/ACL; never retries an effect.
#[cfg(any(windows, unix))]
pub fn request_cancelled(
    link: &AuthorityLink,
    stop: &std::sync::Arc<crate::transport::Event>,
) -> io::Result<Option<AccountObservation>> {
    request_cancelled_within(link, stop, std::time::Duration::from_millis(150))
}

/// Bounded consume-time observation. One RPC, no retries, no mutator nonce.
#[cfg(any(windows, unix))]
pub fn read_account_session(
    link: &AuthorityLink,
    timeout: std::time::Duration,
) -> io::Result<Option<AccountObservation>> {
    let stop = std::sync::Arc::new(crate::transport::Event::new()?);
    request_cancelled_within(link, &stop, timeout)
}
/// One authenticated RPC with a total deadline, including partial reads/writes.
#[cfg(any(windows, unix))]
pub(crate) fn request_cancelled_within(
    link: &AuthorityLink,
    stop: &std::sync::Arc<crate::transport::Event>,
    timeout: std::time::Duration,
) -> io::Result<Option<AccountObservation>> {
    let until = std::time::Instant::now()
        .checked_add(timeout)
        .ok_or(io::ErrorKind::InvalidInput)?;
    let pipe = crate::transport::connect(&link.pipe, std::sync::Arc::clone(stop), timeout)?;
    if !pipe.server_peer()?.is_image(&link.image) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut io = Deadline { pipe, until };
    control::write(
        &mut io,
        &control::Request {
            version: control::VERSION,
            sequence: 1,
            nonce: String::new(),
            command: control::Command::ReadAccountSession {},
        },
    )?;
    let response: ControlResponse = control::read(&mut io)?;
    response.validate(control::wall_ms()?)
}
#[cfg(any(windows, unix))]
struct Deadline {
    pipe: crate::transport::Pipe,
    until: std::time::Instant,
}
#[cfg(any(windows, unix))]
impl Deadline {
    fn remaining(&mut self) -> io::Result<()> {
        let remaining = self
            .until
            .checked_duration_since(std::time::Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or(io::ErrorKind::TimedOut)?;
        self.pipe.set_timeout(remaining);
        Ok(())
    }
}
#[cfg(any(windows, unix))]
impl std::io::Read for Deadline {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        self.remaining()?;
        self.pipe.read(bytes)
    }
}
#[cfg(any(windows, unix))]
impl std::io::Write for Deadline {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.remaining()?;
        self.pipe.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.pipe.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generation_is_closed_and_debug_is_redacted() {
        let generation = AccountGeneration::try_from("a".repeat(64)).unwrap();
        assert_eq!(format!("{generation:?}"), "AccountGeneration([redacted])");
        assert_eq!(
            serde_json::to_string(&generation).unwrap(),
            format!("\"{}\"", "a".repeat(64))
        );
        for text in [
            String::new(),
            "A".repeat(64),
            "f".repeat(63),
            "0".repeat(65),
            "g".repeat(64),
        ] {
            assert!(AccountGeneration::try_from(text).is_err());
        }
    }
    #[test]
    fn observation_requires_fresh_versioned_policy_and_exact_sequence() {
        let now = 10_000;
        let response = || ControlResponse {
            version: control::VERSION,
            sequence: 1,
            observation: Some(AccountObservation {
                generation: "a".repeat(64).try_into().unwrap(),
                policy: Policy {
                    epoch: 1,
                    revision: 1,
                    checked_at_ms: now,
                    ..Policy::denied(control::AccessState::NoCredential)
                },
            }),
        };
        assert!(response().validate(now).unwrap().is_some());
        for checked in [0, now + 1] {
            let mut invalid = response();
            invalid.observation.as_mut().unwrap().policy.checked_at_ms = checked;
            assert!(invalid.validate(now).is_err());
        }
        let mut wrong = response();
        wrong.sequence = 2;
        assert!(wrong.validate(now).is_err());
        let mut wrong = response();
        wrong.version += 1;
        assert!(wrong.validate(now).is_err());
        let mut wrong = response();
        wrong.observation.as_mut().unwrap().policy.version += 1;
        assert!(wrong.validate(now).is_err());
        let mut value = serde_json::to_value(response()).unwrap();
        value["observation"]["identity"] = "not-allowed".into();
        assert!(serde_json::from_value::<ControlResponse>(value).is_err());
    }
}
