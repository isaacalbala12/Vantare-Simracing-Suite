//! Tests unitarios de Studio (gestos, escala, catálogo, capturas, inspector). Mapa: `README.md`.
use super::canvas::keyboard_nudge;
use super::canvas::{
    CANVAS_PRESETS, Drag, Resize, fitted_scale, held_nudge_distance, overlay_monitor,
    preview_origin, selection_caption_top,
};
use super::catalog::{
    DEMO_ITEMS, demo_standings_settings, example_snapshots, hide_selected_for_capture,
    preview_snapshot, unavailable_scenario,
};
use super::catalog::{capture_settings, demo_content_scale};
use super::*;

#[test]
fn hidden_frames_are_not_projected_without_repainting() {
    assert!(Studio::ingest_skips_frame(true, true));
    assert!(Studio::ingest_skips_frame(true, false));
    assert!(!Studio::ingest_skips_frame(false, true));
    assert!(Studio::ingest_skips_frame(false, false));
}
#[test]
fn preview_mode_toolbar_builds_without_duplicate_hover_styles() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let _ = studio.toolbar_preview_mode(cx);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn strip_visibility_toggle_resets_the_inspector() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let id = studio.editor.layout().instances[0].id.clone();
            assert!(studio.editor.layout().instances[0].visible);
            studio.select(id.clone(), cx);
            studio.inspector_selection = Some(id.clone());
            studio.toggle_visibility_from_strip(&id, cx);
            assert!(!studio.editor.layout().instances[0].visible);
            assert!(
                studio.inspector_selection.is_none(),
                "el inspector debe reconstruirse tras ocultar desde la tira"
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn track_button_serves_cached_state_and_follows_tray_hide() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, _| {
            // El botón sirve la caché sin releer: firma estable, sin cambios.
            assert!(!studio.track_showing);
            assert!(!studio.refresh_track_showing());
            studio.editor.show_on_track().expect("mostrar");
            assert!(studio.refresh_track_showing());
            assert!(studio.track_showing);
            assert!(
                !studio.refresh_track_showing(),
                "firma estable: el render no reparsea"
            );
            // La bandeja retira por el mismo canal; el refresco lo refleja.
            Presentation::hide(&file.path).expect("bandeja oculta");
            assert!(studio.refresh_track_showing());
            assert!(!studio.track_showing);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn document_shortcuts_use_exact_modifiers() {
    for (stroke, expected) in [
        ("ctrl-z", Some(DocumentKey::History(false))),
        ("ctrl-shift-z", Some(DocumentKey::History(true))),
        ("ctrl-y", Some(DocumentKey::History(true))),
        ("cmd-z", Some(DocumentKey::History(false))),
        ("ctrl-d", Some(DocumentKey::Duplicate)),
        ("ctrl-s", Some(DocumentKey::Save)),
        ("delete", Some(DocumentKey::Remove)),
        ("ctrl-alt-z", None),
        ("ctrl-alt-d", None),
        ("ctrl-shift-d", None),
        ("shift-delete", None),
        ("ctrl-delete", None),
        ("backspace", None),
        ("d", None),
    ] {
        assert_eq!(
            document_key(&gpui::Keystroke::parse(stroke).expect("tecla")),
            expected,
            "{stroke}"
        );
    }
}
fn prepared_widget(path: PathBuf) -> Prepared {
    let mut prepared = Prepared::load(path).expect("preparar Studio");
    prepared.editor.add(Kind::Standings).expect("widget");
    prepared
}
fn start_preview(studio: &mut Studio, cx: &mut Context<Studio>) {
    let frame = studio.frames[0].1.clone();
    frame.update(cx, |frame, _| {
        frame.drag = Some(Drag {
            pointer: (100.0, 200.0),
            origin: (frame.item.x, frame.item.y),
            preview: (frame.item.x + 80.0, frame.item.y + 40.0),
            scale: frame.preview_scale,
        });
    });
    studio.drag = Some(frame);
}
#[test]
fn real_scene_and_photo_selection_use_same_snapshot_for_all_widgets_without_editing_layout() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let layout = studio.editor.layout().clone();
            for index in [0, 11, 12] {
                studio.real_photo = Some(index);
                studio.example = true;
                studio.rebuild(cx);
                for kind in Kind::ALL {
                    assert!(std::ptr::eq(
                        studio.preview_snapshot(*kind),
                        std::ptr::from_ref(&studio.photos[index].snapshot)
                    ));
                }
            }
            assert_eq!(studio.editor.layout(), &layout);
            studio.example = false;
            assert!(std::ptr::eq(
                studio.preview_snapshot(Kind::Standings),
                std::ptr::from_ref(&studio.snapshot)
            ));
            assert_eq!(
                Editor::open(file.path.clone()).expect("disk").layout(),
                &layout
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn resize_preview_freezes_document_and_commit_roundtrips_with_one_undo() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let original = studio.editor.layout().clone();
            let frame = studio.frames[0].1.clone();
            let size = frame
                .read(cx)
                .item
                .geometry
                .resolved(frame.read(cx).renderer.read(cx).wanted_size());
            frame.update(cx, |frame, _| {
                frame.resize = Some(Resize {
                    pointer: (100.0, 100.0),
                    origin: (frame.item.x, frame.item.y),
                    size,
                    preview: ((frame.item.x, frame.item.y), size),
                    scale: 0.5,
                    handle: vantare_ui::geometry::Handle(-1, -1),
                    locked: true,
                });
            });
            studio.drag = Some(frame.clone());
            studio.move_drag(
                &MouseMoveEvent {
                    position: gpui::point(px(130.0), px(120.0)),
                    pressed_button: Some(MouseButton::Left),
                    ..Default::default()
                },
                cx,
            );
            let preview = frame.read(cx).resize.as_ref().expect("resize").preview;
            assert_eq!(studio.editor.layout(), &original);
            assert_eq!(
                Editor::open(file.path.clone())
                    .expect("disk during")
                    .layout(),
                &original
            );
            assert!(
                (preview.0.0 + preview.1.width - original.instances[0].x - size.width).abs()
                    < 0.001
            );
            assert!(
                (preview.0.1 + preview.1.height - original.instances[0].y - size.height).abs()
                    < 0.001
            );
            studio.finish_drag(gpui::point(px(130.0), px(120.0)), cx);
            let next = studio.editor.layout().clone();
            assert_eq!(next.instances[0].geometry.size, Some(preview.1));
            assert_eq!(
                studio.frames[0].1.read(cx).renderer.read(cx).frame_size(),
                preview.1.tuple()
            );
            assert_eq!(
                Editor::open(file.path.clone()).expect("reopen").layout(),
                &next
            );
            studio.history(false, cx);
            assert_eq!(studio.editor.layout(), &original);
            studio.history(true, cx);
            assert_eq!(studio.editor.layout(), &next);
            studio.history(false, cx);
            studio.history(false, cx);
            assert!(
                studio.editor.layout().instances.is_empty(),
                "no history during preview"
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn geometry_edits_keep_dimension_control_identity_and_sync_both_axes() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let size = studio.selected_size(cx).expect("size");
            for (title, value, min, max) in [
                ("Ancho", size.0, 64.0, 3840.0),
                ("Alto", size.1, 32.0, 2160.0),
            ] {
                studio.instance_number(
                    title,
                    Tab::Layout,
                    f64::from(value),
                    min,
                    max,
                    1.0,
                    |_, _| {},
                    cx,
                );
            }
            let controls = studio.size_fields.clone();
            studio.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.geometry.size = Some(vantare_ui::geometry::Size {
                            width: 500.0,
                            height: 700.0,
                        });
                    })
                },
                cx,
            );
            assert_eq!(studio.size_fields, controls, "focus-bearing entity remains");
            assert!((controls[0].1.read(cx).range.value - 500.0).abs() < 0.001);
            assert!((controls[1].1.read(cx).range.value - 700.0).abs() < 0.001);
            studio.editor.undo().expect("undo");
            studio.rebuild(cx);
            assert_eq!(studio.size_fields, controls);
            assert!((controls[0].1.read(cx).range.value - f64::from(size.0)).abs() < 0.001);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn clicking_resize_handle_without_motion_does_not_write_geometry_or_history() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let layout = studio.editor.layout().clone();
            let frame = studio.frames[0].1.clone();
            let size = frame
                .read(cx)
                .item
                .geometry
                .resolved(frame.read(cx).renderer.read(cx).wanted_size());
            frame.update(cx, |frame, _| {
                frame.resize = Some(Resize {
                    pointer: (100.0, 100.0),
                    origin: (frame.item.x, frame.item.y),
                    size,
                    preview: ((frame.item.x, frame.item.y), size),
                    scale: 1.0,
                    handle: vantare_ui::geometry::Handle(1, 1),
                    locked: true,
                });
            });
            studio.drag = Some(frame);
            studio.finish_drag(gpui::point(px(100.0), px(100.0)), cx);
            assert_eq!(studio.editor.layout(), &layout);
            studio.editor.undo().expect("undo adding");
            assert!(studio.editor.layout().instances.is_empty());
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn resize_cancel_restores_renderer_and_keyboard_resize_keeps_position() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let initial = studio.editor.layout().clone();
            let size = studio.selected_size(cx).expect("size");
            studio.resize_nudge((1, 0), false, cx);
            let n = studio.editor.selected().expect("selected");
            assert_eq!((n.x, n.y), (initial.instances[0].x, initial.instances[0].y));
            assert!((n.geometry.size.expect("size").width - size.0 - 1.0).abs() < 0.001);
            studio.resize_nudge((0, 1), true, cx);
            studio.history(false, cx);
            studio.history(false, cx);
            assert_eq!(studio.editor.layout(), &initial);
            let frame = studio.frames[0].1.clone();
            let start = vantare_ui::geometry::Size {
                width: size.0,
                height: size.1,
            };
            frame.update(cx, |f, cx| {
                f.resize = Some(Resize {
                    pointer: (100.0, 100.0),
                    origin: (f.item.x, f.item.y),
                    size: start,
                    preview: ((f.item.x, f.item.y), start),
                    scale: 1.0,
                    handle: vantare_ui::geometry::Handle(1, 1),
                    locked: false,
                });
                f.renderer.update(cx, |renderer, cx| {
                    renderer.set_frame_size(Some(vantare_ui::geometry::Size {
                        width: 1000.0,
                        height: 900.0,
                    }));
                    cx.notify();
                });
            });
            studio.drag = Some(frame);
            studio.cancel_drag(cx);
            assert_eq!(
                studio.frames[0].1.read(cx).renderer.read(cx).frame_size(),
                size
            );
            studio.finish_drag(gpui::point(px(500.0), px(500.0)), cx);
            assert_eq!(studio.editor.layout(), &initial);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn geometry_changes_cancel_manual_and_fitted_gestures_without_a_document_edit() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        for step in [0, 3, 5] {
            for rail_change in [false, true] {
                let file = crate::document::tests::File::new();
                let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
                studio.update(cx, |studio, cx| {
                    studio.zoom_step = step;
                    let original = studio.editor.layout().clone();
                    start_preview(studio, cx);
                    if rail_change {
                        studio.set_adapt(orbit::Adapt::new(1280.0, 720.0, None, false), cx);
                    } else {
                        studio.measure_canvas((640.0, 360.0), 1.0 / 3.0, cx);
                    }
                    assert!(studio.drag.is_none());
                    assert!(studio.frames[0].1.read(cx).drag.is_none());
                    studio.finish_drag(gpui::point(px(900.0), px(800.0)), cx);
                    assert_eq!(studio.editor.layout(), &original);
                    assert_eq!(
                        Editor::open(file.path.clone()).expect("reabrir").layout(),
                        &original
                    );
                    studio.editor.undo().expect("solo se deshace añadir");
                    assert!(studio.editor.layout().instances.is_empty());
                });
            }
        }
        crate::quit_headless_test(cx);
    });
}
#[test]
fn selection_frame_stays_opaque_and_keeps_its_size_when_content_becomes_transparent() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        let frame = studio.read(cx).frames[0].1.clone();
        let mut sizes = vec![];
        for opacity in [0.0, 0.25, 1.0] {
            frame.update(cx, |frame, cx| {
                frame.item.opacity = opacity;
                frame.selected = true;
                let mut host = frame.element(cx);
                assert_eq!(host.style().opacity, None);
                assert_eq!(host.style().border_widths.left, None);
                let mut outline = CanvasFrame::selection_outline(cx);
                assert_eq!(outline.style().opacity, None);
                assert_eq!(outline.style().position, Some(gpui::Position::Absolute));
                assert_eq!(outline.style().border_widths.left, Some(px(1.0).into()));
                sizes.push(host.style().size.clone());
            });
        }
        assert!(sizes.windows(2).all(|pair| pair[0] == pair[1]));
        crate::quit_headless_test(cx);
    });
}
#[test]
fn selection_matches_painted_bounds_for_every_widget_and_zoom() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        let frame = studio.read(cx).frames[0].1.clone();
        for &kind in Kind::ALL {
            for factor in [0.5, 1.0, 2.0] {
                frame.update(cx, |frame, cx| {
                    frame.item.settings = Settings::default_for(kind);
                    frame.renderer.update(cx, |renderer, _| {
                        *renderer =
                            Overlay::configured(&frame.item.settings, Preferences::default());
                        let natural = renderer.wanted_size();
                        renderer.set_frame_size(Some(vantare_ui::geometry::Size {
                            width: natural.0 * factor,
                            height: natural.1 * factor * 2.0,
                        }));
                    });
                    let natural = frame.renderer.read(cx).wanted_size();
                    for zoom in [0.1, 0.5, 1.0, 2.5, 4.0] {
                        frame.preview_scale = zoom;
                        frame.content_scale = 1.0;
                        frame.selected = true;
                        let expected = (natural.0 * factor * zoom, natural.1 * factor * zoom);
                        let mut host = frame.element(cx);
                        assert_eq!(
                            host.style().size.width,
                            Some(px(expected.0).into()),
                            "{kind:?} ancho a {zoom}"
                        );
                        assert_eq!(
                            host.style().size.height,
                            Some(px(expected.1).into()),
                            "{kind:?} alto a {zoom}"
                        );
                    }
                });
            }
        }
        crate::quit_headless_test(cx);
    });
}
#[test]
fn live_starts_empty_and_uses_only_received_photos_even_during_a_gesture() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            studio.example = false;
            assert_eq!(studio.snapshot, Snapshot::default());
            for &kind in Kind::ALL {
                assert_eq!(studio.preview_snapshot(kind), &Snapshot::default());
            }
            let photo = studio.examples[0].1.clone();
            studio.ingest(&photo, cx);
            start_preview(studio, cx);
            let mut newest = photo.clone();
            newest.sequence += 1;
            studio.ingest(&newest, cx);
            assert!(studio.drag.is_some(), "telemetría no cancela el gesto");
            studio.cancel_drag(cx);
            for &kind in Kind::ALL {
                assert_eq!(studio.preview_snapshot(kind), &newest);
            }
            studio.example = true;
            assert_eq!(studio.preview_snapshot(Kind::Standings), &photo);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn unavailable_scenarios_explain_their_state_without_offering_button_actions() {
    use gpui::Element;
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        for (index, label) in ["Salida", "Boxes", "Lluvia", "Noche"]
            .into_iter()
            .enumerate()
        {
            let control =
                unavailable_scenario(index, label, scenes::Scenario::ALL[index].reason(), cx);
            assert_eq!(control.a11y_role(), Some(gpui::Role::Group));
            let mut node = gpui::accesskit::Node::new(gpui::Role::Group);
            control.write_a11y_info(&mut node);
            assert_eq!(
                node.label(),
                Some(format!("{label} · Próximamente").as_str())
            );
            assert!(!node.supports_action(gpui::AccessibleAction::Click));
            assert!(!node.supports_action(gpui::AccessibleAction::Focus));
        }
        crate::quit_headless_test(cx);
    });
}
#[test]
fn keyboard_movement_persists_logical_pixels_and_undo_restores_each_step() {
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor");
    editor.add(Kind::Standings).expect("widget");
    let original = editor.layout().clone();
    for (stroke, expected) in [("right", (21.0, 20.0)), ("shift-down", (21.0, 28.0))] {
        let key = gpui::Keystroke::parse(stroke).expect("tecla");
        let (direction, shift) = keyboard_nudge(&key).expect("flecha espacial");
        editor
            .edit_selected(|item| {
                (item.x, item.y) = inspector::nudged_position((item.x, item.y), direction, shift);
            })
            .expect("mover");
        let reopened = Editor::open(file.path.clone()).expect("reabrir");
        let item = &reopened.layout().instances[0];
        assert_eq!((item.x, item.y), expected);
    }
    editor.undo().expect("deshacer 8 px");
    assert_eq!(
        editor.selected().map(|item| (item.x, item.y)),
        Some((21.0, 20.0))
    );
    editor.undo().expect("deshacer 1 px");
    assert_eq!(editor.layout(), &original);
}
#[test]
fn keyboard_movement_does_not_claim_modified_navigation_or_other_keys() {
    for stroke in ["ctrl-right", "alt-left", "super-up", "a", "escape", "tab"] {
        let key = gpui::Keystroke::parse(stroke).expect("tecla");
        assert_eq!(keyboard_nudge(&key), None, "{stroke}");
    }
    for (stroke, direction) in [("left", (-1, 0)), ("up", (0, -1)), ("down", (0, 1))] {
        assert_eq!(
            keyboard_nudge(&gpui::Keystroke::parse(stroke).expect("tecla")),
            Some((direction, false))
        );
    }
}
#[test]
fn fitted_canvas_is_maximal_and_centered_at_four_aspects_and_all_seven_sizes() {
    for resolution in &CANVAS_PRESETS[..4] {
        let resolution = *resolution;
        for (width, height) in [
            (1920.0, 1080.0),
            (1680.0, 1050.0),
            (1512.0, 900.0),
            (1440.0, 900.0),
            (1366.0, 768.0),
            (1280.0, 720.0),
            (2048.0, 1152.0),
        ] {
            for rail_open in [false, true] {
                let adapt = orbit::Adapt::new(width, height, None, rail_open);
                let (top, horizontal_padding, bottom) = adapt.padding();
                let available = (
                    adapt.center_width() - horizontal_padding * 2.0,
                    height - 52.0 - top - bottom - 44.0 - 39.0 - 108.0 - adapt.gap() * 2.0,
                );
                let scale =
                    fitted_scale(available.0, available.1, resolution).expect("cabe en la ventana");
                let size = (resolution.width * scale, resolution.height * scale);
                let origin = preview_origin(available.0, available.1, scale, resolution);
                assert!((size.0 / size.1 - resolution.width / resolution.height).abs() < 0.000_01);
                assert!(size.0 <= available.0 + 0.001 && size.1 <= available.1 + 0.001);
                assert!(
                    (size.0 - available.0).abs() < 0.001 || (size.1 - available.1).abs() < 0.001
                );
                assert!((origin.0 - (available.0 - size.0) / 2.0).abs() < 0.001);
                assert!((origin.1 - (available.1 - size.1) / 2.0).abs() < 0.001);
            }
        }
    }
    assert_eq!(fitted_scale(3840.0, 2160.0, CANVAS_PRESETS[0]), Some(2.0));
    assert_eq!(
        preview_origin(800.0, 400.0, 1.0, CANVAS_PRESETS[0]),
        (0.0, 0.0)
    );
}
#[test]
fn default_canvas_follows_overlay_monitor_with_global_positions_unchanged() {
    let secondary = (-2560.0, 0.0, 2560.0, 1600.0);
    let primary = (0.0, 0.0, 1920.0, 1080.0);
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor");
    editor.add(Kind::Radar).expect("radar");
    editor
        .edit_selected(|item| {
            item.x = -2400.0;
            item.y = 100.0;
        })
        .expect("posición global");
    let previous = editor.layout().clone();
    assert_eq!(
        overlay_monitor(editor.layout(), &[primary, secondary], primary),
        secondary
    );
    assert_eq!(editor.layout(), &previous);
    assert_eq!(
        overlay_monitor(&Layout::default(), &[secondary, primary], primary),
        primary
    );
    editor
        .edit_selected(|item| item.visible = false)
        .expect("ocultar");
    assert_eq!(
        overlay_monitor(editor.layout(), &[primary, secondary], primary),
        primary
    );
}
#[test]
fn selection_caption_stays_inside_canvas_at_ultrawide_fit_without_moving_frame() {
    for y in [0.0, 62.0, 300.0] {
        for scale in [0.1, 0.25, 0.5, 1.0, 1.5] {
            let frame_top = y * scale;
            let caption_top = selection_caption_top(y, scale);
            assert!(frame_top + caption_top >= 0.0);
            assert!((-22.0..=0.0).contains(&caption_top));
            if frame_top >= 22.0 {
                assert!((caption_top + 22.0).abs() < f32::EPSILON);
            }
        }
    }
}
#[test]
fn canvas_resolution_changes_preview_and_anchors_without_moving_widgets() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let instances = studio.editor.layout().instances.clone();
            studio.measure_canvas(
                (850.0, 500.0),
                fitted_scale(850.0, 500.0, studio.canvas_resolution()).expect("fit"),
                cx,
            );
            for resolution in &CANVAS_PRESETS[..4] {
                studio.set_canvas_resolution(Some(*resolution), cx);
                assert_eq!(studio.canvas_resolution(), *resolution);
                assert_eq!(studio.editor.layout().instances, instances);
                let mut stage = studio.preview_stage(cx);
                assert_eq!(
                    stage.style().size.width,
                    Some(px(resolution.width * studio.preview_scale()).into())
                );
                assert_eq!(
                    stage.style().size.height,
                    Some(px(resolution.height * studio.preview_scale()).into())
                );
                let anchored = studio
                    .anchored_position((400.0, 200.0), 2, 2)
                    .expect("anclar");
                assert_eq!(
                    anchored,
                    (
                        studio.monitor.0 + resolution.width - 400.0,
                        studio.monitor.1 + resolution.height - 200.0
                    )
                );
                assert_eq!(studio.frames[0].1.read(cx).item, instances[0]);
            }
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn general_examples_remain_explicit_design_samples_for_every_widget() {
    for (_, snapshot) in example_snapshots().expect("ejemplos") {
        assert_eq!(
            snapshot.state.session.kind.current(),
            Some(&vantare_domain::SessionKind::Race)
        );
    }
}
#[test]
fn catalog_groups_locked_widgets_under_pro_and_keeps_plan_widgets_addable() {
    use super::add_widget::{GroupKind, groups};
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    for catalog in [
        CatalogAccess::Free,
        CatalogAccess::LaunchV1,
        CatalogAccess::Pro,
    ] {
        let access = Some(Access {
            verified: true,
            catalog,
            ..Access::default()
        });
        let shown = groups("", None, |kind| widget_lock(access, kind).is_some(), &[]);
        let total: usize = shown.iter().map(|group| group.kinds.len()).sum();
        assert_eq!(total, Kind::CATALOG.len(), "cada widget aparece una vez");
        for group in &shown {
            for &kind in &group.kinds {
                assert_eq!(
                    group.kind == GroupKind::Locked,
                    !catalog.allows_widget(kind.name()),
                    "{kind:?} en {catalog:?}"
                );
                if group.kind == GroupKind::Locked {
                    assert_eq!(widget_lock(access, kind), Some("Incluida en Pro"));
                }
            }
        }
    }
    // Sin verificar, nada se puede añadir; Workshop y capturas (None) no bloquean.
    let unverified = Some(Access::default());
    assert!(
        groups(
            "",
            None,
            |kind| widget_lock(unverified, kind).is_some(),
            &[]
        )
        .iter()
        .all(|group| group.kind == GroupKind::Locked)
    );
    assert!(
        groups("", None, |kind| widget_lock(None, kind).is_some(), &[])
            .iter()
            .all(|group| group.kind != GroupKind::Locked)
    );
}
#[test]
fn examples_cover_all_widgets_and_live_never_uses_a_sample() {
    let examples = example_snapshots().expect("muestras incrustadas válidas");
    let live = Snapshot::default();
    assert_eq!(examples.len(), Kind::ALL.len());
    for &kind in Kind::ALL {
        let sample = preview_snapshot(true, &examples, &live, kind);
        assert_ne!(sample, &live, "{kind:?}: muestra vacía");
        if matches!(
            kind,
            Kind::Standings | Kind::Delta | Kind::Relative | Kind::FuelStrategy
        ) {
            assert!(
                sample.state.player.is_some(),
                "{kind:?}: ejemplo sin piloto"
            );
        }
        assert!(std::ptr::eq(
            preview_snapshot(false, &examples, &live, kind),
            &raw const live
        ));
        assert!(!std::ptr::eq(sample, &raw const live));
    }
    let fuel = preview_snapshot(true, &examples, &live, Kind::FuelStrategy);
    assert_eq!(
        vantare_domain::fuel_strategy::project(fuel, Preferences::default()).status,
        None
    );
    let delta = preview_snapshot(true, &examples, &live, Kind::Delta);
    assert_eq!(
        vantare_domain::delta::project(delta, Preferences::default()).status,
        vantare_domain::delta::Status::Ready
    );
}
#[test]
fn added_head_to_head_uses_the_renderer_size_and_stays_inside_canvas() {
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor");
    editor.add(Kind::HeadToHead).expect("añadir H2H");
    let item = editor.layout().instances.last().expect("instancia");
    let renderer = Overlay::configured(&item.settings, Preferences::default());
    assert_eq!(renderer.wanted_size(), (780.0, 72.0));
    assert!(item.x >= 0.0 && item.y >= 0.0);
    assert!(item.x + renderer.wanted_size().0 <= 1920.0);
    assert!(item.y + renderer.wanted_size().1 <= 1080.0);
}

