//! Configuración local de apariencia; escritura atómica con detección de conflictos.
use super::{Hub, State};
use crate::orbit::theme::{self, AppearanceSettings, InterfaceFont, MonoFont};
use gpui::{Context, Window};

/// Versión de las claves: Vantare = grafito, Classic = carmín desde el feedback 7.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredAppearance {
    pub palette_version: u8,
    #[serde(flatten)]
    pub settings: AppearanceSettings,
}

pub(super) fn read_settings(value: &serde_json::Value) -> Result<AppearanceSettings, vantare_ipc::files::Error> {
    vantare_ipc::files::future_version(value, "paletteVersion", 1)?;
    let legacy = value.get("paletteVersion").is_none();
    let mut settings: AppearanceSettings = serde_json::from_value(value.clone())
        .map_err(|error| vantare_ipc::files::Error::InvalidInput(format!("leer apariencia: {error}")))?;
    if legacy && value.get("palette").is_some() {
        settings.palette = match settings.palette {
            theme::Palette::Vantare => theme::Palette::Classic,
            theme::Palette::Classic => theme::Palette::Vantare,
            other => other,
        };
    }
    settings.contrast = settings.contrast.clamp(80, 120);
    settings.glass_opacity = settings.glass_opacity.clamp(50,100);
    Ok(settings)
}

pub(super) fn wire(state: &State, window: &Window, cx: &mut Context<Hub>) {
    cx.subscribe_in(
        &state.quick_theme,
        window,
        |hub, _, event: &crate::orbit::ChoiceChanged, window, cx| {
            hub.settings_palette(event.0, window, cx);
        },
    )
    .detach();
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
            let mut settings = hub.settings.store.value.appearance;
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
            let mut settings = hub.settings.store.value.appearance;
            settings.mono_font = font;
            hub.settings_appearance_apply(settings, window, cx);
        },
    )
    .detach();
}
impl Hub {
    pub(crate) fn settings_zoom_restore(&mut self, window: &Window) {
        if let Err(error) = vantare_ui::set_window_zoom(window, self.settings.store.value.zoom) {
            self.settings.status = Some(error);
        }
    }
    pub(crate) fn settings_zoom_change(
        &mut self,
        direction: i8,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let percent = zoom_step_limited(
            self.settings.store.value.zoom,
            direction,
            vantare_ui::window_zoom_limit(window).max(90.0),
        );
        if percent == self.settings.store.value.zoom {
            return;
        }
        self.settings.status = match self.settings.store.save_zoom(percent) {
            Ok(()) => vantare_ui::set_window_zoom(window, percent).err(),
            Err(error) => Some(error),
        };
        cx.notify();
    }
    pub(in crate::shell) fn settings_appearance_apply(
        &mut self,
        settings: AppearanceSettings,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings.appearance_preview = [None, None];
        match self.settings.store.save_appearance(settings) {
            Ok(()) => {
                theme::apply(self.settings.store.value.appearance, window.appearance(), cx);
                self.settings.status = self.settings.store.mirror_warning.clone();
            }
            Err(error) => self.settings.status = Some(error),
        }
        // Si falla el disco, los selectores vuelven a la configuración aplicada.
        let saved = self.settings.store.value.appearance;
        self.settings.quick_theme.update(cx, |choice, cx| {
            choice.state.selected = theme::Palette::ALL
                .iter()
                .position(|palette| *palette == saved.palette);
            cx.notify();
        });
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
    pub(super) fn settings_scheme(
        &mut self,
        scheme: theme::Scheme,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut settings = self.settings.store.value.appearance;
        settings.scheme = scheme;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_palette(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(palette) = theme::Palette::ALL.get(index).copied() else {
            return;
        };
        let mut settings = self.settings.store.value.appearance;
        settings.palette = palette;
        self.settings_appearance_apply(settings, window, cx);
    }
    pub(super) fn settings_slider_pointer(
        &mut self,
        index: usize,
        x: gpui::Pixels,
        cx: &mut Context<Self>,
    ) {
        let Some(bounds) = self.settings.appearance_bounds[index] else {
            return;
        };
        let value = slider_pointer_value(index, f32::from(x - bounds.left()));
        if self.settings.appearance_preview[index] != Some(value) {
            self.settings.appearance_preview[index] = Some(value);
            cx.notify();
        }
    }
    pub(super) fn settings_slider_release(
        &mut self,
        index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings.appearance_dragging[index] = false;
        if let Some(value) = self.settings.appearance_preview[index].take() {
            self.settings_slider_value(index, value, window, cx);
            cx.notify();
        }
    }
    pub(super) fn settings_slider_value(
        &mut self,
        index: usize,
        value: u8,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut settings = self.settings.store.value.appearance;
        if index == 0 {
            settings.contrast = value;
        } else {
            settings.glass_opacity = value;
        }
        if settings != self.settings.store.value.appearance {
            self.settings_appearance_apply(settings, window, cx);
        }
    }
}

fn slider_pointer_value(index: usize, offset: f32) -> u8 {
    use crate::orbit::{APPEARANCE_THUMB_SIZE, APPEARANCE_TRACK_WIDTH, APPEARANCE_VALUE_OFFSET};
    let fraction = ((offset - APPEARANCE_VALUE_OFFSET - APPEARANCE_THUMB_SIZE / 2.0)
        / (APPEARANCE_TRACK_WIDTH - APPEARANCE_THUMB_SIZE))
        .clamp(0.0, 1.0);
    let (min, span) = if index == 0 {
        (80.0, 40.0)
    } else {
        (50.0, 50.0)
    };
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    // 50..120, redondeo al entero mas cercano.
    let value = (min + span * fraction).round() as u8;
    value
}

fn zoom_step_limited(percent: u16, direction: i8, limit: f32) -> u16 {
    let values = [90, 100, 110, 125];
    match direction {
        -1 => values
            .into_iter()
            .rev()
            .find(|value| f32::from(*value) < f32::from(percent).min(limit))
            .unwrap_or(90),
        1 => values
            .into_iter()
            .find(|value| *value > percent && f32::from(*value) <= limit + 0.001)
            .unwrap_or(percent),
        _ => 100,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pointer_reaches_both_limits_at_the_thumb_centres_and_beyond() {
        for (index, min, max) in [(0, 80, 120), (1, 50, 100)] {
            assert_eq!(slider_pointer_value(index, 64.0), min);
            assert_eq!(slider_pointer_value(index, 226.0), max);
            assert_eq!(slider_pointer_value(index, 233.0), max);
            assert_eq!(slider_pointer_value(index, 0.0), min);
        }
        assert_eq!(slider_pointer_value(0, 223.0), 119);
        assert_eq!(slider_pointer_value(0, 225.0), 120);
    }
    #[test]
    fn zoom_steps_respect_the_window_limit() {
        assert_eq!(zoom_step_limited(90,-1,125.0),90);
        assert_eq!(zoom_step_limited(125,1,125.0),125);
        assert_eq!(zoom_step_limited(100,1,125.0),110);
        assert_eq!(zoom_step_limited(110,-1,125.0),100);
        assert_eq!(zoom_step_limited(125,0,125.0),100);
        assert_eq!(zoom_step_limited(110,1,112.5),110);
        assert_eq!(zoom_step_limited(125,1,112.5),125);
        assert_eq!(zoom_step_limited(125,-1,112.5),110);
        assert_eq!(zoom_step_limited(90,1,90.0),90);
    }
}
