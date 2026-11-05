use super::{Context, Duration, Hub, Instant, Launcher, PathBuf};
use gpui::{PromptButton, PromptLevel};

fn close_code(restart: bool, connected: bool) -> u8 {
    if restart {
        10
    } else if connected {
        11
    } else {
        0
    }
}

fn write_hub_exit(root: &std::path::Path, connected: bool) -> std::io::Result<()> {
    std::fs::write(
        root.join("hub-exit"),
        if connected { "live" } else { "idle" },
    )
}

const CLOSE_SAVE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy)]
pub(super) enum ForcedClose {
    Live,
    Restart,
}

impl ForcedClose {
    fn prepare(self, close_without_draft: &mut bool, restart_requested: &mut bool) {
        *close_without_draft = true;
        *restart_requested |= matches!(self, Self::Restart);
    }
}

fn close_save_expired(started: Option<Instant>, now: Instant) -> bool {
    started.is_some_and(|started| now.saturating_duration_since(started) >= CLOSE_SAVE_TIMEOUT)
}

fn reset_close_attempt(requested: &mut bool, started: &mut Option<Instant>, skip_draft: &mut bool) {
    *requested = false;
    *started = None;
    *skip_draft = false;
}

fn needs_close_draft_save(skip_draft: bool, dirty: bool) -> bool {
    !skip_draft && dirty
}

impl Hub {
    pub(super) fn close(&mut self, cx: &mut Context<Self>) {
        if self.can_close(cx) {
            cx.quit();
        }
    }

    pub(super) fn forced_close(&mut self, reason: ForcedClose, cx: &mut Context<Self>) {
        if self.remote.read(cx).editor.dirty {
            eprintln!("cierre forzado con ediciones del informe sin guardar");
        }
        reason.prepare(&mut self.close_without_draft, &mut self.restart_requested);
        self.close_save_pending = false;
        self.close_save_started = None;
        self.close(cx);
    }

    pub(super) fn abort_close(&mut self) {
        reset_close_attempt(
            &mut self.close_requested,
            &mut self.close_save_started,
            &mut self.close_without_draft,
        );
        self.cancel_beta_restart();
    }

    pub(super) fn can_close(&mut self, cx: &mut Context<Self>) -> bool {
        self.close_requested = true;
        if self.close_save_pending {
            if close_save_expired(self.close_save_started, Instant::now()) {
                self.close_save_pending = false;
                self.close_save_failed(cx);
            }
            return false;
        }
        if !self.launcher.update(cx, Launcher::can_close) {
            return false;
        }
        if crate::installation::defer_close(&self.boot_confirmation, || {
            // Tras liberar el préstamo de la ventana que recibió la X.
            cx.defer(|cx| {
                for handle in cx.windows() {
                    let _ = handle.update(cx, |_, window, _| {
                        vantare_ui::window_activation::hide(window);
                    });
                }
            });
        }) {
            return false;
        }
        if needs_close_draft_save(self.close_without_draft, self.remote.read(cx).editor.dirty) {
            let now = Instant::now();
            if close_save_expired(self.close_save_started, now) {
                self.close_save_failed(cx);
                return false;
            }
            self.close_save_started.get_or_insert(now);
            match self
                .remote
                .update(cx, crate::services::view::Remote::begin_close_save)
            {
                Some(true) => self.close_save_pending = true,
                Some(false) => self.close_save_failed(cx),
                None => {}
            }
            return false;
        }
        self.close_save_started = None;
        match self.save(cx) {
            Ok(()) => {
                if let Some(root) = std::env::var_os("VANTARE_BETA_ROOT")
                    && let Err(error) = write_hub_exit(&PathBuf::from(root), self.connected_source)
                {
                    self.status = Some(format!("registrar cierre beta: {error}").into());
                    self.abort_close();
                    cx.notify();
                    return false;
                }
                self.exit_code
                    .set(close_code(self.restart_requested, self.connected_source));
                true
            }
            Err(error) => {
                self.notifications.update(cx, |center, cx| {
                    center.report("hub.save", error.to_string(), cx);
                });
                self.status = Some(error.into());
                self.abort_close();
                cx.notify();
                false
            }
        }
    }

    pub(super) fn close_save_failed(&mut self, cx: &mut Context<Self>) {
        self.abort_close();
        // La X aún presta su ventana al callback: abrir el diálogo al liberar ese préstamo.
        let hub = cx.entity().downgrade();
        cx.defer(move |cx| {
            let Some(window) = cx.windows().into_iter().next() else {
                return;
            };
            let Ok(prompt) = window.update(cx, |_, window, cx| {
                window.prompt(
                    PromptLevel::Warning,
                    "No se pudo guardar el borrador protegido",
                    Some("Hay ediciones sin guardar."),
                    &[
                        PromptButton::ok("Reintentar"),
                        PromptButton::cancel("Cerrar sin guardar"),
                    ],
                    cx,
                )
            }) else {
                return;
            };
            cx.spawn(async move |cx| {
                if let Ok(choice) = prompt.await {
                    let _ = hub.update(cx, |this, cx| {
                        if choice == 1 {
                            this.close_without_draft = true;
                        }
                        this.close(cx);
                    });
                }
            })
            .detach();
        });
    }
}

#[cfg(test)]
mod presentation_tests {
    use super::*;

    #[test]
    fn restart_to_apply_wins_over_connected_detach() {
        assert_eq!(close_code(true, true), 10);
        assert_eq!(close_code(false, true), 11);
        assert_eq!(close_code(false, false), 0);
        let (mut skip, mut restart) = (false, false);
        ForcedClose::Live.prepare(&mut skip, &mut restart);
        assert!(skip);
        assert!(!restart);
        skip = false;
        ForcedClose::Restart.prepare(&mut skip, &mut restart);
        assert!(skip);
        assert!(restart);
    }

    #[test]
    fn busy_services_gets_five_seconds_before_the_close_dialog() {
        let now = Instant::now();
        assert!(!close_save_expired(None, now + Duration::from_secs(6)));
        assert!(!close_save_expired(
            Some(now),
            now + Duration::from_millis(4_999)
        ));
        assert!(close_save_expired(Some(now), now + Duration::from_secs(5)));
    }

    #[test]
    fn aborted_close_restores_the_draft_guard() {
        let now = Instant::now();
        for (scenario, started) in [
            ("launcher cancel", None),
            ("hub-exit write failure", None),
            ("hub save failure", None),
            ("close without saving then cancel", Some(now)),
        ] {
            let (mut requested, mut skip_draft, mut started) = (true, true, started);
            reset_close_attempt(&mut requested, &mut started, &mut skip_draft);
            assert!(!requested, "{scenario}");
            assert!(started.is_none(), "{scenario}");
            assert!(!skip_draft, "{scenario}");
            assert!(needs_close_draft_save(skip_draft, true), "{scenario}");
        }
    }

    #[test]
    fn live_and_restart_skip_only_the_draft_gate() {
        let root = std::env::temp_dir().join(format!(
            "vantare-close-policy-{}",
            vantare_services::random_id().expect("id")
        ));
        std::fs::create_dir(&root).unwrap();
        for (reason, restart_exit) in [(ForcedClose::Live, 11), (ForcedClose::Restart, 10)] {
            let (mut skip, mut restart) = (false, false);
            reason.prepare(&mut skip, &mut restart);
            assert!(!needs_close_draft_save(skip, true));
            assert_eq!(close_code(restart, true), restart_exit);
            write_hub_exit(&root, true).unwrap();
            assert_eq!(
                std::fs::read_to_string(root.join("hub-exit")).unwrap(),
                "live"
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
