#![cfg(windows)]

mod activation_session;
mod audio_devices;
mod audio_events;
mod audio_session;
mod blocking_call;
mod brightness_watcher;
mod browser_tabs_session;
mod browser_windows;
mod call_deadline;
mod capture_sessions;
mod com_call;
mod com_post;
mod com_strings;
mod com_variant;
mod com_worker;
mod endpoint_watcher;
mod media_session;
mod media_snapshot;
mod media_thumbnail;
mod media_watch;
mod msaa_tabs;
mod policy_config;
mod process_identity;
mod tab_selection;
mod uia_tabs;
mod winrt_async;
mod wmi_brightness;
mod wmi_connection;
mod wmi_variant;

use std::time::Duration;

use napi::bindgen_prelude::{Either, Function, Null, Object, ToNapiValue};
use napi::Env;
use napi_derive::napi;

use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED};

use activation_session::ActivationSession;
use audio_events::{AudioListeners, AUDIO_EVENTS};
use audio_devices::{list_active_endpoints, set_default_endpoint, AudioEndpoint, EndpointFlow};
use audio_session::{AudioSession, VolumeState};
use blocking_call::run_blocking;
use brightness_watcher::{start_watching, BrightnessListener};
use browser_tabs_session::TabsSession;
use com_worker::ComWorker;
use media_session::{MediaSession, SnapshotListener};
use process_identity::ProcessIdentity;
use tab_selection::TabRow;
use wmi_brightness::{BrightnessSession, MonitorIdentityRow};

static AUDIO_WORKER: ComWorker<AudioSession> = ComWorker::new("alpine-audio", "audio", COINIT_MULTITHREADED);

static ACTIVATION_WORKER: ComWorker<ActivationSession> =
    ComWorker::new("alpine-activation", "activation", COINIT_APARTMENTTHREADED);

static BRIGHTNESS_WORKER: ComWorker<BrightnessSession> =
    ComWorker::new("alpine-brightness", "brightness", COINIT_MULTITHREADED);

static TABS_WORKER: ComWorker<TabsSession> = ComWorker::new("alpine-browser-tabs", "browser tabs", COINIT_MULTITHREADED);

#[napi(object)]
pub struct AudioState {
    pub volume: u32,
    pub muted: bool,
}

#[napi(object)]
pub struct AudioDevice {
    pub id: String,
    pub name: Either<String, Null>,
    pub flow: String,
    pub is_default: bool,
}

fn queue_audio_call<T: ToNapiValue + Send + 'static>(
    env: &Env,
    work: impl FnOnce(&mut AudioSession) -> Result<T, String> + Send + 'static,
) -> napi::Result<Object<'_>> {
    AUDIO_WORKER.queue(env, work)
}

fn to_audio_state(state: VolumeState) -> AudioState {
    AudioState {
        volume: state.percent,
        muted: state.muted,
    }
}

fn flow_label(flow: EndpointFlow) -> String {
    match flow {
        EndpointFlow::Output => "output".to_string(),
        EndpointFlow::Input => "input".to_string(),
    }
}

fn to_audio_device(endpoint: AudioEndpoint) -> AudioDevice {
    AudioDevice {
        id: endpoint.id,
        name: endpoint.name.map_or(Either::B(Null), Either::A),
        flow: flow_label(endpoint.flow),
        is_default: endpoint.is_default,
    }
}

fn list_devices(session: &mut AudioSession) -> Result<Vec<AudioDevice>, String> {
    let endpoints = list_active_endpoints(session.enumerator()?)
        .map_err(|error| format!("could not list audio devices: {}", error.message()))?;
    Ok(endpoints.into_iter().map(to_audio_device).collect())
}

fn switch_default_device(session: &mut AudioSession, id: &str) -> Result<bool, String> {
    let switched = set_default_endpoint(id)
        .map_err(|error| format!("could not set the default audio device: {}", error.message()))?;
    if switched {
        session.mark_binding_stale();
    }
    Ok(switched)
}

#[napi(ts_return_type = "Promise<AudioState>")]
pub fn audio_get_state(env: &Env) -> napi::Result<Object<'_>> {
    queue_audio_call(env, |session| session.read_state().map(to_audio_state))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn audio_set_volume(env: &Env, percent: f64) -> napi::Result<Object<'_>> {
    queue_audio_call(env, move |session| session.set_volume_percent(percent))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn audio_set_mute(env: &Env, muted: bool) -> napi::Result<Object<'_>> {
    queue_audio_call(env, move |session| session.set_mute(muted))
}

