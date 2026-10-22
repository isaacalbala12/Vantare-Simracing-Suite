//! Interacción real de la shell sobre `TestPlatform`; sin ventanas ni capturas.
use super::*;
use crate::shell::{Loaded, Prepared, PreparedStudio};
use gpui::{HeadlessAppContext, WindowHandle, px, size};
use std::path::{Path, PathBuf};

struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "vantare-onboarding-review-{}",
            vantare_services::random_id().expect("entropía")
        ));
        std::fs::create_dir(&root).expect("directorio propio");
        Self(root)
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).expect("limpiar directorio propio");
    }
}

fn context() -> HeadlessAppContext {
    let mut cx = HeadlessAppContext::with_asset_source(
        gpui_platform::current_platform(true).text_system(),
        std::sync::Arc::new(crate::shell::assets::Icons),
    );
    cx.update(|cx| cx.set_global(crate::orbit::theme::Theme::default()));
    cx
}

fn open(root: &Path, cx: &mut HeadlessAppContext) -> WindowHandle<Hub> {
    let pipe = format!(
        "onboarding-test-{}",
        vantare_services::random_id().expect("id")
    );
    let loaded = Loaded {
        layout_preexisted: root.join("layout.json").exists(),
        preview_fixtures: None,
        appearance: crate::shell::settings::appearance::Store::load_or_default(
            &root.join("appearance.json"),
        )
        .0,
        appearance_error: None,
        prepared: Prepared::load(root, None).expect("escena"),
        studio: PreparedStudio::load(root.join("layout.json")).expect("layout"),
        calendar: crate::calendar::Calendar::load(root).expect("calendario"),
        notifications: crate::notifications::Center::default(),
        analysis: crate::analysis::Analysis::new(root.join("recordings"), root.join("no-storage")),
        launcher: crate::launcher::Store::load(root.join("launcher.json")).expect("launcher"),
        engineer: crate::engineer::Engineer::load(root.join("engineer.json")),
        strategy_dir: root.into(),
        testing_dir: root.into(),
        subscriber: vantare_ipc::Subscriber::connect(&pipe, |_| false).expect("suscriptor aislado"),
        service_pipe: pipe,
        demo: None,
        capture: None,
    };
    cx.open_window(size(px(1360.0), px(900.0)), |window, cx| {
        cx.new(|cx| {
            let mut hub = Hub::build(
                loaded,
                crate::Section::Home,
                Access::default(),
                std::rc::Rc::default(),
                window,
                cx,
            );
            let (send, _requests) = std::sync::mpsc::sync_channel(8);
            hub.remote =
                cx.new(|cx| crate::services::view::purchase_tests::fixture(cx, send, root));
            hub
        })
    })
    .expect("ventana de TestPlatform")
}

fn draw(window: impl Into<gpui::AnyWindowHandle>, cx: &mut HeadlessAppContext) {
    cx.update_window(window.into(), |_, window, cx| {
        window.draw(cx).clear(cx);
    })
    .expect("pintar árbol sin renderer");
}

fn key(window: impl Into<gpui::AnyWindowHandle>, stroke: &str, cx: &mut HeadlessAppContext) {
    cx.update_window(window.into(), |_, window, cx| {
        let keystroke = gpui::Keystroke::parse(stroke).expect("tecla");
        window.dispatch_event(
            gpui::PlatformInput::KeyDown(gpui::KeyDownEvent {
                keystroke: keystroke.clone(),
                is_held: false,
                prefer_character_input: false,
            }),
            cx,
        );
        window.dispatch_event(
            gpui::PlatformInput::KeyUp(gpui::KeyUpEvent { keystroke }),
            cx,
        );
    })
    .expect("teclado real");
}

fn page(window: WindowHandle<Hub>, step: usize, tabs: usize, cx: &mut HeadlessAppContext) {
    window
        .update(cx, |hub, window, cx| {
            hub.onboarding.as_mut().expect("asistente").page(step);
            hub.focus.focus(window, cx);
            cx.notify();
        })
        .expect("paso");
    draw(window, cx);
    cx.update_window(window.into(), |_, window, cx| {
        for _ in 0..tabs {
            window.focus_next(cx);
        }
    })
    .expect("tabulaciones");
    if tabs > 0 {
        window
            .update(cx, |hub, window, _| {
                assert!(
                    !hub.focus.is_focused(window),
                    "Tab debe alcanzar un control"
                );
            })
            .expect("control enfocado");
    }
    draw(window, cx);
}

