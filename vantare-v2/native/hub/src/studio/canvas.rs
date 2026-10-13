#[cfg(feature = "parity-capture")]
use super::catalog::demo_content_scale;
use super::*;

/// Un paso inmediato, pausa inicial y repetición a 1/4/8 px cada 30 ms.
pub(super) fn held_nudge_distance(elapsed: Duration, shift: bool) -> f32 {
    let ticks = elapsed.as_millis().saturating_sub(300) / 30;
    let pixels =
        1 + ticks.min(20) + ticks.saturating_sub(20).min(30) * 4 + ticks.saturating_sub(50) * 8;
    #[allow(clippy::cast_precision_loss)] // Acotado al límite de coordenadas del documento.
    let distance = pixels.min(100_000) as f32;
    distance * if shift { 8.0 } else { 1.0 }
}

pub(super) struct HeldNudge {
    pub(super) frame: Entity<CanvasFrame>,
    pub(super) origin: (f32, f32),
    pub(super) direction: (i8, i8),
    pub(super) shift: bool,
    pub(super) started: Instant,
}

pub(super) fn keyboard_nudge(key: &gpui::Keystroke) -> Option<((i8, i8), bool)> {
    if key.modifiers.control
        || key.modifiers.platform
        || key.modifiers.alt
        || key.modifiers.function
    {
        return None;
    }
    let direction = match key.key.as_str() {
        "left" => (-1, 0),
        "right" => (1, 0),
        "up" => (0, -1),
        "down" => (0, 1),
        _ => return None,
    };
    Some((direction, key.modifiers.shift))
}

pub(super) const CANVAS_PRESETS: [CanvasResolution; 6] = [
    CanvasResolution {
        width: 1920.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 2520.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 1920.0,
        height: 1200.0,
    },
    CanvasResolution {
        width: 3840.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 2560.0,
        height: 1440.0,
    },
    CanvasResolution {
        width: 3840.0,
        height: 2160.0,
    },
];

pub(super) fn fitted_scale(width: f32, height: f32, resolution: CanvasResolution) -> Option<f32> {
    if !width.is_finite() || !height.is_finite() || !resolution.valid() {
        return None;
    }
    let scale = (width / resolution.width).min(height / resolution.height);
    (scale > 0.0).then_some(scale)
}

/// El zoom mayor que el viewport comienza en su origen para poder desplazarse.
pub(super) fn preview_origin(
    width: f32,
    height: f32,
    scale: f32,
    resolution: CanvasResolution,
) -> (f32, f32) {
    (
        ((width - resolution.width * scale) / 2.0).max(0.0),
        ((height - resolution.height * scale) / 2.0).max(0.0),
    )
}

pub(super) fn selection_caption_top(client_y: f32, scale: f32) -> f32 {
    (-22.0_f32).max(-client_y * scale)
}

/// El documento conserva posiciones globales; el lienzo muestra el monitor de sus overlays.
pub(super) fn overlay_monitor(
    layout: &Layout,
    displays: &[(f32, f32, f32, f32)],
    fallback: (f32, f32, f32, f32),
) -> (f32, f32, f32, f32) {
    layout
        .instances
        .iter()
        .filter(|item| item.visible)
        .find_map(|item| {
            displays.iter().copied().find(|&(x, y, width, height)| {
                item.x >= x && item.x < x + width && item.y >= y && item.y < y + height
            })
        })
        .unwrap_or(fallback)
}

