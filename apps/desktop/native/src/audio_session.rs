use std::sync::atomic::Ordering;

use windows::core::GUID;
use windows::Win32::Foundation::ERROR_NOT_FOUND;
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioMeterInformation};
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

use crate::audio_devices::device_id;
use crate::audio_events::{volume_change_forwarder, AUDIO_EVENTS};
use crate::capture_sessions::CaptureSessions;
use crate::endpoint_watcher::{StaleBindings, WatchedEnumerator};
use crate::process_identity::{ProcessIdentities, ProcessIdentity};

pub struct VolumeState {
    pub percent: u32,
    pub muted: bool,
}

struct BoundEndpoint {
    device_id: String,
    volume: IAudioEndpointVolume,
    meter: IAudioMeterInformation,
    volume_watch: Option<IAudioEndpointVolumeCallback>,
}

#[derive(Default)]
pub struct AudioSession {
    bound: Option<BoundEndpoint>,
    watched_enumerator: Option<WatchedEnumerator>,
    stale: StaleBindings,
    capture_sessions: CaptureSessions,
    process_identities: ProcessIdentities,
}

const NO_EVENT_CONTEXT: *const GUID = std::ptr::null();

fn clamp_percent(percent: f64) -> f64 {
    percent.clamp(0.0, 100.0)
}

pub fn percent_of_scalar(scalar: f32) -> u32 {
    clamp_percent((f64::from(scalar) * 100.0).round()) as u32
}

fn round_to_thousandths(value: f32) -> f64 {
    (f64::from(value) * 1000.0).round() / 1000.0
}

fn read_volume_percent(endpoint: &BoundEndpoint) -> windows::core::Result<u32> {
    Ok(percent_of_scalar(unsafe { endpoint.volume.GetMasterVolumeLevelScalar()? }))
}

fn read_mute(endpoint: &BoundEndpoint) -> windows::core::Result<bool> {
    Ok(unsafe { endpoint.volume.GetMute()? }.as_bool())
}

fn read_volume_state(endpoint: &BoundEndpoint) -> windows::core::Result<VolumeState> {
    Ok(VolumeState {
        percent: read_volume_percent(endpoint)?,
        muted: read_mute(endpoint)?,
    })
}

fn read_peak_value(endpoint: &BoundEndpoint) -> windows::core::Result<f64> {
    Ok(round_to_thousandths(unsafe { endpoint.meter.GetPeakValue()? }))
}

fn write_volume_percent(endpoint: &BoundEndpoint, percent: f64) -> windows::core::Result<()> {
    let scalar = (clamp_percent(percent) / 100.0) as f32;
    unsafe { endpoint.volume.SetMasterVolumeLevelScalar(scalar, NO_EVENT_CONTEXT) }
}

fn write_mute(endpoint: &BoundEndpoint, muted: bool) -> windows::core::Result<()> {
    unsafe { endpoint.volume.SetMute(muted, NO_EVENT_CONTEXT) }
}

fn step_volume_and_unmute(endpoint: &BoundEndpoint, delta_percent: f64) -> windows::core::Result<VolumeState> {
    let stepped = clamp_percent((f64::from(read_volume_percent(endpoint)?) + delta_percent).round());
    write_volume_percent(endpoint, stepped)?;
    if read_mute(endpoint)? {
        write_mute(endpoint, false)?;
    }
    read_volume_state(endpoint)
}

fn flip_mute(endpoint: &BoundEndpoint) -> windows::core::Result<VolumeState> {
    write_mute(endpoint, !read_mute(endpoint)?)?;
    read_volume_state(endpoint)
}

fn describe_failure(error: &windows::core::Error) -> String {
    if error.code() == ERROR_NOT_FOUND.to_hresult() {
        return "no default render endpoint".to_string();
    }
    format!("audio endpoint call failed: {} ({:#010x})", error.message(), error.code().0)
}

impl BoundEndpoint {
    fn start_volume_watch(&mut self) {
        let forwarder = volume_change_forwarder();
        if unsafe { self.volume.RegisterControlChangeNotify(&forwarder) }.is_ok() {
            self.volume_watch = Some(forwarder);
        }
    }

    fn stop_volume_watch(&mut self) {
        if let Some(forwarder) = self.volume_watch.take() {
            let _ = unsafe { self.volume.UnregisterControlChangeNotify(&forwarder) };
        }
    }

    fn sync_volume_watch(&mut self, watching: bool) {
        match (watching, self.volume_watch.is_some()) {
            (true, false) => self.start_volume_watch(),
            (false, true) => self.stop_volume_watch(),
            _ => {}
        }
    }
}

impl Drop for BoundEndpoint {
    fn drop(&mut self) {
        self.stop_volume_watch();
    }
}

impl AudioSession {
    pub fn enumerator(&mut self) -> Result<&IMMDeviceEnumerator, String> {
        self.ensure_enumerator().map_err(|error| describe_failure(&error))
    }

