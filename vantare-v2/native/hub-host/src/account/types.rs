use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Gate {
    None,
    Checking,
    Choose,
    Email,
    WaitingBrowser,
    Canceling,
    LoggingOut,
    LogoutFailed,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionView {
    SignedOut,
    SignedIn,
    NeedsSignIn,
    Pending,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EmailMode {
    SignInCode,
    SignInPassword,
    SignUpCode,
    SignUpPassword,
    Recovery,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EmailStage {
    Form,
    Code,
    NewPassword,
    Consent,
    Authorizing,
    HostedRequired,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModuleKind {
    Studio,
    Launcher,
    Calendar,
    Strategy,
    Engineer,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModuleStatus {
    Included,
    Unverified,
    Soon,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Product {
    ProMonthly,
    ProAnnual,
    Founders,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum EmailIntent {
    Open {
        mode: EmailMode,
    },
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
        #[serde(rename = "signOutOthers")]
        sign_out_others: bool,
    },
    Resend {},
    Finish {},
    Cancel {},
}
impl std::fmt::Debug for EmailIntent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("EmailIntent([redacted])")
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PlanView {
    Verified,
    Unverified,
    Founders,
    Denied { text: String },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModuleView {
    pub id: ModuleKind,
    pub status: ModuleStatus,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailView {
    pub mode: EmailMode,
    pub stage: EmailStage,
    pub restarted: bool,
    pub retry_after_seconds: u16,
    pub message: String,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CopyLinkView {
    pub available: bool,
    pub copied: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurchaseView {
    pub waiting: bool,
    pub message: Option<String>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "independent observations in the approved account wire view"
)]
pub struct AccountView {
    pub configured: bool,
    pub gate: Gate,
    pub session: SessionView,
    pub working: bool,
    pub name: String,
    pub photo: Option<String>,
    pub plan: PlanView,
    pub verified: bool,
    pub blocked: bool,
    pub modules: [ModuleView; 5],
    pub email: Option<EmailView>,
    pub copy_link: CopyLinkView,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub session_notice: bool,
    pub can_return_after_logout: bool,
    pub device_limit: bool,
    pub purchase: PurchaseView,
    pub portal: bool,
    pub channel: String,
}

impl From<EmailMode> for vantare_ipc::services_protocol::EmailMode {
    fn from(value: EmailMode) -> Self {
        match value {
            EmailMode::SignInCode => Self::SignInCode,
            EmailMode::SignInPassword => Self::SignInPassword,
            EmailMode::SignUpCode => Self::SignUpCode,
            EmailMode::SignUpPassword => Self::SignUpPassword,
            EmailMode::Recovery => Self::Recovery,
        }
    }
}
impl From<vantare_ipc::services_protocol::EmailStage> for EmailStage {
    fn from(value: vantare_ipc::services_protocol::EmailStage) -> Self {
        use vantare_ipc::services_protocol::EmailStage as Core;
        match value {
            Core::Form => Self::Form,
            Core::Code => Self::Code,
            Core::NewPassword => Self::NewPassword,
            Core::Consent => Self::Consent,
            Core::Authorizing => Self::Authorizing,
            Core::HostedRequired => Self::HostedRequired,
        }
    }
}
impl From<vantare_ipc::services_protocol::Session> for SessionView {
    fn from(value: vantare_ipc::services_protocol::Session) -> Self {
        use vantare_ipc::services_protocol::Session as Core;
        match value {
            Core::SignedOut => Self::SignedOut,
            Core::SignedIn => Self::SignedIn,
            Core::NeedsSignIn => Self::NeedsSignIn,
            Core::Pending => Self::Pending,
        }
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PortalPage {
    Profile,
}
