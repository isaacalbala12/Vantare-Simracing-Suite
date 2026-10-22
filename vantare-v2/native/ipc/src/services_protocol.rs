//! DTO/IPC: sin tokens de sesión. AccountEmail y el enlace PKCE de copia redactan Debug.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};

// v14 adds explicit AccountCopyLink and redacted LoginLink for a live PKCE attempt.
// Reject older peers: Hub and services must agree on clipboard recovery.
pub const VERSION: u32 = 14;
#[path = "services_protocol/pilot_document.rs"]
pub mod pilot_document;
#[path = "services_protocol/report_document.rs"]
pub mod report_document;
#[path = "services_protocol/roadmap_document.rs"]
pub mod roadmap_document;
#[path = "services_protocol/testing_document.rs"]
pub mod testing_document;
#[path = "services_protocol/triage_document.rs"]
pub mod triage_document;
pub const MAX_FRAME: usize = 128 * 1024;
// Only exact triage previews allow two 256 KiB attachments with JSON escaping.
pub const MAX_TRIAGE_FRAME: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "command", deny_unknown_fields)]
pub enum Command {
    MailConsentGet,
    MailConsentSet {
        consent: bool,
        source: MailSource,
    },
    PilotLoad,
    PilotSave {
        profile: pilot_document::PilotProfile,
        expected_revision: u64,
    },
    PilotSync,
    Status,
    TransferRights,
    AccountBegin,
    AccountEmail {
        action: EmailAction,
    },
    AccountPoll,
    AccountCopyLink,
    AccountRenew,
    AccountProfileRefresh,
    Logout,
    LicenseStatus,
    LicenseRenew,
    Purchase {
        product: BillingProduct,
    },
    DeviceReset,
    CalendarRefresh,
    RoadmapCached,
    RoadmapRefresh,
    TestingRefresh,
    TestingAnswer {
        id: String,
        score: u8,
        note: String,
    },
    TestingContribute {
        id: String,
        title: String,
        body: String,
        consent: bool,
    },
    TestingCredit {
        id: String,
        consent: bool,
    },
    TestingNoticeRead {
        id: String,
        updated_at: String,
    },
    TriagePrepare {
        title: String,
        body: String,
        selection: triage_document::Selection,
        consent: bool,
    },
    TriageSend {
        preview_id: String,
    },
    DraftLoad,
    DraftSave {
        fields: report_document::Fields,
    },
    DraftDiscard,
    ReportCapture {
        fields: report_document::Fields,
    },
    ReportRemoveScreenshot {
        id: String,
        fields: report_document::Fields,
    },
    ReportPrepare,
    ReportRetryPrepare,
    ReportSend {
        preview_id: String,
    },
    Shutdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MailSource {
    Onboarding,
    Settings,
}

/// Solo credenciales introducidas por el usuario; nunca tokens del proveedor.
/// Debug redactado porque Command puede aparecer en diagnósticos.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "action", deny_unknown_fields)]
pub enum EmailAction {
    Begin {
        mode: EmailMode,
        email: String,
        password: String,
    },
    Verify {
        code: String,
    },
    Reset {
        password: String,
        sign_out_of_other_sessions: bool,
    },
    Resend {},
    Finish {},
    Cancel {},
}
impl std::fmt::Debug for EmailAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("EmailAction([redacted])")
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmailMode {
    SignInCode,
    SignInPassword,
    SignUpCode,
    SignUpPassword,
    Recovery,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmailStage {
    Form,
    Code,
    NewPassword,
    Consent,
    Authorizing,
    HostedRequired,
}

// Bootstrap privado: no Debug para evitar registrar el nonce.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupervisorHello {
    pub version: u32,
    pub nonce: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub sequence: u64,
    pub nonce: String,
    pub command: Command,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "result", deny_unknown_fields)]
pub enum Reply {
    MailConsent {
        consent: bool,
        locale: Option<String>,
        revision: u64,
    },
    Pilot {
        state: pilot_document::PilotState,
        message: String,
    },
    Checkout {
        url: String,
    },
    License {
        policy: crate::control::Policy,
        message: String,
    },
    Status {
        account_configured: bool,
        message: String,
    },
    Closed,
    Draft {
        draft: Option<report_document::Draft>,
        message: String,
    },
    ReportPreview {
        preview: report_document::Preview,
    },
    ReportReceipt {
        receipt: report_document::Receipt,
        draft_state: DraftState,
    },
    Calendar {
        schedule: Option<String>,
        /// Respaldo de `RaceControl` con el mismo contrato. `Reply` rechaza campos
        /// desconocidos: añadirlo exigió subir `VERSION` a 12.
        #[serde(default)]
        fallback: Option<String>,
    },
    Testing {
        data: testing_document::Participation,
    },
    TriagePreview {
        preview: triage_document::Preview,
    },
    Roadmap {
        publication: Option<roadmap_document::Publication>,
        fetched_at: Option<u64>,
        stale: bool,
        message: String,
    },
    Email {
        stage: EmailStage,
        retry_after_seconds: u64,
        message: String,
        error: Option<String>,
    },
    AccountLink {
        url: LoginLink,
    },
    Account {
        #[serde(default)]
        copy_link: bool,
        signed_in: bool,
        #[serde(default)]
        profile: Option<AccountProfile>,
        expires_at: Option<u64>,
        pending: bool,
        message: String,
        error: Option<String>,
    },
    Error {
        message: String,
    },
    /// El servidor rechazó la emisión por límite de dispositivos. Es una salida
    /// concreta (`Command::DeviceReset`), no un fallo cualquiera: viaja como
    /// variante propia para que el Hub decida sin leer el texto.
    DeviceLimit {
        message: String,
    },
}

