//! Plano de derechos: JSON acotado, distinto de adquisición, sin tokens.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

pub const VERSION: u32 = 7;
const LIMIT: usize = 64 * 1024;
pub const VERSION_ERROR: &str =
    "versiones IPC incompatibles: reinicia núcleo, Hub y overlays de la misma build";

/// Incompatibilidad local del protocolo; nunca incluye mensajes arbitrarios del peer.
#[derive(Debug)]
pub struct VersionMismatch;
impl std::fmt::Display for VersionMismatch {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(VERSION_ERROR)
    }
}
impl std::error::Error for VersionMismatch {}

/// Closed local categories. Never retain peer text or OS paths in diagnostics.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    Timeout,
    Disconnected,
    Eof,
    PeerGone,
    Transport,
    Unavailable,
    UnknownLegacy,
    Identity,
    CommandNotAllowed,
    Protocol,
    Version,
    Rejected,
}
impl Failure {
    pub fn classify(error: &io::Error) -> Self {
        if let Some(failure) = error
            .get_ref()
            .and_then(|error| error.downcast_ref::<Self>())
        {
            return *failure;
        }
        if error
            .get_ref()
            .is_some_and(<dyn std::error::Error + Send + Sync>::is::<VersionMismatch>)
        {
            return Self::Version;
        }
        match error.kind() {
            io::ErrorKind::TimedOut => Self::Timeout,
            io::ErrorKind::UnexpectedEof => Self::Eof,
            io::ErrorKind::BrokenPipe => Self::PeerGone,
            io::ErrorKind::ConnectionAborted
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::NotConnected => Self::Disconnected,
            io::ErrorKind::PermissionDenied => Self::Identity,
            io::ErrorKind::InvalidData => Self::Protocol,
            _ => Self::Transport,
        }
    }
    pub const fn diagnostic(self) -> &'static str {
        match self {
            Self::Timeout => "rights-transport-timeout",
            Self::Disconnected => "rights-disconnected",
            Self::Eof => "rights-eof",
            Self::PeerGone => "rights-peer-gone",
            Self::Transport => "rights-transport-transient",
            Self::Unavailable => "rights-operation-unavailable",
            Self::UnknownLegacy => "rights-legacy-unknown",
            Self::Identity => "rights-peer-identity",
            Self::CommandNotAllowed => "rights-command-not-allowed",
            Self::Protocol => "rights-protocol-invalid",
            Self::Version => "rights-version-incompatible",
            Self::Rejected => "rights-rejected",
        }
    }
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.diagnostic())
    }
}
impl std::error::Error for Failure {}

pub const REJECTED: &str = "rights-rejected";
pub const UNAVAILABLE: &str = "rights-operation-unavailable";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// Capacidades independientes del contrato beta; no forman estados excluyentes.
#[allow(clippy::struct_excessive_bools)]
pub struct Policy {
    pub version: u32,
    pub epoch: u64,
    pub revision: u64,
    pub checked_at_ms: u64,
    pub state: AccessState,
    pub signed_until_ms: Option<u64>,
    pub grace_until_ms: Option<u64>,
    pub catalog: CatalogAccess,
    pub engineer: bool,
    pub strategy: bool,
    pub analysis: bool,
    pub calendar: bool,
    #[serde(default)]
    pub tester: bool,
    pub live: bool,
    /// Legacy diagnostic observation only; never used for access or scheduling.
    pub error: Option<String>,
}

/// Estado del núcleo; catálogo y módulos siguen siendo capacidades independientes.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum AccessState {
    #[default]
    NoCredential,
    Unconfigured,
    Active,
    Grace,
    Expired,
    RecoveryRequired,
    ClockBehind {
        until_ms: u64,
    },
    Revoked,
    Unavailable,
    UpdateRequired,
}
impl AccessState {
    pub const fn permits_access(self) -> bool {
        matches!(self, Self::Active | Self::Grace)
    }
    /// Distinguish absence of a credential from an actionable denial.
    pub const fn requires_attention(self) -> bool {
        !matches!(self, Self::Active | Self::Grace | Self::NoCredential)
    }
    pub const fn needs_recovery(self) -> bool {
        matches!(self, Self::RecoveryRequired | Self::ClockBehind { .. })
    }
    pub const fn message(self) -> Option<&'static str> {
        match self {
            Self::Active | Self::Grace | Self::NoCredential => None,
            Self::Unconfigured => Some("Servicio de derechos no configurado"),
            Self::Expired => Some("La credencial ha caducado; comprueba el acceso."),
            Self::RecoveryRequired => Some(
                "Necesitas conexión para recuperar el acceso; comprueba el acceso o inicia sesión.",
            ),
            Self::ClockBehind { .. } => Some(
                "El reloj está detrás de la frontera de seguridad guardada. Comprueba la fecha del equipo; puede ser necesario esperar antes de recuperar el acceso.",
            ),
            Self::Revoked => Some("Acceso bloqueado"),
            Self::Unavailable => Some("No se pudo verificar la política de acceso"),
            Self::UpdateRequired => Some(VERSION_ERROR),
        }
    }
}

