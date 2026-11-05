//! Dos dueños del mismo documento y dos raíces independientes, sin lanzar apps.
use super::*;
use crate::chain::{Chain, Status};
use std::time::Duration;

fn store(root: &std::path::Path) -> Store {
    fs::create_dir_all(root).unwrap();
    let mut profile = Profile::new("qa".into(), "QA".into());
    profile.first_step_delay = 3600;
    profile.steps.push(Step {
        app_id: "obs".into(),
        delay_seconds: 0,
        args_override: None,
    });
    Store::in_memory(
        root.join("launcher.json"),
        Document {
            profiles: vec![profile],
            ..Document::default()
        },
    )
    .unwrap()
}

fn start_in_store(store: &Store) -> Result<Chain, String> {
    Chain::start(
        store.document.clone(),
        store.document.profiles[0].clone(),
        |_| Discovery::default(),
        crate::processes::Shared::default(),
        None,
        &store.path,
    )
}

fn waiting(store: &Store) -> Chain {
    let chain = start_in_store(store).expect("fixture válido");
    let event = chain
        .progress
        .recv_timeout(Duration::from_secs(5))
        .expect("espera inicial observable");
    assert_eq!(event.status, Status::Pending);
    assert_eq!(event.step, Some(0));
    chain
}

#[test]
fn concurrent_owners_of_the_same_settings_are_rejected_until_the_worker_exits() {
    let tree = Tree::new();
    let first = store(&tree.0.join("shared"));
    let second = store(&tree.0.join("shared"));
    assert_eq!(first.path, second.path);
    let mut active = waiting(&first);
    let other = start_in_store(&second);
    let admitted = other.is_ok();
    if let Ok(mut chain) = other {
        chain.shutdown().unwrap();
    }
    active.shutdown().unwrap();
    let mut after_release = waiting(&second);
    after_release.shutdown().unwrap();
    assert!(
        !admitted,
        "dos dueños no deben ejecutar cadenas sobre el mismo archivo"
    );
}

#[test]
fn concurrent_owners_of_independent_settings_remain_independent() {
    let tree = Tree::new();
    let first = store(&tree.0.join("a"));
    let second = store(&tree.0.join("b"));
    assert_ne!(first.path, second.path);
    let mut active = waiting(&first);
    let other = start_in_store(&second);
    let admitted = other.is_ok();
    if let Ok(mut chain) = other {
        chain.shutdown().unwrap();
    }
    active.shutdown().unwrap();
    assert!(
        admitted,
        "el bloqueo de una raíz no bloquea otra instalación QA"
    );
}

// This helper is invoked only by the test below, with its own QA root.
#[test]
fn concurrent_lock_helper() {
    use std::io::Read as _;
    let Some(root) = std::env::var_os("VANTARE_R12_LOCK_ROOT") else {
        return;
    };
    let root = std::path::PathBuf::from(root);
    let owned = store(&root);
    let mut chain = waiting(&owned);
    fs::write(root.join("ready"), []).unwrap();
    // The parent keeps stdin open; EOF also releases the worker if the parent exits.
    let _ = std::io::stdin().read_exact(&mut [0]);
    chain.shutdown().unwrap();
}

#[test]
fn concurrent_cross_process_owner_releases_the_lock_after_a_crash() {
    struct Helper(std::process::Child);
    impl Drop for Helper {
        fn drop(&mut self) {
            if self.0.try_wait().ok().flatten().is_none() {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
    }
    let tree = Tree::new();
    let owned = store(&tree.0.join("crashed-owner"));
    let root = owned.path.parent().unwrap();
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "tests::concurrency_tests::concurrent_lock_helper",
            "--nocapture",
        ])
        .env("VANTARE_R12_LOCK_ROOT", root)
        .stdin(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        command.creation_flags(0x0800_0000);
    }
    let mut helper = Helper(command.spawn().expect("helper propio retenido por handle"));
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    // A file handshake crosses processes without an arbitrary startup sleep.
    // Polling is bounded and stops as soon as the helper reports a Pending step.
    while !root.join("ready").exists() && std::time::Instant::now() < deadline {
        assert!(
            helper.0.try_wait().unwrap().is_none(),
            "helper terminó antes de estar activo"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(
        root.join("ready").exists(),
        "helper válido con cadena activa"
    );
    let other = start_in_store(&owned);
    let admitted = other.is_ok();
    if let Ok(mut chain) = other {
        chain.shutdown().unwrap();
    }
    helper
        .0
        .kill()
        .expect("simular caída solo del helper propio");
    helper.0.wait().expect("recoger helper propio");
    let mut after_crash = waiting(&owned);
    after_crash.shutdown().unwrap();
    assert!(
        !admitted,
        "otro proceso no puede ejecutar una cadena del mismo documento"
    );
}
