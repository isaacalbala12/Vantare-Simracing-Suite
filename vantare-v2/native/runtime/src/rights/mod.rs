//! Único dueño local de firma, binding, reloj y decisión. I/O fuera de adquisición.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};
use vantare_domain::{SessionKind, Snapshot, SourceKind, SourceState, UNKNOWN_SIMULATOR};
use vantare_ipc::control::{AccessState, Policy, VERSION};
use vantare_services::{
    Error, Result,
    license::{
        CredentialV1, Verifier,
        authority::{Authority, SessionIdentity},
    },
    storage::Store,
};

pub mod host;
#[cfg(test)]
mod tests;

pub fn wall_now() -> DateTime<Utc> {
    std::time::SystemTime::now().into()
}

fn local_devices(root: &Path) -> Devices {
    // Cada identidad falla por separado: v1 no depende del archivo de v2.
    let legacy =
        vantare_services::license::installation::legacy_fingerprint().unwrap_or_else(|error| {
            eprintln!("núcleo: identidad legacy no disponible: {error}");
            String::new()
        });
    let installation = (|| -> Result<String> {
        let installation_root = root.parent().ok_or(Error::Storage)?;
        let store = Store::open(installation_root, "core-installation-v1")?;
        Ok(vantare_services::license::installation::Installation::load_or_create(&store)?.key_id())
    })()
    .unwrap_or_else(|error| {
        eprintln!("núcleo: identidad de instalación no disponible: {error}");
        String::new()
    });
    Devices {
        legacy,
        installation,
    }
}

