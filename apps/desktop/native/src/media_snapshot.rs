use std::time::Duration;

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use windows::Foundation::DateTime;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};

use crate::media_thumbnail::read_thumbnail;
use crate::winrt_async::join_within;

const PROPERTIES_WAIT: Duration = Duration::from_secs(3);
pub const TICKS_PER_MILLISECOND: i64 = 10_000;
const UNIX_EPOCH_IN_FILETIME_TICKS: i64 = 116_444_736_000_000_000;

#[napi(object)]
pub struct MediaSnapshot {
    pub app_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub playing: bool,
    pub position_ms: f64,
    pub duration_ms: f64,
    pub timeline_updated_at: f64,
    pub can_seek: bool,
    pub thumbnail_read: bool,
    pub thumbnail: Option<Buffer>,
    pub thumbnail_type: Option<String>,
}

#[derive(PartialEq)]
pub struct TrackIdentity {
    app_id: Option<String>,
    title: Option<String>,
    artist: Option<String>,
}

pub struct SessionReading {
    pub snapshot: MediaSnapshot,
    properties: Option<MediaProperties>,
}

fn milliseconds_of_ticks(ticks: i64) -> f64 {
    (ticks as f64 / TICKS_PER_MILLISECOND as f64).round()
}

fn unix_milliseconds_of(time: DateTime) -> f64 {
    if time.UniversalTime <= 0 {
        return 0.0;
    }
    milliseconds_of_ticks(time.UniversalTime - UNIX_EPOCH_IN_FILETIME_TICKS)
}

fn text_of(text: windows_core::Result<windows_core::HSTRING>) -> Option<String> {
    text.ok().map(|value| value.to_string())
}

fn empty_snapshot() -> MediaSnapshot {
    MediaSnapshot {
        app_id: None,
        title: None,
        artist: None,
        playing: false,
        position_ms: 0.0,
        duration_ms: 0.0,
        timeline_updated_at: 0.0,
        can_seek: false,
        thumbnail_read: false,
        thumbnail: None,
        thumbnail_type: None,
    }
}

fn read_properties(session: &Session) -> Option<MediaProperties> {
    let request = session.TryGetMediaPropertiesAsync().ok()?;
    join_within(&request, PROPERTIES_WAIT, "reading the media properties").ok()
}

fn fill_playback(snapshot: &mut MediaSnapshot, session: &Session) {
    let Ok(playback) = session.GetPlaybackInfo() else { return };
    snapshot.playing = playback.PlaybackStatus().is_ok_and(|status| status == PlaybackStatus::Playing);
    snapshot.can_seek = playback
        .Controls()
        .and_then(|controls| controls.IsPlaybackPositionEnabled())
        .unwrap_or(false);
}

fn fill_timeline(snapshot: &mut MediaSnapshot, session: &Session) {
    let Ok(timeline) = session.GetTimelineProperties() else { return };
    let start = timeline.StartTime().map_or(0, |span| span.Duration);
    let end = timeline.EndTime().map_or(0, |span| span.Duration);
    let position = timeline.Position().map_or(0, |span| span.Duration);
    snapshot.duration_ms = milliseconds_of_ticks(end - start);
    snapshot.position_ms = milliseconds_of_ticks(position - start);
    snapshot.timeline_updated_at = timeline.LastUpdatedTime().map_or(0.0, unix_milliseconds_of);
}

pub fn read_session(session: Option<&Session>) -> SessionReading {
    let mut snapshot = empty_snapshot();
    let Some(session) = session else {
        return SessionReading { snapshot, properties: None };
    };
    let properties = read_properties(session);
    snapshot.app_id = text_of(session.SourceAppUserModelId());
    if let Some(properties) = properties.as_ref() {
        snapshot.title = text_of(properties.Title());
        snapshot.artist = text_of(properties.Artist());
    }
    fill_playback(&mut snapshot, session);
    fill_timeline(&mut snapshot, session);
    SessionReading { snapshot, properties }
}

impl SessionReading {
    pub fn track(&self) -> TrackIdentity {
        TrackIdentity {
            app_id: self.snapshot.app_id.clone(),
            title: self.snapshot.title.clone(),
            artist: self.snapshot.artist.clone(),
        }
    }

    pub fn with_thumbnail(self) -> MediaSnapshot {
        let mut snapshot = self.snapshot;
        snapshot.thumbnail_read = true;
        if let Some(thumbnail) = self.properties.as_ref().and_then(read_thumbnail) {
            snapshot.thumbnail = Some(Buffer::from(thumbnail.bytes));
            snapshot.thumbnail_type = thumbnail.content_type;
        }
        snapshot
    }

    pub fn without_thumbnail(self) -> MediaSnapshot {
        self.snapshot
    }
}
