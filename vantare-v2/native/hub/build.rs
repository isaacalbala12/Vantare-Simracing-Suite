#[path = "../packaging/windows-icon.rs"]
mod windows_icon;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    windows_icon::embed()
}
