//! Se instancia SOLO en el núcleo. Entrada de juego procede del núcleo, no IPC Hub.
use super::Verified;
use crate::{Error, Result, storage::Store};
use chrono::{DateTime, TimeDelta, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clock {
    last_seen: Option<DateTime<Utc>>,
    latest_issued: Option<DateTime<Utc>>,
    invalidated_after: Option<DateTime<Utc>>,
    // Pared y tiempo efectivo se conservan por separado: aceptar una emisión
    // firmada unos segundos futura no debe parecer rollback al reabrir.
    #[serde(default)]
    last_wall: Option<DateTime<Utc>>,
    #[serde(default)]
    forward_millis: i64,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionIdentity {
    pub simulator: String,
    pub track: String,
    pub kind: String,
    /// Marca estable procedente del simulador, nunca la época local del núcleo.
    pub started: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Game {
    session: u64,
    #[serde(default)]
    identity: Option<SessionIdentity>,
    subject: String,
    device: String,
    eligible: Vec<String>,
    #[serde(default)]
    deadlines: Vec<(String, DateTime<Utc>)>,
    entered_at: DateTime<Utc>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    version: u8,
    clock: Clock,
    game: Option<Game>,
    invalidated: bool,
}

pub struct Authority {
    clock: Clock,
    verified: Option<Verified>,
    game: Option<Game>,
    confirmed_game: bool,
    invalidated: bool,
    recovery_required: bool,
    anchor: Option<(DateTime<Utc>, Duration)>,
    last_wall: Option<DateTime<Utc>>,
}

impl Authority {
    pub fn restore(store: &Store) -> Result<Self> {
        let mut damaged = false;
        let saved = match store.load_cache::<Saved>("authority") {
            Ok(saved)
                if saved.version == 1 && (0..=300_000).contains(&saved.clock.forward_millis) =>
            {
                saved
            }
            Err(Error::NotFound) => {
                // A binding without its authority is not a fresh installation.
                let binding_exists = match store.load_cache::<serde_json::Value>("binding") {
                    Ok(_) | Err(Error::Corrupt) => true,
                    Err(Error::NotFound) => false,
                    Err(error) => return Err(error),
                };
                if binding_exists {
                    Self::ensure_recovery_marker(store)?;
                }
                Saved {
                    version: 1,
                    clock: Clock::default(),
                    game: None,
                    invalidated: true,
                }
            }
            Ok(_) | Err(Error::Corrupt) => {
                // A failed repair after the rename must not look like a fresh
                // installation on restart. The marker carries no grants/time.
                Self::ensure_recovery_marker(store)?;
                store.quarantine_dated("authority", 0)?;
                damaged = true;
                Saved {
                    version: 1,
                    clock: Clock::default(),
                    game: None,
                    invalidated: true,
                }
            }
            Err(error) => return Err(error),
        };
        let recovery_marker = match store.load_cache::<bool>("authority-recovery") {
            Ok(_) => true,
            Err(Error::NotFound) => false,
            Err(Error::Corrupt) => {
                // Its continued presence is the recovery guard. Moving it
                // before replacing it would leave a crash window without a
                // guard. A successful online persist removes it last.
                damaged = true;
                true
            }
            Err(error) => return Err(error),
        };
        let authority = Self {
            clock: saved.clock,
            game: if recovery_marker { None } else { saved.game },
            invalidated: saved.invalidated || recovery_marker,
            recovery_required: recovery_marker,
            verified: None,
            confirmed_game: false,
            anchor: None,
            last_wall: None,
        };
        if damaged {
            // Durable before looking at any binding: a restart cannot turn the
            // quarantined document into an ordinary first installation.
            authority.persist(store)?;
            eprintln!("{}", super::CacheIssue::AuthorityUnreadable.diagnostic());
        }
        Ok(authority)
    }

    fn ensure_recovery_marker(store: &Store) -> Result<()> {
        // A corrupt marker is already a guard; preserve its original bytes even
        // when the authority is also damaged or missing.
        match store.load_cache::<bool>("authority-recovery") {
            Ok(_) | Err(Error::Corrupt) => Ok(()),
            Err(Error::NotFound) => store.save("authority-recovery", &true),
            Err(error) => Err(error),
        }
    }

    pub fn needs_online_recovery(&self, wall: DateTime<Utc>) -> bool {
        self.recovery_required
            || self
                .last_wall
                .or(self.clock.last_wall)
                .or(self.clock.last_seen)
                .is_some_and(|last| wall < last)
    }

    fn observe(&mut self, wall: DateTime<Utc>, tick: Duration) -> Result<DateTime<Utc>> {
        // Comparar pared con pared: el reloj efectivo puede adelantarse por deriva.
        if self
            .last_wall
            .or(self.clock.last_wall)
            .or(self.clock.last_seen)
            .is_some_and(|last| wall < last)
        {
            return Err(Error::Clock);
        }
        let adjusted_wall = wall
            .checked_add_signed(TimeDelta::milliseconds(self.clock.forward_millis))
            .ok_or(Error::Clock)?;
        let now = if let Some((anchor, start)) = self.anchor {
            let elapsed = tick.checked_sub(start).ok_or(Error::Clock)?;
            let elapsed = TimeDelta::from_std(elapsed).map_err(|_| Error::Clock)?;
            adjusted_wall.max(anchor.checked_add_signed(elapsed).ok_or(Error::Clock)?)
        } else {
            self.anchor = Some((adjusted_wall, tick));
            adjusted_wall
        };
        let now = now.max(self.clock.last_seen.unwrap_or(now));
        self.last_wall = Some(wall);
        self.clock.last_wall = Some(wall);
        self.clock.last_seen = Some(now);
        Ok(now)
    }

    pub fn install(
        &mut self,
        verified: Verified,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        if self.recovery_required {
            return Err(Error::Denied);
        }
        let now = self.observe(now, tick)?;
        if self
            .clock
            .invalidated_after
            .is_some_and(|time| verified.issued_at <= time)
        {
            return Err(Error::Denied);
        }
        let ahead = verified.issued_at.signed_duration_since(now);
        if ahead > TimeDelta::minutes(5)
            || self
                .clock
                .latest_issued
                .is_some_and(|latest| verified.issued_at < latest)
        {
            return Err(Error::Clock);
        }
        if ahead > TimeDelta::zero() {
            // La firma ya se comprobó. Adelantar el reloj efectivo hasta iat
            // conserva los vencimientos firmados; nunca suma gracia a exp.
            let forward = self
                .clock
                .forward_millis
                .checked_add(ahead.num_milliseconds())
                .filter(|offset| (0..=300_000).contains(offset))
                .ok_or(Error::Clock)?;
            self.clock.forward_millis = forward;
            self.clock.last_seen = Some(verified.issued_at);
            self.anchor = Some((verified.issued_at, tick));
        }
        self.clock.latest_issued = Some(verified.issued_at);
        if self
            .game
            .as_ref()
            .is_some_and(|game| game.subject != verified.subject || game.device != verified.device)
        {
            self.game = None;
            self.confirmed_game = false;
        }
        self.verified = Some(verified);
        self.invalidated = false;
        Ok(())
    }

    /// Only a newly completed authenticated HTTPS renewal may call this.
    /// Disk restore/TransferRights must always use `install`.
    pub fn install_online(
        &mut self,
        verified: Verified,
        wall: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        let skew = verified.issued_at.signed_duration_since(wall);
        if skew < -TimeDelta::minutes(5)
            || skew > TimeDelta::minutes(5)
            || self
                .clock
                .latest_issued
                .is_some_and(|latest| verified.issued_at < latest)
        {
            return Err(Error::Clock);
        }
        // A healthy tombstone is never lowered, even if logout used a wrong
        // future wall. A new issuance must exceed that durable boundary.
        if self
            .clock
            .invalidated_after
            .is_some_and(|at| verified.issued_at <= at)
        {
            return Err(Error::Denied);
        }
        if !self.recovery_required
            && self
                .last_wall
                .or(self.clock.last_wall)
                .or(self.clock.last_seen)
                .is_none_or(|last| wall >= last)
        {
            // Ordinary online renewals keep the established monotonic anchor
            // and eligible game grace, just like an ordinary Install.
            return self.install(verified, wall, tick);
        }
        let effective = wall.max(verified.issued_at);
        let clock = Clock {
            last_seen: Some(effective),
            last_wall: Some(wall),
            forward_millis: effective.signed_duration_since(wall).num_milliseconds(),
            ..self.clock.clone()
        };
        // Validate everything before replacing the previous clock/grant.
        self.clock = clock;
        self.last_wall = Some(wall);
        self.anchor = Some((effective, tick));
        self.leave_game();
        self.recovery_required = false;
        self.install(verified, wall, tick)
    }

    pub fn enter_game(&mut self, session: u64, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.enter_game_observed(session, now, now, tick)
    }

    /// Solo el núcleo aporta la hora de entrada observada, conservada fuera de
    /// adquisición. Un retraso de E/S no convierte una entrada válida en vencida.
    pub fn enter_game_observed(
        &mut self,
        session: u64,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        self.enter_game_identified(session, None, entered_at, now, tick)
    }

    /// Solo una identidad estable completa confirma una sesión tras restaurar.
    pub fn enter_game_identified(
        &mut self,
        session: u64,
        identity: Option<SessionIdentity>,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        let now = self.observe(now, tick)?;
        let entered_at = entered_at
            .checked_add_signed(TimeDelta::milliseconds(self.clock.forward_millis))
            .ok_or(Error::Clock)?;
        if entered_at > now {
            return Err(Error::Clock);
        }
        if self.invalidated {
            return Err(Error::Denied);
        }
        if identity.as_ref().is_some_and(|id| {
            [&id.simulator, &id.track, &id.kind, &id.started]
                .iter()
                .any(|value| value.trim().is_empty() || value.len() > 512)
        }) {
            return Err(Error::Protocol);
        }
        if !self.confirmed_game {
            let same = self.game.as_ref().is_some_and(|game| {
                game.identity
                    .as_ref()
                    .zip(identity.as_ref())
                    .is_some_and(|(old, new)| old == new)
            });
            if !same {
                self.leave_game();
            }
        }
        let verified = self.verified.as_ref().ok_or(Error::InvalidCredential)?;
        if let Some(game) = &mut self.game {
            if (self.confirmed_game && (game.session != session || game.identity != identity))
                || game.subject != verified.subject
                || game.device != verified.device
            {
                return Err(Error::Conflict);
            }
            game.session = session; // El ID local puede cambiar sin alterar el plazo guardado.
            self.confirmed_game = true; // Same core-observed session; does not reset entry/expiry.
            return Ok(());
        }
        self.game = Some(Game {
            session,
            identity,
            subject: verified.subject.clone(),
            device: verified.device.clone(),
            entered_at,
            eligible: verified
                .grants
                .iter()
                .filter(|grant| {
                    verified.issued_at <= entered_at
                        && grant.expires_at.is_none_or(|expiry| entered_at < expiry)
                })
                .map(|grant| grant.key.clone())
                .collect(),
            deadlines: verified
                .grants
                .iter()
                .filter_map(|grant| {
                    let expiry = grant.expires_at?;
                    (verified.issued_at <= entered_at && entered_at < expiry)
                        .then(|| {
                            expiry.checked_add_signed(TimeDelta::seconds(super::GAME_GRACE_SECONDS))
                        })
                        .flatten()
                        .map(|end| (grant.key.clone(), end))
                })
                .collect(),
        });
        self.confirmed_game = true;
        Ok(())
    }

    pub fn leave_game(&mut self) {
        self.game = None;
        self.confirmed_game = false;
    }

    /// Sesión firmada, incluso sin concesiones. Usa el reloj ya observado por rights.
    pub fn credential_current(&self) -> bool {
        !self.invalidated
            && self.verified.as_ref().is_some_and(|verified| {
                verified
                    .expires_at
                    .is_none_or(|end| self.clock.last_seen.is_some_and(|now| now < end))
            })
    }

    pub fn credential_deadline(&self) -> Option<DateTime<Utc>> {
        self.local_deadline(self.verified.as_ref()?.expires_at?)
    }

    fn local_deadline(&self, deadline: DateTime<Utc>) -> Option<DateTime<Utc>> {
        deadline.checked_sub_signed(TimeDelta::milliseconds(self.clock.forward_millis))
    }

    /// Deadline efectivo ya aprobado: el consumidor no inventa gracia local.
    pub fn next_deadline(&self, rights: &[String]) -> Option<DateTime<Utc>> {
        self.verified
            .as_ref()?
            .grants
            .iter()
            .filter(|grant| rights.contains(&grant.key))
            .filter_map(|grant| {
                let expiry = grant.expires_at?;
                if self.confirmed_game
                    && self.game.as_ref().is_some_and(|game| {
                        game.entered_at < expiry && game.eligible.contains(&grant.key)
                    })
                {
                    self.grace_deadline(&grant.key)
                        .map(|end| end.max(expiry))
                        .or(Some(expiry))
                } else {
                    Some(expiry)
                }
            })
            .min()
            .and_then(|deadline| self.local_deadline(deadline))
    }
    pub fn invalidate(&mut self, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.invalidated = true;
        self.verified = None;
        self.leave_game();
        // Logout must still persist a tombstone during a clock correction.
        // Keep the largest observed boundary; never silently lower revocation.
        let observed = self.observe(now, tick).ok();
        let boundary = self
            .clock
            .last_seen
            .into_iter()
            .chain(self.clock.last_wall)
            .chain(self.last_wall)
            .chain(self.clock.invalidated_after)
            .chain(observed)
            .fold(now, std::cmp::max);
        self.clock.invalidated_after = Some(boundary);
        Ok(())
    }

    pub fn rights(&mut self, now: DateTime<Utc>, tick: Duration) -> Result<Vec<String>> {
        let now = self.observe(now, tick)?;
        if self.invalidated {
            return Ok(Vec::new());
        }
        let verified = self.verified.as_ref().ok_or(Error::InvalidCredential)?;
        Ok(verified
            .grants
            .iter()
            .filter(|grant| {
                grant.expires_at.is_none_or(|expiry| {
                    now < expiry
                        || (self.confirmed_game
                            && self.game.as_ref().is_some_and(|game| {
                                game.entered_at < expiry && game.eligible.contains(&grant.key)
                            })
                            && self.grace_deadline(&grant.key).is_some_and(|end| now < end))
                })
            })
            .map(|grant| grant.key.clone())
            .collect())
    }

    fn grace_deadline(&self, key: &str) -> Option<DateTime<Utc>> {
        self.game
            .as_ref()?
            .deadlines
            .iter()
            .find_map(|(grant, end)| (grant == key).then_some(*end))
    }

    /// Core must persist before publishing rights/ACK; never service-owned.
    pub fn rights_and_persist(
        &mut self,
        now: DateTime<Utc>,
        tick: Duration,
        store: &Store,
    ) -> Result<Vec<String>> {
        let rights = self.rights(now, tick)?;
        self.persist(store)?;
        Ok(rights)
    }

    /// Save a core-owned clock/game/invalidations snapshot.
    pub fn persist(&self, store: &Store) -> Result<()> {
        store.save(
            "authority",
            &Saved {
                version: 1,
                clock: self.clock.clone(),
                game: self.game.clone(),
                invalidated: self.invalidated,
            },
        )?;
        if !self.recovery_required {
            store.remove("authority-recovery")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un documento ilegible apartaba la autoridad para SIEMPRE: cada arranque
    /// devolvia `Err` y la unica salida era que alguien borrase el fichero a
    /// mano. Ahora se aparta y se arranca con el defecto.
    #[test]
    fn a_corrupt_authority_is_quarantined_and_the_service_still_starts() {
        let (_root, store) = crate::test_store("authority-quarantine");
        // Version distinta de 1: JSON valido con contenido que la puerta rechaza.
        store
            .save("authority", &serde_json::json!({"version": 2}))
            .expect("guardar documento invalido");

        let authority = Authority::restore(&store).expect("debe arrancar");
        assert!(
            authority.invalidated,
            "el defecto debe ser el CONSERVADOR: lapida anti-rollback puesta"
        );
        assert!(
            store
                .load::<bool>("authority-recovery")
                .expect("recovery durable"),
            "la recuperación debe sobrevivir al reinicio"
        );
        // Y el segundo arranque tampoco tropieza.
        assert!(Authority::restore(&store).is_ok());
    }
}
