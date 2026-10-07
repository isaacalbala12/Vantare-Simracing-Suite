//! Ajustes compone Orbit; únicamente escribe preferencias con contrato nativo.
use super::Hub;
use crate::{
    orbit,
    testing::diagnostic::{Diagnostic, Module, Observed, SectionError},
};
use gpui::{Context, Entity, FocusHandle, Window, prelude::*};
use orbit::{Choice, ChoiceChanged, ChoiceKind, Input, OptionItem};
use std::{path::PathBuf, time::Instant};
use vantare_domain::format::{Language, Preferences, Units};

pub(super) mod appearance;
mod privacy;
mod releases;
#[cfg(test)]
mod tests;
mod text_rendering;
mod updates;
mod view;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Page {
    #[default]
    Application,
    Appearance,
    Performance,
    Updates,
    Hotkeys,
    Privacy,
    Diagnostics,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    PrepareDiagnostic,
    CopyDiagnostic,
}
impl Page {
    const ALL: [Self; 7] = [
        Self::Application,
        Self::Appearance,
        Self::Performance,
        Self::Hotkeys,
        Self::Updates,
        Self::Privacy,
        Self::Diagnostics,
    ];
    fn label(self) -> &'static str {
        match self {
            Self::Application => "General",
            Self::Appearance => "Apariencia",
            Self::Performance => "Rendimiento en pista",
            Self::Updates => "Actualizaciones",
            Self::Hotkeys => "Atajos",
            Self::Privacy => "Privacidad",
            Self::Diagnostics => "Diagnóstico",
        }
    }
    fn subtitle(self) -> &'static str {
        match self {
            Self::Application => "Interfaz y sistema",
            Self::Appearance => "Colores, contraste y fuentes",
            Self::Performance => "Así funcionarán los niveles",
            Self::Updates => "Versión, canal y novedades",
            Self::Hotkeys => "Combinaciones globales",
            Self::Privacy => "Fallos, uso y contribución",
            Self::Diagnostics => "Fuentes, datos y registros",
        }
    }
    fn title(self) -> &'static str {
        if self == Self::Privacy {
            "Privacidad y contribución"
        } else {
            self.label()
        }
    }
    fn description(self) -> &'static str {
        match self {
            Self::Application => "Interfaz, sistema y comportamiento de la ventana.",
            Self::Appearance => "Personaliza colores, contraste y tipografía de Vantare.",
            Self::Performance => "Así funcionarán los niveles",
            Self::Updates => "Versión instalada, canal y novedades.",
            Self::Hotkeys => "Atajos del Hub y combinaciones en pista disponibles próximamente.",
            Self::Privacy => "Elige qué informes y datos de uso puede enviar Vantare.",
            Self::Diagnostics => "Estado de las fuentes, datos locales y registros.",
        }
    }
    fn matches(self, query: &str) -> bool {
        let titles = match self {
            Self::Application => {
                "aplicación zoom idioma densidad inicio windows minimizado avisos notificaciones widgets unidades métrico imperial"
            }
            Self::Appearance => {
                "paleta grafito carmín harness noche le mans piedra cálida contraste opacidad cristal fuentes animaciones"
            }
            Self::Performance => {
                "máximo alto equilibrado ahorro mínimo personalizado automático cadencia widgets hz coste"
            }
            Self::Updates => "versión instalada canal novedades stable testers nightly rollback",
            Self::Hotkeys => {
                "toggle overlay siguiente perfil anterior cambiar referencia delta combinaciones"
            }
            Self::Privacy => {
                "fallos uso diagnóstico posthog consentimiento contribución cola strategy envíos borrado remoto"
            }
            Self::Diagnostics => {
                "telemetry core overlay cpu memoria datos registros fuentes eventos informe"
            }
        };
        search_text(&format!("{} {} {titles}", self.label(), self.subtitle()))
            .contains(&search_text(query))
    }
}

