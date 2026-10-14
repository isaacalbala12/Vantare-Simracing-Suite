//! Perfil de presentación del userinfo autenticado. La imagen se descarga
//! sin bearer ni redirects, en servicios; el Hub solo recibe una miniatura.
use super::UserInfo;
use crate::{Error, Result, http::Http, protocol::AccountProfile};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageReader, Limits, codecs::jpeg::JpegEncoder};
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cached {
    identity: super::Identity,
    profile: AccountProfile,
}

pub(super) fn restore(
    store: &crate::storage::Store,
    identity: Option<&super::Identity>,
) -> Option<AccountProfile> {
    let identity = identity?;
    match store.load_for_restore::<Cached>("account-profile") {
        Ok(Some(saved)) if &saved.identity == identity => Some(saved.profile),
        Ok(_) | Err(Error::NotFound) => None,
        Err(error) => {
            // Solo presentación: un fallo de caché no impide restaurar OAuth.
            eprintln!("No se pudo leer la caché de perfil: {error}");
            None
        }
    }
}

pub(super) fn save(
    store: &crate::storage::Store,
    identity: &super::Identity,
    profile: &AccountProfile,
) -> Result<()> {
    store.save(
        "account-profile",
        &Cached {
            identity: identity.clone(),
            profile: profile.clone(),
        },
    )
}

fn image_url(value: &str) -> Option<Url> {
    if value.len() > 4096 {
        return None;
    }
    let url = Url::parse(value).ok()?;
    let host = url.host_str()?;
    (url.scheme() == "https"
        && matches!(host, "img.clerk.com" | "images.clerk.dev")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none())
    .then_some(url)
}

fn thumbnail(bytes: &[u8]) -> Result<String> {
    let mut reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| Error::Protocol)?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(1024);
    limits.max_image_height = Some(1024);
    limits.max_alloc = Some(8 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| Error::Protocol)?;
    let image = image.thumbnail(128, 128).to_rgb8();
    let mut small = Vec::new();
    JpegEncoder::new_with_quality(&mut small, 75)
        .encode_image(&image)
        .map_err(|_| Error::Protocol)?;
    if small.len() > 24 * 1024 {
        return Err(Error::TooLarge);
    }
    Ok(STANDARD.encode(small))
}

impl UserInfo {
    pub(super) fn profile(&self, http: &Http) -> AccountProfile {
        let name = self.name.clone().unwrap_or_else(|| {
            [self.given_name.as_deref(), self.family_name.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ")
        });
        let mut profile = AccountProfile {
            name: name
                .chars()
                .filter(|c| !c.is_control())
                .take(128)
                .collect::<String>()
                .trim()
                .to_owned(),
            ..AccountProfile::default()
        };
        // Clerk OAuth llama `picture` a la imagen del perfil (`image_url`).
        if let Some(mut url) = self
            .image_url
            .as_deref()
            .or(self.picture.as_deref())
            .and_then(image_url)
        {
            profile.image_url = Some(url.to_string());
            url.query_pairs_mut().clear().extend_pairs([
                ("width", "128"),
                ("height", "128"),
                ("fit", "crop"),
                ("quality", "75"),
            ]);
            // La foto es opcional: su fallo no invalida OAuth ni los derechos.
            profile.image_jpeg = http
                .profile_image(&url)
                .and_then(crate::http::Response::success)
                .and_then(|r| thumbnail(&r.body))
                .ok();
        }
        profile
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_photo_refuses_arbitrary_hosts_credentials_and_local_paths() {
        for url in [
            "http://img.clerk.com/x",
            "file:///avatar.png",
            "https://127.0.0.1/x",
            "https://img.clerk.com.evil.invalid/x",
            "https://user@img.clerk.com/x",
            "https://img.clerk.com:444/x",
            "https://img.clerk.com/x#fragment",
        ] {
            assert!(image_url(url).is_none(), "{url}");
        }
        assert!(image_url("https://img.clerk.com/photo").is_some());
        assert!(image_url("https://images.clerk.dev/photo").is_some());
    }

    #[test]
    fn cached_profile_is_optional_and_bound_to_the_restored_oauth_identity() {
        let (root, store) = crate::test_store("profile-cache");
        let identity = super::super::Identity {
            issuer: "https://clerk.fixture.invalid/".into(),
            subject: "user_fixture".into(),
        };
        assert!(restore(&store, Some(&identity)).is_none());
        let profile = AccountProfile {
            name: "Perfil guardado".into(),
            ..Default::default()
        };
        save(&store, &identity, &profile).expect("guardar");
        assert_eq!(restore(&store, Some(&identity)), Some(profile));
        assert!(
            restore(&store, None).is_none(),
            "sin sesión no muestra el perfil"
        );
        assert!(
            restore(
                &store,
                Some(&super::super::Identity {
                    subject: "another_user".into(),
                    ..identity.clone()
                })
            )
            .is_none()
        );
        assert!(
            restore(
                &store,
                Some(&super::super::Identity {
                    issuer: "https://another.invalid/".into(),
                    ..identity.clone()
                })
            )
            .is_none()
        );
        store
            .save("account-profile", &serde_json::json!({"invalid":true}))
            .expect("corrupto");
        assert!(
            restore(&store, Some(&identity)).is_none(),
            "caché corrupta no afecta OAuth"
        );
        drop(store);
        crate::cleanup_store(&root, "profile-cache", &[]);
    }

    #[test]
    fn bounded_thumbnail_accepts_jpeg_and_png_and_rejects_corruption() {
        let image = image::DynamicImage::new_rgb8(200, 100);
        for format in [image::ImageFormat::Jpeg, image::ImageFormat::Png] {
            let mut bytes = std::io::Cursor::new(Vec::new());
            image.write_to(&mut bytes, format).expect("fixture");
            let jpeg = STANDARD
                .decode(thumbnail(bytes.get_ref()).expect("avatar"))
                .expect("base64");
            let small = image::load_from_memory(&jpeg).expect("JPEG");
            assert_eq!((small.width(), small.height()), (128, 64));
            assert!(jpeg.len() <= 24 * 1024);
        }
        assert!(thumbnail(b"not an image").is_err());
        let mut large = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(1025, 1)
            .write_to(&mut large, image::ImageFormat::Png)
            .expect("large");
        assert!(thumbnail(large.get_ref()).is_err());
    }
}
