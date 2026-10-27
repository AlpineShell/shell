use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::{
    eCapture, eRender, EDataFlow, ERole, IMMDeviceEnumerator, IMMNotificationClient, IMMNotificationClient_Impl,
    DEVICE_STATE,
};
use windows_core::{implement, PCWSTR};

use crate::audio_events::AUDIO_EVENTS;

#[derive(Clone, Default)]
pub struct StaleBindings {
    pub render: Arc<AtomicBool>,
    pub capture: Arc<AtomicBool>,
}

impl StaleBindings {
    fn mark_render_stale(&self) {
        self.render.store(true, Ordering::Release);
    }

    fn mark_capture_stale(&self) {
        self.capture.store(true, Ordering::Release);
    }

    fn mark_all_stale(&self) {
        self.mark_render_stale();
        self.mark_capture_stale();
    }
}

#[implement(IMMNotificationClient)]
struct StaleBindingNotifier {
    stale: StaleBindings,
}

impl IMMNotificationClient_Impl for StaleBindingNotifier_Impl {
    fn OnDeviceStateChanged(&self, _device_id: &PCWSTR, _new_state: DEVICE_STATE) -> windows_core::Result<()> {
        self.stale.mark_all_stale();
        AUDIO_EVENTS.forward_devices_changed();
        Ok(())
    }

    fn OnDeviceAdded(&self, _device_id: &PCWSTR) -> windows_core::Result<()> {
        self.stale.mark_capture_stale();
        AUDIO_EVENTS.forward_devices_changed();
        Ok(())
    }

    fn OnDeviceRemoved(&self, _device_id: &PCWSTR) -> windows_core::Result<()> {
        self.stale.mark_all_stale();
        AUDIO_EVENTS.forward_devices_changed();
        Ok(())
    }

    fn OnDefaultDeviceChanged(&self, flow: EDataFlow, _role: ERole, _default_id: &PCWSTR) -> windows_core::Result<()> {
        if flow == eRender {
            self.stale.mark_render_stale();
        }
        if flow == eCapture {
            self.stale.mark_capture_stale();
        }
        AUDIO_EVENTS.forward_devices_changed();
        Ok(())
    }

    fn OnPropertyValueChanged(&self, _device_id: &PCWSTR, _key: &PROPERTYKEY) -> windows_core::Result<()> {
        Ok(())
    }
}

pub struct WatchedEnumerator {
    enumerator: IMMDeviceEnumerator,
    registered_notifier: Option<IMMNotificationClient>,
}

impl WatchedEnumerator {
    pub fn watch(enumerator: IMMDeviceEnumerator, stale: StaleBindings) -> Self {
        let notifier: IMMNotificationClient = StaleBindingNotifier { stale }.into();
        let registered = unsafe { enumerator.RegisterEndpointNotificationCallback(&notifier) }.is_ok();
        WatchedEnumerator {
            enumerator,
            registered_notifier: registered.then_some(notifier),
        }
    }

    pub fn enumerator(&self) -> &IMMDeviceEnumerator {
        &self.enumerator
    }

    pub fn is_watching(&self) -> bool {
        self.registered_notifier.is_some()
    }
}

impl Drop for WatchedEnumerator {
    fn drop(&mut self) {
        if let Some(notifier) = self.registered_notifier.take() {
            let _ = unsafe { self.enumerator.UnregisterEndpointNotificationCallback(&notifier) };
        }
    }
}
