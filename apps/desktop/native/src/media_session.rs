use std::sync::Arc;
use std::time::Duration;

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::Status;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
};

use crate::media_snapshot::{read_session, MediaSnapshot, TrackIdentity, TICKS_PER_MILLISECOND};
use crate::media_watch::{follow_current_session, subscribe_to_manager, ManagerSubscription, WatchSignals, WatchedSession};
use crate::winrt_async::join_within;

const MANAGER_WAIT: Duration = Duration::from_secs(5);
const COMMAND_WAIT: Duration = Duration::from_secs(5);

pub type SnapshotListener = ThreadsafeFunction<MediaSnapshot, (), MediaSnapshot, Status, false, true>;

struct WatchConnection {
    watched: Option<WatchedSession>,
    subscription: ManagerSubscription,
}

struct SessionWatch {
    listener: SnapshotListener,
    signals: Arc<WatchSignals>,
    connection: Option<WatchConnection>,
    last_track: Option<TrackIdentity>,
}

#[derive(Default)]
pub struct MediaSession {
    manager: Option<SessionManager>,
    watch: Option<SessionWatch>,
}

fn current_session_of(manager: &SessionManager) -> windows_core::Result<Option<Session>> {
    match manager.GetCurrentSession() {
        Ok(session) => Ok(Some(session)),
        Err(error) if error.code().is_ok() => Ok(None),
        Err(error) => Err(error),
    }
}

fn describe_session_failure(error: windows_core::Error) -> String {
    format!("could not read the current media session: 0x{:08X} {}", error.code().0, error.message())
}

fn publish_current_session(watch: &mut SessionWatch, current: Option<Session>) {
    let Some(connection) = watch.connection.as_mut() else { return };
    follow_current_session(&mut connection.watched, current, &watch.signals);
    let properties_stale = watch.signals.take_properties_stale();
    let reading = read_session(connection.watched.as_ref().map(WatchedSession::session));
    let track = reading.track();
    let wants_thumbnail = properties_stale || watch.last_track.as_ref() != Some(&track);
    watch.last_track = Some(track);
    let snapshot = if wants_thumbnail {
        reading.with_thumbnail()
    } else {
        reading.without_thumbnail()
    };
    watch.listener.call(snapshot, ThreadsafeFunctionCallMode::NonBlocking);
}

impl MediaSession {
    fn manager(&mut self) -> Result<SessionManager, String> {
        if let Some(manager) = &self.manager {
            return Ok(manager.clone());
        }
        let request = SessionManager::RequestAsync()
            .map_err(|error| format!("could not reach the media sessions: {}", error.message()))?;
        let manager = join_within(&request, MANAGER_WAIT, "the media session manager")?;
        self.manager = Some(manager.clone());
        Ok(manager)
    }

    fn current_session(&mut self) -> Result<Option<Session>, String> {
        if let Ok(current) = current_session_of(&self.manager()?) {
            return Ok(current);
        }
        self.manager = None;
        current_session_of(&self.manager()?).map_err(describe_session_failure)
    }

    fn current_watched_session(&mut self, watch: &mut SessionWatch) -> Result<Option<Session>, String> {
        if let Some(connection) = &watch.connection {
            if let Ok(current) = current_session_of(connection.subscription.manager()) {
                return Ok(current);
            }
            watch.connection = None;
            self.manager = None;
        }
        let manager = self.manager()?;
        let subscription = subscribe_to_manager(&manager, &watch.signals)?;
        let current = current_session_of(&manager).map_err(describe_session_failure)?;
        watch.connection = Some(WatchConnection {
            watched: None,
            subscription,
        });
        Ok(current)
    }

    pub fn read_info(&mut self, with_thumbnail: bool) -> Result<MediaSnapshot, String> {
        let current = self.current_session()?;
        let reading = read_session(current.as_ref());
        Ok(if with_thumbnail {
            reading.with_thumbnail()
        } else {
            reading.without_thumbnail()
        })
    }

    pub fn control(&mut self, action: &str) -> Result<bool, String> {
        let Some(session) = self.current_session()? else { return Ok(false) };
        let request = match action {
            "play" => session.TryPlayAsync(),
            "pause" => session.TryPauseAsync(),
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            _ => return Ok(false),
        }
        .map_err(|error| format!("could not send {action} to the media session: {}", error.message()))?;
        join_within(&request, COMMAND_WAIT, "the media command")
    }

    pub fn seek(&mut self, position_ms: f64) -> Result<bool, String> {
        if !position_ms.is_finite() || position_ms < 0.0 {
            return Ok(false);
        }
        let Some(session) = self.current_session()? else { return Ok(false) };
        let start = session
            .GetTimelineProperties()
            .and_then(|timeline| timeline.StartTime())
            .map_or(0, |span| span.Duration);
        let target = start + (position_ms.round() as i64) * TICKS_PER_MILLISECOND;
        let request = session
            .TryChangePlaybackPositionAsync(target)
            .map_err(|error| format!("could not seek the media session: {}", error.message()))?;
        join_within(&request, COMMAND_WAIT, "the media seek")
    }

    pub fn watch(&mut self, listener: SnapshotListener, request_refresh: fn()) {
        self.watch = Some(SessionWatch {
            listener,
            signals: WatchSignals::new(request_refresh),
            connection: None,
            last_track: None,
        });
        self.refresh_watch();
    }

    pub fn unwatch(&mut self) {
        self.watch = None;
    }

    pub fn refresh_watch(&mut self) {
        let Some(mut watch) = self.watch.take() else { return };
        watch.signals.begin_refresh();
        if let Ok(current) = self.current_watched_session(&mut watch) {
            publish_current_session(&mut watch, current);
        }
        self.watch = Some(watch);
    }
}