/// Corte comercial publicado, independiente del canal y del número de la build.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogAccess {
    #[default]
    Free,
    LaunchV1,
    Pro,
    Founders,
}
impl CatalogAccess {
    pub fn allows_widget(self, id: &str) -> bool {
        match self {
            Self::Free | Self::LaunchV1 => {
                matches!(id, "standings" | "relative" | "delta" | "pedals")
            }
            Self::Pro | Self::Founders => true,
        }
    }

    /// Las capacidades de módulo siguen siendo necesarias. Esta restricción
    /// solo acota la edición; no publica ni concede módulos por sí sola.
    pub fn allows_module(self, key: &str) -> bool {
        self != Self::LaunchV1 || key == "vantare.module.calendar"
    }
}
impl Policy {
    /// Único constructor conservador; conserva metadatos al usar struct update.
    pub fn denied(state: AccessState) -> Self {
        debug_assert!(!state.permits_access());
        Self {
            state,
            version: VERSION,
            ..Self::default()
        }
    }
    pub fn effective_until_ms(&self) -> Option<u64> {
        self.grace_until_ms.or(self.signed_until_ms)
    }
    /// Fresh observation, including a definitive denial. It is not permission.
    pub fn fresh_at(&self, now_ms: u64) -> bool {
        self.version == VERSION
            && self.revision > 0
            && now_ms >= self.checked_at_ms
            && now_ms.saturating_sub(self.checked_at_ms) < 2_000
    }
    pub fn current_at(&self, now_ms: u64) -> bool {
        self.fresh_at(now_ms)
            && !matches!(
                self.state,
                AccessState::Unconfigured
                    | AccessState::Revoked
                    | AccessState::Unavailable
                    | AccessState::UpdateRequired
            )
            && self.effective_until_ms().is_none_or(|end| now_ms < end)
    }
    fn observable_at(&self, now_ms: u64) -> bool {
        self.fresh_at(now_ms) && (!self.state.permits_access() || self.current_at(now_ms))
    }
    pub fn current(&self) -> bool {
        wall_ms().is_ok_and(|now| self.current_at(now))
    }
}

// No Debug: nonce de autorización solo por stdin heredado, jamás logs/CLI.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoreLink {
    pub pipe: String,
    pub image: std::path::PathBuf,
    pub nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bootstrap {
    pub nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "command", deny_unknown_fields)]
pub enum Command {
    Read,
    Install {
        credential: String,
    },
    /// Only the authenticated helper immediately after a verified HTTPS renewal.
    /// Never constructed from a persisted Candidate or binding.
    InstallOnline {
        credential: String,
    },
    Invalidate,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub sequence: u64,
    pub nonce: String,
    pub command: Command,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub version: u32,
    pub sequence: u64,
    pub policy: Policy,
    pub error: Option<String>,
}
pub fn pipe_name(photo: &str) -> String {
    format!("{photo}-rights")
}
pub fn wall_ms() -> io::Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|time| u64::try_from(time.as_millis()).ok())
        .ok_or_else(|| io::Error::other("reloj de derechos inválido"))
}
pub fn read<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<T> {
    serde_json::from_slice(&read_frame(reader)?).map_err(|_| io::ErrorKind::InvalidData.into())
}

#[cfg(any(windows, unix))]
fn read_response(reader: &mut impl Read) -> io::Result<Response> {
    // Read the version before the strict Policy schema: a different generation
    // may add fields which this reader cannot deserialize. Never accept them.
    #[derive(Deserialize)]
    struct Header {
        version: u32,
    }
    #[derive(Deserialize)]
    struct PolicyEnvelope {
        policy: PolicyHeader,
    }
    #[derive(Deserialize)]
    struct PolicyHeader {
        version: u32,
    }
    let bytes = read_frame(reader)?;
    let header: Header = serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData)?;
    if header.version != VERSION {
        return Err(io::Error::new(io::ErrorKind::InvalidData, VersionMismatch));
    }
    let envelope: PolicyEnvelope =
        serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData)?;
    if envelope.policy.version != VERSION {
        return Err(io::Error::new(io::ErrorKind::InvalidData, VersionMismatch));
    }
    // Parse the original bytes again so duplicate/unknown fields remain invalid.
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

