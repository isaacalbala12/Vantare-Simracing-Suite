//! Estado de conexión por App GPUI; nunca pertenece a un renderer de widget.
use gpui::{App, Global};
use vantare_ipc::ConnectionStatus;
struct Status(ConnectionStatus);
impl Global for Status {}
pub(crate) fn incompatible(cx: &App) -> bool {
    cx.try_global::<Status>()
        .is_some_and(|status| status.0.incompatible())
}
pub(crate) fn install(status: Option<ConnectionStatus>, cx: &mut App) {
    let Some(status) = status else { return };
    cx.set_global(Status(status));
    cx.spawn(async move |cx| {
        let mut previous = false;
        loop {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(250))
                .await;
            cx.update(|cx| {
                let current = incompatible(cx);
                if current != previous {
                    previous = current;
                    cx.refresh_windows();
                }
            });
        }
    })
    .detach();
}
