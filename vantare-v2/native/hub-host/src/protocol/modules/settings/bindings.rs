// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::settings::track::PerformanceLevel>(&mut text);
    declare::<crate::settings::track::TrackView>(&mut text);
    declare::<crate::settings::model::Palette>(&mut text);
    declare::<crate::settings::model::Scheme>(&mut text);
    declare::<crate::settings::model::InterfaceFont>(&mut text);
    declare::<crate::settings::model::MonoFont>(&mut text);
    declare::<crate::settings::model::AppearanceSettings>(&mut text);
    declare::<crate::settings::model::Density>(&mut text);
    declare::<crate::settings::model::Preferences>(&mut text);
    declare::<crate::settings::StartupView>(&mut text);
    declare::<crate::settings::SettingsView>(&mut text);
    declare::<crate::settings::SettingsPatch>(&mut text);
    declare_named::<super::Request>(&mut text, "SettingsRequest");
    declare_named::<super::Reply>(&mut text, "SettingsReply");
    declare_named::<super::HostError>(&mut text, "SettingsHostError");
    constants!(
        &mut text,
        "performanceLevels",
        crate::settings::track::PerformanceLevel::ALL
    );
    constants!(&mut text, "widgetHz", crate::settings::track::WIDGET_HZ);
    constants!(&mut text, "tableHz", crate::settings::track::TABLE_HZ);
    constants!(&mut text, "palettes", crate::settings::model::Palette::ALL);
    constants!(
        &mut text,
        "schemes",
        [
            crate::settings::model::Scheme::System,
            crate::settings::model::Scheme::Light,
            crate::settings::model::Scheme::Dark
        ]
    );
    constants!(
        &mut text,
        "interfaceFonts",
        [
            crate::settings::model::InterfaceFont::Inter,
            crate::settings::model::InterfaceFont::Segoe,
            crate::settings::model::InterfaceFont::Arial
        ]
    );
    constants!(
        &mut text,
        "monoFonts",
        [
            crate::settings::model::MonoFont::Cascadia,
            crate::settings::model::MonoFont::Consolas,
            crate::settings::model::MonoFont::Courier
        ]
    );
    constants!(
        &mut text,
        "densities",
        [
            crate::settings::model::Density::Compact,
            crate::settings::model::Density::Balanced,
            crate::settings::model::Density::Comfortable
        ]
    );
    constants!(&mut text, "zoomLevels", crate::settings::model::ZOOM_LEVELS);
    constants!(
        &mut text,
        "defaultZoom",
        crate::settings::model::DEFAULT_ZOOM
    );
    constants!(
        &mut text,
        "contrastRange",
        [
            crate::settings::model::CONTRAST_MIN,
            crate::settings::model::CONTRAST_MAX
        ]
    );
    constants!(
        &mut text,
        "glassOpacityRange",
        [
            crate::settings::model::GLASS_OPACITY_MIN,
            crate::settings::model::GLASS_OPACITY_MAX
        ]
    );
    let fields: Vec<_> = patch_samples()
        .into_iter()
        .map(|patch| {
            serde_json::to_value(patch).expect("patch")["field"]
                .as_str()
                .expect("field")
                .to_owned()
        })
        .collect();
    constants!(&mut text, "settingsFields", fields);

    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    let settings = settings_sample();
    let mut current = settings.clone();
    current.can_retry = true;
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::SettingsGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::SettingsRetry {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::SettingsDiscard {},
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::SettingsGet {
            value: settings.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::SettingsUpdate {
            value: settings.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::SettingsRetry {
            value: settings.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::SettingsDiscard {
            value: settings.clone(),
        },
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Conflict { current },
    });
    for patch in patch_samples() {
        ui.push(UiToHost::Request {
            id: 1,
            request: Request::SettingsUpdate {
                patch,
                base_revision: "0".repeat(64),
            },
        });
    }
    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn settings_sample() -> crate::settings::SettingsView {
    crate::settings::SettingsView {
        track: crate::settings::track::TrackView::default(),
        version: vantare_ipc::product::VERSION.into(),
        general: crate::settings::model::Preferences::default(),
        appearance: crate::settings::model::AppearanceSettings::default(),
        zoom: crate::settings::model::DEFAULT_ZOOM,
        revision: "0".repeat(64),
        protected: false,
        can_retry: false,
        warning: false,
        startup: crate::settings::StartupView {
            supported: false,
            enabled: false,
        },
    }
}
pub(crate) fn patch_samples() -> Vec<crate::settings::SettingsPatch> {
    vec![
        crate::settings::SettingsPatch::Density(crate::settings::model::Density::Balanced),
        crate::settings::SettingsPatch::Minimized(true),
        crate::settings::SettingsPatch::Updates(false),
        crate::settings::SettingsPatch::Launcher(false),
        crate::settings::SettingsPatch::Toasts(true),
        crate::settings::SettingsPatch::Palette(crate::settings::model::Palette::Vantare),
        crate::settings::SettingsPatch::Scheme(crate::settings::model::Scheme::System),
        crate::settings::SettingsPatch::Contrast(crate::settings::model::CONTRAST_MIN),
        crate::settings::SettingsPatch::GlassOpacity(crate::settings::model::GLASS_OPACITY_MAX),
        crate::settings::SettingsPatch::InterfaceFont(crate::settings::model::InterfaceFont::Segoe),
        crate::settings::SettingsPatch::MonoFont(crate::settings::model::MonoFont::Consolas),
        crate::settings::SettingsPatch::ReducedMotion(true),
        crate::settings::SettingsPatch::Zoom(crate::settings::model::DEFAULT_ZOOM),
        crate::settings::SettingsPatch::Startup(false),
        crate::settings::SettingsPatch::Performance(
            crate::settings::track::PerformanceLevel::Economy,
        ),
        crate::settings::SettingsPatch::HideOffTrack(true),
    ]
}
