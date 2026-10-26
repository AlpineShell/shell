use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::{
    eRender, EDataFlow, ERole, IMMDeviceEnumerator, IMMNotificationClient, IMMNotificationClient_Impl,
    DEVICE_STATE,
};
use windows_core::{implement, PCWSTR};

#[implement(IMMNotificationClient)]
struct StaleBindingNotifier {
    binding_stale: Arc<AtomicBool>,
}

impl StaleBindingNotifier {
    fn mark_binding_stale(&self) {
        self.binding_stale.store(true, Ordering::Release);
    }
}

impl IMMNotificationClient_Impl for StaleBindingNotifier_Impl {
    fn OnDeviceStateChanged(&self, _device_id: &PCWSTR, _new_state: DEVICE_STATE) -> windows_core::Result<()> {
        self.mark_binding_stale();
        Ok(())
    }

    fn OnDeviceAdded(&self, _device_id: &PCWSTR) -> windows_core::Result<()> {
        Ok(())
    }

    fn OnDeviceRemoved(&self, _device_id: &PCWSTR) -> windows_core::Result<()> {
        self.mark_binding_stale();
        Ok(())
    }

    fn OnDefaultDeviceChanged(&self, flow: EDataFlow, _role: ERole, _default_id: &PCWSTR) -> windows_core::Result<()> {
        if flow == eRender {
            self.mark_binding_stale();
        }
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
    pub fn watch(enumerator: IMMDeviceEnumerator, binding_stale: Arc<AtomicBool>) -> Self {
        let notifier: IMMNotificationClient = StaleBindingNotifier { binding_stale }.into();
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
