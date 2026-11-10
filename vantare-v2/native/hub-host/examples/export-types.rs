fn main() -> std::io::Result<()> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../hub-web/src/contract/generated");
    std::fs::create_dir_all(&path)?;
    std::fs::write(
        path.join("contract.ts"),
        vantare_hub_host::protocol::typescript(),
    )?;
    std::fs::write(
        path.join("corpus.json"),
        vantare_hub_host::protocol::bindings::corpus_json(),
    )
}
