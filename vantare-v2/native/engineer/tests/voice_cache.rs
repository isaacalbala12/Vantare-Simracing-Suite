#![cfg(windows)]
use std::{fs, io, path::PathBuf, time::Duration};
use vantare_engineer::{
    radio::{Intent, Locale},
    voice::{Voice, cache_key, clip_paths, coverage, resolve_clip},
};

#[test]
fn keys_match_frozen_go_cache_key_vectors_including_utf8() {
    // Obtenidos 2026-09-30 con go run, importando internal/tts y llamando
    // (&tts.Cache{}).Key(locale, voice, text); no hash Rust como oráculo.
    for (locale, voice, text, expected) in [
        (
            "es",
            "ef_dora",
            "Queda un litro",
            "548efa3ffeefef2900d83b32b51d0b099f96f2d273845432e236e41e8f784e17",
        ),
        (
            "en",
            "af_bella",
            "Car left",
            "b02f71a4c58e0828fc4cb2d21a086794df273b40b14d6e9c53063c16d32c4fd8",
        ),
        (
            "it",
            "if_sara",
            "Rimane metà serbatoio",
            "c947cb1ee85436503cc4ed10fce6070f46593f42039c29420ed5c8d775261c00",
        ),
        (
            "pt-BR",
            "pf_dora",
            "Volta concluída",
            "5c0e9db2fa68bec0bd4d8c23a1807b31f6a53aa0e4737a2846f400fff6da038a",
        ),
    ] {
        assert_eq!(cache_key(locale, voice, text).expect("CNG"), expected);
        assert_eq!(Locale::parse(locale).expect("locale").voice(), voice);
    }
    assert_eq!(Intent::LapCompleted.text(Locale::PtBr), "Volta concluída");
    assert_ne!(
        cache_key("es", "ef_dora", "Queda un litro").expect("CNG"),
        cache_key("es", "otra", "Queda un litro").expect("CNG")
    );
    assert_ne!(
        cache_key("a", "bc", "d").expect("CNG"),
        cache_key("ab", "c", "d").expect("CNG")
    );
}

#[test]
fn shared_phrases_and_voices_match_the_go_catalog_for_each_locale() {
    let catalog = include_str!("../../../internal/engineer/presentation/presentation.go");
    let config = include_str!("../../../internal/engineer/audio/config.go");
    for (locale, section) in [
        (Locale::Es, "LocaleSpanish"),
        (Locale::En, "LocaleEnglish"),
        (Locale::It, "LocaleItalian"),
        (Locale::PtBr, "LocalePortugueseBrazil"),
    ] {
        let (_, phrases) = catalog
            .split_once(&format!("{section}: {{"))
            .expect("catálogo Go");
        let (phrases, _) = phrases.split_once("\n\t\t},").expect("fin locale");
        // Flags no tiene equivalente en el catálogo canónico Go.
        for (intent, go_intent) in [
            (Intent::PitEntry, "IntentPitEntry"),
            (Intent::PitExit, "IntentPitExit"),
            (Intent::LapCompleted, "IntentLapCompleted"),
            (Intent::FuelOne, "IntentFuelOneLitre"),
            (Intent::FuelTwo, "IntentFuelTwoLitres"),
            (Intent::FuelHalf, "IntentFuelHalfTank"),
            (Intent::CarLeft, "IntentSpotterCarLeft"),
            (Intent::CarRight, "IntentSpotterCarRight"),
            (Intent::ThreeWide, "IntentSpotterThreeWide"),
        ] {
            assert!(
                phrases.contains(&format!(
                    "messagepolicy.{go_intent}: same(\"{}\")",
                    intent.text(locale)
                )),
                "{} {} difiere de Go",
                locale.code(),
                intent.key()
            );
        }
        assert!(config.contains(&format!(
            "case \"{}\":\n\t\tvoice = \"{}\"",
            locale.code(),
            locale.voice()
        )));
    }
}

