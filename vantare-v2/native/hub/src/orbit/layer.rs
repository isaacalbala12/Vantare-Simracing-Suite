//! Capa modal/popover: contenido y acciones pertenecen al consumidor.
use super::{
    GUTTER, MENU_Z, MODAL_Z, PALETTE_W, POPOVER_MAX_H, POPOVER_W, palette_backdrop, state,
};
use gpui::{
    AnyView, Context, EventEmitter, FocusHandle, IntoElement, Render, Window, anchored, deferred,
    div, prelude::*, px, rgba,
};
#[derive(Clone, Copy, Debug)]
pub enum LayerKind {
    Modal,
    Popover(gpui::Point<gpui::Pixels>),
}
#[derive(Clone, Copy, Debug)]
pub struct Dismissed;
pub struct Layer {
    pub open: bool,
    kind: LayerKind,
    label: &'static str,
    content: AnyView,
    focus: FocusHandle,
    targets: Vec<FocusHandle>,
    restore: Option<FocusHandle>,
    popover_size: Option<(f32, f32)>,
}
impl EventEmitter<Dismissed> for Layer {}
/// Solo los popovers usan el ajuste de cristal. Choice y los diálogos
/// modales conservan su superficie opaca para separar su contenido del fondo.
fn panel_ramp(theme: &super::theme::Theme, modal: bool) -> super::skin::Ramp {
    let opacity = if modal { 255 } else { theme.panel_bg & 255 };
    super::skin::Ramp {
        from: (theme.skin.neo.from << 8) | opacity,
        to: (theme.skin.neo.to << 8) | opacity,
        end: theme.skin.neo.end,
    }
}
impl Layer {
    /// `targets`: controles habilitados en orden de Tab; actualizar si cambia el contenido.
    pub fn new(
        label: &'static str,
        kind: LayerKind,
        content: AnyView,
        targets: Vec<FocusHandle>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        cx.on_focus_out(&focus, window, |this, _, window, cx| {
            if this.open {
                this.targets
                    .first()
                    .unwrap_or(&this.focus)
                    .focus(window, cx);
            }
        })
        .detach();
        Self {
            open: false,
            kind,
            label,
            content,
            focus,
            targets,
            restore: None,
            popover_size: None,
        }
    }
    pub fn show(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            self.restore = window.focused(cx);
        }
        self.open = true;
        self.focus.focus(window, cx);
        cx.notify();
    }
    /// Mantiene el popover unido a su control tras un cambio de layout.
    pub fn set_popover_position(
        &mut self,
        position: gpui::Point<gpui::Pixels>,
        cx: &mut Context<Self>,
    ) {
        if let LayerKind::Popover(current) = &mut self.kind
            && *current != position
        {
            *current = position;
            cx.notify();
        }
    }

    pub fn set_targets(&mut self, targets: Vec<FocusHandle>) {
        self.targets = targets;
    }
    /// Geometría del consumidor; el valor por defecto conserva los demás popovers.
    #[must_use]
    pub fn with_popover_size(mut self, width: f32, max_height: f32) -> Self {
        self.popover_size = Some((width.max(1.0), max_height.max(1.0)));
        self
    }
    pub fn dismiss(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.open {
            return;
        }
        self.open = false;
        if let Some(restore) = self.restore.take() {
            restore.focus(window, cx);
        }
        cx.emit(Dismissed);
        cx.notify();
    }
    fn key(&mut self, event: &gpui::KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        match event.keystroke.key.as_str() {
            "escape" => self.dismiss(window, cx),
            "tab" => {
                let current = self
                    .targets
                    .iter()
                    .position(|f| f.contains_focused(window, cx));
                if let Some(index) =
                    state::focus_step(current, self.targets.len(), event.keystroke.modifiers.shift)
                {
                    self.targets[index].focus(window, cx);
                } else {
                    self.focus.focus(window, cx);
                }
            }
            _ => return,
        }
        cx.stop_propagation();
    }
}
impl Render for Layer {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let root = div().id("orbit-layer");
        if !self.open {
            return root.into_any_element();
        }
        let modal = matches!(self.kind, LayerKind::Modal);
        let panel = div()
            .id("layer-panel")
            .role(gpui::Role::Dialog)
            .aria_label(self.label)
            .track_focus(&self.focus.clone().tab_stop(false))
            .tab_index(0)
            .tab_stop(false)
            .tab_group()
            .w(px(if modal {
                PALETTE_W
            } else {
                self.popover_size.map_or(POPOVER_W, |size| size.0)
            }))
            .max_w_full()
            .max_h_full()
            .when(!modal, |s| {
                s.max_h(px(self.popover_size.map_or(POPOVER_MAX_H, |size| size.1)))
            })
            .overflow_y_scroll()
            .rounded(px(super::skin(cx).radius.lg))
            // Panel flotante §3: relleno 180° y luz superior; sin desenfoque exterior.
            .bg(super::ramp_alpha(
                panel_ramp(cx.global::<super::theme::Theme>(), modal),
                180.0,
            ))
            .shadow(vec![super::kit_shadow(
                super::skin(cx).neo_light,
                1.0,
                0.0,
                0.0,
                true,
            )])
            .border_1()
            .border_color(super::alpha(super::skin(cx).line2))
            .occlude()
            .capture_key_down(cx.listener(Self::key))
            .on_mouse_down_out(cx.listener(|this, _, window, cx| this.dismiss(window, cx)))
            .child(self.content.clone());
        match self.kind {
            LayerKind::Modal => deferred(
                root.absolute()
                    .inset_0()
                    .size_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .p(px(GUTTER))
                    .bg(rgba(palette_backdrop(cx)))
                    .occlude()
                    .child(panel),
            )
            .with_priority(MODAL_Z)
            .into_any_element(),
            LayerKind::Popover(position) => {
                deferred(anchored().position(position).snap_to_window().child(panel))
                    .with_priority(MENU_Z)
                    .into_any_element()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orbit::theme::{AppearanceSettings, Palette, Scheme, resolve_hub};

    #[test]
    fn saved_glass_keeps_choices_opaque_and_changes_notification_backgrounds() {
        for palette in Palette::ALL {
            for scheme in [Scheme::Light, Scheme::Dark] {
                for glass_opacity in [50, 100] {
                    let settings = AppearanceSettings {
                        palette,
                        scheme,
                        glass_opacity,
                        ..Default::default()
                    };
                    let saved =
                        serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
                    let theme = resolve_hub(saved, gpui::WindowAppearance::Dark);
                    let popover = panel_ramp(&theme, false);
                    let expected = u32::from(glass_opacity) * 255 / 100;
                    assert_eq!(super::super::controls::choice_background(&theme) & 255, 255);
                    assert_eq!((popover.from & 255, popover.to & 255), (expected, expected));
                    assert_eq!(
                        (popover.from >> 8, popover.to >> 8),
                        (theme.skin.neo.from, theme.skin.neo.to)
                    );
                    let modal = panel_ramp(&theme, true);
                    assert_eq!((modal.from & 255, modal.to & 255), (255, 255));
                }
            }
        }
    }
}