/// URL de un intento PKCE vivo, solo tras el gesto Copiar enlace. Nunca Debug.
#[derive(Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LoginLink(pub String);
impl std::fmt::Debug for LoginLink {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("LoginLink([redacted])")
    }
}

/// Presentación únicamente: nunca se usa para vincular identidad ni derechos.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccountProfile {
    pub name: String,
    pub image_url: Option<String>,
    pub image_jpeg: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingProduct {
    ProMonthly,
    ProAnnual,
    LaunchLifetime,
    Founders,
}
impl BillingProduct {
    pub fn key(self) -> &'static str {
        match self {
            Self::ProMonthly => "pro_monthly",
            Self::ProAnnual => "pro_annual",
            Self::LaunchLifetime => "launch_lifetime",
            Self::Founders => "founders",
        }
    }
}

/// Estado local tras confirmar un informe; conservar otro borrador no es un fallo.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftState {
    Cleared,
    Preserved,
    CleanupPending,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub version: u32,
    pub sequence: u64,
    pub reply: Reply,
}

pub fn read<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<T> {
    let mut prefix = [0_u8; 4];
    reader.read_exact(&mut prefix)?;
    let len =
        usize::try_from(u32::from_le_bytes(prefix)).map_err(|_| io::ErrorKind::InvalidData)?;
    if len == 0 || len > MAX_TRIAGE_FRAME {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = vec![0; len];
    reader.read_exact(&mut bytes)?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData)?;
    if len > frame_limit(&value) {
        return Err(io::ErrorKind::InvalidData.into());
    }
    serde_json::from_value(value).map_err(|_| io::ErrorKind::InvalidData.into())
}

