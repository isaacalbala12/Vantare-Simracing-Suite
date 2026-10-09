fn main() {
    println!("cargo:rerun-if-env-changed=VANTARE_VERSION");
    println!("cargo:rerun-if-env-changed=VANTARE_BUILD_CHANNEL");
}
