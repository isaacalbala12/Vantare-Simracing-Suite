//! Primer arranque GPUI. Cuenta, layout y privacidad conservan sus propietarios.
mod art;
mod view;
use super::{Hub, navigation::Access};
use crate::onboarding::{Choices, Equipment, SAY, usage_say};
use gpui::{Context, Window, prelude::*};
use std::time::{Duration, Instant};
use vantare_ipc::control::CatalogAccess;
use vantare_services::diagnostics::{Privacy, Usage};

fn plan_request(
    product: Option<crate::services::protocol::BillingProduct>,
    signed: bool,
) -> Option<crate::services::protocol::Command> {
    use crate::services::protocol::{BillingProduct, Command};
    matches!(product, Some(BillingProduct::ProMonthly)).then(|| {
        if signed {
            Command::Purchase {
                product: BillingProduct::ProMonthly,
            }
        } else {
            Command::AccountBegin
        }
    })
}

#[allow(clippy::struct_excessive_bools)] // Sesión, QA, movimiento del SO y elección manual son hechos independientes.
pub(super) struct State {
    pub step: usize,
    pub choices: Choices,
    pub equipment: Equipment,
    pub backgrounds: [Option<std::sync::Arc<gpui::RenderImage>>; 3],
    pub found: [bool; 2],
    pub simulators_touched: bool,
    pub text: String,
    pub spoken: Instant,
    pub pointer: (f32, f32),
    pub error: Option<String>,
    pub consent_error: bool,
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
        let equipment = if capture {
            Equipment {
                cpu: Some("Ryzen 7 5800X".into()),
                cores: Some(8),
                ram_bytes: Some(32 * 1024 * 1024 * 1024),
                gpu: Some("RTX 3070".into()),
            }
        } else {
            Equipment::detect()
        };
        let mut choices = Choices::default();
        choices.select_automatic(&equipment);
        // Assets estáticos preparados una vez: también deben estar listos en la primera
        // pintura con movimiento reducido, sin esperar un clic para mostrar el fondo.
        let backgrounds = [
            include_bytes!("../../../assets/onboarding/panel.svg").as_slice(),
            include_bytes!("../../../assets/onboarding/backdrop.svg").as_slice(),
            include_bytes!("../../../assets/onboarding/track.svg").as_slice(),
        ]
        .map(|bytes| {
            cx.svg_renderer()
                .render_single_frame(bytes, 1.0)
                .map_err(|error| error.to_string())
        });
        let artwork_error = backgrounds
            .iter()
            .find_map(|result| result.as_ref().err().cloned());
        let backgrounds = backgrounds.map(Result::ok);
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
            choices,
            equipment,
            backgrounds,
            found: [false; 2],
            simulators_touched: false,
            text: SAY[step].into(),
            spoken: Instant::now(),
            pointer: (0.0, 0.0),
            error: artwork_error,
            consent_error: false,
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
        if self.step == 5 {
            // Al volver atrás el bocadillo sigue al interruptor, no al valor inicial.
            self.say(usage_say(self.choices.usage));
        }
    }
}
/// La salida sin guardar solo se ofrece junto al error del paso de privacidad:
/// sin consentimiento guardado, pero con la opción más privada.
const fn private_exit_available(step: usize, consent_error: bool) -> bool {
    consent_error && step >= 5
}
/// Todo apagado y sin persistir: la decisión más privada para entrar en la app.
const fn most_private(privacy: Privacy) -> Privacy {
    Privacy {
        usage: false,
        usage_decided: true,
        crashes: false,
        crashes_decided: true,
        ..privacy
    }
}
/// Nombre corto del plan que el núcleo confirma para la cuenta; `None` mientras
/// no haya política vigente. Una cuenta conectada sin confirmar no es «Gratis».
fn confirmed_plan(access: Access) -> Option<&'static str> {
    (access.verified && !access.blocked).then(|| match access.catalog {
        CatalogAccess::Free => "Gratis",
        CatalogAccess::LaunchV1 => "Lanzamiento",
        CatalogAccess::Pro => "Pro",
    })
}
/// Fila «Plan» del resumen: el plan real si se conoce; «Gratis» solo sin cuenta.
fn plan_label(signed: bool, access: Access) -> String {
    if !signed {
        return "Gratis · sin cuenta".into();
    }
    if access.blocked {
        return "Acceso bloqueado".into();
    }
    confirmed_plan(access).map_or_else(
        || "Cuenta conectada · plan sin confirmar".into(),
        |plan| format!("{plan} · cuenta conectada"),
    )
}
/// Control de navegación del asistente.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Nav {
    Back,
    Next,
    Skip,
}
/// Qué hace un control en el paso actual, sin tocar el estado.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Motion {
    Blocked,
    Page(usize),
    Exit(bool),
}
/// El pie decide con esto: un control oculto no navega. Atrás no sale del
/// primer paso, Saltar desaparece desde el paso de privacidad (el resumen se
/// alcanza terminando) y Continuar en el resumen sale con el teclado; los
/// botones visibles del resumen son la salida explícita.
const fn motion(nav: Nav, step: usize, can_advance: bool) -> Motion {
    match nav {
        Nav::Back if step == 0 => Motion::Blocked,
        Nav::Back => Motion::Page(step - 1),
        Nav::Skip if step < 5 => Motion::Page(6),
        Nav::Skip => Motion::Blocked,
        Nav::Next if step >= 6 => Motion::Exit(true),
        Nav::Next if !can_advance => Motion::Blocked,
        Nav::Next => Motion::Page(step + 1),
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
        // #1628 R2: Plus y Launch remiten a precios; nunca inventar un SKU.
        let Some(command) = plan_request(product, state.signed) else {
            cx.open_url("https://vantare.app/#precios");
            return;
        };
        if !state.signed {
            state.say("Conecta tu cuenta para consultar los planes disponibles.");
        }
        self.remote
            .update(cx, |remote, cx| remote.request(command, cx));
        cx.notify();
    }
    pub(super) fn onboarding_next(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        let step = state.step;
        let usage = state.choices.usage;
        match motion(Nav::Next, step, state.choices.can_advance(step)) {
            Motion::Blocked => {}
            Motion::Exit(show) => self.onboarding_finish(show, window, cx),
            Motion::Page(next) => {
                if step == 5 && !self.onboarding_consent(usage, cx) {
                    // El error queda visible: el usuario puede reintentar o entrar sin guardar.
                    cx.notify();
                    return;
                }
                if let Some(state) = &mut self.onboarding {
                    state.page(next);
                }
                cx.notify();
            }
        }
    }
    /// Atrás retrocede un paso; en el primer paso el control oculto no navega.
    pub(super) fn onboarding_back(&mut self, cx: &mut Context<Self>) {
        self.onboarding_move(Nav::Back, cx);
    }
    /// Saltar va al resumen; desde el paso de privacidad el control oculto no navega.
    pub(super) fn onboarding_skip(&mut self, cx: &mut Context<Self>) {
        self.onboarding_move(Nav::Skip, cx);
    }
    fn onboarding_move(&mut self, nav: Nav, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        let Motion::Page(step) = motion(nav, state.step, state.choices.can_advance(state.step))
        else {
            return;
        };
        if let Some(state) = &mut self.onboarding {
            state.page(step);
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
            state.consent_error = !success;
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
            state.say(usage_say(next));
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
    /// Salida de emergencia si el consentimiento no se puede guardar: entra con
    /// todo apagado y sin intentar más escrituras que puedan volver a fallar.
    fn onboarding_enter_private(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        if state.capture || !private_exit_available(state.step, state.consent_error) {
            return;
        }
        // Decisión en memoria, no en disco: también evita que la pregunta de
        // privacidad vuelva a bloquear el primer arranque en este mismo inicio.
        if let Ok(store) = &mut self.settings.privacy {
            store.value = most_private(store.value);
        }
        self.onboarding = None;
        self.section = crate::Section::Home;
        self.focus.focus(window, cx);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::protocol::{BillingProduct, Command};
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    #[test]
    fn plus_and_launch_open_prices_without_login_or_checkout() {
        for signed in [false, true] {
            assert!(plan_request(None, signed).is_none());
            assert!(plan_request(Some(BillingProduct::LaunchLifetime), signed).is_none());
        }
        assert!(matches!(
            plan_request(Some(BillingProduct::ProMonthly), false),
            Some(Command::AccountBegin)
        ));
        assert!(matches!(
            plan_request(Some(BillingProduct::ProMonthly), true),
            Some(Command::Purchase {
                product: BillingProduct::ProMonthly
            })
        ));
    }
    #[test]
    fn plan_labels_follow_the_confirmed_license_and_never_presume_free() {
        let unverified = Access::default();
        let launch = Access {
            verified: true,
            catalog: CatalogAccess::LaunchV1,
            ..Access::default()
        };
        let pro = Access {
            verified: true,
            catalog: CatalogAccess::Pro,
            ..Access::default()
        };
        let free = Access {
            verified: true,
            ..Access::default()
        };
        let blocked = Access {
            blocked: true,
            ..Access::default()
        };
        // Sin cuenta la fila no inventa nada: el núcleo no confirma plan alguno.
        for access in [unverified, launch, blocked] {
            assert_eq!(plan_label(false, access), "Gratis · sin cuenta");
        }
        assert_eq!(confirmed_plan(unverified), None);
        assert_eq!(
            plan_label(true, unverified),
            "Cuenta conectada · plan sin confirmar"
        );
        assert_eq!(confirmed_plan(blocked), None);
        assert_eq!(plan_label(true, blocked), "Acceso bloqueado");
        assert_eq!(confirmed_plan(free), Some("Gratis"));
        assert_eq!(plan_label(true, free), "Gratis · cuenta conectada");
        assert_eq!(confirmed_plan(launch), Some("Lanzamiento"));
        assert_eq!(plan_label(true, launch), "Lanzamiento · cuenta conectada");
        assert_eq!(confirmed_plan(pro), Some("Pro"));
        assert_eq!(plan_label(true, pro), "Pro · cuenta conectada");
    }
    // La navegación se prueba en la decisión pura: el render no tiene arnés
    // GPUI en el repo, y el pie y la tecla Escape consultan esta misma función.
    #[test]
    fn the_footer_only_moves_in_visible_steps() {
        assert_eq!(motion(Nav::Back, 0, true), Motion::Blocked);
        for step in 1..=6 {
            assert_eq!(motion(Nav::Back, step, true), Motion::Page(step - 1));
        }
        for step in 0..=4 {
            assert_eq!(motion(Nav::Skip, step, true), Motion::Page(6));
        }
        for step in 5..=6 {
            assert_eq!(motion(Nav::Skip, step, true), Motion::Blocked);
        }
        for step in 0..=5 {
            assert_eq!(motion(Nav::Next, step, false), Motion::Blocked);
            assert_eq!(motion(Nav::Next, step, true), Motion::Page(step + 1));
        }
        assert_eq!(motion(Nav::Next, 6, true), Motion::Exit(true));
    }
    #[test]
    fn the_unsaved_exit_needs_the_consent_error_at_the_privacy_step() {
        assert!(!private_exit_available(5, false));
        assert!(!private_exit_available(6, false));
        for step in 0..=4 {
            assert!(!private_exit_available(step, true));
        }
        assert!(private_exit_available(5, true));
        assert!(private_exit_available(6, true));
    }
    #[test]
    fn most_private_turns_everything_off_without_losing_the_generation() {
        let saved = Privacy {
            generation: 7,
            crashes: true,
            usage: true,
            crashes_decided: false,
            usage_decided: false,
        };
        assert_eq!(
            most_private(saved),
            Privacy {
                generation: 7,
                crashes: false,
                usage: false,
                crashes_decided: true,
                usage_decided: true,
            }
        );
    }
}
