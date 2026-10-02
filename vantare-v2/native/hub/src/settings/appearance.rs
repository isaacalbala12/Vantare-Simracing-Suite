//! Configuración local de apariencia; escritura atómica con detección de conflictos.
use super::{Hub, State};
use crate::orbit::theme::{self, AppearanceSettings, InterfaceFont, MonoFont, Scheme};
use gpui::{Context, Window};
use std::path::PathBuf;

pub(crate) struct Store {
    pub settings: AppearanceSettings,
    path: PathBuf,
    observed: Option<Vec<u8>>,
}
impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let observed = match std::fs::metadata(&path) {
            Ok(_) => Some(crate::files::read(&path, 16 * 1024)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(format!("inspeccionar apariencia: {error}")),
        };
        let mut settings: AppearanceSettings = observed.as_deref().map_or_else(
            || Ok(AppearanceSettings::default()),
            |bytes| {
                serde_json::from_slice(bytes).map_err(|error| format!("leer apariencia: {error}"))
            },
        )?;
        settings.contrast = settings.contrast.clamp(80, 120);
        settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
        Ok(Self {
            settings,
            path,
            observed,
        })
    }
    pub fn save(&mut self, mut settings: AppearanceSettings) -> Result<(), String> {
        settings.contrast = settings.contrast.clamp(80, 120);
        settings.glass_opacity = settings.glass_opacity.clamp(50, 100);
        let bytes = serde_json::to_vec_pretty(&settings)
            .map_err(|error| format!("serializar apariencia: {error}"))?;
        crate::files::save(&self.path, &bytes, self.observed.as_deref())?;
        self.observed = Some(bytes);
        self.settings = settings;
        Ok(())
    }
}

pub(super) fn wire(state: &State, window: &Window, cx: &mut Context<Hub>) {
    cx.subscribe_in(
        &state.font,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            let Some(font) = [
                InterfaceFont::Inter,
                InterfaceFont::Segoe,
                InterfaceFont::Arial,
            ]
            .get(event.0)
            .copied() else {
                return;
            };
            let mut settings = hub.settings.appearance.settings;
            settings.interface_font = font;
            hub.settings_appearance_apply(settings, window, cx);
        },
    )
    .detach();
    cx.subscribe_in(
        &state.mono,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            let Some(font) = [MonoFont::Cascadia, MonoFont::Consolas, MonoFont::Courier]
                .get(event.0)
                .copied()
            else {
                return;
            };
            let mut settings = hub.settings.appearance.settings;
            settings.mono_font = font;
            hub.settings_appearance_apply(settings, window, cx);
        },
    )
    .detach();
}
impl Hub {
    pub(super) fn settings_appearance_apply(
        &mut self,
        settings: AppearanceSettings,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match self.settings.appearance.save(settings) {
            Ok(()) => {
                theme::apply(self.settings.appearance.settings, window.appearance(), cx);
                self.settings.status = None;
            }
            Err(error) => self.settings.status = Some(error),
        }
        // Si falla el disco, los selectores vuelven a la configuración aplicada.
        let saved = self.settings.appearance.settings;
        self.settings.font.update(cx, |choice, cx| {
            choice.state.selected = Some(saved.interface_font as usize);
            cx.notify();
        });
        self.settings.mono.update(cx, |choice, cx| {
            choice.state.selected = Some(saved.mono_font as usize);
            cx.notify();
        });
        cx.notify();
    }
}

impl Hub {
    pub(super) fn settings_palette(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        use theme::Palette;
        let Some(palette) = [
            Palette::Vantare,
            Palette::Rose,
            Palette::Grove,
            Palette::Ocean,
            Palette::Ember,
            Palette::Iris,
            Palette::Mono,
        ]
        .get(index)
        .copied() else {
            return;
        };
        let mut settings = self.settings.appearance.settings;
        settings.palette = palette;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_scheme(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(scheme) = [Scheme::System, Scheme::Light, Scheme::Dark]
            .get(index)
            .copied()
        else {
            return;
        };
        let mut settings = self.settings.appearance.settings;
        settings.scheme = scheme;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_slider_pointer(
        &mut self,
        index: usize,
        x: gpui::Pixels,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(bounds) = self.settings.appearance_bounds[index] else {
            return;
        };
        // La fila reserva 45 px para el valor + 12 px de separación; pista 128 px.
        let fraction = ((f32::from(x - bounds.left()) - 57.0) / 128.0).clamp(0.0, 1.0);
        let (min, span) = if index == 0 {
            (80.0, 40.0)
        } else {
            (50.0, 50.0)
        };
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        // rango acotado a 50..120.
        let value = (min + span * fraction).round() as u8;
        self.settings_slider_value(index, value, window, cx);
    }
    pub(super) fn settings_slider_value(
        &mut self,
        index: usize,
        value: u8,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut settings = self.settings.appearance.settings;
        if index == 0 {
            settings.contrast = value;
        } else {
            settings.glass_opacity = value;
        }
        if settings != self.settings.appearance.settings {
            self.settings_appearance_apply(settings, window, cx);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("reloj")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "vantare-appearance-{label}-{}-{nonce}",
            std::process::id()
        ))
    }
    #[test]
    fn persists_all_preferences_and_keeps_the_last_applied_values_on_conflict() {
        let dir = directory("persist");
        let path = dir.join("appearance.json");
        let mut first = Store::load(path.clone()).expect("defaults");
        assert_eq!(first.settings.scheme, Scheme::Dark);
        let mut other = Store::load(path.clone()).expect("second reader");
        let settings = AppearanceSettings {
            palette: theme::Palette::Ocean,
            scheme: Scheme::System,
            contrast: 115,
            glass_opacity: 65,
            interface_font: InterfaceFont::Arial,
            mono_font: MonoFont::Consolas,
        };
        first.save(settings).expect("guardar");
        assert_eq!(Store::load(path).expect("reinicio").settings, settings);
        let previous = other.settings;
        assert!(other.save(settings).is_err());
        assert_eq!(other.settings, previous);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
    #[test]
    fn rejects_invalid_or_oversized_data_and_clamps_numeric_preferences() {
        let dir = directory("bounds");
        std::fs::create_dir_all(&dir).expect("directorio");
        let path = dir.join("appearance.json");
        std::fs::write(&path, b"no JSON").expect("corrupt");
        assert!(Store::load(path.clone()).is_err());
        std::fs::write(&path, vec![b' '; 16 * 1024 + 1]).expect("large");
        assert!(Store::load(path.clone()).is_err());
        std::fs::remove_file(&path).expect("remove fixture");
        let mut store = Store::load(path.clone()).expect("defaults");
        store
            .save(AppearanceSettings {
                contrast: 255,
                glass_opacity: 0,
                ..AppearanceSettings::default()
            })
            .expect("clamp");
        let loaded = Store::load(path).expect("reload").settings;
        assert_eq!(loaded.contrast, 120);
        assert_eq!(loaded.glass_opacity, 50);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
}