pub fn production(
    photo: &str,
    epoch: u64,
    nonce: Option<String>,
    engineer: std::path::PathBuf,
) -> std::io::Result<host::Host> {
    let channel = option_env!("VANTARE_BUILD_CHANNEL")
        .filter(|channel| matches!(*channel, "nightly" | "testers" | "master" | "beta"))
        .unwrap_or("unknown");
    let root = std::env::var_os("VANTARE_NATIVE_DATA_ROOT")
        .or_else(|| std::env::var_os("LOCALAPPDATA"))
        .map(std::path::PathBuf::from)
        .ok_or_else(|| std::io::Error::other("directorio de derechos no disponible"))?
        .join("Vantare/native/rights")
        .join(channel);
    let keys = option_env!("VANTARE_LICENSE_PUBLIC_KEYS").filter(|keys| !keys.is_empty());
    let mut devices = Devices {
        legacy: String::new(),
        installation: String::new(),
    };
    if keys.is_some() {
        devices = local_devices(&root);
    }
    let image = std::env::current_exe()?;
    let helper = image.with_file_name("vantare-services.exe");
    let consumers = [
        image.with_file_name("vantare-overlays.exe"),
        image.with_file_name("vantare-hub.exe"),
        image.with_file_name("vantare.exe"),
        engineer,
    ];
    host::Host::start(
        photo,
        host::Options {
            root,
            keys: keys.map(str::to_owned),
            devices,
            epoch,
            nonce,
        },
        move |peer, mutate| {
            if mutate {
                peer.is_image(&helper)
            } else {
                consumers.iter().any(|image| peer.is_image(image)) || peer.is_image(&helper)
            }
        },
    )
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Binding {
    version: u8,
    credential: String,
    subject: String,
    device: String,
}

pub struct Devices {
    pub legacy: String,
    pub installation: String,
}
pub struct Owner {
    store: Store,
    verifier: Option<Verifier>,
    authority: Authority,
    devices: Devices,
    binding: Option<Binding>,
    game: Option<u64>,
    policy: Policy,
    denial: Option<AccessState>,
}
impl Owner {
    pub fn open(
        root: &Path,
        keys: Option<&str>,
        devices: Devices,
        epoch: u64,
        now: DateTime<Utc>,
    ) -> Result<Self> {
        let store = Store::open(root, "core-rights-v1")?;
        let authority = Authority::restore(&store)?;
        let trust_roots = keys.map(Verifier::public_keys).transpose()?;
        let state = authority.recovery_state(now).unwrap_or_default();
        let mut owner = Self {
            store,
            verifier: trust_roots,
            authority,
            devices,
            binding: None,
            game: None,
            policy: Policy {
                version: VERSION,
                epoch,
                state,
                ..Policy::default()
            },
            denial: None,
        };
        match owner.store.load_cache::<serde_json::Value>("binding") {
            Ok(document) => match serde_json::from_value::<Binding>(document) {
                Ok(binding) if binding.version == 1 => {
                    let trust_roots = owner.verifier.as_ref().ok_or(Error::Unconfigured)?;
                    if let Some(issue) = trust_roots.cache_issue(&binding.credential) {
                        owner.quarantine_binding(issue, now)?;
                    } else {
                        let verified = match owner.verify(&binding.credential) {
                            Ok(verified)
                                if verified.subject() == binding.subject
                                    && verified.device() == binding.device =>
                            {
                                verified
                            }
                            Ok(_) | Err(Error::InvalidCredential | Error::TooLarge) => {
                                owner.quarantine_binding(
                                    vantare_services::license::CacheIssue::InvalidSignature,
                                    now,
                                )?;
                                return Ok(owner);
                            }
                            Err(error) => return Err(error),
                        };
                        match owner.authority.install(verified, now, Duration::ZERO) {
                            Ok(()) => {}
                            Err(Error::Denied | Error::Clock) => {
                                owner.quarantine_binding(
                                    vantare_services::license::CacheIssue::AuthorityRejected,
                                    now,
                                )?;
                                return Ok(owner);
                            }
                            Err(error) => return Err(error),
                        }
                        if owner.authority.persist(&owner.store).is_err() {
                            // No durable ACK means no rights. Keep the owner available
                            // for a fresh signed grant once storage recovers.
                            owner.denial = Some(AccessState::Unavailable);
                            owner.authority.leave_game();
                            eprintln!("license-cache-authority-persist-failed");
                        } else {
                            owner.binding = Some(binding);
                        }
                    }
                }
                _ => owner.quarantine_binding(
                    vantare_services::license::CacheIssue::UnsupportedFormat,
                    now,
                )?,
            },
            Err(Error::NotFound) => owner.authority.leave_game(),
            Err(Error::Corrupt) => {
                owner.quarantine_binding(vantare_services::license::CacheIssue::Unreadable, now)?;
            }
            Err(error) => return Err(error),
        }
        Ok(owner)
    }
    fn quarantine_binding(
        &mut self,
        issue: vantare_services::license::CacheIssue,
        now: DateTime<Utc>,
    ) -> Result<()> {
        self.verifier.as_ref().ok_or(Error::Unconfigured)?;
        let at = u64::try_from(now.timestamp_millis()).map_err(|_| Error::Clock)?;
        self.store.quarantine_dated("binding", at)?;
        // No cached game grace survives without a verified binding. Preserve the
        // anti-rollback clock/tombstone; only a newly verified grant can replace it.
        self.authority.leave_game();
        eprintln!("{}", issue.diagnostic());
        Ok(())
    }
    fn verify(&self, text: &str) -> Result<vantare_services::license::Verified> {
        let text = text.trim_start();
        let verifier = self.verifier.as_ref().ok_or(Error::Unconfigured)?;
        if text.len() > 32 * 1024 {
            return Err(Error::TooLarge);
        }
        if text.starts_with('{') {
            if self.devices.legacy.is_empty() {
                // Missing local identity is not evidence against a signed cache.
                return Err(Error::Unconfigured);
            }
            let credential: CredentialV1 =
                serde_json::from_str(text).map_err(|_| Error::InvalidCredential)?;
            // El UUID procede de claims verificados, nunca de email/metadata/booleanos IPC.
            verifier.v1(
                &credential,
                &credential.claims.subject,
                &self.devices.legacy,
            )
        } else {
            verifier.proof(text, &self.devices.legacy, &self.devices.installation)
        }
    }
    pub fn install(&mut self, text: String, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.install_from(text, now, tick, false)
    }
    pub fn install_online(
        &mut self,
        text: String,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        self.install_from(text, now, tick, true)
    }
    fn install_from(
        &mut self,
        text: String,
        now: DateTime<Utc>,
        tick: Duration,
        online: bool,
    ) -> Result<()> {
        let result = (|| {
            let verified = self.verify(&text)?;
            if self
                .binding
                .as_ref()
                .is_some_and(|old| old.subject != verified.subject())
            {
                return Err(Error::Denied); // Cambio de cuenta exige invalidación durable previa.
            }
            let binding = Binding {
                version: 1,
                credential: text,
                subject: verified.subject().into(),
                device: verified.device().into(),
            };
            if online {
                self.authority.install_online(verified, now, tick)?;
            } else {
                self.authority.install(verified, now, tick)?;
            }
            self.store.save("binding", &binding)?;
            self.authority.persist(&self.store)?;
            self.binding = Some(binding);
            Ok(())
        })();
        // An untrusted renewal is not revocation. Preserve the previous verified
        // binding on cryptographic/policy rejection; storage failures still fail
        // closed because a new in-memory grant might lack its durable ACK.
        match result {
            Ok(()) => self.denial = None,
            Err(
                Error::InvalidCredential
                | Error::TooLarge
                | Error::Denied
                | Error::Clock
                | Error::Expired,
            ) => {}
            Err(_) => self.denial = Some(AccessState::Unavailable),
        }
        if let Some(reason) = self.denial {
            self.deny(reason);
        }
        result
    }
    pub fn invalidate(&mut self, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.denial = Some(AccessState::Revoked);
        self.deny(AccessState::Revoked);
        self.authority.invalidate(now, tick)?;
        self.authority.persist(&self.store)?; // ACK solo después de tombstone durable.
        self.binding = None;
        self.store.remove("binding")?;
        Ok(())
    }
    pub fn advance(
        &mut self,
        snapshot: &Snapshot,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<Policy> {
        self.advance_observed(snapshot, now, now, tick)
    }
    pub fn advance_observed(
        &mut self,
        snapshot: &Snapshot,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<Policy> {
        self.advance_observed_session(snapshot, None, entered_at, now, tick)
    }

    /// `started` debe proceder del adaptador y sobrevivir al reinicio del núcleo.
    /// Hub/IPC no pueden proporcionarlo. Ausencia nunca confirma gracia guardada.
    pub fn advance_observed_session(
        &mut self,
        snapshot: &Snapshot,
        started: Option<&str>,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<Policy> {
        let live = snapshot.origin.source.kind == SourceKind::Live
            && snapshot.state.source_state == SourceState::Live;
        let paused_same_session = snapshot.origin.source.kind == SourceKind::Live
            && snapshot.state.source_state == SourceState::Paused
            && self.game == Some(snapshot.state.session.id.0);
        if live {
            if self.game.is_some() && self.game != Some(snapshot.state.session.id.0) {
                self.authority.leave_game();
            }
            if self.binding.is_some() && self.denial.is_none() {
                let entered = self.authority.enter_game_identified(
                    snapshot.state.session.id.0,
                    session_identity(snapshot, started),
                    entered_at,
                    now,
                    tick,
                );
                if let Err(error) = entered {
                    let reason = self
                        .authority
                        .recovery_state(now)
                        .unwrap_or(AccessState::Unavailable);
                    self.denial = Some(reason);
                    self.deny(reason);
                    self.policy.error = Some(error.to_string());
                    return Err(error);
                }
            }
            self.game = Some(snapshot.state.session.id.0);
        } else if snapshot.origin.source.kind == SourceKind::Replay
            || (snapshot.state.source_state != SourceState::Stale && !paused_same_session)
        {
            // Waiting inicial no es evidencia de que terminó la carrera guardada.
            // La primera sesión live confirma o descarta; replay nunca confirma.
            if self.game.is_some() || snapshot.origin.source.kind == SourceKind::Replay {
                self.authority.leave_game();
            }
            self.game = None;
        }
        self.publish_policy(live, now, tick)
    }

    fn publish_policy(&mut self, live: bool, now: DateTime<Utc>, tick: Duration) -> Result<Policy> {
        let result = if self.binding.is_some() && self.denial.is_none() {
            self.authority.rights_and_persist(now, tick, &self.store)
        } else {
            Ok(Vec::new()) // Sin binding no hay reloj de derechos que avanzar.
        };
        let rights = result.as_ref().cloned().unwrap_or_default();
        let valid = result.is_ok() && self.denial.is_none() && self.authority.credential_current();
        let operational = rights
            .iter()
            .any(|right| right.starts_with("vantare.operational."));
        let catalog = vantare_services::license::catalog::access(&rights);
        let module = |key: &str| {
            valid
                && catalog.allows_module(key)
                && (operational
                    || catalog == vantare_ipc::control::CatalogAccess::Founders
                    || rights.iter().any(|right| right == key))
        };
        let decision_rights: Vec<_> = rights
            .iter()
            .filter(|key| affects_policy(key))
            .cloned()
            .collect();
        self.policy.revision = self.policy.revision.checked_add(1).ok_or(Error::Protocol)?;
        self.policy.checked_at_ms =
            u64::try_from(now.timestamp_millis()).map_err(|_| Error::Clock)?;
        self.policy.state = if let Some(recovery) = self.authority.recovery_state(now) {
            recovery
        } else if self.verifier.is_none() {
            AccessState::Unconfigured
        } else if result.is_err() {
            AccessState::Unavailable
        } else if let Some(reason) = self.denial {
            reason
        } else if self.binding.is_none() {
            AccessState::NoCredential
        } else if !valid {
            AccessState::Expired
        } else if self.authority.in_grace(&decision_rights) {
            AccessState::Grace
        } else {
            AccessState::Active
        };
        self.policy.catalog = catalog;
        self.policy.engineer = module("vantare.module.engineer");
        self.policy.strategy = module("vantare.module.strategy");
        self.policy.analysis = module("vantare.module.analysis");
        self.policy.calendar = module("vantare.module.calendar");
        self.policy.tester = valid
            && rights.iter().any(|right| {
                matches!(
                    right.as_str(),
                    "vantare.operational.owner"
                        | "vantare.operational.tester"
                        | "vantare.operational.nightly_tester"
                )
            });
        self.policy.live = live;
        self.policy.error = result.as_ref().err().map(ToString::to_string).or_else(|| {
            if self.verifier.is_none() {
                Some(Error::Unconfigured.to_string())
            } else if self.denial.is_some() {
                Some(Error::Denied.to_string())
            } else {
                None
            }
        });
        let effective_until_ms = self
            .authority
            .next_deadline(&decision_rights)
            .into_iter()
            .chain(self.authority.credential_deadline())
            .min()
            .map(|end| u64::try_from(end.timestamp_millis()).map_err(|_| Error::Clock))
            .transpose()?;
        self.policy.signed_until_ms = self
            .authority
            .signed_deadline(&decision_rights)
            .into_iter()
            .chain(self.authority.credential_deadline())
            .min()
            .map(|end| u64::try_from(end.timestamp_millis()).map_err(|_| Error::Clock))
            .transpose()?;
        debug_assert!(
            self.policy
                .signed_until_ms
                .zip(effective_until_ms)
                .is_none_or(|(signed, effective)| signed <= effective)
        );
        self.policy.grace_until_ms = (effective_until_ms != self.policy.signed_until_ms)
            .then_some(effective_until_ms)
            .flatten();
        result?;
        Ok(self.policy.clone())
    }
    fn deny(&mut self, state: AccessState) {
        self.policy = Policy {
            epoch: self.policy.epoch,
            revision: self.policy.revision,
            checked_at_ms: self.policy.checked_at_ms,
            live: self.policy.live,
            ..Policy::denied(state)
        };
    }
    pub fn policy(&self) -> Policy {
        self.policy.clone()
    }
}

// Only rights that affect the current policy participate in its expiry deadline.
fn affects_policy(key: &str) -> bool {
    key.starts_with("vantare.module.")
        || key.starts_with("vantare.operational.")
        || matches!(
            key,
            "vantare.plan.pro" | "vantare.plan.founders" | "vantare.edition.launch_v1"
        )
}

fn session_identity(snapshot: &Snapshot, started: Option<&str>) -> Option<SessionIdentity> {
    let simulator = snapshot.origin.source.simulator;
    if simulator == UNKNOWN_SIMULATOR {
        return None;
    }
    let track = snapshot.state.session.track_name.current()?;
    let kind = match snapshot.state.session.kind.current()? {
        SessionKind::Practice => "practice".into(),
        SessionKind::Qualifying => "qualifying".into(),
        SessionKind::Race => "race".into(),
        SessionKind::Other(value) => format!("other:{value}"),
    };
    Some(SessionIdentity {
        simulator: simulator.into(),
        track: track.clone(),
        kind,
        started: started?.into(),
    })
}
