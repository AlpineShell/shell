use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::Function;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl};
use windows::Win32::Media::Audio::AUDIO_VOLUME_NOTIFICATION_DATA;
use windows_core::implement;

use crate::audio_session::percent_of_scalar;
use crate::AudioState;

type VolumeListener = ThreadsafeFunction<AudioState, (), AudioState, napi::Status, false, true>;

type DevicesListener = ThreadsafeFunction<(), (), (), napi::Status, false, true>;

pub struct AudioListeners {
    volume: VolumeListener,
    devices: DevicesListener,
}

impl AudioListeners {
    pub fn create(on_volume: &Function<AudioState, ()>, on_devices_changed: &Function<(), ()>) -> napi::Result<Self> {
        Ok(AudioListeners {
            volume: on_volume.build_threadsafe_function().weak::<true>().build()?,
            devices: on_devices_changed.build_threadsafe_function().weak::<true>().build()?,
        })
    }
}

pub struct AudioEventSlot {
    listeners: Mutex<Option<Arc<AudioListeners>>>,
}

pub static AUDIO_EVENTS: AudioEventSlot = AudioEventSlot {
    listeners: Mutex::new(None),
};

impl AudioEventSlot {
    fn current(&self) -> Option<Arc<AudioListeners>> {
        self.listeners.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone()
    }

    pub fn replace(&self, listeners: Option<AudioListeners>) {
        let previous = {
            let mut slot = self.listeners.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            std::mem::replace(&mut *slot, listeners.map(Arc::new))
        };
        drop(previous);
    }

    pub fn is_watching(&self) -> bool {
        self.listeners.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).is_some()
    }

    fn forward_volume(&self, state: AudioState) {
        if let Some(listeners) = self.current() {
            listeners.volume.call(state, ThreadsafeFunctionCallMode::NonBlocking);
        }
    }

    pub fn forward_devices_changed(&self) {
        if let Some(listeners) = self.current() {
            listeners.devices.call((), ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

#[implement(IAudioEndpointVolumeCallback)]
struct VolumeChangeForwarder;

impl IAudioEndpointVolumeCallback_Impl for VolumeChangeForwarder_Impl {
    fn OnNotify(&self, notification: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows_core::Result<()> {
        if let Some(data) = unsafe { notification.as_ref() } {
            AUDIO_EVENTS.forward_volume(AudioState {
                volume: percent_of_scalar(data.fMasterVolume),
                muted: data.bMuted.as_bool(),
            });
        }
        Ok(())
    }
}

pub fn volume_change_forwarder() -> IAudioEndpointVolumeCallback {
    VolumeChangeForwarder.into()
}