pub fn write(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let value = serde_json::to_value(value).map_err(|_| io::ErrorKind::InvalidData)?;
    let bytes = serde_json::to_vec(&value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.len() > frame_limit(&value) {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let len = u32::try_from(bytes.len()).map_err(|_| io::ErrorKind::InvalidData)?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}
fn frame_limit(value: &serde_json::Value) -> usize {
    if value
        .get("result")
        .or_else(|| value.get("reply").and_then(|r| r.get("result")))
        .and_then(serde_json::Value::as_str)
        == Some("TriagePreview")
    {
        MAX_TRIAGE_FRAME
    } else {
        MAX_FRAME
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn large_escaped_triage_preview_does_not_expand_other_command_limits() {
        let packet = triage_document::Packet {
            id: "15940000-0000-0000-0000-000000000001".into(),
            title: "test".into(),
            body: "test".into(),
            context: serde_json::json!({}),
            attachments: (0..2)
                .map(|i| triage_document::Attachment {
                    kind: if i == 0 {
                        "app_log"
                    } else {
                        "telemetry_fragment"
                    }
                    .into(),
                    content: "\u{1}".repeat(262_144),
                    sha256: "a".repeat(64),
                })
                .collect(),
        };
        let response = Response {
            version: VERSION,
            sequence: 1,
            reply: Reply::TriagePreview {
                preview: triage_document::Preview {
                    id: "a".repeat(64),
                    channel: "testers".into(),
                    packet,
                },
            },
        };
        let mut bytes = Vec::new();
        write(&mut bytes, &response).expect("bounded worst-case preview");
        assert!(bytes.len() > MAX_FRAME && bytes.len() <= MAX_TRIAGE_FRAME + 4);
        read::<Response>(&mut bytes.as_slice()).expect("typed preview");
        let normal = Request {
            version: VERSION,
            sequence: 1,
            nonce: "x".repeat(MAX_FRAME),
            command: Command::Status,
        };
        assert!(write(&mut Vec::new(), &normal).is_err());
    }
    #[test]
    fn three_thumbnails_and_escaped_preview_fit_the_bounded_ipc_frame() {
        let preview = report_document::Preview {
            id:"a".repeat(64),digest:"b".repeat(64),account_id:"550e8400-e29b-41d4-a716-446655440000".into(),
            channel:"testers".into(),retry:false,
            payload:serde_json::to_string_pretty(&serde_json::json!({"action":"\\".repeat(2048),
                "expected":"\\".repeat(2048),"observed":"\\".repeat(2048),"context":"\\".repeat(4096)})).expect("preview"),
            screenshots:(0..3).map(|_|report_document::ScreenshotPreview {
                id:"a".repeat(64),jpeg:"a".repeat(14*1024),width:1920,height:1080,byte_size:400*1024
            }).collect(),
        };
        let mut frame = Vec::new();
        write(&mut frame, &Reply::ReportPreview { preview }).expect("bounded frame");
        assert!(frame.len() > 64 * 1024 && frame.len() <= MAX_FRAME + 4);
        assert!(matches!(
            read::<Reply>(&mut frame.as_slice()).expect("read"),
            Reply::ReportPreview { .. }
        ));
    }
    #[test]
    fn calendar_reply_gained_a_field_so_the_version_moved_past_11() {
        // Un Hub v11 rechaza el campo nuevo (`deny_unknown_fields`): por eso el
        // guardián de versión tiene que cortar antes de leer la respuesta.
        const { assert!(VERSION >= 12) };
        let with_field = r#"{"result":"Calendar","schedule":null,"fallback":"{}"}"#;
        assert!(serde_json::from_str::<Reply>(with_field).is_ok());
        // Un servicio anterior que no lo envía sigue entendiéndose.
        let without = r#"{"result":"Calendar","schedule":null}"#;
        assert!(matches!(
            serde_json::from_str::<Reply>(without),
            Ok(Reply::Calendar { fallback: None, .. })
        ));
        // Y los campos desconocidos siguen rechazándose.
        let unknown = r#"{"result":"Calendar","schedule":null,"otro":1}"#;
        assert!(serde_json::from_str::<Reply>(unknown).is_err());
    }
    #[test]
    fn protocol_rejects_oversized_truncated_and_unknown_commands() {
        for bytes in [
            u32::MAX.to_le_bytes().to_vec(),
            vec![2, 0, 0, 0, b'{'],
            vec![0, 0, 0, 0],
        ] {
            assert!(read::<Request>(&mut bytes.as_slice()).is_err());
        }
        let mut wire = Vec::new();
        write(
            &mut wire,
            &Request {
                version: VERSION,
                sequence: 1,
                nonce: "bootstrap".into(),
                command: Command::Status,
            },
        )
        .expect("marco");
        assert!(matches!(
            read::<Request>(&mut wire.as_slice()).expect("DTO").command,
            Command::Status
        ));
        assert!(serde_json::from_str::<Command>("{\"command\":\"SetEntitlements\"}").is_err());
    }
}

#[cfg(test)]
mod email_tests {
    use super::*;
    #[test]
    fn credentials_roundtrip_but_debug_and_replies_never_expose_them() {
        let command = Command::AccountEmail {
            action: EmailAction::Begin {
                mode: EmailMode::SignUpPassword,
                email: "fixture@example.invalid".into(),
                password: "fixture-password".into(),
            },
        };
        let debug = format!("{command:?}");
        assert!(!debug.contains("fixture-password") && !debug.contains("fixture@example.invalid"));
        let mut frame = Vec::new();
        write(&mut frame, &command).expect("write");
        let Command::AccountEmail {
            action:
                EmailAction::Begin {
                    mode,
                    email,
                    password,
                },
        } = read::<Command>(&mut frame.as_slice()).expect("read")
        else {
            panic!("expected email command");
        };
        assert_eq!(mode, EmailMode::SignUpPassword);
        assert_eq!(email, "fixture@example.invalid");
        assert_eq!(password, "fixture-password");
        for action in ["Resend", "Finish", "Cancel"] {
            let valid = serde_json::json!({"command":"AccountEmail","action":{"action":action}});
            assert!(serde_json::from_value::<Command>(valid.clone()).is_ok());
            let mut forged = valid;
            forged["action"]["user_code"] = "external-code".into();
            assert!(
                serde_json::from_value::<Command>(forged).is_err(),
                "actions without data must reject external fields"
            );
        }
    }
}

#[cfg(test)]
mod login_link_tests {
    use super::*;
    #[test]
    fn login_link_roundtrips_but_debug_never_exposes_oauth_state() {
        let link = Reply::AccountLink { url: LoginLink("https://issuer.invalid/authorize?state=private-fixture&code_challenge=public-fixture".into()) };
        let debug = format!("{link:?}");
        assert!(!debug.contains("private-fixture"));
        assert!(!debug.contains("issuer.invalid"));
        let json = serde_json::to_vec(&link).expect("encode");
        let restored: Reply = serde_json::from_slice(&json).expect("decode");
        assert!(
            matches!(restored, Reply::AccountLink { url } if url.0.contains("state=private-fixture"))
        );
    }
}
