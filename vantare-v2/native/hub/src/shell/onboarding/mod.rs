//! Primer arranque GPUI. Cuenta, layout y privacidad conservan sus propietarios.
mod art;
#[cfg(test)]
mod interaction_tests;
mod view;
use super::{Hub, navigation::Access};
use crate::onboarding::{Choices, Equipment, SAY, crash_say, usage_say};
use gpui::{Context, Window, prelude::*};
use std::time::{Duration, Instant};
use vantare_ipc::control::CatalogAccess;
use vantare_services::diagnostics::{Privacy, Usage};

fn plan_request(
    product: Option<crate::services::protocol::BillingProduct>,
    signed: bool,
) -> Option<crate::services::protocol::Command> {
    use crate::services::protocol::{BillingProduct, Command};
    (signed && matches!(product, Some(BillingProduct::ProMonthly))).then_some(Command::Purchase {
        product: BillingProduct::ProMonthly,
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
    pub marketing_continue: bool,
    pub capture: bool,
    pub signed: bool,
    pub system_reduced: bool,
    pub preview_scale: std::cell::Cell<f32>,
    pub previews: Vec<(vantare_ui::Kind, gpui::Entity<vantare_ui::Overlay>)>,
}
impl State {
    pub fn new(
        capture: Option<&crate::demo::CaptureState>,
        privacy: Option<Privacy>,
        cx: &mut gpui::App,
    ) -> Self {
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
        let mut choices = choices_from_privacy(privacy);
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
            marketing_continue: false,
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
        self.marketing_continue = false;
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
/// Los valores nuevos solo se proponen cuando aún no hay una decisión guardada.
fn choices_from_privacy(privacy: Option<Privacy>) -> Choices {
    let mut choices = Choices::default();
    if let Some(privacy) = privacy {
        if privacy.usage_decided {
            choices.usage = privacy.usage;
        }
        if privacy.crashes_decided {
            choices.crashes = privacy.crashes;
        }
    }
    choices
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
/// Consentimiento del paso de privacidad: guarda juntas las dos decisiones que
/// el usuario ve en los interruptores; el resto del estado no se toca.
const fn consent_privacy(current: Privacy, usage: bool, crashes: bool) -> Privacy {
    Privacy {
        usage,
        usage_decided: true,
        crashes,
        crashes_decided: true,
        ..current
    }
}
/// Aviso de fallos del asistente: qué se envía y cómo apagarlo. Decisión del
/// 15-oct: se muestra siempre en el paso, no se suprime la decisión.
fn crash_report_notice() -> String {
    format!(
        "Si está encendido, Vantare envía a PostHog (Unión Europea) {}. Puedes apagarlo aquí mismo o más tarde en Ajustes › Privacidad.",
        crate::shell::settings::privacy::CRASH_REPORT_WHAT
    )
}
/// Nombre corto del plan que el núcleo confirma para la cuenta; `None` mientras
/// no haya política vigente. Una cuenta conectada sin confirmar no es «Gratis».
fn confirmed_plan(access: Access) -> Option<&'static str> {
    (access.verified && !access.blocked).then_some(match access.catalog {
        CatalogAccess::Free => "Gratis",
        CatalogAccess::LaunchV1 => "Lanzamiento",
        CatalogAccess::Pro => "Pro",
        CatalogAccess::Founders => "Founders",
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
        Nav::Skip if step < 5 => Motion::Page(5),
        Nav::Skip => Motion::Blocked,
        Nav::Next if step >= 6 => Motion::Exit(true),
        Nav::Next if !can_advance => Motion::Blocked,
        Nav::Next => Motion::Page(step + 1),
    }
}
impl Hub {
    fn onboarding_account_login(&mut self, provider: usize, cx: &mut Context<Self>) {
        use crate::services::protocol::{Command, EmailMode};
        if self.onboarding.as_ref().is_none_or(|state| state.capture) {
            return;
        }
        self.remote.update(cx, |remote, cx| {
            if provider == 2 {
                remote.select_email(EmailMode::SignInCode, cx);
            } else {
                remote.request(Command::AccountBegin, cx);
            }
        });
        cx.notify();
    }
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
        if !state.signed
            && matches!(
                product,
                Some(crate::services::protocol::BillingProduct::ProMonthly)
            )
        {
            state.page(3);
            state.say("Conecta tu cuenta para consultar los planes disponibles.");
            self.onboarding_account_login(2, cx);
            return;
        }
        // #1628 R2: Plus y Launch remiten a precios; nunca inventar un SKU.
        let Some(command) = plan_request(product, state.signed) else {
            cx.open_url("https://vantare.app/#precios");
            return;
        };
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
        let crashes = state.choices.crashes;
        match motion(Nav::Next, step, state.choices.can_advance(step)) {
            Motion::Blocked => {}
            Motion::Exit(show) => self.onboarding_finish(show, window, cx),
            Motion::Page(next) => {
                if step == 5 && !self.onboarding_marketing(cx) {
                    return;
                }
                if step == 5 && !self.onboarding_consent(usage, crashes, cx) {
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
    /// Saltar lleva al aviso de privacidad; desde ese paso el control oculto no navega.
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
    /// Guarda las dos decisiones del paso de privacidad tal y como se ven en
    /// los interruptores: apagar fallos aquí se respeta igual que el uso.
    fn onboarding_consent(&mut self, usage: bool, crashes: bool, cx: &mut Context<Self>) -> bool {
        if self.onboarding.as_ref().is_some_and(|s| s.capture) {
            return true;
        }
        let result = self
            .settings
            .privacy
            .as_mut()
            .map_err(|e| e.clone())
            .and_then(|store| {
                let next = consent_privacy(store.value, usage, crashes);
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
    fn onboarding_marketing(&mut self, cx: &mut Context<Self>) -> bool {
        use crate::services::protocol::{Command, MailSource};
        if self
            .onboarding
            .as_ref()
            .is_none_or(|s| s.capture || !s.signed)
        {
            return true;
        }
        let remote = self.remote.read(cx);
        if let Some(error) = remote.mail.error.clone()
            && let Some(state) = &mut self.onboarding
        {
            state.error = Some(error);
        }
        if remote.mail.pending {
            return false;
        }
        if remote.mail.onboarding_saved {
            return true;
        }
        let consent = remote.mail.desired.or(remote.mail.consent).unwrap_or(false);
        if let Some(state) = &mut self.onboarding {
            state.marketing_continue = true;
        }
        self.remote.update(cx, |remote, cx| {
            remote.mail_command(
                Command::MailConsentSet {
                    consent,
                    source: MailSource::Onboarding,
                },
                cx,
            );
        });
        false
    }
    fn onboarding_toggle_marketing(&mut self, cx: &mut Context<Self>) {
        use crate::services::protocol::{Command, MailSource};
        if self
            .onboarding
            .as_ref()
            .is_none_or(|s| s.capture || !s.signed)
        {
            return;
        }
        let remote = self.remote.read(cx);
        if remote.mail.pending {
            return;
        }
        let consent = !remote.mail.consent.unwrap_or(false);
        self.remote.update(cx, |remote, cx| {
            remote.mail_command(
                Command::MailConsentSet {
                    consent,
                    source: MailSource::Onboarding,
                },
                cx,
            );
        });
    }
    fn onboarding_toggle_usage(&mut self, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        let next = !state.choices.usage;
        let crashes = state.choices.crashes;
        if !self.onboarding_consent(next, crashes, cx) {
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
    fn onboarding_toggle_crashes(&mut self, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        let next = !state.choices.crashes;
        let usage = state.choices.usage;
        if !self.onboarding_consent(usage, next, cx) {
            cx.notify();
            return;
        }
        if let Some(state) = &mut self.onboarding {
            state.choices.crashes = next;
            state.say(crash_say(next));
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
        if !self.onboarding_consent(choices.usage, choices.crashes, cx) {
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
            vantare_ui::analytics::consent(cx, store.value);
        }
        vantare_ui::analytics::suspend_until_consent(cx);
        self.analytics
            .consent(vantare_ui::analytics::generation(cx));
        self.onboarding = None;
        self.section = crate::Section::Home;
        self.focus.focus(window, cx);
        cx.notify();
    }
    fn complete_onboarding_marketing(&mut self, cx: &mut Context<Self>) {
        let Some(state) = &self.onboarding else {
            return;
        };
        if state.step != 5 || !state.marketing_continue {
            return;
        }
        let mail = &self.remote.read(cx).mail;
        if mail.pending {
            return;
        }
        let error = mail.error.clone();
        let confirmed = mail.onboarding_saved;
        let usage = state.choices.usage;
        let crashes = state.choices.crashes;
        if let Some(state) = &mut self.onboarding {
            state.marketing_continue = false;
            if let Some(error) = error {
                state.error = Some(error);
                cx.notify();
                return;
            }
        }
        if confirmed
            && self.onboarding_consent(usage, crashes, cx)
            && let Some(state) = &mut self.onboarding
        {
            state.page(6);
        }
        cx.notify();
    }
    pub(super) fn poll_onboarding(&mut self, cx: &mut Context<Self>) {
        if self.onboarding.as_ref().is_some_and(|s| !s.capture) {
            self.remote
                .update(cx, super::super::services::view::Remote::poll_mail);
        }
        self.complete_onboarding_marketing(cx);
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
        assert!(plan_request(Some(BillingProduct::ProMonthly), false).is_none());
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
        let founders = Access {
            verified: true,
            catalog: CatalogAccess::Founders,
            ..Access::default()
        };
        assert_eq!(confirmed_plan(founders), Some("Founders"));
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
    // La decisión del pie se cubre aquí; el teclado se prueba con GPUI headless.
    #[test]
    fn the_footer_only_moves_in_visible_steps() {
        assert_eq!(motion(Nav::Back, 0, true), Motion::Blocked);
        for step in 1..=6 {
            assert_eq!(motion(Nav::Back, step, true), Motion::Page(step - 1));
        }
        for step in 0..=4 {
            assert_eq!(motion(Nav::Skip, step, true), Motion::Page(5));
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
    fn most_private_turns_everything_off_without_changing_the_saved_generation() {
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
    // El aviso y las decisiones se cubren además de la interacción GPUI.
    #[test]
    fn the_privacy_step_offers_crash_reports_on_with_the_notice_visible() {
        let choices = Choices::default();
        assert!(
            choices.crashes,
            "los informes de fallos llegan encendidos al paso"
        );
        assert!(!choices.usage, "el uso sigue siendo una decisión aparte");
        let notice = crash_report_notice();
        assert!(
            notice.contains(crate::shell::settings::privacy::CRASH_REPORT_WHAT),
            "el aviso reutiliza el texto del primer arranque"
        );
        assert!(
            notice.contains("Puedes apagarlo aquí mismo"),
            "el aviso dice cómo apagarlo en el mismo paso"
        );
        assert!(
            notice.contains("Ajustes › Privacidad"),
            "el aviso remite a Ajustes para más tarde"
        );
    }
    #[test]
    fn only_undecided_permissions_use_the_onboarding_proposal() {
        let undecided = choices_from_privacy(Some(Privacy::default()));
        assert!(undecided.crashes);
        assert!(!undecided.usage);
        let saved = choices_from_privacy(Some(Privacy {
            crashes: false,
            crashes_decided: true,
            usage: true,
            usage_decided: true,
            generation: 4,
        }));
        assert!(!saved.crashes);
        assert!(saved.usage);
    }
    #[test]
    fn consent_saves_the_two_decisions_of_the_privacy_step() {
        let current = Privacy {
            generation: 7,
            ..Privacy::default()
        };
        assert_eq!(
            consent_privacy(current, true, true),
            Privacy {
                generation: 7,
                crashes: true,
                usage: true,
                crashes_decided: true,
                usage_decided: true,
            }
        );
        // Apagar fallos en el asistente se guarda tal cual: no se vuelve a encender.
        assert_eq!(
            consent_privacy(current, false, false),
            Privacy {
                generation: 7,
                crashes: false,
                usage: false,
                crashes_decided: true,
                usage_decided: true,
            }
        );
        // Lo guardado refleja los interruptores, aunque hubiera una decisión previa.
        let legacy = Privacy {
            generation: 3,
            crashes: false,
            usage: true,
            crashes_decided: true,
            usage_decided: false,
        };
        assert_eq!(
            consent_privacy(legacy, true, true),
            Privacy {
                generation: 3,
                crashes: true,
                usage: true,
                crashes_decided: true,
                usage_decided: true,
            }
        );
    }
    #[test]
    fn the_unsaved_exit_turns_crash_reports_off_even_when_the_step_offered_them_on() {
        let choices = Choices::default();
        let chosen = consent_privacy(Privacy::default(), choices.usage, choices.crashes);
        assert!(chosen.crashes, "el paso llegó con fallos encendidos");
        let entered = most_private(chosen);
        assert!(!entered.crashes && entered.crashes_decided);
        assert!(!entered.usage && entered.usage_decided);
        assert_eq!(entered.generation, chosen.generation);
    }
}