#[test]
fn interrupted_setup_reopens_saved_crash_rejection_and_usage_acceptance() {
    gpui_platform::headless().run(|app| {
        for enable_usage in [false, true] {
            let root = Root::new();
            let mut cx = context();
            let first = open(&root.0, &mut cx);
            first
                .update(&mut cx, |hub, _, cx| {
                    hub.onboarding.as_mut().expect("asistente").page(PRIVACY);
                    if enable_usage {
                        hub.onboarding_toggle_usage(cx);
                    } else {
                        hub.onboarding_toggle_crashes(cx);
                    }
                })
                .expect("elección explícita");
            let saved = Privacy::load(&root.0).expect("privacy.json guardado");
            assert_eq!(saved.usage, enable_usage);
            assert_eq!(saved.crashes, enable_usage);
            cx.update_window(first.into(), |_, window, _| window.remove_window())
                .expect("cerrar");
            let reopened = open(&root.0, &mut cx);
            reopened
                .update(&mut cx, |hub, _, _| {
                    let choices = &hub.onboarding.as_ref().expect("reabierto").choices;
                    assert_eq!(choices.crashes, saved.crashes);
                    assert_eq!(choices.usage, saved.usage);
                })
                .expect("valores restaurados");
            page(reopened, PRIVACY, 0, &mut cx);
            key(reopened, "enter", &mut cx); // Terminar, sin tocar interruptores.
            reopened
                .update(&mut cx, |hub, window, cx| {
                    assert_eq!(hub.onboarding.as_ref().expect("resumen").step, DONE);
                    hub.onboarding_finish(false, window, cx);
                    assert!(hub.onboarding.is_none());
                })
                .expect("terminar configuración");
            assert_eq!(Privacy::load(&root.0).expect("decisión conservada"), saved);
            cx.update_window(reopened.into(), |_, window, _| window.remove_window())
                .expect("cerrar");
            drop(cx);
        }
        crate::quit_headless_test(app);
    });
}

#[test]
#[allow(clippy::too_many_lines)] // Un recorrido de foco real por los pasos 0–5.
fn enter_and_space_activate_focused_controls_instead_of_advancing_the_page() {
    gpui_platform::headless().run(|app| {
        let root = Root::new();
        let mut cx = context();
        let window = open(&root.0, &mut cx);
        page(window, 0, 0, &mut cx);
        key(window, "enter", &mut cx);
        window
            .update(&mut cx, |hub, _, _| {
                assert_eq!(hub.onboarding.as_ref().expect("empezar").step, 1);
            })
            .expect("Enter en la página avanza");
        for step in [1, 2] {
            // Saltar, primer simulador/estilo: controles reales del árbol pintado.
            page(window, step, 2, &mut cx);
            key(window, "enter", &mut cx);
            window
                .update(&mut cx, |hub, _, _| {
                    let state = hub.onboarding.as_ref().expect("asistente");
                    assert_eq!(state.step, step);
                    assert!(!if step == 1 {
                        state.choices.simulators[0]
                    } else {
                        state.choices.styles[0]
                    });
                })
                .expect("Enter cambia el control enfocado");
            key(window, "space", &mut cx);
            window
                .update(&mut cx, |hub, _, _| {
                    let state = hub.onboarding.as_ref().expect("asistente");
                    assert_eq!(state.step, step);
                    assert!(if step == 1 {
                        state.choices.simulators[0]
                    } else {
                        state.choices.styles[0]
                    });
                })
                .expect("Espacio cambia una sola vez");
        }
        page(window, 3, 4, &mut cx); // Saltar, Discord, Google, email.
        key(window, "enter", &mut cx);
        window
            .update(&mut cx, |hub, _, cx| {
                assert_eq!(hub.onboarding.as_ref().expect("cuenta").step, 3);
                assert!(
                    hub.remote.read(cx).email_open(),
                    "email usa el formulario nativo"
                );
            })
            .expect("login propio");
        page(window, 4, 3, &mut cx); // Saltar, Automático, primer nivel manual.
        key(window, "enter", &mut cx);
        window
            .update(&mut cx, |hub, _, _| {
                let state = hub.onboarding.as_ref().expect("rendimiento");
                assert_eq!(state.step, 4);
                assert!(!state.choices.automatic);
            })
            .expect("nivel manual");
        page(window, PRIVACY, 1, &mut cx); // Saltar oculto: primer foco = fallos.
        key(window, "enter", &mut cx);
        window
            .update(&mut cx, |hub, _, _| {
                let state = hub.onboarding.as_ref().expect("privacidad");
                assert_eq!(state.step, PRIVACY);
                assert!(!state.choices.crashes);
            })
            .expect("Enter apaga fallos sin terminar");
        cx.update_window(window.into(), |_, window, _| window.remove_window())
            .expect("cerrar");
        drop(cx);
        crate::quit_headless_test(app);
    });
}

