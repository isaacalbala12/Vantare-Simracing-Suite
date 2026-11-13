fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var_os("CARGO_FEATURE_PAINT_STATS").is_some() {
        vantare_build_support::measurement_provenance()?;
    }
    vantare_build_support::embed_binary("vantare")
}
