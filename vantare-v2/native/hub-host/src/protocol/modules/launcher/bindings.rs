use crate::launcher::LauncherView;
use crate::launcher::apps::{
    AppDraft, AppEditor, CatalogApp, CatalogView, ExecutableSelection, PickedApp,
};
use crate::launcher::editor::{
    ProfileClose, ProfileDraft, ProfileEditorView, ProfileFailure, ProfilePolicy, ProfileRetry,
    ProfileRunning, ProfileStep,
};
use crate::protocol::bindings::{canonical, declare};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
use std::fmt::Write as _;
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<ExecutableSelection>(&mut text);
    declare::<AppDraft>(&mut text);
    declare::<AppEditor>(&mut text);
    declare::<CatalogApp>(&mut text);
    declare::<CatalogView>(&mut text);
    declare::<PickedApp>(&mut text);
    append_apps_constants(&mut text);
    declare::<ProfileRunning>(&mut text);
    declare::<ProfileFailure>(&mut text);
    declare::<ProfileClose>(&mut text);
    declare::<ProfileRetry>(&mut text);
    declare::<ProfileStep>(&mut text);
    declare::<ProfilePolicy>(&mut text);
    declare::<ProfileDraft>(&mut text);
    declare::<ProfileEditorView>(&mut text);

    declare::<crate::launcher::LauncherApp>(&mut text);
    declare::<crate::launcher::LauncherOptions>(&mut text);
    declare::<crate::launcher::LauncherProfile>(&mut text);
    declare::<crate::launcher::LauncherView>(&mut text);
    append_launcher_constants(&mut text);
    append_profile_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = launcher_host_samples();
    let mut ui = launcher_ui_samples();

    host.extend(
        application_reply_samples()
            .into_iter()
            .map(|result| HostToUi::Response { id: 1, result }),
    );
    ui.extend(
        application_request_samples()
            .into_iter()
            .map(|request| UiToHost::Request { id: 1, request }),
    );
    ui.push(UiToHost::PickedExecutable(ExecutableSelection {
        id: 1,
        path: None,
    }));
    serde_json::json!({"host":host,"ui":ui})
}

fn append_launcher_constants(text: &mut String) {
    text.push_str("export const launcherLimits = ");
    text.push_str(&serde_json::to_string(&canonical(serde_json::json!({"id":crate::launcher::ID_LIMIT,"profiles":crate::launcher::PROFILE_LIMIT,"apps":crate::launcher::APP_LIMIT}))).expect("launcher constants"));
    text.push_str(" as const;\n");
}

fn append_profile_constants(text: &mut String) {
    let values = [
        (
            "profileRunning",
            serde_json::to_value(ProfileRunning::ALL).expect("enum"),
        ),
        (
            "profileFailures",
            serde_json::to_value(ProfileFailure::ALL).expect("enum"),
        ),
        (
            "profileCloses",
            serde_json::to_value(ProfileClose::ALL).expect("enum"),
        ),
        (
            "profileRetries",
            serde_json::to_value(ProfileRetry::ALL).expect("enum"),
        ),
        (
            "profileLimits",
            serde_json::json!({"name":crate::launcher::editor::NAME_MAX,"description":crate::launcher::editor::DESCRIPTION_MAX,"notes":crate::launcher::editor::NOTES_MAX,"hotkey":crate::launcher::editor::HOTKEY_MAX,"steps":crate::launcher::editor::STEPS_MAX,"retries":crate::launcher::editor::RETRIES_MAX,"delay":crate::launcher::editor::DELAY_MAX}),
        ),
    ];
    for (name, value) in values {
        writeln!(
            text,
            "export const {name} = {} as const;",
            serde_json::to_string(&canonical(value)).expect("constants JSON")
        )
        .expect("String write");
    }
}

