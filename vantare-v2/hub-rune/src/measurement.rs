//! Debug macOS offscreen probe; no product telemetry or visible-window path.
#[cfg(all(debug_assertions, target_os = "macos"))]
use std::io::Write;
use std::{cell::Cell, rc::Rc};

pub type Probe = Rc<Cell<Option<&'static str>>>;

pub struct Scene(Vec<vantare_hub_host::protocol::HostToUi>);
impl Scene {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    pub fn load() -> std::io::Result<Option<Self>> {
        if std::env::var("VANTARE_HUB_CUT2").as_deref() != Ok("1") {
            return Ok(None);
        }
        let path = std::path::PathBuf::from(
            std::env::var_os("VANTARE_HUB_CUT2_SCENE").ok_or(std::io::ErrorKind::InvalidInput)?,
        );
        if path.file_name().and_then(|s| s.to_str()) != Some("shared-scene.json") {
            return Err(std::io::ErrorKind::InvalidInput.into());
        }
        let messages = serde_json::from_slice(&std::fs::read(path)?)?;
        Ok(Some(Self(messages)))
    }
    pub fn reply(
        &self,
        message: &vantare_hub_host::protocol::UiToHost,
    ) -> Option<vantare_hub_host::protocol::HostToUi> {
        use vantare_hub_host::protocol::{HostError, HostToUi, UiToHost};
        let wire = serde_json::to_value(message).ok()?;
        match message {
            UiToHost::Request { id, .. } => {
                let method = wire["request"]["method"].as_str()?;
                if [
                    "core.get",
                    "home.get",
                    "studio.get",
                    "launcher.get",
                    "launcher.resident.get",
                    "launcher.catalog",
                ]
                .contains(&method)
                {
                    for item in &self.0 {
                        if let HostToUi::Response { result, .. } = item
                            && serde_json::to_value(result).ok()?["method"] == method
                        {
                            return Some(HostToUi::Response {
                                id: *id,
                                result: result.clone(),
                            });
                        }
                    }
                }
                Some(HostToUi::Failure {
                    id: *id,
                    error: HostError::Unsupported,
                })
            }
            UiToHost::Subscribe { .. } => self
                .0
                .iter()
                .find(|item| {
                    matches!(item, HostToUi::Event { .. })
                        && serde_json::to_value(item)
                            .ok()
                            .is_some_and(|item| item["event"]["topic"] == wire["topic"])
                })
                .cloned(),
            _ => None,
        }
    }
}

pub fn observe(state: &crate::State) {
    let Some(probe) = &state.measurement else {
        return;
    };
    let ready = match state.section.as_str() {
        "home"
            if state.home.value.is_some()
                && state
                    .home_assets
                    .as_ref()
                    .is_some_and(|assets| assets.capture_ready()) =>
        {
            Some("home")
        }
        "studio" if state.studio.value.is_some() => Some("studio"),
        "launcher"
            if state.launcher.value.is_some()
                && state.launcher.orders.view.is_some()
                && state.launcher.catalog.is_some() =>
        {
            Some("launcher")
        }
        _ => None,
    };
    probe.set(ready);
}

#[cfg(all(debug_assertions, target_os = "macos"))]
pub fn attach(app: rune::App<crate::State>, state: &mut crate::State) -> rune::App<crate::State> {
    if std::env::var("VANTARE_HUB_CUT2").as_deref() != Ok("1") {
        return app;
    }
    // Fail before try_run: a probe can never fall back to a visible window.
    assert_eq!(std::env::var("VANTARE_HUB_HOST").as_deref(), Ok("mock"));
    let args: Vec<_> = std::env::args().collect();
    for flag in ["--frames", "--script", "--realtime", "--scene"] {
        assert!(
            args.iter().any(|a| a == flag),
            "cut2 needs closed headless arguments"
        );
    }
    assert!(!args.iter().any(|a| a == "--native"));
    let probe = Probe::default();
    state.measurement = Some(probe.clone());
    let mut previous = None;
    app.on_frame_encoded(move |frame| {
        if frame.outcome() != rune::FrameOutcome::Drawn {
            return;
        }
        if let Some(screen) = probe.get()
            && Some(screen) != previous
        {
            previous = Some(screen);
            println!(
                "cut2 {}",
                serde_json::json!({"kind":"ready", "screen":screen})
            );
            let _ = std::io::stdout().flush();
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loading_screens_cannot_mark_a_useful_frame() {
        let mut state = crate::init();
        state.measurement = Some(Probe::default());
        for screen in ["home", "studio", "launcher"] {
            state.section = screen.into();
            observe(&state);
            assert_eq!(state.measurement.as_ref().unwrap().get(), None);
        }
        state.studio.value = Some(crate::studio::scene("studio-base"));
        state.section = "studio".into();
        observe(&state);
        assert_eq!(state.measurement.as_ref().unwrap().get(), Some("studio"));
        state.section = "launcher".into();
        observe(&state);
        assert_eq!(state.measurement.as_ref().unwrap().get(), None);
    }
    #[test]
    fn snapshot_preserves_request_ids_and_refuses_writes() {
        use vantare_hub_host::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
        let scene = Scene(vec![HostToUi::Response {
            id: 1,
            result: Reply::StudioGet {
                value: crate::studio::scene("studio-base"),
            },
        }]);
        assert!(matches!(
            scene.reply(&UiToHost::Request {
                id: 42,
                request: Request::StudioGet {}
            }),
            Some(HostToUi::Response { id: 42, .. })
        ));
        assert!(matches!(
            scene.reply(&UiToHost::Request {
                id: 43,
                request: Request::StudioTrack { show: true }
            }),
            Some(HostToUi::Failure {
                id: 43,
                error: HostError::Unsupported
            })
        ));
    }
}