#[test]
fn private_exit_revokes_memory_without_overwriting_the_unwritable_file() {
    gpui_platform::headless().run(|app| {
        let root = Root::new();
        let mut store = crate::shell::settings::privacy::Store::load(&root.0).expect("store");
        store
            .save(consent_privacy(store.value, true, true))
            .expect("permiso previo");
        let saved = store.value;
        drop(store);
        let mut cx = context();
        let window = open(&root.0, &mut cx);
        window
            .update(&mut cx, |hub, window, cx| {
                let state = hub.onboarding.as_mut().expect("asistente");
                state.page(PRIVACY);
                state.consent_error = true;
                hub.onboarding_enter_private(window, cx);
                assert!(hub.onboarding.is_none());
                let private = hub.settings.privacy.as_ref().expect("privacidad").value;
                assert!(!private.usage && !private.crashes);
                assert_eq!(private.generation, saved.generation);
                assert_eq!(Privacy::load(&root.0).expect("sin escrituras"), saved);
            })
            .expect("entrar sin guardar");
        cx.update_window(window.into(), |_, window, _| window.remove_window())
            .expect("cerrar");
        drop(cx);
        crate::quit_headless_test(app);
    });
}

#[test]
#[allow(clippy::too_many_lines)] // Tres salidas completas: 403, 409 y respuesta pendiente.
fn persistent_marketing_errors_allow_finishing_with_unconfirmed_mail() {
    gpui_platform::headless().run(|app| {
        let roots = [Root::new(), Root::new(), Root::new()];
        let mut cx = context();
        for (index, (error, pending)) in [
            ("403 verified_email_required", false),
            ("409 MailErasurePending", false),
            ("409 MailErasurePending", true),
        ]
        .into_iter()
        .enumerate()
        {
            let root = &roots[index];
            let window = open(&root.0, &mut cx);
            page(window, PRIVACY, 0, &mut cx);
            window
                .update(&mut cx, |hub, _, cx| {
                    hub.onboarding.as_mut().expect("asistente").signed = true;
                    hub.remote.update(cx, |remote, _| {
                        // Un ACK antiguo no confirma una elección que acaba de fallar.
                        remote.mail.consent = Some(true);
                        remote.mail.onboarding_saved = false;
                        remote.mail.pending = pending;
                        remote.mail.error = (!pending).then(|| error.into());
                    });
                })
                .expect("rechazo persistente");
            key(window, "enter", &mut cx); // Terminar por el teclado real.
            window
                .update(&mut cx, |hub, _, cx| {
                    if pending {
                        // Respuesta fallida a la petición iniciada por Terminar.
                        hub.remote.update(cx, |remote, _| {
                            remote.mail.error = Some(error.into());
                            remote.mail.pending = false;
                        });
                        hub.complete_onboarding_marketing(cx);
                    }
                    let state = hub.onboarding.as_ref().expect("resumen alcanzado");
                    assert_eq!(state.step, DONE);
                    assert!(state.marketing_unconfirmed);
                    assert_eq!(state.text, MARKETING_UNCONFIRMED);
                    assert!(state.error.is_none(), "no es un error de privacidad");
                    assert!(!state.consent_error);
                    assert!(!private_exit_available(state.step, state.consent_error));
                    let mail = &hub.remote.read(cx).mail;
                    assert_eq!(mail.consent, Some(true), "no inventar un ACK distinto");
                    assert!(!mail.onboarding_saved);
                    let privacy = Privacy::load(&root.0).expect("privacidad guardada");
                    assert!(!privacy.usage && privacy.crashes);
                    assert!(privacy.usage_decided && privacy.crashes_decided);
                    // Volver y terminar tampoco reabre el bucle del rechazo persistente.
                    hub.onboarding_back(cx);
                })
                .expect("error opcional permite el resumen");
            page(window, PRIVACY, 0, &mut cx);
            key(window, "enter", &mut cx);
            window
                .update(&mut cx, |hub, window, cx| {
                    assert_eq!(hub.onboarding.as_ref().expect("resumen").step, DONE);
                    hub.onboarding_finish(false, window, cx);
                    assert!(hub.onboarding.is_none(), "se sale del asistente");
                    assert!(
                        hub.settings
                            .general
                            .as_ref()
                            .expect("ajustes")
                            .value
                            .onboarding_completed
                    );
                })
                .expect("configuración completada sin permiso de correo");
            cx.update_window(window.into(), |_, window, _| window.remove_window())
                .expect("cerrar");
        }
        drop(cx);
        crate::quit_headless_test(app);
    });
}

