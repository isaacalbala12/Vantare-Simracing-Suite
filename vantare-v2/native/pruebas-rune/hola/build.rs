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
    let head_ref = git(&["symbolic-ref", "HEAD"]);
    println!(
        "cargo:rerun-if-changed={}",
        git(&["rev-parse", "--git-path", &head_ref])
    );
    println!("cargo:rerun-if-changed=src/main.rs");
}
