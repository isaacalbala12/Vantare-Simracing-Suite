//! Capturas de los tres escritores anteriores al paso 4, sin normalizar el JSON.
use super::super::super::policy::{Policy, Retry};
use super::super::tests::with_decision_window;
use super::*;

fn policy_case(index: usize) -> Document {
    let mut profile = Profile::new("p".into(), format!("Caso {index}"));
    profile.steps.push(Step {
        app_id: "lmu".into(),
        delay_seconds: 17,
        args_override: Some(vec!["--qa".into()]),
    });
    profile.description = "Descripción conservada".into();
    profile.notes = "Notas conservadas".into();
    profile.launch_count = 7;
    profile.last_launched_at = Some("2026-11-01T12:00:00Z".into());
    profile.avg_chain_duration_ms = 123;
    if index % 2 == 1 {
        profile.first_step_delay = 17;
        profile.max_retries = 2;
        profile.reuse_running = false;
        profile.continue_on_error = true;
    }
    profile.policy = match index {
        0 | 1 => None,
        2 | 3 => Some(Policy::default()),
        _ => Some(Policy {
            already_running: Running::Restart,
            failure: Failure::Continue,
            cancel: Close::Started,
            exit: Close::Leave,
            retry: Retry::All,
            first_step_delay: u32::MAX,
            max_retries: 3,
        }),
    };
    let mut untouched = Profile::new("untouched".into(), "Antiguo sin editar".into());
    untouched.first_step_delay = 23;
    untouched.max_retries = 1;
    untouched.continue_on_error = true;
    Document {
        profiles: vec![profile, untouched],
        wails_import: Some(vantare_launcher::legacy::Import {
            source: std::path::PathBuf::from("D:/VantareServer/qa/archive.json"),
            launcher: [(
                "unusedHistory".into(),
                serde_json::json!({"keep": [1, 2, 3]}),
            )]
            .into(),
        }),
        ..Document::default()
    }
}

fn prepare_case(launcher: &mut Launcher, index: usize) {
    let path = launcher.store.path.clone();
    std::fs::write(
        &path,
        serde_json::to_vec_pretty(&policy_case(index)).unwrap(),
    )
    .unwrap();
    launcher.store = Store::load(path).expect("lector real antes de editar");
    launcher.discovered.apps[0].availability.launchable = true;
}

fn saved_bytes(launcher: &Launcher) -> String {
    String::from_utf8(std::fs::read(&launcher.store.path).expect("JSON realmente guardado"))
        .unwrap()
}

#[test]
fn three_policy_writers_preserve_the_18_pre_refactor_json_byte_captures() {
    with_decision_window(|window, cx| {
        let mut actual = Vec::new();
        for writer in 0..3 {
            for case in 0..6 {
                let bytes = window
                    .update(cx, |launcher, window, cx| {
                        prepare_case(launcher, case);
                        match writer {
                            0 => {
                                let profile = launcher.store.document.profiles[0].clone();
                                launcher.profile_editor(profile, window, cx);
                                launcher.commit_form(window, cx);
                                assert!(
                                    launcher.profile_draft.is_none(),
                                    "editor: {}",
                                    launcher.status
                                );
                            }
                            1 => {
                                assert!(launcher.edit(
                                    |document| {
                                        let mut profile = document.profiles[0].clone();
                                        for (option, selected) in
                                            [(0, 2), (1, 2), (2, 3), (3, 1), (4, 1)]
                                        {
                                            set_option(
                                                &mut profile,
                                                &[0, 5, 17],
                                                option,
                                                selected,
                                            )?;
                                        }
                                        document.save_profile(profile)
                                    },
                                    cx
                                ));
                            }
                            _ => {
                                for option in [0, 1, 2] {
                                    launcher.toggle_saved_preference("p", option, cx);
                                    assert_eq!(launcher.status, "Guardado local confirmado");
                                }
                            }
                        }
                        saved_bytes(launcher)
                    })
                    .expect("escritor real en ventana de prueba");
                actual.push(bytes);
            }
        }
        let receipt = std::path::PathBuf::from(
            std::env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("QA aislada"),
        )
        .join("launcher-policy-captured.json");
        std::fs::create_dir_all(receipt.parent().unwrap()).unwrap();
        std::fs::write(receipt, serde_json::to_vec_pretty(&actual).unwrap()).unwrap();
        let expected: Vec<String> =
            serde_json::from_str(include_str!("policy-bytes.json")).unwrap();
        assert_eq!(actual.len(), 18);
        for (index, (actual, expected)) in actual.iter().zip(&expected).enumerate() {
            assert_eq!(
                actual.as_bytes(),
                expected.as_bytes(),
                "escritor {}, caso {}",
                index / 6,
                index % 6
            );
        }
        assert_eq!(
            expected.len(),
            18,
            "primero registrar las capturas antes del refactor"
        );
    });
}