fn profile_keys_sample() -> Reply {
    let document = vantare_launcher::Document::fresh_install();
    let mut draft = crate::launcher::editor::draft(&document.profiles[0]);
    for (index, step) in draft.steps.iter_mut().enumerate() {
        step.key = Some(format!("{:064x}", index + 1));
    }
    Reply::LauncherProfileGet {
        value: ProfileEditorView {
            revision: "0".repeat(64),
            draft,
        },
    }
}

fn append_apps_constants(text: &mut String) {
    writeln!(text, "export const launcherPickPathMax = {} as const;\nexport const launcherPickLifetimeSeconds = {} as const;", crate::launcher::apps::PICK_PATH_MAX, crate::launcher::apps::PICK_LIFETIME_SECONDS).expect("String write");
}

fn application_reply_samples() -> [Reply; 7] {
    [
        Reply::LauncherCatalog {
            value: CatalogView {
                revision: "0".repeat(64),
                scanning: false,
                apps: vec![],
            },
        },
        Reply::LauncherScan {
            value: LauncherView::default(),
        },
        Reply::LauncherAppGet {
            value: AppEditor {
                revision: "0".repeat(64),
                draft: AppDraft {
                    id: None,
                    name: String::new(),
                    favorite: false,
                    use_discovery: false,
                },
                has_executable: false,
                has_custom_arguments: false,
            },
        },
        Reply::LauncherAppPick {
            value: Some(PickedApp {
                token: "0".repeat(64),
                name: "QA".into(),
            }),
        },
        Reply::LauncherAppSave {
            value: LauncherView::default(),
        },
        Reply::LauncherAppRemove {
            value: LauncherView::default(),
        },
        Reply::LauncherAppFavorite {
            value: LauncherView::default(),
        },
    ]
}

fn application_request_samples() -> [Request; 7] {
    [
        Request::LauncherCatalog {},
        Request::LauncherScan {},
        Request::LauncherAppGet { id: None },
        Request::LauncherAppPick { id: None },
        Request::LauncherAppSave {
            draft: AppDraft {
                id: None,
                name: "QA".into(),
                favorite: false,
                use_discovery: false,
            },
            pick_token: Some("0".repeat(64)),
            base_revision: "0".repeat(64),
        },
        Request::LauncherAppRemove {
            id: "custom:qa".into(),
            base_revision: "0".repeat(64),
        },
        Request::LauncherAppFavorite {
            id: "lmu".into(),
            favorite: true,
            base_revision: "0".repeat(64),
        },
    ]
}

fn launcher_host_samples() -> Vec<HostToUi> {
    vec![
        HostToUi::Response {
            id: 1,
            result: profile_keys_sample(),
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherProfileGet {
                value: ProfileEditorView {
                    revision: "0".repeat(64),
                    draft: crate::launcher::editor::new_draft(),
                },
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherProfileSave {
                value: crate::launcher::LauncherView::default(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherGet {
                value: serde_json::from_str(include_str!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../hub-web/fixtures/launcher-base.json"
                )))
                .expect("launcher fixture"),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherLaunch { accepted: true },
        },
        HostToUi::Failure {
            id: 1,
            error: crate::protocol::HostError::LauncherConflict {
                current: crate::launcher::LauncherView::default(),
            },
        },
        HostToUi::Event {
            event: crate::protocol::Event::Launcher {
                value: crate::launcher::LauncherView::default(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherFavorite { accepted: false },
        },
    ]
}

fn launcher_ui_samples() -> Vec<UiToHost> {
    vec![
        UiToHost::Request {
            id: 1,
            request: Request::LauncherProfileGet { id: None },
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherProfileGet {
                id: Some("creator".into()),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherProfileSave {
                draft: crate::launcher::editor::draft(
                    &vantare_launcher::Document::fresh_install().profiles[0],
                ),
                base_revision: "0".repeat(64),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherLaunch {
                profile: "creator".into(),
                base_revision: "0".repeat(64),
            },
        },
        UiToHost::Subscribe {
            topic: crate::protocol::Topic::Launcher,
        },
        UiToHost::Unsubscribe {
            topic: crate::protocol::Topic::Launcher,
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherFavorite {},
        },
    ]
}