pub(super) struct State {
    privacy: Result<privacy::Store, String>,
    privacy_focus: [FocusHandle; 2],
    pub(super) appearance: appearance::Store,
    appearance_focus: [FocusHandle; 12],
    appearance_bounds: [Option<gpui::Bounds<gpui::Pixels>>; 2],
    appearance_dragging: [bool; 2],
    page: Page,
    pub(super) panel_scroll: gpui::ScrollHandle,
    panel_height: f32,
    nav_focus: Vec<FocusHandle>,
    action_focus: [FocusHandle; 4],
    query: Entity<Input>,
    language: Entity<Choice>,
    units: Entity<Choice>,
    hub_language: Entity<Choice>,
    density: Entity<Choice>,
    font: Entity<Choice>,
    mono: Entity<Choice>,
    event_filter: Entity<Choice>,
    event_query: Entity<Input>,
    data: PathBuf,
    diagnostic: Option<Diagnostic>,
    busy: bool,
    status: Option<String>,
    update: updates::LocalUpdate,
    update_busy: bool,
    beta_status: Option<updates::BetaStatus>,
    beta_checked: Instant,
}

fn choice(
    label: &'static str,
    kind: ChoiceKind,
    labels: &[&str],
    selected: Option<usize>,
    enabled: bool,
    window: &mut Window,
    cx: &mut Context<Hub>,
) -> Entity<Choice> {
    cx.new(|cx| {
        let mut choice = Choice::new(
            label,
            kind,
            labels.iter().map(|label| OptionItem::new(*label)).collect(),
            selected,
            window,
            cx,
        );
        choice.set_enabled(enabled, cx);
        if matches!(label, "Fuente de interfaz" | "Fuente monoespaciada") {
            choice.reference_trigger();
        }
        choice
    })
}
fn language(index: usize) -> Option<Language> {
    [Language::Es, Language::En].get(index).copied()
}
fn units(index: usize) -> Option<Units> {
    [Units::Metric, Units::Imperial].get(index).copied()
}

impl State {
    pub(super) fn select_demo_page(&mut self, page: crate::demo::CaptureSettingsPage) {
        self.privacy = privacy::Store::load(&self.data);
        self.page = match page {
            crate::demo::CaptureSettingsPage::Application => Page::Application,
            crate::demo::CaptureSettingsPage::Appearance => Page::Appearance,
            crate::demo::CaptureSettingsPage::Performance => Page::Performance,
            crate::demo::CaptureSettingsPage::Updates => Page::Updates,
            crate::demo::CaptureSettingsPage::Hotkeys => Page::Hotkeys,
            crate::demo::CaptureSettingsPage::Privacy => Page::Privacy,
            crate::demo::CaptureSettingsPage::Diagnostics => Page::Diagnostics,
        };
    }

    fn format_controls(
        prefs: Preferences,
        window: &mut Window,
        cx: &mut Context<Hub>,
    ) -> (Entity<Choice>, Entity<Choice>) {
        let language = choice(
            "Idioma de los widgets",
            ChoiceKind::Dropdown,
            &["Español", "English"],
            Some(usize::from(prefs.language == Language::En)),
            true,
            window,
            cx,
        );
        let units = choice(
            "Unidades de los widgets",
            ChoiceKind::Dropdown,
            &["Métrico", "Imperial"],
            Some(usize::from(prefs.units == Units::Imperial)),
            true,
            window,
            cx,
        );
        cx.subscribe(&language, |this, _, event: &ChoiceChanged, cx| {
            if let Some(language) = self::language(event.0) {
                let mut prefs = this.studio.read(cx).preferences();
                prefs.language = language;
                this.settings_preferences(prefs, cx);
            }
        })
        .detach();
        cx.subscribe(&units, |this, _, event: &ChoiceChanged, cx| {
            if let Some(units) = self::units(event.0) {
                let mut prefs = this.studio.read(cx).preferences();
                prefs.units = units;
                this.settings_preferences(prefs, cx);
            }
        })
        .detach();
        (language, units)
    }