    fn ensure_enumerator(&mut self) -> windows::core::Result<&IMMDeviceEnumerator> {
        if self.watched_enumerator.is_none() {
            let created: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
            self.watched_enumerator = Some(WatchedEnumerator::watch(created, self.stale.clone()));
        }
        Ok(self
            .watched_enumerator
            .as_ref()
            .expect("enumerator was just created")
            .enumerator())
    }

    pub fn mark_binding_stale(&self) {
        self.stale.render.store(true, Ordering::Release);
        self.stale.capture.store(true, Ordering::Release);
    }

    fn release_binding(&mut self) {
        self.bound = None;
        self.watched_enumerator = None;
    }

    fn can_reuse_binding(&self) -> bool {
        let watching = self.watched_enumerator.as_ref().is_some_and(WatchedEnumerator::is_watching);
        watching && self.bound.is_some() && !self.stale.render.load(Ordering::Acquire)
    }

    fn bind_default_endpoint(&mut self) -> windows::core::Result<&BoundEndpoint> {
        if !self.can_reuse_binding() {
            self.rebind_default_endpoint()?;
        }
        let bound = self.bound.as_mut().expect("endpoint was just bound");
        bound.sync_volume_watch(AUDIO_EVENTS.is_watching());
        Ok(bound)
    }

    fn rebind_default_endpoint(&mut self) -> windows::core::Result<()> {
        self.stale.render.swap(false, Ordering::AcqRel);
        let device = unsafe { self.ensure_enumerator()?.GetDefaultAudioEndpoint(eRender, eMultimedia)? };
        let default_id = device_id(&device)?;
        let still_bound = self.bound.as_ref().is_some_and(|bound| bound.device_id == default_id);
        if !still_bound {
            let volume: IAudioEndpointVolume = unsafe { device.Activate(CLSCTX_ALL, None)? };
            let meter: IAudioMeterInformation = unsafe { device.Activate(CLSCTX_ALL, None)? };
            self.bound = Some(BoundEndpoint {
                device_id: default_id,
                volume,
                meter,
                volume_watch: None,
            });
        }
        Ok(())
    }

    fn on_bound_endpoint<T>(&mut self, body: impl Fn(&BoundEndpoint) -> windows::core::Result<T>) -> Result<T, String> {
        if let Ok(value) = self.bind_default_endpoint().and_then(&body) {
            return Ok(value);
        }
        self.release_binding();
        let retried = self.bind_default_endpoint().and_then(&body);
        if retried.is_err() {
            self.release_binding();
        }
        retried.map_err(|error| describe_failure(&error))
    }

    pub fn read_state(&mut self) -> Result<VolumeState, String> {
        self.on_bound_endpoint(read_volume_state)
    }

    pub fn set_volume_percent(&mut self, percent: f64) -> Result<(), String> {
        self.on_bound_endpoint(|endpoint| write_volume_percent(endpoint, percent))
    }

    pub fn set_mute(&mut self, muted: bool) -> Result<(), String> {
        self.on_bound_endpoint(|endpoint| write_mute(endpoint, muted))
    }

    pub fn step_volume(&mut self, delta_percent: f64) -> Result<VolumeState, String> {
        self.on_bound_endpoint(|endpoint| step_volume_and_unmute(endpoint, delta_percent))
    }

    pub fn toggle_mute(&mut self) -> Result<VolumeState, String> {
        self.on_bound_endpoint(flip_mute)
    }

    pub fn read_peak(&mut self) -> Result<f64, String> {
        self.on_bound_endpoint(read_peak_value)
    }

    pub fn sync_volume_watch(&mut self) -> Result<(), String> {
        if AUDIO_EVENTS.is_watching() {
            return self.on_bound_endpoint(|_| Ok(()));
        }
        if let Some(bound) = self.bound.as_mut() {
            bound.sync_volume_watch(false);
        }
        Ok(())
    }

    fn read_capturing_process_ids(&mut self) -> windows::core::Result<Vec<u32>> {
        self.ensure_enumerator()?;
        let enumerator = self.watched_enumerator.as_ref().expect("enumerator was just created").enumerator();
        self.capture_sessions.capturing_process_ids(enumerator, &self.stale.capture)
    }

    fn release_every_binding(&mut self) {
        self.capture_sessions.release();
        self.release_binding();
        let _ = self.sync_volume_watch();
    }

    pub fn list_capturing_processes(&mut self) -> Result<Vec<ProcessIdentity>, String> {
        let process_ids = match self.read_capturing_process_ids() {
            Ok(process_ids) => process_ids,
            Err(_) => {
                self.capture_sessions.release();
                self.read_capturing_process_ids().map_err(|error| {
                    self.release_every_binding();
                    format!("could not list capture sessions: {} ({:#010x})", error.message(), error.code().0)
                })?
            }
        };
        let mut identities: Vec<ProcessIdentity> = Vec::new();
        for identity in process_ids.into_iter().filter_map(|process_id| self.process_identities.identify(process_id)) {
            if !identities.iter().any(|known| known.name == identity.name) {
                identities.push(identity);
            }
        }
        Ok(identities)
    }
}