#[napi(ts_return_type = "Promise<AudioState>")]
pub fn audio_step_volume(env: &Env, delta_percent: f64) -> napi::Result<Object<'_>> {
    queue_audio_call(env, move |session| session.step_volume(delta_percent).map(to_audio_state))
}

#[napi(ts_return_type = "Promise<AudioState>")]
pub fn audio_toggle_mute(env: &Env) -> napi::Result<Object<'_>> {
    queue_audio_call(env, |session| session.toggle_mute().map(to_audio_state))
}

#[napi(ts_return_type = "Promise<number>")]
pub fn audio_get_peak(env: &Env) -> napi::Result<Object<'_>> {
    queue_audio_call(env, |session| session.read_peak())
}

#[napi(ts_return_type = "Promise<Array<AudioDevice>>")]
pub fn audio_list_devices(env: &Env) -> napi::Result<Object<'_>> {
    queue_audio_call(env, list_devices)
}

#[napi(ts_return_type = "Promise<boolean>")]
pub fn audio_set_default_device(env: &Env, id: String) -> napi::Result<Object<'_>> {
    queue_audio_call(env, move |session| switch_default_device(session, &id))
}

#[napi(ts_return_type = "Promise<number>")]
pub fn app_activate(env: &Env, aumid: String) -> napi::Result<Object<'_>> {
    ACTIVATION_WORKER.queue(env, move |session| session.activate(&aumid))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn app_activation_warm(env: &Env) -> napi::Result<Object<'_>> {
    ACTIVATION_WORKER.queue(env, |session| session.warm())
}

#[napi(object)]
pub struct MicrophoneCapturer {
    pub name: String,
    pub path: Either<String, Null>,
    pub description: Either<String, Null>,
}

fn to_microphone_capturer(identity: ProcessIdentity) -> MicrophoneCapturer {
    MicrophoneCapturer {
        name: identity.name,
        path: identity.path.map_or(Either::B(Null), Either::A),
        description: identity.description.map_or(Either::B(Null), Either::A),
    }
}

#[napi(ts_return_type = "Promise<Array<MicrophoneCapturer>>")]
pub fn microphone_list_capturers(env: &Env) -> napi::Result<Object<'_>> {
    queue_audio_call(env, |session| {
        let identities = session.list_capturing_processes()?;
        Ok(identities.into_iter().map(to_microphone_capturer).collect::<Vec<_>>())
    })
}

#[napi(
    ts_args_type = "onVolume: (state: AudioState) => void, onDevicesChanged: () => void",
    ts_return_type = "Promise<void>"
)]
pub fn audio_watch<'env>(
    env: &'env Env,
    on_volume: Function<AudioState, ()>,
    on_devices_changed: Function<(), ()>,
) -> napi::Result<Object<'env>> {
    AUDIO_EVENTS.replace(Some(AudioListeners::create(&on_volume, &on_devices_changed)?));
    queue_audio_call(env, |session| session.sync_volume_watch())
}

#[napi(ts_return_type = "Promise<void>")]
pub fn audio_unwatch(env: &Env) -> napi::Result<Object<'_>> {
    AUDIO_EVENTS.replace(None);
    queue_audio_call(env, |session| session.sync_volume_watch())
}

#[napi(object)]
pub struct BrowserTab {
    pub hwnd: i64,
    pub browser: String,
    pub index: u32,
    pub selected: bool,
    pub title: String,
}

fn to_browser_tab(row: TabRow) -> BrowserTab {
    BrowserTab {
        hwnd: row.hwnd,
        browser: row.browser,
        index: row.index,
        selected: row.selected,
        title: row.title,
    }
}

#[napi(ts_return_type = "Promise<Array<BrowserTab>>")]
pub fn browser_tabs_list(env: &Env) -> napi::Result<Object<'_>> {
    TABS_WORKER.queue(env, |session| Ok(session.list()?.into_iter().map(to_browser_tab).collect::<Vec<_>>()))
}

