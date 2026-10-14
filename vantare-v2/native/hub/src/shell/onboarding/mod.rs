//! Primer arranque GPUI. Cuenta, layout y privacidad conservan sus propietarios.
mod art;
mod view;
use super::Hub;
use crate::onboarding::{Choices, SAY};
use gpui::{Context, Window, prelude::*};
use std::time::{Duration, Instant};
use vantare_services::diagnostics::Usage;

#[allow(clippy::struct_excessive_bools)] // Sesión, QA, movimiento del SO y elección manual son hechos independientes.
pub(super) struct State {
    pub step: usize,
    pub choices: Choices,
    pub found: [bool; 2],
    pub simulators_touched: bool,
    pub text: String,
    pub spoken: Instant,
    pub pointer: (f32, f32),
    pub error: Option<String>,
    pub capture: bool,
    pub signed: bool,
    pub system_reduced: bool,
    pub preview_scale: std::cell::Cell<f32>,
    pub previews: Vec<(vantare_ui::Kind, gpui::Entity<vantare_ui::Overlay>)>,
}
impl State {
    pub fn new(capture: Option<&crate::demo::CaptureState>, cx: &mut gpui::App) -> Self {
        let step = capture
            .and_then(|c| c.name.strip_prefix("onboarding-"))
            .and_then(|n| n.parse::<usize>().ok())
            .filter(|n| *n < 7)
            .unwrap_or(0);
        let capture = capture.is_some();
        let mut previews = Vec::new();
        let fixtures = crate::scene::fixtures_root();
        for kind in crate::onboarding::ORDER {
            let snapshot = fixtures
                .as_ref()
                .and_then(|root| {
                    crate::scene::Scene::open(root.join(format!("{}.snapshot.json", kind.name())))
                        .ok()
                })
                .map(|scene| scene.snapshot().clone())
                .unwrap_or_default();
            let mut settings = vantare_ui::Settings::default_for(kind);
            if let vantare_ui::Settings::Standings(s) = &mut settings {
                s.row_count = 6;
            }
            let mut overlay = vantare_ui::Overlay::configured(
                &settings,
                vantare_domain::format::Preferences::default(),
            );
            let view = cx.new(|cx| {
                overlay.ingest(&snapshot, cx);
                overlay
            });
            previews.push((kind, view));
        }
        Self {
            step,
            choices: Choices::default(),
            found: [false; 2],
            simulators_touched: false,
            text: SAY[step].into(),
            spoken: Instant::now(),
            pointer: (0.0, 0.0),
            error: None,
            capture,
            signed: false,
            system_reduced: crate::shell::settings::windows::reduced_motion(),
            preview_scale: std::cell::Cell::new(0.0),
            previews,
        }
    }
    pub fn say(&mut self, text: impl Into<String>) {
        self.text = text.into();
        self.spoken = Instant::now();
    }
    pub fn page(&mut self, step: usize) {
        self.step = step.min(6);
        self.say(SAY[self.step]);
        if self.step == 1 && !self.found[0] && !self.capture {
            self.say("Marca los simuladores que usas en tu PC.");
        }
        if self.step == 3 && !self.capture {
            self.say(
                "Inicia sesión para conectar tu cuenta. Tu configuración se guarda en este PC.",
            );
        }
        if self.step == 4 && !self.capture {
            self.say("Elige un nivel de rendimiento. La detección automática todavía no está disponible.");
        }
    }
}
impl Hub {
    pub(super) fn onboarding_plan(
        &mut self,
        product: Option<crate::services::protocol::BillingProduct>,
        cx: &mut Context<Self>,
    ) {
        let Some(state) = &mut self.onboarding else {
            return;
        };
        if state.capture {
            return;
        }
        let Some(product) = product else {
            state.error =
                Some("Pro Plus todavía no está disponible en el servicio de compra.".into());
            cx.notify();
            return;
        };
        let command = if state.signed {
            crate::services::protocol::Command::Purchase { product }
        } else {
            state.say("Conecta tu cuenta para consultar los planes disponibles.");
            crate::services::protocol::Command::AccountBegin
        };
        self.remote
            .update(cx, |remote, cx| remote.request(command, cx));
        cx.notify();
    }
    pub(super) fn onboarding_next(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        if !state.choices.can_advance(state.step) {
            return;
        }
        if state.step == 6 {
            self.onboarding_finish(true, window, cx);
            return;
        }
        if state.step == 5 && !self.onboarding_consent(state.choices.usage, cx) {
            return;
        }
        if let Some(state) = &mut self.onboarding {
            state.page(state.step + 1);
        }
        cx.notify();
    }
    fn onboarding_consent(&mut self, enabled: bool, cx: &mut Context<Self>) -> bool {
        if self.onboarding.as_ref().is_some_and(|s| s.capture) {
            return true;
        }
        let result = self
            .settings
            .privacy
            .as_mut()
            .map_err(|e| e.clone())
            .and_then(|store| {
                let mut next = store.value;
                next.usage = enabled;
                next.usage_decided = true;
                // El onboarding no solicita permiso de fallos; permanece separado y apagado.
                if !next.crashes_decided {
                    next.crashes = false;
                    next.crashes_decided = true;
                }
                store.save(next)?;
                vantare_ui::analytics::consent(cx, store.value);
                Ok(())
            });
        let success = result.is_ok();
        if let Some(state) = &mut self.onboarding {
            state.error = result.err();
        }
        success
    }
    fn onboarding_toggle_usage(&mut self, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        let next = !state.choices.usage;
        if !self.onboarding_consent(next, cx) {
            cx.notify();
            return;
        }
        if let Some(state) = &mut self.onboarding {
            state.choices.usage = next;
            state.say(if next {
                "Datos de uso activados. Son anónimos."
            } else {
                "Datos de uso desactivados."
            });
            if next && !state.capture {
                vantare_ui::analytics::record_once(cx, &Usage::UsageOptIn {});
            }
        }
        cx.notify();
    }
    fn onboarding_finish(&mut self, show: bool, window: &mut Window, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        if state.capture {
            return;
        }
        let choices = state.choices.clone();
        if !choices.can_advance(1) || !choices.can_advance(2) {
            if let Some(state) = &mut self.onboarding {
                state.page(if choices.can_advance(1) { 2 } else { 1 });
            }
            cx.notify();
            return;
        }
        if !self.onboarding_consent(choices.usage, cx) {
            cx.notify();
            return;
        }
        let result = self
            .studio
            .update(cx, |studio, cx| {
                studio.finish_onboarding(&choices.kit(), choices.level, show, cx)
            })
            .and_then(|()| {
                self.settings
                    .general
                    .as_mut()
                    .map_err(|e| e.clone())
                    .and_then(|store| {
                        let mut next = store.value;
                        next.onboarding_completed = true;
                        next.onboarding_simulators = choices.simulators;
                        store.save(next)
                    })
            });
        if let Err(error) = result {
            if let Some(state) = &mut self.onboarding {
                state.error = Some(error);
            }
        } else {
            self.onboarding = None;
            self.section = if show {
                crate::Section::Home
            } else {
                crate::Section::Studio
            };
            self.focus.focus(window, cx);
        }
        cx.notify();
    }
    pub(super) fn poll_onboarding(&mut self, cx: &mut Context<Self>) {
        let Some(state) = &mut self.onboarding else {
            return;
        };
        if !state.capture {
            let found = self.launcher.read(cx).onboarding_simulators();
            if found != state.found {
                state.found = found;
                if state.step <= 1 && !state.simulators_touched {
                    state.choices.simulators = if found.iter().any(|x| *x) {
                        found
                    } else {
                        [true, false]
                    };
                }
                cx.notify();
            }
            let signed = self.remote.read(cx).onboarding_session().0;
            if signed != state.signed {
                state.signed = signed;
                state.say(if signed {
                    "Sesión iniciada. Tu configuración se guarda en este PC."
                } else {
                    SAY[3]
                });
                cx.notify();
            }
        }
    }
    pub(super) fn animate_onboarding(cx: &mut Context<Self>) {
        // Task pertenece al Hub: no hilo separado, se cancela al destruir la entidad.
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(16))
                    .await;
                if !this
                    .update(cx, |hub, cx| {
                        if hub.onboarding.is_none() {
                            return false;
                        }
                        if !hub
                            .onboarding
                            .as_ref()
                            .is_some_and(|s| s.system_reduced || s.capture)
                            && !cx
                                .try_global::<vantare_ui::MotionPolicy>()
                                .is_some_and(|p| p.0)
                        {
                            cx.notify();
                        }
                        true
                    })
                    .unwrap_or(false)
                {
                    break;
                }
            }
        })
        .detach();
    }
}
