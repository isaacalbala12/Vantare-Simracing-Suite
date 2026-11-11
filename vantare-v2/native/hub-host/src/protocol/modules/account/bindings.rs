use crate::account::*;
use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<Gate>(&mut text);
    declare::<SessionView>(&mut text);
    declare::<EmailMode>(&mut text);
    declare::<EmailStage>(&mut text);
    declare::<ModuleKind>(&mut text);
    declare::<ModuleStatus>(&mut text);
    declare::<Product>(&mut text);
    declare::<EmailIntent>(&mut text);
    declare::<PlanView>(&mut text);
    declare::<ModuleView>(&mut text);
    declare::<EmailView>(&mut text);
    declare::<CopyLinkView>(&mut text);
    declare::<PurchaseView>(&mut text);
    declare::<AccountView>(&mut text);
    declare::<PortalPage>(&mut text);
    constants!(
        &mut text,
        "accountLimits",
        serde_json::json!({"email":EMAIL_MAX,"password":PASSWORD_MAX,"code":CODE_LENGTH,"retryAfterSeconds":RETRY_AFTER_MAX_SECONDS,"purchaseWaitSeconds":PURCHASE_WAIT_SECONDS,"text":TEXT_MAX,"name":NAME_MAX,"photoBase64":PHOTO_BASE64_MAX})
    );
    constants!(
        &mut text,
        "accountOptions",
        serde_json::json!({
            "gates":[Gate::None,Gate::Checking,Gate::Choose,Gate::Email,Gate::WaitingBrowser,Gate::Canceling,Gate::LoggingOut,Gate::LogoutFailed],
            "sessions":[SessionView::SignedOut,SessionView::SignedIn,SessionView::NeedsSignIn,SessionView::Pending],
            "modes":[EmailMode::SignInCode,EmailMode::SignInPassword,EmailMode::SignUpCode,EmailMode::SignUpPassword,EmailMode::Recovery],
            "stages":[EmailStage::Form,EmailStage::Code,EmailStage::NewPassword,EmailStage::Consent,EmailStage::Authorizing,EmailStage::HostedRequired],
            "modules":[ModuleKind::Studio,ModuleKind::Launcher,ModuleKind::Calendar,ModuleKind::Strategy,ModuleKind::Engineer],
            "statuses":[ModuleStatus::Included,ModuleStatus::Unverified,ModuleStatus::Soon],
            "products":[Product::ProMonthly,Product::ProAnnual,Product::Founders]
        })
    );
    text
}
pub(crate) fn sample() -> AccountView {
    AccountView {
        configured: true,
        gate: Gate::Choose,
        session: SessionView::SignedOut,
        working: false,
        name: String::new(),
        photo: None,
        plan: PlanView::Unverified,
        verified: false,
        blocked: false,
        modules: [
            ModuleKind::Studio,
            ModuleKind::Launcher,
            ModuleKind::Calendar,
            ModuleKind::Strategy,
            ModuleKind::Engineer,
        ]
        .map(|id| ModuleView {
            id,
            status: if matches!(id, ModuleKind::Strategy | ModuleKind::Engineer) {
                ModuleStatus::Soon
            } else {
                ModuleStatus::Unverified
            },
        }),
        email: None,
        copy_link: CopyLinkView {
            available: false,
            copied: false,
        },
        error: None,
        notice: None,
        session_notice: false,
        can_return_after_logout: false,
        device_limit: false,
        purchase: PurchaseView {
            waiting: false,
            message: None,
        },
        portal: false,
        channel: "nightly".into(),
    }
}
pub(crate) fn corpus() -> serde_json::Value {
    let value = sample();
    let requests = request_samples();
    let mut ui: Vec<UiToHost> = requests
        .into_iter()
        .map(|request| UiToHost::Request { id: 1, request })
        .collect();
    ui.push(UiToHost::Subscribe {
        topic: crate::protocol::Topic::Account,
    });
    ui.push(UiToHost::Unsubscribe {
        topic: crate::protocol::Topic::Account,
    });
    let replies = vec![
        Reply::AccountGet {
            value: value.clone(),
        },
        Reply::AccountBegin {
            value: value.clone(),
        },
        Reply::AccountCancel {
            value: value.clone(),
        },
        Reply::AccountCopyLink {
            value: value.clone(),
        },
        Reply::AccountEmail {
            value: value.clone(),
        },
        Reply::AccountLogout {
            value: value.clone(),
        },
        Reply::AccountCheck {
            value: value.clone(),
        },
        Reply::AccountPhotoRefresh {
            value: value.clone(),
        },
        Reply::AccountPortal {
            value: value.clone(),
        },
        Reply::AccountPurchase {
            value: value.clone(),
        },
        Reply::AccountPurchaseStop {
            value: value.clone(),
        },
        Reply::AccountDeviceReset {
            value: value.clone(),
        },
        Reply::AccountRetry {
            value: value.clone(),
        },
        Reply::AccountBack {
            value: value.clone(),
        },
        Reply::AccountChoose {
            value: value.clone(),
        },
    ];
    let mut host: Vec<HostToUi> = replies.into_iter().map(sample_response).collect();
    host.push(HostToUi::Event {
        event: crate::protocol::Event::Account { value },
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: crate::protocol::HostError::AccountInvalid,
    });
    serde_json::json!({"host":host,"ui":ui})
}

fn request_samples() -> Vec<Request> {
    vec![
        Request::AccountGet {},
        Request::AccountBegin {},
        Request::AccountCancel {},
        Request::AccountCopyLink {},
        Request::AccountEmail {
            action: EmailIntent::Open {
                mode: EmailMode::SignInCode,
            },
        },
        Request::AccountLogout {},
        Request::AccountCheck {},
        Request::AccountPhotoRefresh {},
        Request::AccountPortal {
            page: PortalPage::Profile,
        },
        Request::AccountPurchase {
            product: Product::Founders,
        },
        Request::AccountPurchaseStop {},
        Request::AccountDeviceReset {},
        Request::AccountRetry {},
        Request::AccountBack {},
        Request::AccountChoose {},
        Request::AccountEmail {
            action: EmailIntent::Begin {
                mode: EmailMode::SignInCode,
                email: "qa@example.invalid".into(),
                password: String::new(),
            },
        },
        Request::AccountEmail {
            action: EmailIntent::Verify {
                code: "123456".into(),
            },
        },
        Request::AccountEmail {
            action: EmailIntent::Reset {
                password: "example".into(),
                sign_out_others: true,
            },
        },
        Request::AccountEmail {
            action: EmailIntent::Resend {},
        },
        Request::AccountEmail {
            action: EmailIntent::Finish {},
        },
        Request::AccountEmail {
            action: EmailIntent::Cancel {},
        },
    ]
}
