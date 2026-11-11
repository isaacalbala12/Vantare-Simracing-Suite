fn main() -> std::io::Result<()> {
    let path = std::env::args_os().nth(1).map_or_else(
        || {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../hub-web/src/contract/generated")
        },
        std::path::PathBuf::from,
    );
    std::fs::create_dir_all(&path)?;
    std::fs::create_dir_all(path.join("corpus"))?;
    for (id, typescript, corpus) in vantare_hub_host::protocol::bindings::module_outputs() {
        std::fs::write(path.join(format!("{id}.ts")), typescript)?;
        std::fs::write(
            path.join("corpus").join(format!("{id}.json")),
            serde_json::to_string_pretty(&corpus).expect("corpus") + "\n",
        )?;
    }
    Ok(())
}