struct Cache(PathBuf);
impl Cache {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("engineer-kokoro-test-{}", std::process::id()));
        fs::create_dir(&path).expect("temporal exclusivo");
        Self(path)
    }
}
impl Drop for Cache {
    fn drop(&mut self) {
        assert!(self.0.is_absolute());
        assert_eq!(self.0.parent(), Some(std::env::temp_dir().as_path()));
        assert!(
            self.0
                .file_name()
                .expect("nombre")
                .to_string_lossy()
                .starts_with("engineer-kokoro-test-")
        );
        fs::remove_dir_all(&self.0).expect("limpiar propio temporal");
    }
}
fn wav() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend(356_u32.to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16_u32.to_le_bytes());
    bytes.extend(1_u16.to_le_bytes());
    bytes.extend(1_u16.to_le_bytes());
    bytes.extend(16_000_u32.to_le_bytes());
    bytes.extend(32_000_u32.to_le_bytes());
    bytes.extend(2_u16.to_le_bytes());
    bytes.extend(16_u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(320_u32.to_le_bytes());
    bytes.resize(364, 0);
    bytes
}
#[test]
fn cache_resolution_is_read_only_exact_and_missing_preserves_catalog() {
    let cache = Cache::new();
    let [wav_path, mp3_path, legacy] =
        clip_paths(&cache.0, Locale::Es, Intent::FuelOne).expect("rutas");
    assert_eq!(
        resolve_clip(&cache.0, Locale::Es, Intent::FuelOne)
            .expect_err("ausente")
            .kind(),
        io::ErrorKind::NotFound
    );
    fs::write(&wav_path, wav()).expect("WAV sintético");
    let before = fs::read(&wav_path).expect("leer");
    let (path, duration) = resolve_clip(&cache.0, Locale::Es, Intent::FuelOne).expect("hash WAV");
    assert_eq!(path, wav_path.canonicalize().expect("canonical"));
    assert_eq!(duration, Duration::from_millis(10));
    assert_eq!(fs::read(&wav_path).expect("leer"), before);
    assert!(!mp3_path.exists() && !legacy.exists());
    assert_eq!(
        resolve_clip(&cache.0, Locale::En, Intent::FuelOne)
            .expect_err("locale distinto")
            .kind(),
        io::ErrorKind::NotFound
    );
    let report = coverage(&cache.0);
    assert_eq!(report["locales"][0]["phrases"][3]["status"], "available");
    assert_eq!(report["locales"][1]["phrases"][3]["status"], "missing");
    assert_eq!(
        report["locales"][1]["phrases"][3]["text"],
        "One litre remaining"
    );
    fs::write(&wav_path, b"roto").expect("corrupto");
    fs::write(&mp3_path, b"invalid mp3").expect("MP3 alternativo tampoco autoriza fallback");
    assert_eq!(
        resolve_clip(&cache.0, Locale::Es, Intent::FuelOne)
            .expect_err("no fallback")
            .kind(),
        io::ErrorKind::InvalidData
    );
    fs::remove_file(&wav_path).expect("quitar WAV");
    assert!(resolve_clip(&cache.0, Locale::Es, Intent::FuelOne).is_err());
    fs::remove_file(&mp3_path).expect("quitar MP3");
    fs::create_dir(&wav_path).expect("medio irregular");
    assert_eq!(
        resolve_clip(&cache.0, Locale::Es, Intent::FuelOne)
            .expect_err("directorio no es clip")
            .kind(),
        io::ErrorKind::InvalidInput
    );
    fs::remove_dir(&wav_path).expect("quitar directorio");
    let missing_root = cache.0.join("sin-carpeta");
    let mut player = Voice::new(Some(&missing_root)).expect("no abortar por cache ausente");
    assert_eq!(
        player
            .play(Locale::Es, Intent::FuelOne, Duration::ZERO)
            .expect_err("ausente")
            .kind(),
        io::ErrorKind::NotFound
    );
    assert!(!missing_root.exists());
}
