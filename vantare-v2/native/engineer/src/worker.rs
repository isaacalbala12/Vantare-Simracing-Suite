//! Una cola para selección, texto y voz; sus I/O nunca corren en adquisición.
use std::io::{self, Write};
use std::path::Path;
use std::time::Duration;

use crate::{
    Applied,
    radio::{Families, Locale, Message, Queue},
    voice::Voice,
};
use vantare_domain::Snapshot;

pub struct RadioWorker {
    families: Families,
    queue: Queue,
    voice: Voice,
    locale: Locale,
    latest_revision: Option<(u64, u64)>,
    latest_at: Duration,
    source_stale: bool,
    presentation: Option<Message>,
}
impl RadioWorker {
    pub fn new(locale: Locale, clips: Option<&Path>) -> io::Result<Self> {
        Ok(Self {
            families: Families::default(),
            queue: Queue::default(),
            voice: Voice::new(clips)?,
            locale,
            latest_revision: None,
            latest_at: Duration::ZERO,
            source_stale: false,
            presentation: None,
        })
    }
    pub fn clear(&mut self) -> io::Result<()> {
        self.queue.clear();
        self.families.reset();
        self.presentation = None;
        self.voice.stop()
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
            self.voice.stop()?;
            self.presentation = None;
            clear_output(output)?;
        }
        if self.queue.refresh(snapshot) {
            self.voice.stop()?;
        }
        for message in messages {
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
            self.queue.finish();
        }
        // Sin clips se entregan avisos visuales de inmediato, sin una cola
        // distinta ni esperar un TTL como si hubiera audio sonando.
        while let Some((message, preempted)) = self.queue.select(now) {
            if preempted {
                self.voice.stop()?;
            }
            let mut presentation = message.to_json();
            let playing = match self.voice.play(message.locale, message.intent, now) {
                Ok(Some(_)) => {
                    presentation["voice"] = "started".into();
                    true
                }
                Ok(None) => {
                    presentation["voice"] = "disabled".into();
                    false
                }
                Err(error) => {
                    presentation["voice"] = if error.kind() == io::ErrorKind::NotFound {
                        "missing"
                    } else {
                        "failed"
                    }
                    .into();
                    presentation["voice_error"] = format!("{:?}", error.kind()).into();
                    false
                }
            };
            serde_json::to_writer(&mut *output, &presentation).map_err(io::Error::other)?;
            writeln!(output)?;
            output.flush()?;
            self.families.started(&message); // ACK visual; no claim de acústica.
            self.presentation = Some(message);
            if playing {
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
