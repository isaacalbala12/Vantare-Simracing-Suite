fn main() {
    if std::env::args_os().skip(1).eq(["--version"]) {
        println!("vantare-telemetry {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    eprintln!("vantare-telemetry: IPC runtime is not enabled");
    std::process::exit(2);
}
