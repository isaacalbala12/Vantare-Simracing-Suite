//! Preferencias preparadas para un propietario residente; no registra efectos Win32.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hotkey {
    pub modifiers: u32,
    pub virtual_key: u32,
}
impl Hotkey {
    pub fn parse(raw: &str) -> Result<Option<Self>, String> {
        if raw.trim().is_empty() {
            return Ok(None);
        }
        if raw.len() > 64 {
            return Err("atajo demasiado largo".into());
        }
        let parts: Vec<_> = raw
            .trim()
            .to_ascii_lowercase()
            .split('+')
            .map(str::trim)
            .map(str::to_owned)
            .collect();
        let (key, modifiers) = parts.split_last().ok_or("atajo vacio")?;
        if modifiers.is_empty() || key.len() != 1 || !key.as_bytes()[0].is_ascii_alphanumeric() {
            return Err("atajo: usa modificadores y una letra o numero".into());
        }
        let mut flags = 0;
        for modifier in modifiers {
            let flag = match modifier.as_str() {
                "alt" => 1,
                "ctrl" => 2,
                "shift" => 4,
                "win" => 8,
                _ => return Err("atajo: modificador desconocido".into()),
            };
            if flags & flag != 0 {
                return Err("atajo: modificador repetido".into());
            }
            flags |= flag;
        }
        let virtual_key = u32::from(key.as_bytes()[0].to_ascii_uppercase());
        if flags == 2
            && "CVXAZYSOPWNQRTFHDEBUILKJ"
                .bytes()
                .any(|letter| u32::from(letter) == virtual_key)
            || flags == 8 && virtual_key == u32::from(b'L')
        {
            return Err("atajo reservado por Windows o edicion".into());
        }
        Ok(Some(Self {
            modifiers: flags,
            virtual_key,
        }))
    }
    pub fn display(self) -> String {
        let mut parts: Vec<String> = [(2, "ctrl"), (4, "shift"), (1, "alt"), (8, "win")]
            .into_iter()
            .filter(|(flag, _)| self.modifiers & flag != 0)
            .map(|(_, name)| name.into())
            .collect();
        if let Some(key) = char::from_u32(self.virtual_key) {
            parts.push(key.to_ascii_lowercase().to_string());
        }
        parts.join("+")
    }
}

impl super::Document {
    pub fn save_profile(&mut self, mut profile: super::Profile) -> Result<(), String> {
        let hotkey = Hotkey::parse(&profile.hotkey)?;
        if let Some(hotkey) = hotkey {
            if self
                .profiles
                .iter()
                .filter(|p| p.id != profile.id)
                .any(|p| Hotkey::parse(&p.hotkey).ok().flatten() == Some(hotkey))
            {
                return Err("atajo asignado a otro perfil".into());
            }
            profile.hotkey = hotkey.display();
        } else {
            profile.hotkey.clear();
        }
        if profile.launch_on_windows_startup && profile.steps.is_empty() {
            return Err("inicio con Windows requiere pasos".into());
        }
        let mut candidate = self.clone();
        if profile.launch_on_windows_startup {
            for other in &mut candidate.profiles {
                other.launch_on_windows_startup = false;
            }
        }
        if let Some(current) = candidate.profiles.iter_mut().find(|p| p.id == profile.id) {
            *current = profile;
        } else {
            candidate.profiles.push(profile);
        }
        candidate.validate()?;
        *self = candidate;
        Ok(())
    }
}