/// Inspect the envelope before decoding a generation-specific command.
pub fn read_request(reader: &mut impl Read) -> io::Result<Request> {
    #[derive(Deserialize)]
    struct Header {
        version: u32,
    }
    let bytes = read_frame(reader)?;
    let header: Header = serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData)?;
    if header.version != VERSION {
        return Err(io::Error::new(io::ErrorKind::InvalidData, VersionMismatch));
    }
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

fn read_frame(reader: &mut impl Read) -> io::Result<Vec<u8>> {
    let mut prefix = [0; 4];
    reader.read_exact(&mut prefix)?;
    let size =
        usize::try_from(u32::from_le_bytes(prefix)).map_err(|_| io::ErrorKind::InvalidData)?;
    if size == 0 || size > LIMIT {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = vec![0; size];
    reader.read_exact(&mut bytes)?;
    Ok(bytes)
}
pub fn write(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.len() > LIMIT {
        return Err(io::ErrorKind::InvalidData.into());
    }
    writer.write_all(
        &u32::try_from(bytes.len())
            .map_err(|_| io::ErrorKind::InvalidData)?
            .to_le_bytes(),
    )?;
    writer.write_all(&bytes)?;
    writer.flush()
}

#[cfg(any(windows, unix))]
pub fn request(link: &CoreLink, command: Command) -> io::Result<Policy> {
    use crate::transport::Event;
    let stop = std::sync::Arc::new(Event::new()?);
    request_cancelled(link, command, &stop)
}
#[cfg(any(windows, unix))]
pub fn request_cancelled(
    link: &CoreLink,
    command: Command,
    stop: &std::sync::Arc<crate::transport::Event>,
) -> io::Result<Policy> {
    use crate::transport::IO_TIMEOUT;
    let mut pipe = connect_ready(&link.pipe, stop, IO_TIMEOUT)?;
    if !pipe.server_peer()?.is_image(&link.image) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    write(
        &mut pipe,
        &Request {
            version: VERSION,
            sequence: 1,
            nonce: link.nonce.clone(),
            command,
        },
    )?;
    let response = read_response(&mut pipe)?;
    if response.version != VERSION || response.policy.version != VERSION {
        return Err(io::Error::new(io::ErrorKind::InvalidData, VersionMismatch));
    }
    if response.sequence != 1 {
        return Err(io::ErrorKind::InvalidData.into());
    }
    if let Some(error) = response.error {
        // No cuerpos arbitrarios del peer en logs/errores.
        return Err(io::Error::other(if error == REJECTED {
            Failure::Rejected
        } else if error == UNAVAILABLE {
            Failure::Unavailable
        } else {
            Failure::UnknownLegacy
        }));
    }
    Ok(response.policy)
}

/// Espera acotada solo al abrir un pipe ocupado/en arranque. Nunca reenvía RPC.
#[cfg(any(windows, unix))]
pub fn connect_ready(
    name: &str,
    stop: &std::sync::Arc<crate::transport::Event>,
    timeout: std::time::Duration,
) -> io::Result<crate::transport::Pipe> {
    let started = std::time::Instant::now();
    loop {
        if stop.is_set() {
            return Err(io::ErrorKind::Interrupted.into());
        }
        match crate::transport::connect(name, std::sync::Arc::clone(stop), timeout) {
            Ok(pipe) => return Ok(pipe),
            Err(error) if retryable_connect(&error) && started.elapsed() < timeout => {
                stop.wait(std::time::Duration::from_millis(10));
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(windows)]
fn retryable_connect(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(2 | 231))
}

/// Un fallo de transporte no es una revocación. Conserva la última observación
/// solo durante su TTL original; una respuesta definitiva la sustituye siempre.
#[cfg(any(windows, unix))]
fn feed_observation(
    result: io::Result<Policy>,
    previous: Option<Policy>,
    cursor: &mut (u64, u64),
    now_ms: u64,
) -> Option<Policy> {
    match result {
        Ok(policy)
            if policy.observable_at(now_ms)
                && (policy.epoch > cursor.0
                    || (policy.epoch == cursor.0 && policy.revision >= cursor.1)) =>
        {
            *cursor = (policy.epoch, policy.revision);
            Some(policy)
        }
        Err(error)
            if error.get_ref().is_some_and(
                <dyn std::error::Error + Send + Sync + 'static>::is::<VersionMismatch>,
            ) =>
        {
            Some(Policy {
                version: VERSION,
                state: AccessState::UpdateRequired,
                ..Policy::default()
            })
        }
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound
                    | io::ErrorKind::ConnectionRefused
                    | io::ErrorKind::ConnectionReset
                    | io::ErrorKind::ConnectionAborted
                    | io::ErrorKind::BrokenPipe
                    | io::ErrorKind::UnexpectedEof
                    | io::ErrorKind::TimedOut
                    | io::ErrorKind::Interrupted
                    | io::ErrorKind::WouldBlock
            ) =>
        {
            previous.filter(|policy| policy.observable_at(now_ms))
        }
        _ => None,
    }
}
#[cfg(unix)]
fn retryable_connect(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused | io::ErrorKind::WouldBlock
    )
}

#[cfg(any(windows, unix))]
pub struct Feed {
    latest: std::sync::Arc<std::sync::Mutex<Option<Policy>>>,
    stop: std::sync::Arc<crate::transport::Event>,
    initial: std::sync::Arc<crate::transport::Event>,
    thread: Option<std::thread::JoinHandle<()>>,
}
#[cfg(any(windows, unix))]
impl Feed {
    pub fn connect(photo: &str, core_image: std::path::PathBuf) -> io::Result<Self> {
        use crate::transport::Event;
        let latest = std::sync::Arc::new(std::sync::Mutex::new(None));
        let stop = std::sync::Arc::new(Event::new()?);
        let initial = std::sync::Arc::new(Event::new()?);
        let ready = std::sync::Arc::clone(&initial);
        let target = std::sync::Arc::clone(&latest);
        let cancel = std::sync::Arc::clone(&stop);
        let link = CoreLink {
            pipe: pipe_name(photo),
            image: core_image,
            nonce: String::new(),
        };
        let thread = std::thread::Builder::new()
            .name("rights-feed".into())
            .spawn(move || {
                let mut cursor = (0, 0);
                while !cancel.is_set() {
                    let result = request_cancelled(&link, Command::Read, &cancel);
                    if let Ok(mut slot) = target.lock() {
                        *slot = feed_observation(
                            result,
                            slot.take(),
                            &mut cursor,
                            wall_ms().unwrap_or(u64::MAX),
                        );
                    } else {
                        break;
                    }
                    ready.set();
                    if cancel.wait(std::time::Duration::from_millis(250)) {
                        break;
                    }
                }
            })?;
        Ok(Self {
            latest,
            stop,
            initial,
            thread: Some(thread),
        })
    }
    pub fn policy(&self) -> Policy {
        self.latest
            .lock()
            .ok()
            .and_then(|p| p.clone())
            .filter(|policy| {
                policy.state == AccessState::UpdateRequired
                    || wall_ms().is_ok_and(|now| policy.observable_at(now))
            })
            .unwrap_or_default()
    }
    /// Arranque del consumidor sin UI: espera acotada al primer resultado,
    /// nunca interpreta timeout/ausencia como permiso ni inventa derechos.
    pub fn wait_initial(&self, timeout: std::time::Duration) -> bool {
        self.initial.wait(timeout)
    }
}
#[cfg(any(windows, unix))]
impl Drop for Feed {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(thread) = self.thread.take() {
            let _joined = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feed_publishes_fresh_denials_and_retains_only_their_original_observation_ttl() {
        let mut cursor = (1, 1);
        for state in [
            AccessState::Revoked,
            AccessState::Expired,
            AccessState::Unavailable,
            AccessState::Unconfigured,
            AccessState::RecoveryRequired,
            AccessState::ClockBehind { until_ms: 9000 },
        ] {
            let policy = Policy {
                version: VERSION,
                epoch: 1,
                revision: 2,
                checked_at_ms: 1000,
                state,
                signed_until_ms: Some(999),
                ..Policy::default()
            };
            assert!(!policy.current_at(1000));
            let observed = feed_observation(Ok(policy.clone()), None, &mut cursor, 1000)
                .expect("typed denial published");
            assert_eq!(observed, policy);
            assert!(!observed.state.permits_access());
            let held = feed_observation(
                Err(io::ErrorKind::TimedOut.into()),
                Some(observed),
                &mut cursor,
                2999,
            )
            .expect("original TTL");
            assert_eq!(held.checked_at_ms, 1000);
            assert!(
                feed_observation(
                    Err(io::ErrorKind::TimedOut.into()),
                    Some(held),
                    &mut cursor,
                    3000
                )
                .is_none()
            );
        }
    }

    #[test]
    fn generation_headers_are_checked_before_commands_and_nested_policy_fields() {
        for version in [VERSION - 1, VERSION, VERSION + 1] {
            if version != VERSION {
                let mut frame = Vec::new();
                write(
                    &mut frame,
                    &serde_json::json!({"version":version,"new_envelope":true}),
                )
                .expect("future envelope");
                assert_eq!(
                    Failure::classify(
                        &read_response(&mut frame.as_slice())
                            .err()
                            .expect("version before policy")
                    ),
                    Failure::Version
                );
            }
            let mut frame = Vec::new();
            write(
                &mut frame,
                &serde_json::json!({"version": version, "command": "future-command"}),
            )
            .expect("frame");
            let error = read_request(&mut frame.as_slice())
                .err()
                .expect("incompatible or invalid request");
            assert_eq!(
                Failure::classify(&error),
                if version == VERSION {
                    Failure::Protocol
                } else {
                    Failure::Version
                }
            );
            let mut frame = Vec::new();
            write(
                &mut frame,
                &serde_json::json!({"version": VERSION, "sequence":1,
                "policy":{"version":version,"field_from_other_generation":true},"error":null}),
            )
            .expect("response");
            let error = read_response(&mut frame.as_slice())
                .err()
                .expect("incompatible or invalid policy");
            assert_eq!(
                Failure::classify(&error),
                if version == VERSION {
                    Failure::Protocol
                } else {
                    Failure::Version
                }
            );
        }
    }

    #[test]
    fn explicit_state_and_signed_grace_deadlines_are_independent_of_display_text() {
        let base = Policy {
            version: VERSION,
            revision: 1,
            checked_at_ms: 1000,
            state: AccessState::Grace,
            signed_until_ms: Some(900),
            grace_until_ms: Some(2000),
            error: Some("presentation only".into()),
            ..Policy::default()
        };
        assert!(base.current_at(1999));
        assert!(!base.current_at(2000));
        assert!(base.state.permits_access());
        for state in [
            AccessState::NoCredential,
            AccessState::Unconfigured,
            AccessState::Expired,
            AccessState::RecoveryRequired,
            AccessState::ClockBehind { until_ms: 9000 },
            AccessState::Revoked,
            AccessState::Unavailable,
            AccessState::UpdateRequired,
        ] {
            let denied = Policy::denied(state);
            assert!(!denied.state.permits_access());
            assert!(
                !denied.engineer
                    && !denied.strategy
                    && !denied.analysis
                    && !denied.calendar
                    && !denied.tester
            );
            assert_eq!(denied.catalog, CatalogAccess::Free);
            assert_eq!(denied.signed_until_ms, None);
            assert_eq!(denied.grace_until_ms, None);
        }
    }

    #[test]
    fn feed_keeps_original_ttl_during_transient_ipc_but_denies_definitive_changes() {
        let fresh = Policy {
            version: VERSION,
            epoch: 1,
            revision: 2,
            checked_at_ms: 10_000,
            state: AccessState::Active,
            ..Policy::default()
        };
        let mut cursor = (0, 0);
        let first = feed_observation(Ok(fresh.clone()), None, &mut cursor, 10_000);
        for kind in [
            io::ErrorKind::TimedOut,
            io::ErrorKind::BrokenPipe,
            io::ErrorKind::NotFound,
        ] {
            let held = feed_observation(Err(kind.into()), first.clone(), &mut cursor, 10_500);
            assert_eq!(
                held.as_ref(),
                Some(&fresh),
                "no cambia revisión ni checked_at"
            );
            assert!(feed_observation(Err(kind.into()), held, &mut cursor, 12_000).is_none());
        }
        let mut expired = fresh.clone();
        expired.signed_until_ms = Some(10_500);
        assert!(
            feed_observation(
                Err(io::ErrorKind::TimedOut.into()),
                Some(expired),
                &mut cursor,
                10_500
            )
            .is_none()
        );
        for policy in [
            Policy::default(),
            Policy {
                revision: 1,
                ..fresh.clone()
            },
            Policy {
                checked_at_ms: 9000,
                ..fresh.clone()
            },
        ] {
            assert!(feed_observation(Ok(policy), first.clone(), &mut cursor, 11_000).is_none());
        }
        for kind in [
            io::ErrorKind::PermissionDenied,
            io::ErrorKind::InvalidData,
            io::ErrorKind::Other,
        ] {
            assert!(
                feed_observation(Err(kind.into()), first.clone(), &mut cursor, 10_500).is_none()
            );
        }
        let mismatch = feed_observation(
            Err(io::Error::new(io::ErrorKind::InvalidData, VersionMismatch)),
            first.clone(),
            &mut cursor,
            10_500,
        )
        .expect("incompatibilidad explícita");
        assert_eq!(mismatch.state, AccessState::UpdateRequired);
        assert!(!mismatch.current_at(10_500));
        // Una respuesta válida sin derechos sustituye la anterior inmediatamente.
        let denied = Policy {
            revision: 3,
            state: AccessState::NoCredential,
            ..fresh.clone()
        };
        assert_eq!(
            feed_observation(Ok(denied.clone()), first, &mut cursor, 10_500),
            Some(denied)
        );
        // Nueva época; mismo Feed, no una segunda comprobación en paralelo.
        assert!(
            feed_observation(
                Ok(Policy {
                    epoch: 2,
                    revision: 1,
                    ..fresh
                }),
                None,
                &mut cursor,
                10_500
            )
            .is_some()
        );
    }
    #[test]
    fn a_new_widget_is_outside_the_perpetual_catalog_and_missing_scope_fails_closed() {
        assert!(!CatalogAccess::LaunchV1.allows_widget("future-widget"));
        assert!(!CatalogAccess::Free.allows_widget("future-widget"));
        for id in ["standings", "relative", "delta", "pedals"] {
            assert!(CatalogAccess::Free.allows_widget(id), "{id} es gratis");
        }
        assert!(CatalogAccess::Pro.allows_widget("future-widget"));
        let policy = serde_json::to_value(Policy::default()).expect("policy");
        let mut missing = policy.clone();
        missing.as_object_mut().expect("objeto").remove("catalog");
        assert!(serde_json::from_value::<Policy>(missing).is_err());
        let mut unknown = policy;
        unknown["catalog"] = serde_json::json!("unverified-edition");
        assert!(serde_json::from_value::<Policy>(unknown).is_err());
    }
    #[test]
    fn free_denies_widgets_that_require_pro() {
        for id in ["radar", "fuel-strategy", "broadcast-tower"] {
            assert!(!CatalogAccess::Free.allows_widget(id), "{id} no es gratis");
            assert!(!CatalogAccess::LaunchV1.allows_widget(id), "{id} no es LE");
            assert!(CatalogAccess::Pro.allows_widget(id), "{id} es Pro");
        }
    }
    #[test]
    fn pro_to_free_transition_reblocks_widgets_outside_the_free_catalog() {
        let mut cursor = (0, 0);
        let pro = feed_observation(
            Ok(Policy {
                version: VERSION,
                epoch: 1,
                revision: 2,
                checked_at_ms: 10_000,
                state: AccessState::Active,
                catalog: CatalogAccess::Pro,
                ..Policy::default()
            }),
            None,
            &mut cursor,
            10_000,
        )
        .expect("Pro vigente");
        assert!(pro.catalog.allows_widget("radar"));
        let free = feed_observation(
            Ok(Policy {
                revision: 3,
                catalog: CatalogAccess::Free,
                ..pro.clone()
            }),
            Some(pro),
            &mut cursor,
            10_500,
        )
        .expect("baja a Free");
        assert_eq!(free.catalog, CatalogAccess::Free);
        for id in ["standings", "relative", "delta", "pedals"] {
            assert!(free.catalog.allows_widget(id), "{id} sigue en Free");
        }
        for id in ["radar", "fuel-strategy"] {
            assert!(!free.catalog.allows_widget(id), "{id} se bloquea en Free");
        }
    }
    #[test]
    fn old_version_clock_rollback_stale_or_expired_policy_denies() {
        let mut p = Policy {
            version: VERSION,
            epoch: 1,
            revision: 1,
            checked_at_ms: 10_000,
            signed_until_ms: Some(11_500),
            state: AccessState::Active,
            ..Policy::default()
        };
        assert!(p.current_at(11_499));
        assert!(!p.current_at(11_500));
        assert!(!p.current_at(9_999));
        p.signed_until_ms = None;
        assert!(!p.current_at(12_000));
        p.version += 1;
        assert!(!p.current_at(10_000));
        assert!(read::<Request>(&mut u32::MAX.to_le_bytes().as_slice()).is_err());
    }
}