    fn diagnostic_controls(
        window: &mut Window,
        cx: &mut Context<Hub>,
    ) -> (Entity<Choice>, Entity<Input>) {
        let event_query = cx.new(|cx| Input::new(String::new(), "Buscar eventos…", cx));
        cx.observe(&event_query, |_, _, cx| cx.notify()).detach();
        let event_filter = choice(
            "Filtrar eventos",
            ChoiceKind::Segmented,
            &["Todos", "Info", "Aviso", "Error"],
            Some(0),
            true,
            window,
            cx,
        );
        cx.observe(&event_filter, |_, _, cx| cx.notify()).detach();
        (event_filter, event_query)
    }
    pub(super) fn new(
        prefs: Preferences,
        appearance: appearance::Store,
        data: PathBuf,
        window: &mut Window,
        cx: &mut Context<Hub>,
    ) -> Self {
        // Licencias conserva su destino público, dentro de Cuenta en la beta.
        cx.observe_self(Hub::settings_account_destination).detach();
        let hub = cx.entity();
        cx.defer(move |cx| hub.update(cx, Hub::settings_account_destination));
        cx.observe_window_bounds(window, |this, window, cx| {
            this.settings.panel_height = panel_height(f32::from(window.viewport_size().height));
            cx.notify();
        })
        .detach();
        let appearance_settings = appearance.settings;
        let (language, units) = Self::format_controls(prefs, window, cx);
        let query = cx.new(|cx| Input::new(String::new(), "Buscar ajustes…", cx));
        cx.observe(&query, |_, _, cx| cx.notify()).detach();
        let (event_filter, event_query) = Self::diagnostic_controls(window, cx);
        let state = Self {
            privacy: vantare_services::diagnostics::data_root()
                .map_err(|error| error.to_string())
                .and_then(|root| privacy::Store::load(&root)),
            privacy_focus: std::array::from_fn(|_| cx.focus_handle()),
            page: Page::default(),
            panel_scroll: gpui::ScrollHandle::new(),
            panel_height: panel_height(f32::from(window.viewport_size().height)),
            nav_focus: (0..Page::ALL.len()).map(|_| cx.focus_handle()).collect(),
            action_focus: std::array::from_fn(|_| cx.focus_handle()),
            query,
            language,
            units,
            hub_language: choice(
                "Idioma",
                ChoiceKind::Dropdown,
                &["Español", "English"],
                Some(0),
                false,
                window,
                cx,
            ),
            density: choice(
                "Densidad",
                ChoiceKind::Dropdown,
                &["Compacta", "Equilibrada", "Cómoda"],
                Some(1),
                false,
                window,
                cx,
            ),
            font: choice(
                "Fuente de interfaz",
                ChoiceKind::Dropdown,
                &["Inter", "Segoe UI", "Arial"],
                Some(appearance_settings.interface_font as usize),
                true,
                window,
                cx,
            ),
            mono: choice(
                "Fuente monoespaciada",
                ChoiceKind::Dropdown,
                &["Cascadia Code", "Consolas", "Courier New"],
                Some(appearance_settings.mono_font as usize),
                true,
                window,
                cx,
            ),
            appearance,
            appearance_focus: std::array::from_fn(|_| cx.focus_handle()),
            appearance_bounds: [None, None],
            appearance_dragging: [false, false],
            event_filter,
            event_query,
            data,
            diagnostic: None,
            busy: false,
            status: None,
            update: updates::LocalUpdate::default(),
            update_busy: false,
            beta_status: None,
            beta_checked: Instant::now(),
        };
        appearance::wire(&state, window, cx);
        state
    }
}
// Topbar 52 + márgenes/cabecera 108 del layout beta; usado por las novedades.
fn panel_height(viewport_height: f32) -> f32 {
    (viewport_height - 160.0).max(0.0)
}
fn event_matches(error: &SectionError, filter: usize, query: &str) -> bool {
    matches!(filter, 0 | 3)
        && search_text(&format!(
            "{} {:?} {}",
            error.module.label(),
            error.code,
            error.code.label()
        ))
        .contains(&search_text(query))
}
// Rótulos ES/EN del contrato Wails: búsqueda sin acentos, incluidos los
// acentos combinados, sin añadir una dependencia de normalización Unicode.
fn search_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter_map(|ch| match ch {
            '\u{0300}'..='\u{036f}' => None,
            'á' => Some('a'),
            'é' => Some('e'),
            'í' => Some('i'),
            'ó' => Some('o'),
            'ú' | 'ü' => Some('u'),
            'ñ' => Some('n'),
            _ => Some(ch),
        })
        .collect()
}
impl Hub {
    fn settings_account_destination(&mut self, cx: &mut Context<Self>) {
        if self.section == crate::Section::Licenses {
            self.section = crate::Section::Account;
            cx.notify();
        }
    }

