//! Acceso del host de overlays: política del núcleo, sin firma/red propia.
use crate::Kind;
use gpui::{App, Global};
use vantare_ipc::control::{Feed, Policy};

struct Access(Feed);
impl Global for Access {}
pub(crate) fn allowed(_kind: Kind, policy: &Policy) -> bool {
    policy.current() && policy.overlays_advanced
}
pub(crate) fn denied(kind: Kind, cx: &App) -> bool {
    // Workshop/paridad no instalan este global: son previsualizaciones locales.
    cx.try_global::<Access>()
        .is_some_and(|access| !allowed(kind, &access.0.policy()))
}
fn message(policy: &Policy) -> &'static str {
    if policy.error.as_deref() == Some(vantare_ipc::control::VERSION_ERROR) {
        vantare_ipc::control::VERSION_ERROR
    } else {
        "Inicia sesión en Vantare para ver tus overlays"
    }
}
pub(crate) fn notice(cx: &App) -> &'static str {
    cx.try_global::<Access>()
        .map_or("Inicia sesión en Vantare para ver tus overlays", |access| {
            message(&access.0.policy())
        })
}
pub(crate) fn install(feed: Option<Feed>, cx: &mut App) {
    let Some(feed) = feed else { return };
    cx.set_global(Access(feed));
    cx.spawn(async move |cx| {
        let mut previous = (false, None);
        loop {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(250))
                .await;
            cx.update(|cx| {
                let policy = cx.global::<Access>().0.policy();
                let allowed = policy.current() && policy.overlays_advanced;
                let current = (allowed, policy.error);
                if current != previous {
                    previous = current;
                    cx.refresh_windows();
                }
            });
        }
    })
    .detach();
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_mismatch_has_an_actionable_notice_and_never_prints_peer_text() {
        assert_eq!(
            message(&Policy {
                error: Some(vantare_ipc::control::VERSION_ERROR.into()),
                ..Policy::default()
            }),
            vantare_ipc::control::VERSION_ERROR
        );
        assert_eq!(
            message(&Policy {
                error: Some("texto arbitrario del peer".into()),
                ..Policy::default()
            }),
            message(&Policy::default())
        );
    }
    #[test]
    fn every_overlay_requires_a_valid_session_and_no_module_permission() {
        let mut policy = Policy::default();
        for &kind in Kind::ALL {
            assert!(!allowed(kind, &policy));
        }
        policy.version = vantare_ipc::control::VERSION;
        policy.revision = 1;
        policy.checked_at_ms = vantare_ipc::control::wall_ms().expect("wall");
        policy.overlays_advanced = true;
        for &kind in Kind::ALL {
            assert!(allowed(kind, &policy));
        }
        for denied in [
            Policy {
                valid_until_ms: Some(policy.checked_at_ms),
                ..policy.clone()
            },
            Policy {
                checked_at_ms: policy.checked_at_ms - 2001,
                ..policy.clone()
            },
            Policy {
                error: Some("fixture".into()),
                ..policy.clone()
            },
            Policy {
                overlays_advanced: false,
                ..policy.clone()
            },
            Policy {
                version: vantare_ipc::control::VERSION - 1,
                ..policy
            },
        ] {
            for &kind in Kind::ALL {
                assert!(!allowed(kind, &denied));
            }
        }
    }
}
