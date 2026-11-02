//! Authenticated, closed ZIP extraction. The same handle binds hash and bytes.
use super::{
    current_members, installation,
    write_fs::{self, Result, ensure},
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{self, Read, Seek, SeekFrom},
    path::Path,
};

pub fn expand(
    zip_path: &Path,
    expected_sha: &str,
    destination: &Path,
    channel: &str,
) -> Result<super::Manifest> {
    super::validate_catalogue()?;
    write_fs::path(zip_path)?;
    write_fs::path(destination)?;
    ensure(
        super::validation::hex(expected_sha, 64),
        "SHA-256 externo obligatorio",
    )?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1);
    }
    let mut input = options.open(zip_path)?;
    ensure(
        input.metadata()?.len() <= 128 * 1024 * 1024,
        "ZIP comprimido supera el límite",
    )?;
    let mut hash = Sha256::new();
    io::copy(&mut input, &mut hash)?;
    ensure(
        format!("{:x}", hash.finalize()) == expected_sha,
        "SHA-256 externo incorrecto",
    )?;
    input.rewind()?;
    let archive = zip::ZipArchive::new(input)?;
    let mut allowed = current_members(channel);
    allowed.push("manifest.json");
    // Inspect raw records before an indexed archive can hide a duplicate or
    // reject its count for a different reason.
    let central = archive.central_directory_start();
    let mut input = archive.into_inner();
    validate_central(&mut input, central, &allowed)?;
    input.rewind()?;
    let mut archive = zip::ZipArchive::new(input)?;
    ensure(
        archive.len() == allowed.len(),
        "Número de miembros ZIP incorrecto",
    )?;
    let mut seen = HashSet::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let member = archive.by_index(index)?;
        ensure(
            allowed.contains(&member.name()) && seen.insert(member.name().to_owned()),
            "Miembro ZIP no autorizado o duplicado",
        )?;
        total = total
            .checked_add(member.size())
            .ok_or_else(|| super::WriteError::new(1, "Tamaño ZIP fuera de rango"))?;
        ensure(
            member.size() <= 256 * 1024 * 1024 && total <= 512 * 1024 * 1024,
            "ZIP supera el límite de extracción",
        )?;
        // Exact names forbid traversal, ADS, directory entries and .env.
        let mode = member.unix_mode().unwrap_or_default();
        ensure(
            mode & 0xf000 != 0xa000 && !member.is_symlink(),
            "Enlace ZIP rechazado",
        )?;
        ensure(
            matches!(
                member.compression(),
                zip::CompressionMethod::Stored | zip::CompressionMethod::Deflated
            ),
            "Compresión ZIP no compatible",
        )?;
    }
    fs::create_dir_all(destination)?;
    for index in 0..archive.len() {
        let mut member = archive.by_index(index)?;
        let target = destination.join(member.name());
        write_fs::path(&target)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)?;
        // The backend bounds compressed input, not Deflate output. Never trust
        // a forged directory size enough to write the entire expanded stream.
        let declared = member.size();
        let copied = io::copy(&mut member.by_ref().take(declared + 1), &mut output)?;
        ensure(copied == declared, "Tamaño ZIP extraído incorrecto")?;
        output.sync_all()?;
    }
    let manifest = super::Manifest::read(
        &destination.join("manifest.json"),
        super::ReadProfile::Probe,
    )?;
    ensure(
        manifest.channel == channel,
        "Canal del paquete incompatible",
    )?;
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
        if signature != *b"PK\x01\x02" {
            break;
        }
        let mut header = [0; 42];
        input.read_exact(&mut header)?;
        let attrs = u32::from_le_bytes(
            header[34..38]
                .try_into()
                .map_err(|_| super::WriteError::new(1, "Cabecera ZIP inválida"))?,
        );
        ensure(
            attrs & 0x400 == 0 && (attrs >> 16) & 0xf000 != 0xa000,
            "Enlace ZIP rechazado",
        )?;
        let length = usize::from(u16::from_le_bytes([header[24], header[25]]));
        let extra = u16::from_le_bytes([header[26], header[27]]);
        let comment = u16::from_le_bytes([header[28], header[29]]);
        let mut name = vec![0; length];
        input.read_exact(&mut name)?;
        let name = String::from_utf8(name)
            .map_err(|_| super::WriteError::new(1, "Nombre ZIP inválido"))?;
        ensure(
            allowed.contains(&name.as_str()) && seen.insert(name),
            "Miembro ZIP no autorizado o duplicado",
        )?;
        input.seek(SeekFrom::Current(i64::from(extra) + i64::from(comment)))?;
    }
    ensure(seen.len() == allowed.len(), "ZIP incompleto")
}

#[cfg(all(test, windows, feature = "transport"))]
mod central_tests {
    use std::{
        fs,
        io::{Seek, Write},
        path::PathBuf,
    };

    #[test]
    fn duplicate_is_rejected_by_the_raw_central_directory_validator() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent
            .join("p4-central-tests")
            .join(crate::engine::write_fs::id().expect("ID"));
        crate::engine::context::qa_path(&root).expect("QA guard");
        fs::create_dir_all(&root).expect("owned root");
        let mut file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(root.join("duplicate.central"))
            .expect("fixture");
        let name = b"bin/a.exe";
        let mut header = [0_u8; 42];
        header[24..26].copy_from_slice(
            &u16::try_from(name.len())
                .expect("name length")
                .to_le_bytes(),
        );
        for _ in 0..2 {
            file.write_all(b"PK\x01\x02").expect("signature");
            file.write_all(&header).expect("header");
            file.write_all(name).expect("name");
        }
        file.write_all(b"PK\x05\x06").expect("end");
        assert!(super::validate_central(&mut file, 0, &["bin/a.exe", "bin/b.exe"]).is_err());
        // The second name was consumed: this failed in validate_central, not
        // in ZipArchive indexing/count validation or an incomplete catalogue.
        assert_eq!(
            file.stream_position().expect("cursor"),
            u64::try_from(2 * (46 + name.len())).expect("position")
        );
    }
}