#[test]
fn enter_on_a_passive_focused_control_bubbles_to_continue() {
    struct Passive {
        hub: gpui::Entity<Hub>,
        focus: gpui::FocusHandle,
    }
    impl gpui::Render for Passive {
        fn render(
            &mut self,
            _: &mut Window,
            cx: &mut gpui::Context<Self>,
        ) -> impl gpui::IntoElement {
            gpui::div()
                .on_key_up(cx.listener(|this, event, window, cx| {
                    this.hub
                        .update(cx, |hub, cx| hub.onboarding_key_up(event, window, cx));
                }))
                .child(
                    gpui::div()
                        .id("passive")
                        .track_focus(&self.focus)
                        .tab_index(0)
                        .size_full(),
                )
        }
    }
    gpui_platform::headless().run(|app| {
        let root = Root::new();
        let mut cx = context();
        let original = open(&root.0, &mut cx);
        let hub = original.root(&mut cx).expect("hub");
        let probe = cx
            .open_window(size(px(800.0), px(600.0)), |_, cx| {
                cx.new(|cx| Passive {
                    hub: hub.clone(),
                    focus: cx.focus_handle(),
                })
            })
            .expect("control pasivo");
        draw(probe, &mut cx);
        probe
            .update(&mut cx, |this, window, cx| this.focus.focus(window, cx))
            .expect("enfocar control");
        key(probe, "enter", &mut cx);
        hub.update(&mut cx, |hub, _| {
            assert_eq!(hub.onboarding.as_ref().expect("avanzó").step, 1);
        });
        cx.update_window(probe.into(), |_, window, _| window.remove_window())
            .expect("cerrar control");
        cx.update_window(original.into(), |_, window, _| window.remove_window())
            .expect("cerrar Hub");
        drop(hub);
        drop(cx);
        crate::quit_headless_test(app);
    });
}

/// Reutiliza el Hub aislado para comprobar handlers de Ajustes con su Remote real.
pub(in crate::shell) fn with_hub(test: impl FnOnce(&mut Hub, &mut gpui::Context<Hub>) + 'static) {
    gpui_platform::headless().run(move |app| {
        let root = Root::new();
        let mut cx = context();
        let window = open(&root.0, &mut cx);
        window
            .update(&mut cx, |hub, _, cx| test(hub, cx))
            .expect("comprobar Hub");
        cx.update_window(window.into(), |_, window, _| window.remove_window())
            .expect("cerrar Hub");
        drop(cx);
        crate::quit_headless_test(app);
    });
}

/// Paleta y modo guardados en `appearance.json`, el mismo archivo de Ajustes.
fn stored_look(root: &Path) -> (Palette, Scheme) {
    let saved = crate::shell::settings::appearance::Store::load(root.join("appearance.json"))
        .expect("apariencia")
        .settings;
    (saved.palette, saved.scheme)
}

