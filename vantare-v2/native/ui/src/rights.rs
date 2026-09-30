//! Acceso del host de overlays: política del núcleo, sin firma/red propia.
use crate::Kind;
use gpui::{App, Global};
use vantare_ipc::control::{Feed, Policy};

struct Access(Feed);
impl Global for Access {}
pub(crate) fn allowed(kind: Kind, policy: &Policy) -> bool {
    matches!(kind, Kind::Standings | Kind::Pedals) || (policy.current() && policy.overlays_advanced)
}
pub(crate) fn denied(kind: Kind, cx: &App) -> bool {
    // Workshop/paridad no instalan este global: son previsualizaciones locales.
    cx.try_global::<Access>()
        .is_some_and(|access| !allowed(kind, &access.0.policy()))
}
pub(crate) fn install(feed: Option<Feed>, cx: &mut App) {
    let Some(feed) = feed else { return };
    cx.set_global(Access(feed));
    cx.spawn(async move |cx| {
        let mut previous = false;
        loop {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(250))
                .await;
            cx.update(|cx| {
                let policy = cx.global::<Access>().0.policy();
                let allowed = policy.current() && policy.overlays_advanced;
                if allowed != previous {
                    previous = allowed;
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
    fn free_widgets_remain_available_and_paid_widgets_deny_stale_or_expired_policy() {
        let mut policy = Policy::default();
        assert!(allowed(Kind::Standings, &policy));
        assert!(allowed(Kind::Pedals, &policy));
        for kind in Kind::ALL
            .iter()
            .copied()
            .filter(|kind| !matches!(kind, Kind::Standings | Kind::Pedals))
        {
            assert!(!allowed(kind, &policy));
        }
        policy.version = vantare_ipc::control::VERSION;
        policy.revision = 1;
        policy.checked_at_ms = vantare_ipc::control::wall_ms().expect("wall");
        policy.overlays_advanced = true;
        assert!(allowed(Kind::Radar, &policy));
        policy.valid_until_ms = Some(policy.checked_at_ms);
        assert!(!allowed(Kind::Radar, &policy));
        policy.valid_until_ms = None;
        policy.checked_at_ms -= 2001;
        assert!(!allowed(Kind::Radar, &policy));
    }
}
