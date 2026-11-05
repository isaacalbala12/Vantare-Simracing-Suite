//! Dos dueños del mismo documento y dos raíces independientes, sin lanzar apps.
use super::*;
use crate::chain::{Chain, Status};
use std::time::Duration;

fn store(root: &std::path::Path) -> Store {
    fs::create_dir_all(root).unwrap();
    let mut profile = Profile::new("qa".into(), "QA".into());
    profile.first_step_delay = 3600;
    profile.steps.push(Step { app_id: "obs".into(), delay_seconds: 0, args_override: None });
    Store::in_memory(root.join("launcher.json"), Document {
        profiles: vec![profile], ..Document::default()
    }).unwrap()
}

fn start_in_store(store: &Store) -> Result<Chain, String> {
    Chain::start(store.document.clone(), store.document.profiles[0].clone(),
        |_| Discovery::default(), crate::processes::Shared::default(), None)
}

fn waiting(store: &Store) -> Chain {
    let chain = start_in_store(store).expect("fixture válido");
    let event = chain.progress.recv_timeout(Duration::from_secs(5)).expect("espera inicial observable");
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
    if let Ok(mut chain) = other { chain.shutdown().unwrap(); }
    active.shutdown().unwrap();
    let mut after_release = waiting(&second);
    after_release.shutdown().unwrap();
    assert!(!admitted, "dos dueños no deben ejecutar cadenas sobre el mismo archivo");
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
    if let Ok(mut chain) = other { chain.shutdown().unwrap(); }
    active.shutdown().unwrap();
    assert!(admitted, "el bloqueo de una raíz no bloquea otra instalación QA");
}