#[test]
fn the_look_step_previews_saves_like_settings_and_survives_a_restart() {
    gpui_platform::headless().run(|app| {
        let root = Root::new();
        let mut cx = context();
        let window = open(&root.0, &mut cx);
        // Saltar y las nueve tarjetas: Ocean es la sexta.
        page(window, LOOK, 7, &mut cx);
        key(window, "space", &mut cx);
        window
            .update(&mut cx, |hub, _, cx| {
                assert_eq!(hub.onboarding.as_ref().expect("aspecto").step, LOOK);
                assert_eq!(hub.settings.appearance.settings.palette, Palette::Ocean);
                // Vista previa en vivo: el tema global ya es el elegido.
                assert_eq!(
                    cx.global::<crate::orbit::theme::Theme>().palette,
                    Palette::Ocean
                );
                // Ajustes › Apariencia muestra la misma selección.
                assert_eq!(hub.settings.quick_theme.read(cx).state.selected, Some(5));
            })
            .expect("estilo elegido con el teclado");
        assert_eq!(stored_look(&root.0), (Palette::Ocean, Scheme::Dark));
        // Tras las tarjetas: Sistema, Claro, Oscuro.
        page(window, LOOK, 12, &mut cx);
        key(window, "enter", &mut cx);
        window
            .update(&mut cx, |hub, _, cx| {
                assert_eq!(hub.onboarding.as_ref().expect("aspecto").step, LOOK);
                assert_eq!(
                    cx.global::<crate::orbit::theme::Theme>().scheme,
                    Scheme::Light
                );
            })
            .expect("modo claro");
        assert_eq!(stored_look(&root.0), (Palette::Ocean, Scheme::Light));
        cx.update_window(window.into(), |_, window, _| window.remove_window())
            .expect("cerrar");
        let reopened = open(&root.0, &mut cx);
        reopened
            .update(&mut cx, |hub, _, cx| {
                let settings = hub.settings.appearance.settings;
                assert_eq!(
                    (settings.palette, settings.scheme),
                    (Palette::Ocean, Scheme::Light)
                );
                assert_eq!(
                    cx.global::<crate::orbit::theme::Theme>().palette,
                    Palette::Ocean
                );
                assert_eq!(hub.settings.quick_theme.read(cx).state.selected, Some(5));
            })
            .expect("estilo conservado al reiniciar");
        cx.update_window(reopened.into(), |_, window, _| window.remove_window())
            .expect("cerrar");
        drop(cx);
        crate::quit_headless_test(app);
    });
}

#[test]
fn skipping_the_look_step_keeps_vantare_or_the_previous_choice() {
    gpui_platform::headless().run(|app| {
        for previous in [None, Some((Palette::Iris, Scheme::Light))] {
            let root = Root::new();
            let path = root.0.join("appearance.json");
            if let Some((palette, scheme)) = previous {
                // Elección previa hecha en Ajustes › Apariencia.
                let mut store =
                    crate::shell::settings::appearance::Store::load(path.clone()).expect("vacío");
                let settings = crate::orbit::theme::AppearanceSettings {
                    palette,
                    scheme,
                    ..store.settings
                };
                store.save(settings).expect("guardar en Ajustes");
            }
            let before = std::fs::read(&path).ok();
            let mut cx = context();
            let window = open(&root.0, &mut cx);
            // Saltar desde el primer paso pasa por encima del aspecto.
            window
                .update(&mut cx, |hub, _, cx| {
                    hub.onboarding.as_mut().expect("asistente").page(1);
                    hub.onboarding_skip(cx);
                    assert_eq!(hub.onboarding.as_ref().expect("privacidad").step, PRIVACY);
                })
                .expect("saltar");
            // Continuar en el paso de aspecto sin elegir tampoco escribe.
            page(window, LOOK, 0, &mut cx);
            key(window, "enter", &mut cx);
            window
                .update(&mut cx, |hub, window, cx| {
                    assert_eq!(hub.onboarding.as_ref().expect("privacidad").step, PRIVACY);
                    hub.onboarding.as_mut().expect("resumen").page(DONE);
                    hub.onboarding_finish(false, window, cx);
                    assert!(hub.onboarding.is_none());
                    let expected = previous.unwrap_or((Palette::Vantare, Scheme::Dark));
                    let settings = hub.settings.appearance.settings;
                    assert_eq!((settings.palette, settings.scheme), expected);
                    assert_eq!(
                        cx.global::<crate::orbit::theme::Theme>().palette,
                        expected.0
                    );
                })
                .expect("terminar sin elegir aspecto");
            assert_eq!(
                std::fs::read(&path).ok(),
                before,
                "saltar no escribe apariencia"
            );
            cx.update_window(window.into(), |_, window, _| window.remove_window())
                .expect("cerrar");
            drop(cx);
        }
        crate::quit_headless_test(app);
    });
}
