use std::process::Command;

fn git(args: &[&str]) -> String {
    let output = Command::new("git").args(args).output().expect("git");
    assert!(output.status.success());
    String::from_utf8(output.stdout)
        .expect("UTF-8")
        .trim()
        .into()
}

fn main() {
    let sha = git(&["rev-parse", "HEAD"]);
    let dirty = !git(&["status", "--porcelain"]).is_empty();
    println!("cargo:rustc-env=VANTARE_COUNT_SHA={sha}");
    println!("cargo:rustc-env=VANTARE_COUNT_DIRTY={dirty}");
    for name in ["HEAD", "index"] {
        println!(
            "cargo:rerun-if-changed={}",
            git(&["rev-parse", "--git-path", name])
        );
    }
    let reference = Command::new("git")
        .args(["symbolic-ref", "-q", "HEAD"])
        .output()
        .expect("ref");
    if reference.status.success() {
        let name = String::from_utf8(reference.stdout).expect("UTF-8");
        println!(
            "cargo:rerun-if-changed={}",
            git(&["rev-parse", "--git-path", name.trim()])
        );
    }
    for name in ["PROFILE", "OPT_LEVEL", "DEBUG"] {
        println!(
            "cargo:rustc-env=VANTARE_COUNT_{name}={}",
            std::env::var(name).expect(name)
        );
    }
    let rust = Command::new(std::env::var_os("RUSTC").expect("rustc"))
        .arg("--version")
        .output()
        .expect("rustc");
    assert!(rust.status.success());
    println!(
        "cargo:rustc-env=VANTARE_COUNT_RUST={}",
        String::from_utf8(rust.stdout).expect("UTF-8").trim()
    );
    println!("cargo:rerun-if-changed=src");
}
