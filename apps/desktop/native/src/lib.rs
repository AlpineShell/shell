#![cfg(windows)]

mod activation_session;
mod audio_devices;
mod audio_session;
mod com_call;
mod com_post;
mod com_strings;
mod com_worker;
mod endpoint_watcher;
mod media_session;
mod media_snapshot;
mod media_thumbnail;
mod media_watch;
mod policy_config;
mod winrt_async;

use napi::bindgen_prelude::{Either, Null, Object, ToNapiValue};
use napi::Env;
use napi_derive::napi;

use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, COINIT_MULTITHREADED};

use activation_session::ActivationSession;
use audio_devices::{list_active_endpoints, set_default_endpoint, AudioEndpoint, EndpointFlow};
use audio_session::{AudioSession, VolumeState};
use com_worker::ComWorker;
use media_session::{MediaSession, SnapshotListener};

static AUDIO_WORKER: ComWorker<AudioSession> = ComWorker::new("alpine-audio", "audio", COINIT_MULTITHREADED);

static ACTIVATION_WORKER: ComWorker<ActivationSession> =
    ComWorker::new("alpine-activation", "activation", COINIT_APARTMENTTHREADED);

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
