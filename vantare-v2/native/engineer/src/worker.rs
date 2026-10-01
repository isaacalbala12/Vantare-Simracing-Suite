//! Una cola para selección, texto y voz; sus I/O nunca corren en adquisición.
use std::io::{self, Write};
use std::path::Path;
use std::time::Duration;

use crate::control::runtime::{
    AudioOutcome, CachedVoice, Connection, Delivery, DeliveryStatus, HISTORY_LIMIT, RuntimeStatus,
    Spotter, VoiceEngine, VoiceStatus,
};
use crate::{
    Applied,
    radio::{Families, Locale, Message, Queue},
    voice::Voice,
};
use vantare_domain::Snapshot;

pub struct RadioWorker {
    settings: crate::control::Settings,
    clips_configured: bool,
    voice_error: Option<String>,
    last_message: Option<crate::control::Message>,
    families: Families,
    queue: Queue,
    voice: Voice,
    locale: Locale,
    latest_revision: Option<(u64, u64)>,
    latest_at: Duration,
    source_stale: bool,
    presentation: Option<Message>,
    connection: Connection,
    player_available: bool,
    spotter: Spotter,
    history: std::collections::VecDeque<Delivery>,
    delivery_id: u64,
    evicted: u64,
    active_delivery: Option<u64>,
    instance_ms: u64,
}
impl RadioWorker {
    pub fn new(locale: Locale, clips: Option<&Path>) -> io::Result<Self> {
        Ok(Self {
            settings: crate::control::Settings {
                locale: locale.code().into(),
                voice: clips.is_some(),
                ..Default::default()
            },
            clips_configured: clips.is_some(),
            voice_error: None,
            last_message: None,
            families: Families::default(),
            queue: Queue::default(),
            voice: Voice::new(clips)?,
            locale,
            latest_revision: None,
            latest_at: Duration::ZERO,
            source_stale: false,
            presentation: None,
            connection: Connection::Waiting,
            player_available: false,
            spotter: Spotter::WaitingSource,
            history: std::collections::VecDeque::new(),
            delivery_id: 0,
            evicted: 0,
            active_delivery: None,
            instance_ms: crate::control::runtime::now_ms(),
        })
    }
    pub fn configure(&mut self, settings: &crate::control::Settings) -> io::Result<bool> {
        settings.validate()?;
        let locale =
            Locale::parse(&settings.locale).ok_or_else(|| io::Error::other("locale inválido"))?;
        if self.settings == *settings {
            return Ok(false);
        }
        // Retirar cola/voz del ajuste anterior antes de confirmar el nuevo.
        self.clear()?;
        self.locale = locale;
        self.settings = settings.clone();
        self.connection = Connection::Waiting;
        if !settings.enabled {
            self.spotter = Spotter::Disabled;
        }
        self.voice_error = None;
        Ok(true)
    }
    pub fn last_message(&self) -> Option<&crate::control::Message> {
        self.last_message.as_ref()
    }
    pub fn voice_error(&self) -> Option<&str> {
        self.voice_error.as_deref()
    }
    pub fn clear(&mut self) -> io::Result<()> {
        self.queue.clear();
        self.families.reset();
        self.presentation = None;
        self.connection = Connection::Disconnected;
        self.player_available = false;
        self.spotter = if self.settings.enabled {
            Spotter::WaitingSource
        } else {
            Spotter::Disabled
        };
        self.cancel_audio()
    }
    fn finish_audio(&mut self, outcome: AudioOutcome) {
        if let Some(id) = self.active_delivery.take()
            && let Some(delivery) = self.history.iter_mut().find(|item| item.id == id)
        {
            delivery.audio = outcome;
        }
    }
    fn cancel_audio(&mut self) -> io::Result<()> {
        self.voice.stop()?;
        self.finish_audio(AudioOutcome::Cancelled);
        Ok(())
    }
    fn record_delivery(&mut self, message: &Message, audio: AudioOutcome) {
        self.delivery_id = self.delivery_id.saturating_add(1);
        self.history.push_back(Delivery {
            id: self.delivery_id,
            message: crate::control::Message {
                epoch: message.epoch,
                sequence: message.sequence,
                intent: message.intent.key().into(),
                locale: message.locale.code().into(),
                text: message.intent.text(message.locale).into(),
            },
            text_emitted: true,
            audio,
            selected_at_ms: crate::control::runtime::now_ms(),
        });
        if self.history.len() > HISTORY_LIMIT {
            self.history.pop_front();
            self.evicted = self.evicted.saturating_add(1);
        }
    }
    pub fn runtime_status(
        &self,
        heartbeat_ms: u64,
        assets: &std::collections::BTreeMap<String, bool>,
    ) -> RuntimeStatus {
        RuntimeStatus {
            instance_ms: self.instance_ms,
            heartbeat_ms,
            connection: self.connection,
            epoch: self.latest_revision.map(|(epoch, _)| epoch),
            player_available: self.player_available,
            spotter: self.spotter,
            voice: VoiceStatus {
                engine: if cfg!(windows) {
                    VoiceEngine::CachedClipsWinmm
                } else {
                    VoiceEngine::Unavailable
                },
                clips_configured: self.clips_configured,
                selected_voice: self.locale.voice().into(),
                cached_voices: [Locale::Es, Locale::En, Locale::It, Locale::PtBr]
                    .into_iter()
                    .map(|locale| CachedVoice {
                        locale: locale.code().into(),
                        voice: locale.voice().into(),
                        clips_available: assets.get(locale.code()).copied().unwrap_or(false),
                    })
                    .collect(),
                error: self.voice_error.clone(),
            },
            delivery: DeliveryStatus {
                pending: self.queue.pending_len(),
                speaking: self.active_delivery.is_some(),
                text_enabled: self.settings.enabled,
                voice_requested: self.settings.voice,
                history: self.history.iter().cloned().collect(),
                evicted: self.evicted,
            },
        }
    }
    pub fn ingest(
        &mut self,
        snapshot: &Snapshot,
        applied: &Applied,
        now: Duration,
        output: &mut impl Write,
    ) -> io::Result<()> {
        let revision = (snapshot.epoch, snapshot.sequence);
        if self.latest_revision != Some(revision) {
            self.latest_revision = Some(revision);
            self.latest_at = now;
            self.source_stale = false;
        }
        if now.saturating_sub(self.latest_at) >= Duration::from_millis(500) {
            return self.tick(now, output); // Reentregar no rejuvenece una foto.
        }
        let (messages, clear) = self.families.evaluate(snapshot, applied, self.locale, now);
        if clear
            || self
                .presentation
                .as_ref()
                .is_some_and(|message| !message.is_current(snapshot))
        {
            self.queue.clear();
            self.cancel_audio()?;
            self.presentation = None;
            clear_output(output)?;
        }
        if self.queue.refresh(snapshot) {
            self.cancel_audio()?;
        }
        self.connection = match snapshot.state.source_state {
            vantare_domain::SourceState::Live => Connection::Live,
            vantare_domain::SourceState::Stale => Connection::Stale,
            vantare_domain::SourceState::Lost => Connection::Disconnected,
            vantare_domain::SourceState::Waiting => Connection::Waiting,
        };
        self.player_available = snapshot.state.player_car().is_some();
        self.spotter = if self.settings.enabled {
            crate::spotter::availability(snapshot)
        } else {
            Spotter::Disabled
        };
        for message in messages {
            let enabled = match message.intent {
                crate::radio::Intent::FuelOne
                | crate::radio::Intent::FuelTwo
                | crate::radio::Intent::FuelHalf => self.settings.families.fuel,
                crate::radio::Intent::Yellow | crate::radio::Intent::Blue => {
                    self.settings.families.flags
                }
                crate::radio::Intent::PitEntry
                | crate::radio::Intent::PitExit
                | crate::radio::Intent::EngageLimiter
                | crate::radio::Intent::DisengageLimiter => self.settings.families.pitstops,
                crate::radio::Intent::LapCompleted => self.settings.families.laps,
                crate::radio::Intent::CarLeft
                | crate::radio::Intent::CarRight
                | crate::radio::Intent::ThreeWide => true,
            };
            if !self.settings.enabled || !enabled {
                continue;
            }
            if !self.queue.submit(message) {
                writeln!(
                    output,
                    "{{\"version\":\"vantare.radio.status.v1\",\"radio\":\"saturated\"}}"
                )?;
            }
        }
        self.tick(now, output)
    }
    pub fn tick(&mut self, now: Duration, output: &mut impl Write) -> io::Result<()> {
        if self.latest_revision.is_some()
            && now.saturating_sub(self.latest_at) >= Duration::from_millis(500)
        {
            if !self.source_stale {
                self.clear()?;
                self.source_stale = true;
                self.connection = Connection::Stale;
                clear_output(output)?;
            }
            return Ok(());
        }
        if self
            .presentation
            .as_ref()
            .is_some_and(|message| message.expires_at <= now)
        {
            self.presentation = None;
            clear_output(output)?;
        }
        if self.voice.tick(now)? {
            self.finish_audio(AudioOutcome::Finished);
            self.queue.finish();
        }
        // Sin clips se entregan avisos visuales de inmediato, sin una cola
        // distinta ni esperar un TTL como si hubiera audio sonando.
        while let Some((message, preempted)) = self.queue.select(now) {
            if preempted {
                self.cancel_audio()?;
            }
            let mut presentation = message.to_json();
            self.voice_error = None;
            let played = if !self.settings.voice {
                Ok(None)
            } else if !self.clips_configured {
                Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    "sin carpeta de clips; indicar --clips",
                ))
            } else {
                self.voice.play(message.locale, message.intent, now)
            };
            let audio = match played {
                Ok(Some(_)) => {
                    presentation["voice"] = "started".into();
                    AudioOutcome::Started
                }
                Ok(None) => {
                    presentation["voice"] = "disabled".into();
                    AudioOutcome::Disabled
                }
                Err(error) => {
                    self.voice_error = Some(format!("voz {}: {error}", message.intent.key()));
                    presentation["voice"] = if error.kind() == io::ErrorKind::NotFound {
                        "missing"
                    } else if cfg!(unix) && error.kind() == io::ErrorKind::Unsupported {
                        "unavailable"
                    } else {
                        "failed"
                    }
                    .into();
                    presentation["voice_error"] = format!("{:?}", error.kind()).into();
                    if error.kind() == io::ErrorKind::NotFound {
                        AudioOutcome::Missing
                    } else if error.kind() == io::ErrorKind::Unsupported {
                        AudioOutcome::Unavailable
                    } else {
                        AudioOutcome::Failed
                    }
                }
            };
            serde_json::to_writer(&mut *output, &presentation).map_err(io::Error::other)?;
            writeln!(output)?;
            output.flush()?;
            self.families.started(&message); // ACK visual; no claim de acústica.
            self.last_message = Some(crate::control::Message {
                epoch: message.epoch,
                sequence: message.sequence,
                intent: message.intent.key().into(),
                locale: message.locale.code().into(),
                text: message.intent.text(message.locale).into(),
            });
            self.record_delivery(&message, audio);
            self.presentation = Some(message);
            if audio == AudioOutcome::Started {
                self.active_delivery = Some(self.delivery_id);
                break;
            }
            self.queue.finish();
        }
        Ok(())
    }
}

fn clear_output(output: &mut impl Write) -> io::Result<()> {
    writeln!(
        output,
        "{{\"version\":\"vantare.radio.status.v1\",\"clear\":true}}"
    )?;
    output.flush()
}