#[test]
fn capture_scene_keeps_every_product_widget_inside_the_canvas() {
    assert_eq!(DEMO_ITEMS[0].0, Kind::Standings);
    for (kind, x, y) in DEMO_ITEMS {
        let overlay = Overlay::configured(&capture_settings(kind), Preferences::default());
        let (width, height) = overlay.wanted_size();
        let scale = demo_content_scale(kind, width);
        assert!(x >= 0.0 && y >= 0.0);
        assert!(x + width * scale <= 1920.0, "{kind:?}: recorte horizontal");
        assert!(y + height * scale <= 1080.0, "{kind:?}: recorte vertical");
    }
}
#[test]
fn demo_delta_keeps_its_document_width_and_aspect_at_each_zoom() {
    let overlay = Overlay::new(Kind::Delta, Preferences::default());
    let (width, height) = overlay.wanted_size();
    let content_scale = demo_content_scale(Kind::Delta, width);
    for scale in [STUDIO_PREVIEW_SCALE, 0.5, 0.75, 1.0, 1.5] {
        assert!((width * content_scale * scale - 400.0 * scale).abs() < 0.001);
        assert!(
            ((width * content_scale) / (height * content_scale) - width / height).abs() < 0.001
        );
        assert!((760.0 + width * content_scale) * scale < 1920.0 * scale);
    }
    assert!((demo_content_scale(Kind::Relative, 304.0) - 1.0).abs() < f32::EPSILON);
}
#[test]
fn fit_keeps_the_whole_overlay_inside_wide_and_tall_canvases() {
    for (width, height) in [(744.0, 731.0), (444.0, 731.0), (1044.0, 300.0)] {
        let scale = fitted_scale(width, height, CANVAS_PRESETS[0]).expect("canvas medido");
        assert!(1920.0 * scale <= width);
        assert!(1080.0 * scale <= height);
        // Standings llega al borde derecho sin salirse del viewport.
        let overlay = Overlay::configured(&demo_standings_settings(), Preferences::default());
        assert_eq!(overlay.wanted_size(), (338.0, 424.0));
        assert!((1560.0 + overlay.wanted_size().0) * scale <= 1920.0 * scale);
    }
    assert_eq!(
        fitted_scale(744.0, 731.0, CANVAS_PRESETS[0]),
        Some(744.0 / 1920.0)
    );
    for (width, height) in [
        (0.0, 10.0),
        (-1.0, 44.0),
        (f32::NAN, 900.0),
        (800.0, f32::INFINITY),
    ] {
        assert_eq!(fitted_scale(width, height, CANVAS_PRESETS[0]), None);
    }
}
#[test]
fn visibility_is_persisted_and_undoable_without_changing_selection() {
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor");
    editor.add(Kind::Radar).expect("radar");
    let selected = editor.selected.clone();
    editor.add(Kind::Standings).expect("standings");
    let id = editor.selected.clone().expect("instancia añadida");
    editor.selected = selected.clone();
    let previous = editor.layout().clone();
    toggle_visibility(&mut editor, &id).expect("ocultar");
    assert_eq!(editor.selected, selected);
    let reopened = Editor::open(file.path.clone()).expect("reabrir");
    assert!(
        reopened
            .layout()
            .instances
            .iter()
            .any(|item| item.id == id && !item.visible)
    );
    assert!(toggle_visibility(&mut editor, "inexistente").is_err());
    assert_eq!(editor.selected, selected);
    editor.undo().expect("deshacer visibilidad");
    assert_eq!(editor.layout(), &previous);
}

