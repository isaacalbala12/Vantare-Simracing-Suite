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
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Game {
    session: u64,
    subject: String,
    device: String,
    eligible: Vec<String>,
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
    anchor: Option<(DateTime<Utc>, Duration)>,
}

impl Authority {
    pub fn restore(store: &Store) -> Result<Self> {
        let saved = match store.load::<Saved>("authority") {
            Ok(saved) if saved.version == 1 => saved,
            Err(Error::NotFound) => Saved {
                version: 1,
                clock: Clock::default(),
                game: None,
                invalidated: true,
            },
            _ => return Err(Error::Storage),
        };
        Ok(Self {
            clock: saved.clock,
            game: saved.game,
            invalidated: saved.invalidated,
            verified: None,
            confirmed_game: false,
            anchor: None,
        })
    }

    fn observe(&mut self, wall: DateTime<Utc>, tick: Duration) -> Result<DateTime<Utc>> {
        if self.clock.last_seen.is_some_and(|last| wall < last) {
            return Err(Error::Clock);
        }
        let now = if let Some((anchor, start)) = self.anchor {
            let elapsed = tick.checked_sub(start).ok_or(Error::Clock)?;
            let elapsed = TimeDelta::from_std(elapsed).map_err(|_| Error::Clock)?;
            wall.max(anchor.checked_add_signed(elapsed).ok_or(Error::Clock)?)
        } else {
            self.anchor = Some((wall, tick));
            wall
        };
        self.clock.last_seen = Some(now);
        Ok(now)
    }

    pub fn install(
        &mut self,
        verified: Verified,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        let now = self.observe(now, tick)?;
        if self
            .clock
            .invalidated_after
            .is_some_and(|time| verified.issued_at <= time)
        {
            return Err(Error::Denied);
        }
        // No future issuance tolerance extends paid deadlines.
        if verified.issued_at > now
            || self
                .clock
                .latest_issued
                .is_some_and(|latest| verified.issued_at < latest)
        {
            return Err(Error::Clock);
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
        let now = self.observe(now, tick)?;
        if entered_at > now {
            return Err(Error::Clock);
        }
        if self.invalidated {
            return Err(Error::Denied);
        }
        let verified = self.verified.as_ref().ok_or(Error::InvalidCredential)?;
        if let Some(game) = &self.game {
            if game.session != session
                || game.subject != verified.subject
                || game.device != verified.device
            {
                return Err(Error::Conflict);
            }
            self.confirmed_game = true; // Same core-observed session; does not reset entry/expiry.
            return Ok(());
        }
        self.game = Some(Game {
            session,
            subject: verified.subject.clone(),
            device: verified.device.clone(),
            entered_at,
            eligible: verified
                .grants
                .iter()
                .filter(|grant| grant.expires_at.is_none_or(|expiry| entered_at < expiry))
                .map(|grant| grant.key.clone())
                .collect(),
        });
        self.confirmed_game = true;
        Ok(())
    }

    pub fn leave_game(&mut self) {
        self.game = None;
        self.confirmed_game = false;
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
                    expiry.checked_add_signed(TimeDelta::hours(1))
                } else {
                    Some(expiry)
                }
            })
            .min()
    }
    pub fn invalidate(&mut self, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.invalidated = true;
        self.verified = None;
        self.leave_game();
        self.clock.invalidated_after = Some(self.observe(now, tick)?);
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
                            && expiry
                                .checked_add_signed(TimeDelta::hours(1))
                                .is_some_and(|end| now < end))
                })
            })
            .map(|grant| grant.key.clone())
            .collect())
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
        )
    }
}
