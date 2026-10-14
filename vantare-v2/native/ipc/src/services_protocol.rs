//! DTO/IPC: respuestas sin tokens. Solo AccountEmail lleva credenciales de entrada redactadas.
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::io::{self, Read, Write};

pub const VERSION: u32 = 9;
#[path = "services_protocol/pilot_document.rs"]
pub mod pilot_document;
#[path = "services_protocol/report_document.rs"]
pub mod report_document;
#[path = "services_protocol/roadmap_document.rs"]
pub mod roadmap_document;
#[path = "services_protocol/testing_document.rs"]
pub mod testing_document;
// Tres miniaturas + preview JSON del texto (con escape doble). Nunca JPEG completos.
pub const MAX_FRAME: usize = 128 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "command", deny_unknown_fields)]
pub enum Command {
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
    Resend,
    Finish,
    Cancel,
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
    },
    Testing {
        data: testing_document::Participation,
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
    Account {
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
}
impl BillingProduct {
    pub fn key(self) -> &'static str {
        match self {
            Self::ProMonthly => "pro_monthly",
            Self::ProAnnual => "pro_annual",
            Self::LaunchLifetime => "launch_lifetime",
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
    if len == 0 || len > MAX_FRAME {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut bytes = vec![0; len];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

pub fn write(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io::ErrorKind::InvalidData)?;
    if bytes.len() > MAX_FRAME {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let len = u32::try_from(bytes.len()).map_err(|_| io::ErrorKind::InvalidData)?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
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
        let forged = r#"{"command":"AccountEmail","action":{"action":"Finish","user_code":"external-code"}}"#;
        assert!(
            serde_json::from_str::<Command>(forged).is_err(),
            "client cannot approve arbitrary device code"
        );
    }
}
