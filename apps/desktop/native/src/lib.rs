#![cfg(windows)]

mod activation_session;
mod audio_devices;
mod audio_events;
mod audio_session;
mod browser_tabs_session;
mod browser_windows;
mod call_deadline;
mod capture_sessions;
mod com_call;
mod com_strings;
mod com_variant;
mod com_worker;
mod endpoint_watcher;
mod msaa_tabs;
mod policy_config;
mod process_identity;
mod tab_selection;
mod uia_tabs;

use napi::bindgen_prelude::{Either, Function, Null, Object, ToNapiValue};
use napi::Env;
use napi_derive::napi;

use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED};

use activation_session::ActivationSession;
use audio_events::{AudioListeners, AUDIO_EVENTS};
use audio_devices::{list_active_endpoints, set_default_endpoint, AudioEndpoint, EndpointFlow};
use audio_session::{AudioSession, VolumeState};
use browser_tabs_session::TabsSession;
use com_worker::ComWorker;
use process_identity::ProcessIdentity;
use tab_selection::TabRow;

static AUDIO_WORKER: ComWorker<AudioSession> = ComWorker::new("alpine-audio", "audio", COINIT_MULTITHREADED);

static ACTIVATION_WORKER: ComWorker<ActivationSession> =
    ComWorker::new("alpine-activation", "activation", COINIT_APARTMENTTHREADED);

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
    queue_audio_call(env, |session| {
        session.sync_volume_watch();
        Ok(())
    })
}

#[napi(ts_return_type = "Promise<void>")]
pub fn audio_unwatch(env: &Env) -> napi::Result<Object<'_>> {
    AUDIO_EVENTS.replace(None);
    queue_audio_call(env, |session| {
        session.sync_volume_watch();
        Ok(())
    })
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