#[test]
fn drag_preview_does_not_jump_and_commit_is_one_undoable_edit() {
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor");
    editor.add(Kind::Radar).expect("añadir");
    let original = editor.layout().clone();
    let mut drag = Drag {
        pointer: (100.0, 200.0),
        origin: (20.0, 20.0),
        preview: (20.0, 20.0),
        scale: 1.0,
    };
    assert!(!drag.update((100.0, 200.0)));
    assert_eq!(drag.preview, (20.0, 20.0));
    assert!(drag.update((150.0, 260.0)));
    assert_eq!(editor.layout(), &original);
    assert!(!drag.update((f32::NAN, 0.0)));
    editor
        .edit_selected(|item| {
            item.x = drag.preview.0;
            item.y = drag.preview.1;
        })
        .expect("mover");
    assert_eq!(
        editor.selected().map(|item| (item.x, item.y)),
        Some((70.0, 80.0))
    );
    editor.undo().expect("deshacer");
    assert_eq!(editor.layout(), &original);
}
#[test]
fn held_arrows_repeat_accelerate_and_commit_once_on_release() {
    // Las distancias enteras son exactas en f32: comparar sus bits conserva esa garantía.
    for (ms, shift, expected) in [
        (0, false, 1.0_f32),
        (299, false, 1.0),
        (330, false, 2.0),
        (930, false, 25.0),
        (1830, false, 149.0),
        (330, true, 16.0),
    ] {
        assert_eq!(
            held_nudge_distance(Duration::from_millis(ms), shift).to_bits(),
            expected.to_bits()
        );
    }
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let original = studio.editor.layout().clone();
            let frame = studio.frames[0].1.clone();
            let origin = (frame.read(cx).item.x, frame.read(cx).item.y);
            let renderer = frame.read(cx).renderer.clone();
            studio.held_nudge = Some(HeldNudge {
                frame: frame.clone(),
                origin,
                direction: (1, 0),
                shift: false,
                started: Instant::now(),
            });
            for ms in [0, 330, 930, 1830] {
                studio.tick_nudge(Duration::from_millis(ms), cx);
                assert_eq!(studio.editor.layout(), &original);
                assert_eq!(
                    Editor::open(file.path.clone()).expect("disco").layout(),
                    &original
                );
                assert_eq!(frame.read(cx).renderer, renderer);
            }
            studio.finish_nudge(cx);
            assert_eq!(
                studio.editor.selected().expect("selección").x.to_bits(),
                (origin.0 + 149.0).to_bits()
            );
            studio.finish_nudge(cx); // La liberación también puede llegar desde el marco.
            studio.history(false, cx);
            assert_eq!(studio.editor.layout(), &original);
            studio.editor.undo().expect("añadir");
            assert!(studio.editor.layout().instances.is_empty());
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn opacity_preview_keeps_renderers_and_disk_then_commits_one_undoable_edit() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let original = studio.editor.layout().clone();
            let id = studio.editor.selected.clone().expect("selección");
            let frame = studio.frames[0].1.clone();
            let renderer = frame.read(cx).renderer.clone();
            for value in [0.9, 0.5, 0.25, 0.0] {
                studio.preview_opacity(&id, value, cx);
                assert_eq!(studio.editor.layout(), &original);
                assert_eq!(
                    Editor::open(file.path.clone()).expect("disco").layout(),
                    &original
                );
                assert_eq!(frame.read(cx).renderer, renderer);
                assert_eq!(frame.read(cx).opacity_preview, Some(value));
            }
            studio.finish_opacity(cx);
            assert_eq!(studio.frames[0].1, frame);
            assert_eq!(frame.read(cx).renderer, renderer);
            assert_eq!(
                studio
                    .editor
                    .selected()
                    .expect("selección")
                    .opacity
                    .to_bits(),
                0.0_f32.to_bits()
            );
            assert_eq!(
                Editor::open(file.path.clone()).expect("disco").layout(),
                studio.editor.layout()
            );
            studio.history(false, cx);
            assert_eq!(studio.editor.layout(), &original);
            studio.editor.undo().expect("añadir");
            assert!(studio.editor.layout().instances.is_empty());
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn interrupted_opacity_preview_is_discarded() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let original = studio.editor.layout().clone();
            let id = studio.editor.selected.clone().expect("selección");
            studio.preview_opacity(&id, 0.1, cx);
            studio.cancel_drag(cx);
            studio.finish_opacity(cx);
            assert_eq!(studio.editor.layout(), &original);
            assert!(studio.frames[0].1.read(cx).opacity_preview.is_none());
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn click_and_pointer_noise_leave_position_disk_and_history_unchanged() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            let original = studio.editor.layout().clone();
            for scale in [0.25, 0.5, 1.0, 1.5] {
                let frame = studio.frames[0].1.clone();
                frame.update(cx, |frame, _| {
                    frame.drag = Some(Drag {
                        pointer: (100.0, 100.0),
                        origin: (frame.item.x, frame.item.y),
                        preview: (frame.item.x, frame.item.y),
                        scale,
                    });
                });
                studio.drag = Some(frame);
                studio.finish_drag(gpui::point(px(101.0), px(102.0)), cx);
                assert_eq!(studio.editor.layout(), &original);
                assert_eq!(
                    Editor::open(file.path.clone()).expect("disco").layout(),
                    &original
                );
            }
            studio.editor.undo().expect("solo deshace añadir");
            assert!(studio.editor.layout().instances.is_empty());
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn preview_accepts_negative_positions_rejects_invalid_input_and_bounds_coordinates() {
    let mut drag = Drag {
        pointer: (12.0, 8.0),
        origin: (-200.0, 20.0),
        preview: (-200.0, 20.0),
        scale: 1.0,
    };
    assert!(drag.update((-20.0, 40.0)));
    assert_eq!(drag.preview, (-232.0, 52.0));
    let valid = drag.preview;
    assert!(!drag.update((f32::INFINITY, 0.0)));
    assert!(!drag.update((0.0, f32::NAN)));
    assert_eq!(drag.preview, valid);
    assert!(drag.update((1_000_000.0, -1_000_000.0)));
    assert_eq!(drag.preview, (100_000.0, -100_000.0));
}

#[test]
fn responsive_canvas_drag_persists_and_reloads_at_all_review_sizes() {
    for (width, height) in [(650.0, 540.0), (1000.0, 760.0), (1420.0, 1100.0)] {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Standings).expect("widget");
        let original = editor.layout().clone();
        let scale = fitted_scale(width, height, CANVAS_PRESETS[0]).expect("canvas");
        let mut drag = Drag {
            pointer: (100.0, 100.0),
            origin: (20.0, 20.0),
            preview: (20.0, 20.0),
            scale,
        };
        assert!(drag.update((100.0 + 48.0 * scale, 100.0 + 62.0 * scale)));
        editor
            .edit_selected(|item| {
                item.x = drag.preview.0;
                item.y = drag.preview.1;
            })
            .expect("commit");
        let reopened = Editor::open(file.path.clone()).expect("reload");
        assert_eq!(reopened.layout(), editor.layout());
        let item = &reopened.layout().instances[0];
        assert!((item.x - 68.0).abs() < 0.001);
        assert!((item.y - 82.0).abs() < 0.001);
        editor.undo().expect("undo");
        assert_eq!(editor.layout(), &original);
    }
}
#[test]
fn fitted_canvas_drag_maps_pointer_deltas_to_document_space() {
    let mut drag = Drag {
        pointer: (20.0, 20.0),
        origin: (760.0, 40.0),
        preview: (760.0, 40.0),
        scale: 0.5,
    };
    assert!(drag.update((30.0, 25.0)));
    assert_eq!(drag.preview, (780.0, 50.0));
}
#[test]
fn hidden_capture_without_selection_is_an_explicit_noop() {
    let file = crate::document::tests::File::new();
    let mut editor = Editor::open(file.path.clone()).expect("editor vacío");
    assert!(editor.selected.is_none());
    hide_selected_for_capture(&mut editor).expect("no-op sin selección");
    assert!(editor.layout().instances.is_empty());
    editor.add(Kind::Standings).expect("widget");
    hide_selected_for_capture(&mut editor).expect("ocultar");
    assert!(!editor.layout().instances[0].visible);
}
#[cfg(test)]
mod toolbar_status_tests {
    use super::*;
    #[test]
    fn long_save_errors_use_the_same_flexible_clipped_region_as_success() {
        for status in [
            AUTO_SAVED.to_owned(),
            "No se pudo guardar el documento: ".repeat(40),
        ] {
            let mut host = save_status_host(&status, div().child(status.clone()).truncate());
            assert_eq!(host.style().min_size.width, Some(px(0.0).into()));
            assert_eq!(host.style().flex_grow, Some(1.0));
            assert_eq!(host.style().overflow.x, Some(gpui::Overflow::Hidden));
        }
    }
}
#[test]
fn catalog_click_adds_selected_in_a_free_spot_and_locked_widgets_only_warn() {
    use super::add_widget::Toast;
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            studio.set_access(
                Access {
                    verified: true,
                    catalog: CatalogAccess::LaunchV1,
                    ..Access::default()
                },
                cx,
            );
            studio.show_catalog(cx);
            assert_eq!(studio.editor.selected, None, "sin selección: catálogo");
            studio.insert_widget(Kind::Radar, None, cx);
            assert_eq!(studio.editor.layout().instances.len(), 1, "Pro no se añade");
            assert_eq!(
                studio.toast,
                Some(Toast::Locked(Kind::Radar, "Incluida en Pro"))
            );
            studio.insert_widget(Kind::Pedals, None, cx);
            let added = studio
                .editor
                .selected()
                .expect("el nuevo queda seleccionado");
            assert_eq!(added.settings.kind(), Kind::Pedals);
            // Rectángulos pintados de cada marco, sin pasar por `taken()`.
            let rect = |id: &str| {
                let frame = studio
                    .frames
                    .iter()
                    .map(|(_, frame)| frame.read(cx))
                    .find(|frame| frame.item.id == id)
                    .expect("marco");
                let (w, h) = frame.renderer.read(cx).painted_size();
                let (w, h) = (w * frame.content_scale, h * frame.content_scale);
                (
                    frame.item.x,
                    frame.item.y,
                    frame.item.x + w,
                    frame.item.y + h,
                )
            };
            let standings = studio.editor.layout().instances[0].id.clone();
            let (a, b) = (rect(&standings), rect(&added.id.clone()));
            assert!(
                a.2 <= b.0 || b.2 <= a.0 || a.3 <= b.1 || b.3 <= a.1,
                "el hueco libre no solapa Standings: {a:?} · {b:?}"
            );
            assert_eq!(studio.toast, Some(Toast::Added(Kind::Pedals)));
            studio.edit(|editor| editor.edit_selected(|item| item.x += 10.0), cx);
            assert_eq!(
                studio.toast, None,
                "otra edición cierra el aviso y su «Deshacer»"
            );
            studio.history(false, cx);
            studio.history(false, cx);
            assert_eq!(
                studio.editor.layout().instances.len(),
                1,
                "Ctrl Z retira el widget"
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn escape_in_a_field_keeps_the_selection_and_only_the_canvas_returns_to_catalog() {
    use super::canvas::escape_returns_to_catalog;
    assert!(escape_returns_to_catalog(true, true), "Esc en el lienzo");
    assert!(
        !escape_returns_to_catalog(true, false),
        "Esc en un campo del inspector no deselecciona"
    );
    assert!(
        !escape_returns_to_catalog(false, true),
        "sin selección no hay nada que cerrar"
    );
}
#[test]
fn unverified_or_blocked_access_never_sells_pro() {
    use super::add_widget::{lock_badge, locked_note, locked_title, sells_pro};
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    for access in [
        Access::default(),
        Access {
            verified: true,
            blocked: true,
            catalog: CatalogAccess::Pro,
            ..Access::default()
        },
    ] {
        let reason = widget_lock(Some(access), Kind::Radar).expect("todo bloqueado");
        assert_eq!(reason, "Acceso sin verificar");
        assert!(!sells_pro(Some(access)), "sin «Ver planes»");
        assert_eq!(locked_title(Some(access)), "Pendiente de verificar acceso");
        assert_ne!(lock_badge(reason), "Pro");
        assert!(
            !locked_note(Some(access)).contains("Pro"),
            "{}",
            locked_note(Some(access))
        );
    }
    let launch = Access {
        verified: true,
        catalog: CatalogAccess::LaunchV1,
        ..Access::default()
    };
    assert!(sells_pro(Some(launch)));
    assert_eq!(locked_title(Some(launch)), "Con Vantare Pro");
    assert_eq!(lock_badge("Incluida en Pro"), "Pro");
    assert_eq!(
        locked_note(Some(launch)),
        "Tu acceso de lanzamiento incluye 4 widgets. Pro desbloquea los 13 restantes."
    );
    let free = Access {
        verified: true,
        catalog: CatalogAccess::Free,
        ..Access::default()
    };
    assert_eq!(
        locked_note(Some(free)),
        "Tu plan Gratis incluye 4 widgets. Pro desbloquea los 13 restantes."
    );
}
#[test]
fn ver_planes_reaches_the_plans_section_with_any_access() {
    use super::PLANS;
    use crate::Section;
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    for access in [
        Access::default(),
        Access {
            verified: true,
            catalog: CatalogAccess::Free,
            ..Access::default()
        },
        Access {
            verified: true,
            catalog: CatalogAccess::LaunchV1,
            ..Access::default()
        },
    ] {
        let mut section = Section::Studio;
        access
            .beta_navigate(&mut section, PLANS)
            .expect("«Ver planes» siempre navega");
        assert_eq!(section, PLANS);
    }
}
#[test]
fn drop_adds_only_with_its_ghost_and_enter_adds_the_first_unlocked_match() {
    use super::add_widget::{Ghost, Snap};
    use crate::shell::navigation::Access;
    use vantare_ipc::control::CatalogAccess;
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let file = crate::document::tests::File::new();
        let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
        studio.update(cx, |studio, cx| {
            studio.set_access(
                Access {
                    verified: true,
                    catalog: CatalogAccess::LaunchV1,
                    ..Access::default()
                },
                cx,
            );
            studio.show_catalog(cx);
            let count = |studio: &Studio| studio.editor.layout().instances.len();
            assert!(!studio.drop_ghost(Kind::Pedals, cx), "fuera del lienzo");
            assert_eq!(count(studio), 1);
            let ghost = |kind, studio: &Studio, cx: &mut Context<Studio>| Ghost {
                kind,
                snap: Snap {
                    at: (600.0, 300.0),
                    guides: (None, None),
                },
                overlay: studio.catalog_overlay(kind, 1.0, cx),
            };
            studio.ghost = Some(ghost(Kind::Delta, studio, cx));
            assert!(
                !studio.drop_ghost(Kind::Pedals, cx),
                "silueta de otro widget"
            );
            assert!(studio.ghost.is_none());
            studio.ghost = Some(ghost(Kind::Pedals, studio, cx));
            assert!(studio.drop_ghost(Kind::Pedals, cx));
            let added = studio.editor.selected().expect("seleccionado");
            assert_eq!(
                (added.settings.kind(), added.x, added.y),
                (
                    Kind::Pedals,
                    600.0 + studio.monitor.0,
                    300.0 + studio.monitor.1
                ),
                "punto con imán en coordenadas del monitor"
            );
            assert!(studio.ghost.is_none());
            for (query, expected) in [
                ("ped", Some(Kind::Pedals)),
                ("radar", None),
                ("", Some(Kind::Relative)),
            ] {
                studio
                    .search
                    .update(cx, |search, cx| search.set_value(query.into(), cx));
                assert_eq!(studio.first_addable(cx), expected, "Intro con «{query}»");
            }
        });
        crate::quit_headless_test(cx);
    });
}
