use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
};
use windows_core::{IUnknown, Interface};

pub struct WatchSignals {
    refresh_queued: AtomicBool,
    properties_stale: AtomicBool,
    request_refresh: fn(),
}

impl WatchSignals {
    pub fn new(request_refresh: fn()) -> Arc<Self> {
        Arc::new(WatchSignals {
            refresh_queued: AtomicBool::new(false),
            properties_stale: AtomicBool::new(true),
            request_refresh,
        })
    }

    fn notify(&self, properties_changed: bool) {
        if properties_changed {
            self.mark_properties_stale();
        }
        if !self.refresh_queued.swap(true, Ordering::AcqRel) {
            (self.request_refresh)();
        }
    }

    pub fn mark_properties_stale(&self) {
        self.properties_stale.store(true, Ordering::Release);
    }

    pub fn begin_refresh(&self) {
        self.refresh_queued.store(false, Ordering::Release);
    }

    pub fn take_properties_stale(&self) -> bool {
        self.properties_stale.swap(false, Ordering::AcqRel)
    }
}

pub struct ManagerSubscription {
    manager: SessionManager,
    token: i64,
}

impl ManagerSubscription {
    pub fn manager(&self) -> &SessionManager {
        &self.manager
    }
}

impl Drop for ManagerSubscription {
    fn drop(&mut self) {
        let _ = self.manager.RemoveCurrentSessionChanged(self.token);
    }
}

pub struct WatchedSession {
    session: Session,
    identity: usize,
    properties_token: Option<i64>,
    playback_token: Option<i64>,
    timeline_token: Option<i64>,
}

impl WatchedSession {
    pub fn session(&self) -> &Session {
        &self.session
    }
}

impl Drop for WatchedSession {
    fn drop(&mut self) {
        if let Some(token) = self.properties_token {
            let _ = self.session.RemoveMediaPropertiesChanged(token);
        }
        if let Some(token) = self.playback_token {
            let _ = self.session.RemovePlaybackInfoChanged(token);
        }
        if let Some(token) = self.timeline_token {
            let _ = self.session.RemoveTimelinePropertiesChanged(token);
        }
    }
}

fn identity_of(session: &Session) -> usize {
    session.cast::<IUnknown>().map_or(0, |unknown| unknown.as_raw() as usize)
}

fn subscribe_to_session(session: Session, signals: &Arc<WatchSignals>) -> WatchedSession {
    let on_properties = Arc::clone(signals);
    let on_playback = Arc::clone(signals);
    let on_timeline = Arc::clone(signals);
    let properties_token = session
        .MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
            on_properties.notify(true);
            Ok(())
        }))
        .ok();
    let playback_token = session
        .PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
            on_playback.notify(false);
            Ok(())
        }))
        .ok();
    let timeline_token = session
        .TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
            on_timeline.notify(false);
            Ok(())
        }))
        .ok();
    WatchedSession {
        identity: identity_of(&session),
        session,
        properties_token,
        playback_token,
        timeline_token,
    }
}

pub fn subscribe_to_manager(manager: &SessionManager, signals: &Arc<WatchSignals>) -> Result<ManagerSubscription, String> {
    let on_session_change = Arc::clone(signals);
    let token = manager
        .CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
            on_session_change.notify(true);
            Ok(())
        }))
        .map_err(|error| format!("could not watch the current media session: {}", error.message()))?;
    Ok(ManagerSubscription {
        manager: manager.clone(),
        token,
    })
}

pub fn follow_current_session(watched: &mut Option<WatchedSession>, current: Option<Session>, signals: &Arc<WatchSignals>) {
    let current_identity = current.as_ref().map(identity_of);
    let watched_identity = watched.as_ref().map(|session| session.identity);
    if current_identity == watched_identity {
        return;
    }
    *watched = None;
    signals.mark_properties_stale();
    *watched = current.map(|session| subscribe_to_session(session, signals));
}
