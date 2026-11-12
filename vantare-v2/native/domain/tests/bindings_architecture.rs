//! Binding generation must never enter the shipping domain/UI/overlay/Hub graph.
use std::process::Command;
fn tree(package: &str, features: &[&str], edges: &str) -> String {
    let output = Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "-p",
            package,
            "--edges",
            edges,
            "--prefix",
            "none",
        ])
        .args(features)
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo tree");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("UTF-8 graph")
}
#[test]
fn default_domain_and_shipping_ui_overlays_hub_do_not_include_ts_rs() {
    // Overlays and Workshop are binaries of vantare-ui. Dev-only host test
    // dependencies are deliberately excluded: this guards the shipping graph.
    for package in ["vantare-domain", "vantare-ui", "vantare-hub"] {
        let graph = tree(package, &[], "normal,build");
        assert!(
            !graph
                .lines()
                .any(|line| line.split_whitespace().next() == Some("ts-rs")),
            "ts-rs leaked into {package}: {graph}"
        );
    }
}
#[test]
fn host_bindings_is_the_explicit_opt_in_for_domain_bindings() {
    let graph = tree(
        "vantare-hub-host",
        &["--features", "bindings", "--invert", "vantare-domain"],
        "features",
    );
    assert!(
        graph.contains("vantare-domain feature \"bindings\""),
        "host must enable domain bindings: {graph}"
    );
}

#[cfg(feature = "bindings")]
#[test]
fn every_extracted_widget_data_type_supports_host_bindings() {
    use vantare_domain::widget_settings::{
        columns, delta, fuel_strategy, look, pedals, relative, standings,
    };
    fn exported<T: ts_rs::TS>() -> String {
        assert!(!T::decl(&ts_rs::Config::default()).is_empty());
        T::name(&ts_rs::Config::default())
    }
    let names = [
        exported::<look::Look>(),
        exported::<look::Tone>(),
        exported::<look::Accent>(),
        exported::<columns::Format>(),
        exported::<columns::Style>(),
        exported::<columns::ColumnSetting>(),
        exported::<standings::Settings>(),
        exported::<relative::Settings>(),
        exported::<delta::Settings>(),
        exported::<pedals::Settings>(),
        exported::<fuel_strategy::Settings>(),
    ];
    assert_eq!(
        std::collections::BTreeSet::from(names).len(),
        11,
        "no TS declaration collisions"
    );
}