    fn settings_action(&mut self, action: Action, cx: &mut Context<Self>) {
        match action {
            Action::PrepareDiagnostic => self.prepare_settings_diagnostic(cx),
            Action::CopyDiagnostic => {
                if let Some(diagnostic) = &self.settings.diagnostic {
                    match serde_json::to_string_pretty(diagnostic) {
                        Ok(json) => {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(json));
                            self.settings.status =
                                Some("Informe sanitizado copiado al portapapeles local.".into());
                        }
                        Err(_) => {
                            self.settings.status =
                                Some("No se pudo serializar el diagnóstico.".into());
                        }
                    }
                    cx.notify();
                }
            }
        }
    }
    fn settings_preferences(&mut self, prefs: Preferences, cx: &mut Context<Self>) {
        match self.studio.update(cx, |studio, cx| studio.set_preferences(prefs, cx)) {
            Ok(()) => self.settings.status = Some("Formato guardado. Studio y Workshop actualizados; el overlay lo aplicará al recargar el diseño.".into()),
            Err(error) => {
                self.notifications.update(cx, |center, cx| center.report("hub.preferences", error.clone(), cx));
                self.testing.update(cx, |testing, _| testing.observed.error(Module::Hub, &error));
                self.settings.status = Some(error);
            }
        }
        self.sync_settings_preferences(cx);
        cx.notify();
    }
    fn sync_settings_preferences(&self, cx: &mut Context<Self>) {
        let prefs = self.studio.read(cx).preferences();
        for (choice, index) in [
            (
                &self.settings.language,
                usize::from(prefs.language == Language::En),
            ),
            (
                &self.settings.units,
                usize::from(prefs.units == Units::Imperial),
            ),
        ] {
            choice.update(cx, |choice, cx| {
                if choice.state.selected != Some(index) {
                    choice.state.selected = Some(index);
                    choice.state.active = Some(index);
                    cx.notify();
                }
            });
        }
    }
    fn prepare_settings_diagnostic(&mut self, cx: &mut Context<Self>) {
        if self.settings.busy {
            return;
        }
        self.settings.busy = true;
        self.settings.status = None;
        let observed: Observed = self.testing.read(cx).observed.clone();
        let data = self.settings.data.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let exe = std::env::current_exe()
                        .map_err(|_| "No se pudo resolver el binario del Hub.")?;
                    let root = exe
                        .parent()
                        .ok_or("No se pudo resolver el directorio del Hub.")?;
                    Ok::<_, &'static str>(Diagnostic::collect(
                        root,
                        &data,
                        &observed,
                        Instant::now(),
                    ))
                })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.settings.busy = false;
                match result {
                    Ok(diagnostic) => this.settings.diagnostic = Some(diagnostic),
                    Err(error) => this.settings.status = Some(error.into()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn cancel_beta_restart(&mut self) {
        if let Err(error) = updates::cancel_restart() {
            self.settings.status = Some(error);
        }
    }
    pub(super) fn poll_beta_update(&mut self, cx: &mut Context<Self>) {
        if self.capture.is_some()
            || self.demo.is_some()
            || self.settings.beta_checked.elapsed().as_secs() < 2
        {
            return;
        }
        self.settings.beta_checked = Instant::now();
        let status = updates::beta_status();
        if status != self.settings.beta_status {
            if let Some(status) = &status
                && status.state == "ready"
            {
                self.notifications.update(cx, |center, cx| {
                    center.update_ready(status.message.clone(), cx);
                });
            }
            self.settings.beta_status = status;
            cx.notify();
        }
    }
    fn refresh_settings_update(&mut self, cx: &mut Context<Self>) {
        if self.settings.update_busy {
            return;
        }
        self.settings.update_busy = true;
        cx.spawn(async move |this, cx| {
            let update = cx
                .background_executor()
                .spawn(async { updates::LocalUpdate::current() })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.settings.update = update;
                this.settings.update_busy = false;
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    fn select_settings_page(&mut self, page: Page, cx: &mut Context<Self>) {
        self.settings.page = page;
        self.settings.panel_scroll = gpui::ScrollHandle::new();
        self.settings.status = None;
        if page == Page::Updates {
            self.refresh_settings_update(cx);
        }
        cx.notify();
    }
}
