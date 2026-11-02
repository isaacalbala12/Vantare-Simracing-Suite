//! Authenticated, closed ZIP extraction. The same handle binds hash and bytes.
use super::{installation, current_members, write_fs::{self, Result, ensure}};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, io::{self, Read, Seek, SeekFrom}, path::Path};

pub fn expand(zip_path: &Path, expected_sha: &str, destination: &Path, channel: &str) -> Result<super::Manifest> {
    super::validate_catalogue()?;
    write_fs::path(zip_path)?;
    write_fs::path(destination)?;
    ensure(super::validation::hex(expected_sha, 64), "SHA-256 externo obligatorio")?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    { use std::os::windows::fs::OpenOptionsExt; options.share_mode(1); }
    let mut input = options.open(zip_path)?;
    ensure(input.metadata()?.len() <= 128 * 1024 * 1024, "ZIP comprimido supera el límite")?;
    let mut hash = Sha256::new();
    io::copy(&mut input, &mut hash)?;
    ensure(format!("{:x}", hash.finalize()) == expected_sha, "SHA-256 externo incorrecto")?;
    input.rewind()?;
    let mut archive = zip::ZipArchive::new(input)?;
    let mut allowed = current_members(channel);
    allowed.push("manifest.json");
    ensure(archive.len() == allowed.len(), "Número de miembros ZIP incorrecto")?;
    let mut seen = HashSet::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let member = archive.by_index(index)?;
        ensure(allowed.contains(&member.name()) && seen.insert(member.name().to_owned()), "Miembro ZIP no autorizado o duplicado")?;
        total = total.checked_add(member.size()).ok_or_else(|| super::WriteError::new(1, "Tamaño ZIP fuera de rango"))?;
        ensure(member.size() <= 256 * 1024 * 1024 && total <= 512 * 1024 * 1024, "ZIP supera el límite de extracción")?;
        // Exact names forbid traversal, ADS, directory entries and .env.
        let mode = member.unix_mode().unwrap_or_default();
        ensure(mode & 0xf000 != 0xa000 && !member.is_symlink(), "Enlace ZIP rechazado")?;
        ensure(matches!(member.compression(), zip::CompressionMethod::Stored | zip::CompressionMethod::Deflated), "Compresión ZIP no compatible")?;
    }
    let central = archive.central_directory_start();
    let mut input = archive.into_inner();
    validate_central(&mut input, central, &allowed)?;
    input.rewind()?;
    let mut archive = zip::ZipArchive::new(input)?;
    fs::create_dir_all(destination)?;
    for index in 0..archive.len() {
        let mut member = archive.by_index(index)?;
        let target = destination.join(member.name());
        write_fs::path(&target)?;
        if let Some(parent) = target.parent() { fs::create_dir_all(parent)?; }
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&target)?;
        ensure(io::copy(&mut member, &mut output)? == member.size(), "Tamaño ZIP extraído incorrecto")?;
        output.sync_all()?;
    }
    let manifest = super::Manifest::read(&destination.join("manifest.json"), super::ReadProfile::Probe)?;
    ensure(manifest.channel == channel, "Canal del paquete incompatible")?;
    // Incoming packages require the entire current catalogue, while installed
    // manifests retain their own historical subset.
    manifest.installed(destination, true)?;
    installation::tree(destination)?;
    Ok(manifest)
}

// ZipArchive indexes names; validate raw directory records as well so duplicate
// records cannot disappear in that index. Preserve the PS check of both Unix
// symlinks and the raw Windows reparse bit, irrespective of the creator OS.
fn validate_central(input: &mut fs::File, offset: u64, allowed: &[&str]) -> Result<()> {
    input.seek(SeekFrom::Start(offset))?;
    let mut seen = HashSet::new();
    loop {
        let mut signature = [0; 4];
        input.read_exact(&mut signature)?;
        if signature != *b"PK\x01\x02" { break; }
        let mut header = [0; 42];
        input.read_exact(&mut header)?;
        let attrs = u32::from_le_bytes(header[34..38].try_into().map_err(|_| super::WriteError::new(1, "Cabecera ZIP inválida"))?);
        ensure(attrs & 0x400 == 0 && (attrs >> 16) & 0xf000 != 0xa000, "Enlace ZIP rechazado")?;
        let length = usize::from(u16::from_le_bytes([header[24], header[25]]));
        let extra = u16::from_le_bytes([header[26], header[27]]);
        let comment = u16::from_le_bytes([header[28], header[29]]);
        let mut name = vec![0; length];
        input.read_exact(&mut name)?;
        let name = String::from_utf8(name).map_err(|_| super::WriteError::new(1, "Nombre ZIP inválido"))?;
        ensure(allowed.contains(&name.as_str()) && seen.insert(name), "Miembro ZIP no autorizado o duplicado")?;
        input.seek(SeekFrom::Current(i64::from(extra) + i64::from(comment)))?;
    }
    ensure(seen.len() == allowed.len(), "ZIP incompleto")
}