pub(super) fn client_monitor(layout: &Layout, cx: &gpui::App) -> (f32, f32, f32, f32) {
    let bounds = |bounds: gpui::Bounds<Pixels>| {
        (
            f32::from(bounds.origin.x),
            f32::from(bounds.origin.y),
            f32::from(bounds.size.width),
            f32::from(bounds.size.height),
        )
    };
    let fallback = cx
        .primary_display()
        .as_ref()
        .map_or((0.0, 0.0, 1920.0, 1080.0), |display| {
            bounds(display.bounds())
        });
    overlay_monitor(
        layout,
        &cx.displays()
            .iter()
            .map(|display| bounds(display.bounds()))
            .collect::<Vec<_>>(),
        fallback,
    )
}
pub(super) struct Drag {
    pub(super) pointer: (f32, f32),
    pub(super) origin: (f32, f32),
    pub(super) preview: (f32, f32),
    pub(super) scale: f32,
}
impl Drag {
    pub(super) fn update(&mut self, pointer: (f32, f32)) -> bool {
        if !pointer.0.is_finite()
            || !pointer.1.is_finite()
            || !self.scale.is_finite()
            || self.scale <= 0.0
        {
            return false;
        }
        // El umbral está en píxeles de pantalla: seleccionar con ruido de ratón
        // no debe mover el documento, ni siquiera con el lienzo reducido.
        if self.preview == self.origin
            && (pointer.0 - self.pointer.0).hypot(pointer.1 - self.pointer.1) < 3.0
        {
            return false;
        }
        self.preview = (
            (self.origin.0 + (pointer.0 - self.pointer.0) / self.scale)
                .clamp(-100_000.0, 100_000.0),
            (self.origin.1 + (pointer.1 - self.pointer.1) / self.scale)
                .clamp(-100_000.0, 100_000.0),
        );
        true
    }
}
pub(super) struct Resize {
    pub(super) pointer: (f32, f32),
    pub(super) origin: (f32, f32),
    pub(super) size: vantare_ui::geometry::Size,
    pub(super) preview: ((f32, f32), vantare_ui::geometry::Size),
    pub(super) scale: f32,
    pub(super) handle: vantare_ui::geometry::Handle,
    pub(super) locked: bool,
}
impl Resize {
    fn update(&mut self, pointer: (f32, f32)) -> bool {
        if !self.scale.is_finite() || self.scale <= 0.0 {
            return false;
        }
        let Some(next) = vantare_ui::geometry::resize(
            self.origin,
            self.size,
            self.handle,
            (
                (pointer.0 - self.pointer.0) / self.scale,
                (pointer.1 - self.pointer.1) / self.scale,
            ),
            self.locked,
        ) else {
            return false;
        };
        self.preview = next;
        true
    }
}
struct Started(Point<Pixels>, Option<vantare_ui::geometry::Handle>);
/// En GPUI la preview pertenece a una entidad de marco, no al documento ni al widget.
/// Mover invalida solo esta entidad; Overlay conserva su renderer y su foto durante el gesto.
pub(super) struct CanvasFrame {
    pub(super) item: Instance,
    pub(super) lock: Option<&'static str>,
    pub(super) renderer: Entity<Overlay>,
    pub(super) preview_scale: f32,
    client_origin: (f32, f32),
    pub(super) content_scale: f32,
    pub(super) selected: bool,
    focus: FocusHandle,
    pub(super) drag: Option<Drag>,
    pub(super) resize: Option<Resize>,
    pub(super) opacity_preview: Option<f32>,
    nudge_position: Option<(f32, f32)>,
}
impl EventEmitter<Started> for CanvasFrame {}
impl Render for CanvasFrame {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.element(cx)
    }
}
impl CanvasFrame {
    pub(super) fn element(&mut self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let (x, y) = self
            .drag
            .as_ref()
            .map_or((self.item.x, self.item.y), |drag| drag.preview);
        let (x, y) = self.resize.as_ref().map_or((x, y), |r| r.preview.0);
        let (x, y) = self.nudge_position.unwrap_or((x, y));
        let dimensions = self.renderer.read(cx).painted_size();
        div()
            .id("widget-frame")
            .absolute()
            .left(px((x - self.client_origin.0) * self.preview_scale))
            .top(px((y - self.client_origin.1) * self.preview_scale))
            .w(px(dimensions.0 * self.preview_scale * self.content_scale))
            .h(px(dimensions.1 * self.preview_scale * self.content_scale))
            .when(self.selected, |frame| {
                frame.child(Self::selection_outline(cx))
            })
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    cx.emit(Started(event.position, None));
                    // El lienzo vacío vuelve al catálogo; un widget no.
                    cx.stop_propagation();
                }),
            )
            .when(self.lock.is_none(), |frame| {
                frame.child(
                    div()
                        .size_full()
                        .opacity(self.opacity_preview.unwrap_or(self.item.opacity))
                        .child(self.renderer.clone()),
                )
            })
            .when_some(self.lock, |frame, reason| {
                frame.child(orbit::catalog_placeholder(reason, cx))
            })
            .when(self.selected, |frame| {
                frame
                    .child(
                        text(
                            format!(
                                "{} · {:.0} × {:.0}",
                                self.item.settings.kind().label(),
                                dimensions.0,
                                dimensions.1
                            ),
                            10.0,
                            500,
                            orbit::ink(cx),
                            cx,
                        )
                        .whitespace_nowrap()
                        .line_height(px(14.0))
                        .absolute()
                        .top(px(selection_caption_top(
                            y - self.client_origin.1,
                            self.preview_scale,
                        )))
                        .left_0()
                        .px(px(5.0))
                        .bg(rgb(orbit::carmine(cx))),
                    )
                    .children(self.resize_handles(dimensions, cx))
            })
    }
    /// El borde no participa en la geometría ni hereda la opacidad del contenido.
    pub(super) fn selection_outline(cx: &gpui::App) -> gpui::Div {
        div()
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .border_1()
            .border_color(rgb(orbit::carmine(cx)))
    }
    fn resize_handles(
        &self,
        dimensions: (f32, f32),
        cx: &mut Context<Self>,
    ) -> Vec<gpui::Stateful<gpui::Div>> {
        [
            (-1, -1, 0.0, 0.0),
            (0, -1, 0.5, 0.0),
            (1, -1, 1.0, 0.0),
            (-1, 0, 0.0, 0.5),
            (1, 0, 1.0, 0.5),
            (-1, 1, 0.0, 1.0),
            (0, 1, 0.5, 1.0),
            (1, 1, 1.0, 1.0),
        ]
        .into_iter()
        .enumerate()
        .map(|(index, (hx, hy, x, y))| {
            let handle = vantare_ui::geometry::Handle(hx, hy);
            let cursor = match (hx, hy) {
                (0, _) => gpui::CursorStyle::ResizeUpDown,
                (_, 0) => gpui::CursorStyle::ResizeLeftRight,
                (-1, -1) | (1, 1) => gpui::CursorStyle::ResizeUpLeftDownRight,
                _ => gpui::CursorStyle::ResizeUpRightDownLeft,
            };
            div()
                .id(("studio-resize", index))
                .role(gpui::Role::Button)
                .aria_label(format!(
                    "Redimensionar {} {}",
                    match hx {
                        -1 => "izquierda",
                        1 => "derecha",
                        _ => "centro",
                    },
                    match hy {
                        -1 => "arriba",
                        1 => "abajo",
                        _ => "centro",
                    }
                ))
                .absolute()
                .left(px(dimensions.0
                    * self.preview_scale
                    * self.content_scale
                    * x
                    - 5.0))
                .top(px(dimensions.1
                    * self.preview_scale
                    * self.content_scale
                    * y
                    - 5.0))
                .size(px(10.0))
                .bg(rgb(orbit::carmine(cx)))
                .border_1()
                .border_color(rgb(orbit::ink(cx)))
                .cursor(cursor)
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, event: &gpui::MouseDownEvent, window, cx| {
                        this.focus.focus(window, cx);
                        cx.emit(Started(event.position, Some(handle)));
                        cx.stop_propagation();
                    }),
                )
        })
        .collect()
    }
}
impl Studio {
    pub(super) fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.drag = None;
        self.monitor = client_monitor(self.editor.layout(), cx);
        self.fit_scale = fitted_scale(
            self.canvas_size.0,
            self.canvas_size.1,
            self.canvas_resolution(),
        )
        .unwrap_or(self.fit_scale);
        let previous = std::mem::take(&mut self.frames);
        for item in &self.editor.layout().instances {
            let mut overlay = Overlay::configured(&item.settings, self.preferences());
            overlay.set_frame_size(item.geometry.size);
            #[cfg(feature = "parity-capture")]
            let content_scale = if studio_demo_capture() {
                demo_content_scale(item.settings.kind(), overlay.wanted_size().0)
            } else {
                1.0
            };
            #[cfg(not(feature = "parity-capture"))]
            let content_scale = 1.0;
            if let Err(error) = overlay.set_preview_scale(self.preview_scale() * content_scale) {
                eprintln!("Studio: {error}");
            }
            let kept = previous.iter().find(|(id, frame)| {
                id == &item.id
                    && frame
                        .read(cx)
                        .item
                        .settings
                        .look_change(&item.settings)
                        .is_some()
            });
            let renderer = if let Some((_, frame)) = kept {
                let renderer = frame.read(cx).renderer.clone();
                renderer.update(cx, |overlay, cx| {
                    if let Some(look) = item.settings.look() {
                        overlay.set_look(look);
                    }
                    overlay.set_frame_size(item.geometry.size);
                    cx.notify();
                });
                renderer
            } else {
                cx.new(|cx| {
                    overlay.ingest(&self.settings_snapshot(&item.settings), cx);
                    overlay
                })
            };
            let frame = cx.new(|_| CanvasFrame {
                item: item.clone(),
                lock: widget_lock(self.access, item.settings.kind()),
                renderer,
                preview_scale: self.preview_scale(),
                client_origin: (self.monitor.0, self.monitor.1),
                content_scale,
                focus: self.focus.clone(),
                selected: self.editor.selected.as_ref() == Some(&item.id),
                drag: None,
                resize: None,
                opacity_preview: None,
                nudge_position: None,
            });
            let id = item.id.clone();
            cx.subscribe(&frame, move |this, frame, event: &Started, cx| {
                this.select(id.clone(), cx);
                frame.update(cx, |frame, cx| {
                    if let Some(handle) = event.1 {
                        let painted = frame.renderer.read(cx).painted_size();
                        let size = vantare_ui::geometry::Size {
                            width: painted.0,
                            height: painted.1,
                        };
                        frame.resize = Some(Resize {
                            pointer: (event.0.x.into(), event.0.y.into()),
                            origin: (frame.item.x, frame.item.y),
                            size,
                            preview: ((frame.item.x, frame.item.y), size),
                            scale: frame.preview_scale * frame.content_scale,
                            handle,
                            locked: frame.item.geometry.aspect_locked,
                        });
                    } else {
                        frame.drag = Some(Drag {
                            pointer: (event.0.x.into(), event.0.y.into()),
                            origin: (frame.item.x, frame.item.y),
                            preview: (frame.item.x, frame.item.y),
                            scale: frame.preview_scale,
                        });
                    }
                    cx.notify();
                });
                this.drag = Some(frame);
                cx.notify();
            })
            .detach();
            self.frames.push((item.id.clone(), frame));
        }
        self.sync_size_fields(cx);
        cx.notify();
    }
    pub(super) fn canvas_resolution(&self) -> CanvasResolution {
        self.editor
            .layout()
            .canvas_resolution
            .unwrap_or(CanvasResolution {
                width: self.monitor.2,
                height: self.monitor.3,
            })
    }
    pub(super) fn resolution_values(&self) -> Vec<Option<CanvasResolution>> {
        let mut values = vec![None];
        values.extend(CANVAS_PRESETS.into_iter().map(Some));
        if let Some(current) = self.editor.layout().canvas_resolution
            && !CANVAS_PRESETS.contains(&current)
        {
            values.push(Some(current));
        }
        values
    }
    pub(super) fn set_canvas_resolution(
        &mut self,
        resolution: Option<CanvasResolution>,
        cx: &mut Context<Self>,
    ) {
        self.cancel_drag(cx);
        self.status = self.editor.set_canvas_resolution(resolution);
        self.rebuild(cx);
    }
    pub(super) fn anchored_position(
        &self,
        size: (f32, f32),
        column: u8,
        row: u8,
    ) -> Option<(f32, f32)> {
        inspector::anchored_position(
            size,
            (
                self.canvas_resolution().width,
                self.canvas_resolution().height,
            ),
            column,
            row,
        )
        .map(|(x, y)| (x + self.monitor.0, y + self.monitor.1))
    }
    pub(super) fn preview_scale(&self) -> f32 {
        ZOOM_STEPS[self.zoom_step].map_or(self.fit_scale, |percent| f32::from(percent) / 100.0)
    }

    fn rescale_preview(&mut self, cx: &mut Context<Self>) {
        self.cancel_drag(cx);
        let scale = self.preview_scale();
        for (_, frame) in &self.frames {
            frame.update(cx, |frame, cx| {
                frame.renderer.update(cx, |overlay, cx| {
                    if let Err(error) = overlay.set_preview_scale(scale * frame.content_scale) {
                        eprintln!("Studio: {error}");
                    }
                    cx.notify();
                });
                frame.preview_scale = scale;
                cx.notify();
            });
        }
        cx.notify();
    }

    fn zoom(&mut self, step: usize, cx: &mut Context<Self>) {
        self.zoom_step = step.min(ZOOM_STEPS.len() - 1);
        self.rescale_preview(cx);
    }
    pub(super) fn measure_canvas(&mut self, size: (f32, f32), scale: f32, cx: &mut Context<Self>) {
        if self.canvas_size != size || (self.fit_scale - scale).abs() > 0.000_01 {
            // También el zoom manual pierde su sistema de coordenadas al cambiar el viewport.
            self.cancel_drag(cx);
            self.canvas_size = size;
            self.fit_scale = scale;
            if self.zoom_step == 0 {
                self.rescale_preview(cx);
            } else {
                cx.notify();
            }
        }
    }
    pub(super) fn cancel_drag(&mut self, cx: &mut Context<Self>) {
        self.nudge_task = None;
        if let Some(held) = self.held_nudge.take() {
            held.frame.update(cx, |frame, cx| {
                frame.nudge_position = None;
                cx.notify();
            });
        }
        if let Some((id, _)) = self.opacity_preview.take()
            && let Some((_, frame)) = self.frames.iter().find(|(key, _)| *key == id)
        {
            frame.update(cx, |frame, cx| {
                frame.opacity_preview = None;
                cx.notify();
            });
            self.reset_fields();
            cx.notify();
        }
        if let Some(frame) = self.drag.take() {
            frame.update(cx, |frame, cx| {
                frame.drag = None;
                frame.resize = None;
                frame.renderer.update(cx, |renderer, cx| {
                    renderer.set_frame_size(frame.item.geometry.size);
                    cx.notify();
                });
                cx.notify();
            });
            // Durante el gesto se congelaron todos: restaurar también los no arrastrados.
            for (_, frame) in &self.frames {
                let settings = frame.read(cx).item.settings.clone();
                frame.read(cx).renderer.clone().update(cx, |renderer, cx| {
                    renderer.ingest(&self.settings_snapshot(&settings), cx);
                });
            }
        }
    }
    pub(super) fn preview_opacity(&mut self, id: &str, value: f32, cx: &mut Context<Self>) {
        if self.editor.selected.as_deref() != Some(id) || !value.is_finite() {
            return;
        }
        let value = value.clamp(0.0, 1.0);
        self.opacity_preview = Some((id.to_owned(), value));
        if let Some((_, frame)) = self.frames.iter().find(|(key, _)| key == id) {
            frame.update(cx, |frame, cx| {
                frame.opacity_preview = Some(value);
                cx.notify();
            });
        }
    }
    pub(super) fn finish_opacity(&mut self, cx: &mut Context<Self>) {
        let Some((id, value)) = self.opacity_preview.take() else {
            return;
        };
        if self.editor.selected.as_ref() != Some(&id) {
            self.cancel_drag(cx);
            return;
        }
        self.status = self.editor.edit_selected(|item| item.opacity = value);
        let saved = self.editor.selected().map_or(1.0, |item| item.opacity);
        if let Some((_, frame)) = self.frames.iter().find(|(key, _)| *key == id) {
            frame.update(cx, |frame, cx| {
                frame.item.opacity = saved;
                frame.opacity_preview = None;
                cx.notify();
            });
        }
        if self.status.is_err() {
            self.reset_fields();
        }
        cx.notify();
    }
    pub(super) fn move_drag(&mut self, event: &MouseMoveEvent, cx: &mut Context<Self>) {
        if let Some(frame) = self.drag.clone() {
            if !event.dragging() {
                self.cancel_drag(cx);
                return;
            }
            frame.update(cx, |frame, cx| {
                if let Some(resize) = &mut frame.resize
                    && resize.update((event.position.x.into(), event.position.y.into()))
                {
                    frame.renderer.update(cx, |renderer, cx| {
                        renderer.set_frame_size(Some(resize.preview.1));
                        cx.notify();
                    });
                    cx.notify();
                }
                if let Some(drag) = &mut frame.drag
                    && drag.update((event.position.x.into(), event.position.y.into()))
                {
                    cx.notify();
                }
            });
        }
    }
    pub(super) fn finish_drag(&mut self, pointer: Point<Pixels>, cx: &mut Context<Self>) {
        // Soltar fuera del lienzo descarta la silueta del catálogo (on_drop va antes).
        if self.ghost.take().is_some() {
            cx.notify();
        }
        let Some(frame) = self.drag.take() else {
            return;
        };
        let next = frame.update(cx, |frame, cx| {
            cx.notify();
            if let Some(mut resize) = frame.resize.take() {
                let changed = resize.update((pointer.x.into(), pointer.y.into()))
                    && resize.preview != (resize.origin, resize.size);
                changed.then_some((
                    frame.item.id.clone(),
                    resize.preview.0,
                    Some(resize.preview.1),
                ))
            } else {
                let mut drag = frame.drag.take()?;
                drag.update((pointer.x.into(), pointer.y.into()))
                    .then_some((frame.item.id.clone(), drag.preview, None))
            }
        });
        if let Some((id, (x, y), size)) = next {
            self.editor.selected = Some(id);
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = x;
                        item.y = y;
                        if let Some(size) = size {
                            item.geometry.size = Some(size);
                        }
                    })
                },
                cx,
            );
        } else {
            self.rebuild(cx);
        }
    }
    pub(super) fn handle_key(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = &event.keystroke;
        let plain = !key.modifiers.control && !key.modifiers.alt && !key.modifiers.platform;
        if key.key == "escape" && (self.drag.is_some() || self.held_nudge.is_some()) {
            self.cancel_drag(cx);
            cx.stop_propagation();
        } else if key.key == "escape" && plain && self.editor.selected.is_some() {
            self.show_catalog(cx);
            self.focus.focus(window, cx);
            cx.stop_propagation();
        } else if key.key == "/" && plain && self.focus.is_focused(window) {
            // Solo desde el lienzo: en un campo, «/» es texto.
            self.focus_catalog_search(window, cx);
            cx.stop_propagation();
        } else if let Some(action) = document_key(key) {
            // Los campos conservan Supr y sus atajos de edición de texto.
            if matches!(action, DocumentKey::History(_)) || self.focus.is_focused(window) {
                if !event.is_held {
                    match action {
                        DocumentKey::History(redo) => self.history(redo, cx),
                        DocumentKey::Duplicate => self.edit(Editor::duplicate, cx),
                        DocumentKey::Remove => self.edit(Editor::remove, cx),
                        DocumentKey::Save => self.edit(Editor::persist, cx),
                    }
                    self.focus.focus(window, cx);
                }
                cx.stop_propagation();
            }
        } else if self.focus.is_focused(window)
            && key.modifiers.alt
            && !key.modifiers.function
            && self.editor.selected().is_some()
            && let Some((direction, shift)) = keyboard_nudge(&gpui::Keystroke {
                modifiers: gpui::Modifiers {
                    alt: false,
                    ..key.modifiers
                },
                ..key.clone()
            })
        {
            self.resize_nudge(direction, shift, cx);
            cx.stop_propagation();
        } else if self.focus.is_focused(window)
            && self.editor.selected().is_some()
            && let Some((direction, shift)) = keyboard_nudge(key)
        {
            // Los campos del inspector conservan sus flechas y su propio foco.
            self.start_nudge(direction, shift, cx);
            cx.stop_propagation();
        }
    }
    fn toolbar_zoom_out_control(cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-zoom-out")
            .role(gpui::Role::Button)
            .aria_label("Reducir zoom")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(this.zoom_step.saturating_sub(1), cx)))
            .size(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(text("−", 14.0, 500, orbit::ink_3(cx), cx))
    }

    fn toolbar_zoom_label(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let label = format!("{:.0} %", self.preview_scale() * 100.0);
        div()
            .id("studio-zoom-fit")
            .role(gpui::Role::Button)
            .aria_label("Ajustar overlay al lienzo")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(0, cx)))
            .w(px(60.0))
            .text_center()
            .child(orbit::mono_text(label, 12.0, orbit::ink_3(cx), cx))
    }

    fn toolbar_zoom_in_control(cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-zoom-in")
            .role(gpui::Role::Button)
            .aria_label("Ampliar zoom")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(this.zoom_step + 1, cx)))
            .size(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(text("+", 14.0, 500, orbit::ink_3(cx), cx))
    }
    pub(super) fn position_anchor(&mut self, column: u8, row: u8, cx: &mut Context<Self>) {
        if let Some(position) = self
            .selected_size(cx)
            .and_then(|size| self.anchored_position(size, column, row))
        {
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = position.0;
                        item.y = position.1;
                    })
                },
                cx,
            );
        }
    }
    pub(super) fn position_nudge(
        &mut self,
        direction: (i8, i8),
        shift: bool,
        cx: &mut Context<Self>,
    ) {
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    let next = inspector::nudged_position((item.x, item.y), direction, shift);
                    item.x = next.0;
                    item.y = next.1;
                })
            },
            cx,
        );
    }
    pub(super) fn start_nudge(&mut self, direction: (i8, i8), shift: bool, cx: &mut Context<Self>) {
        if self
            .held_nudge
            .as_ref()
            .is_some_and(|held| held.direction == direction && held.shift == shift)
        {
            return;
        }
        self.cancel_drag(cx);
        let Some(item) = self.editor.selected() else {
            return;
        };
        let Some((_, frame)) = self.frames.iter().find(|(id, _)| *id == item.id) else {
            return;
        };
        self.held_nudge = Some(HeldNudge {
            frame: frame.clone(),
            origin: (item.x, item.y),
            direction,
            shift,
            started: Instant::now(),
        });
        self.tick_nudge(Duration::ZERO, cx);
        self.nudge_task = Some(cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(16))
                    .await;
                if !this
                    .update(cx, |this, cx| {
                        let Some(held) = &this.held_nudge else {
                            return false;
                        };
                        this.tick_nudge(held.started.elapsed(), cx);
                        true
                    })
                    .unwrap_or(false)
                {
                    break;
                }
            }
        }));
    }
    pub(super) fn tick_nudge(&self, elapsed: Duration, cx: &mut Context<Self>) {
        let Some(held) = &self.held_nudge else { return };
        let distance = held_nudge_distance(elapsed, held.shift);
        let position = (
            (held.origin.0 + f32::from(held.direction.0) * distance).clamp(-100_000.0, 100_000.0),
            (held.origin.1 + f32::from(held.direction.1) * distance).clamp(-100_000.0, 100_000.0),
        );
        held.frame.update(cx, |frame, cx| {
            if frame.nudge_position != Some(position) {
                frame.nudge_position = Some(position);
                cx.notify();
            }
        });
    }
    pub(super) fn finish_nudge(&mut self, cx: &mut Context<Self>) {
        self.nudge_task = None;
        let Some(held) = self.held_nudge.take() else {
            return;
        };
        let frame = held.frame.read(cx);
        let position = frame.nudge_position;
        let id = frame.item.id.clone();
        held.frame.update(cx, |frame, cx| {
            frame.nudge_position = None;
            cx.notify();
        });
        if self.editor.selected.as_ref() == Some(&id)
            && let Some((x, y)) = position
        {
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = x;
                        item.y = y;
                    })
                },
                cx,
            );
        }
    }
    pub(super) fn resize_nudge(
        &mut self,
        direction: (i8, i8),
        shift: bool,
        cx: &mut Context<Self>,
    ) {
        let Some(size) = self.selected_size(cx) else {
            return;
        };
        let amount = if shift { 8.0 } else { 1.0 };
        self.resize_by(
            (
                f32::from(direction.0) * amount,
                f32::from(direction.1) * amount,
            ),
            size,
            cx,
        );
    }
    fn resize_by(&mut self, delta: (f32, f32), size: (f32, f32), cx: &mut Context<Self>) {
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    let handle = if delta.0 == 0.0 {
                        vantare_ui::geometry::Handle(0, 1)
                    } else {
                        vantare_ui::geometry::Handle(1, 0)
                    };
                    if let Some((_, next)) = vantare_ui::geometry::resize(
                        (item.x, item.y),
                        vantare_ui::geometry::Size {
                            width: size.0,
                            height: size.1,
                        },
                        handle,
                        delta,
                        item.geometry.aspect_locked,
                    ) {
                        item.geometry.size = Some(next);
                    }
                })
            },
            cx,
        );
    }
    pub(super) fn scale_by(&mut self, factor: f32, cx: &mut Context<Self>) {
        let Some(size) = self.selected_size(cx) else {
            return;
        };
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    if let Some((_, next)) = vantare_ui::geometry::resize(
                        (item.x, item.y),
                        vantare_ui::geometry::Size {
                            width: size.0,
                            height: size.1,
                        },
                        vantare_ui::geometry::Handle(1, 1),
                        (size.0 * (factor - 1.0), size.1 * (factor - 1.0)),
                        true,
                    ) {
                        item.geometry.size = Some(next);
                    }
                })
            },
            cx,
        );
    }

    pub(super) fn preview_stage(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let (left, top) = preview_origin(
            self.canvas_size.0,
            self.canvas_size.1,
            self.preview_scale(),
            self.canvas_resolution(),
        );
        let mut stage = div()
            .relative()
            .w(px(self.canvas_resolution().width * self.preview_scale()))
            .h(px(self.canvas_resolution().height * self.preview_scale()))
            .ml(px(left))
            .mt(px(top))
            .flex_none()
            .overflow_hidden()
            .rounded(px(orbit::skin(cx).radius.md))
            .border_1()
            .border_color(gpui::rgba(orbit::line_strong(cx)))
            .bg(linear_gradient(
                140.0,
                linear_color_stop(rgb(orbit::stage(cx).top), 0.0),
                linear_color_stop(rgb(orbit::stage(cx).base), 1.0),
            ));
        for (_, frame) in &self.frames {
            if frame.read(cx).item.visible {
                stage = stage.child(frame.clone());
            }
        }
        let accent = orbit::skin(cx).accent;
        let stage = stage
            .id("studio-stage")
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, window, cx| {
                    this.focus.focus(window, cx);
                    if this.editor.selected.is_some() {
                        this.show_catalog(cx);
                    }
                }),
            )
            .on_drag_move(cx.listener(Self::catalog_drag_move))
            .on_drop(cx.listener(Self::catalog_drop))
            .drag_over::<super::add_widget::CatalogDrag>(move |style, _, _, _| {
                style.border_color(rgb(accent))
            })
            .children(self.ghost_elements(cx));
        stage.child(
            text(
                format!(
                    "{:.0} × {:.0}",
                    self.canvas_resolution().width,
                    self.canvas_resolution().height
                ),
                10.0,
                500,
                orbit::ink_3(cx),
                cx,
            )
            .absolute()
            .bottom(px(14.0))
            .right(px(14.0)),
        )
    }

    pub(super) fn selected_size(&self, cx: &gpui::App) -> Option<(f32, f32)> {
        let item = self.editor.selected()?;
        self.frames
            .iter()
            .find(|(id, _)| *id == item.id)
            .map(|(_, frame)| {
                let frame = frame.read(cx);
                let (width, height) = frame.renderer.read(cx).frame_size();
                (width * frame.content_scale, height * frame.content_scale)
            })
    }
    fn preview_footer(&self, cx: &mut Context<Self>) -> gpui::Div {
        let selection = match (self.editor.selected(), self.selected_size(cx)) {
            (Some(item), Some((width, height))) => {
                format!("x {} · y {} · {} × {}", item.x, item.y, width, height)
            }
            _ => "Sin selección".into(),
        };
        div()
            .min_h(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(8.0))
            .when_some(self.resolution_choice.clone(), |row, choice| {
                row.child(choice)
            })
            .child(
                orbit::mono_text(selection, 11.0, orbit::ink_2(cx), cx)
                    .flex_1()
                    .min_w_0()
                    .whitespace_nowrap()
                    .overflow_hidden()
                    .text_ellipsis(),
            )
            .child(Self::toolbar_zoom_out_control(cx))
            .child(self.toolbar_zoom_label(cx))
            .child(Self::toolbar_zoom_in_control(cx))
            .child(text("Telemetría · — Hz", 11.0, 500, orbit::ink_3(cx), cx))
    }

    pub(super) fn editor_workspace(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        self.init_controls(window, cx);
        let stage = self.preview_stage(cx);
        let resolution = self.canvas_resolution();
        let studio = cx.entity().downgrade();
        let drag_target = studio.clone();
        let measure = gpui::canvas(
            move |bounds, _, cx| {
                if let Some(scale) = fitted_scale(
                    bounds.size.width.into(),
                    bounds.size.height.into(),
                    resolution,
                ) {
                    // La entidad aún participa en el prepaint: actualizar al terminar
                    // el frame permite medir también los cambios del inspector.
                    cx.defer(move |cx| {
                        let _ = studio.update(cx, |this, cx| {
                            let size = (bounds.size.width.into(), bounds.size.height.into());
                            this.measure_canvas(size, scale, cx);
                        });
                    });
                }
            },
            move |_, (), window, _| {
                let studio = drag_target.clone();
                let release_target = studio.clone();
                window.on_mouse_event(move |_: &gpui::MouseUpEvent, phase, _, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        let _ = release_target.update(cx, Studio::finish_nudge);
                    }
                });
                window.on_mouse_event(move |event: &MouseMoveEvent, phase, _, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        // El gesto sigue aunque el puntero salga del hitbox de Studio.
                        // Una entidad cerrada ya no conserva ningún gesto.
                        let _ = studio.update(cx, |this, cx| this.move_drag(event, cx));
                    }
                });
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        // Sin panel alrededor: solo preview_stage dibuja el marco del propio lienzo (R10.3).
        let canvas = div()
            .id("studio-canvas")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .relative()
            .flex()
            .overflow_scroll()
            .on_scroll_wheel(cx.listener(|this, _, _, cx| this.cancel_drag(cx)))
            .child(measure)
            .child(stage)
            .children(self.toast_element(cx));
        div()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(self.adapt.gap()))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .child(canvas)
                    .child(self.preview_footer(cx)),
            )
            .child(self.widget_strip(cx))
    }
}