#[napi(ts_return_type = "Promise<string>")]
pub fn browser_tabs_activate(env: &Env, hwnd: i64, index: i32, title: String) -> napi::Result<Object<'_>> {
    TABS_WORKER.queue(env, move |session| session.activate(hwnd, index, &title))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn browser_tabs_warm(env: &Env) -> napi::Result<Object<'_>> {
    TABS_WORKER.queue(env, |session| session.warm())
}

static MEDIA_WORKER: ComWorker<MediaSession> = ComWorker::new("alpine-media", "media", COINIT_MULTITHREADED);

fn request_media_refresh() {
    MEDIA_WORKER.post(MediaSession::refresh_watch);
}

#[napi(ts_return_type = "Promise<MediaSnapshot>")]
pub fn media_get_info(env: &Env, with_thumbnail: bool) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, move |session| session.read_info(with_thumbnail))
}

#[napi(ts_return_type = "Promise<boolean>")]
pub fn media_control(env: &Env, action: String) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, move |session| session.control(&action))
}

#[napi(ts_return_type = "Promise<boolean>")]
pub fn media_seek(env: &Env, position_ms: f64) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, move |session| session.seek(position_ms))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn media_watch(env: &Env, listener: SnapshotListener) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, move |session| {
        session.watch(listener, request_media_refresh);
        Ok(())
    })
}

#[napi(ts_return_type = "Promise<void>")]
pub fn media_refresh_watch(env: &Env) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, |session| {
        session.refresh_watch();
        Ok(())
    })
}

#[napi(ts_return_type = "Promise<void>")]
pub fn media_unwatch(env: &Env) -> napi::Result<Object<'_>> {
    MEDIA_WORKER.queue(env, |session| {
        session.unwatch();
        Ok(())
    })
}

#[napi(object)]
pub struct MonitorIdentity {
    pub instance_name: Either<String, Null>,
    pub manufacturer: String,
    pub product_code: String,
    pub serial: String,
}

fn to_monitor_identity(row: MonitorIdentityRow) -> MonitorIdentity {
    MonitorIdentity {
        instance_name: row.instance_name.map_or(Either::B(Null), Either::A),
        manufacturer: row.manufacturer,
        product_code: row.product_code,
        serial: row.serial,
    }
}

fn brightness_level(percent: f64) -> u8 {
    if percent.is_nan() {
        return 0;
    }
    percent.clamp(0.0, 100.0).round() as u8
}

#[napi(ts_return_type = "Promise<number | null>")]
pub fn brightness_read_current(env: &Env) -> napi::Result<Object<'_>> {
    BRIGHTNESS_WORKER.queue(env, |session| {
        session
            .read_current_brightness()
            .map(|current| current.map_or(Either::B(Null), Either::A))
    })
}

#[napi(ts_return_type = "Promise<Array<number>>")]
pub fn brightness_read_video_output_technologies(env: &Env) -> napi::Result<Object<'_>> {
    BRIGHTNESS_WORKER.queue(env, |session| session.read_video_output_technologies())
}

#[napi(ts_return_type = "Promise<Array<MonitorIdentity>>")]
pub fn brightness_read_monitor_identities(env: &Env) -> napi::Result<Object<'_>> {
    BRIGHTNESS_WORKER.queue(env, |session| {
        session
            .read_monitor_identities()
            .map(|rows| rows.into_iter().map(to_monitor_identity).collect::<Vec<_>>())
    })
}

#[napi(ts_return_type = "Promise<boolean>")]
pub fn brightness_set_internal(env: &Env, percent: f64) -> napi::Result<Object<'_>> {
    let level = brightness_level(percent);
    BRIGHTNESS_WORKER.queue(env, move |session| session.set_brightness(level))
}

#[napi]
pub fn brightness_set_internal_blocking(percent: f64, timeout_ms: u32) -> napi::Result<bool> {
    let level = brightness_level(percent);
    run_blocking(&BRIGHTNESS_WORKER, "brightness", Duration::from_millis(u64::from(timeout_ms)), move |session| {
        session.set_brightness(level)
    })
    .map_err(napi::Error::from_reason)
}

#[napi(ts_args_type = "listener: (error: Error | null, brightness: number) => void")]
pub fn brightness_watch(listener: BrightnessListener) -> napi::Result<()> {
    start_watching(listener).map_err(napi::Error::from_reason)
}
