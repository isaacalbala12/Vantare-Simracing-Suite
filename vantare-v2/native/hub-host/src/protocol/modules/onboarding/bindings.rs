use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::from("import type { PerformanceLevel } from './settings';\n");
    declare::<crate::onboarding::WidgetKind>(&mut text);
    declare::<crate::onboarding::Equipment>(&mut text);
    declare::<crate::onboarding::OnboardingView>(&mut text);
    constants!(
        &mut text,
        "onboardingCpuLimit",
        crate::onboarding::CPU_LIMIT
    );
    constants!(
        &mut text,
        "onboardingRevisionPattern",
        crate::onboarding::REVISION_PATTERN
    );
    constants!(
        &mut text,
        "onboardingPricesUrl",
        crate::onboarding::PRICES_URL
    );
    constants!(
        &mut text,
        "onboardingKitLimit",
        crate::onboarding::KIT_LIMIT
    );
    constants!(
        &mut text,
        "onboardingWidgetKinds",
        crate::onboarding::WidgetKind::ALL
    );
    constants!(&mut text, "onboardingKits", crate::onboarding::kits());
    constants!(&mut text,"onboardingWidgets",crate::onboarding::WidgetKind::ALL.map(|kind|serde_json::json!({"kind":kind,"label":kind.label(),"free":kind.free(),"position":kind.position()})));
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let value = crate::onboarding::OnboardingView {
        pending: true,
        simulators: [true, false],
        scanning: false,
        equipment: crate::onboarding::Equipment::default(),
        recommended_level: crate::settings::track::PerformanceLevel::Balanced,
        layout_ready: false,
        layout_revision: "0".repeat(64),
        settings_revision: "0".repeat(64),
        private_session: false,
    };
    let host: Vec<HostToUi> = vec![
        sample_response(Reply::OnboardingGet {
            value: value.clone(),
        }),
        sample_response(Reply::OnboardingFinish { value }),
        sample_response(Reply::OnboardingSkipPrivate { accepted: false }),
        sample_response(Reply::OnboardingPrices { accepted: false }),
        HostToUi::Failure {
            id: 1,
            error: crate::protocol::HostError::OnboardingConflict {},
        },
    ];
    let ui: Vec<UiToHost> = vec![
        Request::OnboardingGet {},
        Request::OnboardingFinish {
            kit: vec![crate::onboarding::WidgetKind::Delta],
            level: crate::settings::track::PerformanceLevel::Balanced,
            show: false,
            base_revision: "0".repeat(64),
            layout_revision: "0".repeat(64),
        },
        Request::OnboardingSkipPrivate {},
        Request::OnboardingPrices {},
    ]
    .into_iter()
    .map(|request| UiToHost::Request { id: 1, request })
    .collect();
    serde_json::json!({"host":host,"ui":ui})
}
