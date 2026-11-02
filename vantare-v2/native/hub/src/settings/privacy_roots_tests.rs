//! Paso 0.ii: argumentos de la beta y decisión leída por el grabador/emisor.
use super::*;

#[test]
fn beta_privacy_choice_characterization() {
    let qa = std::env::temp_dir().join(format!(
        "vantare-1869-privacy-{}",
        vantare_services::random_id().expect("QA id")
    ));
    // beta.ps1: DATA_ROOT=<generation>/data, --data-dir=<generation>/data/hub.
    let base = qa.join("data");
    let hub = base.join("hub");
    let shared = base.join("Vantare/native");
    let selected = resolve_root(&hub, &base.join("VantareNative/hub"), shared.clone());
    let mut store = Store::load(&selected).expect("Hub");
    let choice = Privacy {
        crashes: true,
        usage: true,
        crashes_decided: true,
        usage_decided: true,
        ..Privacy::default()
    };
    store.save(choice).expect("explicit choice");
    assert_eq!(Privacy::load(&selected).expect("Hub restart"), choice);
    // Defecto conocido P1: los lectores reales usan diagnostics::data_root().
    assert_eq!(Privacy::load(&shared).expect("recorder/sender"), Privacy::default());
    drop(store);
    std::fs::remove_dir_all(qa).expect("QA cleanup");
}
