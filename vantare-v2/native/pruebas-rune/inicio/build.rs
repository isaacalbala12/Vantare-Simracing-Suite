use std::process::Command;

fn git(args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .output()
        .expect("git para procedencia");
    assert!(output.status.success(), "git {args:?}");
    String::from_utf8(output.stdout)
        .expect("salida UTF-8")
        .trim()
        .to_owned()
}

fn main() {
    let sha = git(&["rev-parse", "HEAD"]);
    let dirty = !git(&["status", "--porcelain"]).is_empty();
    println!("cargo:rustc-env=VANTARE_BUILD_SHA={sha}");
    println!("cargo:rustc-env=VANTARE_BUILD_DIRTY={dirty}");
    for name in ["HEAD", "index"] {
        println!(
            "cargo:rerun-if-changed={}",
            git(&["rev-parse", "--git-path", name])
        );
    }
    let reference = Command::new("git")
        .args(["symbolic-ref", "-q", "HEAD"])
        .output()
        .expect("consulta de rama");
    if reference.status.success() {
        let reference = String::from_utf8(reference.stdout).expect("referencia UTF-8");
        println!(
            "cargo:rerun-if-changed={}",
            git(&["rev-parse", "--git-path", reference.trim()])
        );
    }
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=assets");
    assert_eq!(
        std::env::var("PROFILE").unwrap(),
        "release",
        "medicion solo Release"
    );
    assert_eq!(std::env::var("OPT_LEVEL").unwrap(), "3");
    let rust = Command::new(std::env::var_os("RUSTC").unwrap())
        .arg("--version")
        .output()
        .unwrap();
    println!(
        "cargo:rustc-env=VANTARE_BUILD_RUST={}",
        String::from_utf8(rust.stdout).unwrap().trim()
    );
}
