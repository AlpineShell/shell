use std::sync::atomic::{AtomicBool, Ordering};

use windows::core::Interface;
use windows::Win32::Media::Audio::{
    eCapture, AudioSessionStateActive, IAudioSessionControl, IAudioSessionControl2, IAudioSessionManager2,
    IMMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::CLSCTX_ALL;

#[derive(Default)]
pub struct CaptureSessions {
    managers: Option<Vec<IAudioSessionManager2>>,
}

fn session_managers_of_active_capture_endpoints(
    enumerator: &IMMDeviceEnumerator,
) -> windows::core::Result<Vec<IAudioSessionManager2>> {
    let collection = unsafe { enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)? };
    let count = unsafe { collection.GetCount()? };
    Ok((0..count)
        .filter_map(|index| unsafe { collection.Item(index) }.ok())
        .filter_map(|device| unsafe { device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) }.ok())
        .collect())
}

fn capturing_process_id(session: &IAudioSessionControl) -> Option<u32> {
    if unsafe { session.GetState() }.ok()? != AudioSessionStateActive {
        return None;
    }
    let process_id = unsafe { session.cast::<IAudioSessionControl2>().ok()?.GetProcessId() }.ok()?;
    (process_id > 0).then_some(process_id)
}

fn collect_capturing_process_ids(manager: &IAudioSessionManager2, process_ids: &mut Vec<u32>) -> windows::core::Result<()> {
    let sessions = unsafe { manager.GetSessionEnumerator()? };
    let count = unsafe { sessions.GetCount()? };
    for index in 0..count {
        let session = unsafe { sessions.GetSession(index)? };
        if let Some(process_id) = capturing_process_id(&session) {
            if !process_ids.contains(&process_id) {
                process_ids.push(process_id);
            }
        }
    }
    Ok(())
}

impl CaptureSessions {
    pub fn release(&mut self) {
        self.managers = None;
    }

    fn bound_managers(
        &mut self,
        enumerator: &IMMDeviceEnumerator,
        stale: &AtomicBool,
    ) -> windows::core::Result<&[IAudioSessionManager2]> {
        if stale.swap(false, Ordering::AcqRel) || self.managers.is_none() {
            self.managers = Some(session_managers_of_active_capture_endpoints(enumerator)?);
        }
        Ok(self.managers.as_deref().expect("capture managers were just bound"))
    }

    pub fn capturing_process_ids(
        &mut self,
        enumerator: &IMMDeviceEnumerator,
        stale: &AtomicBool,
    ) -> windows::core::Result<Vec<u32>> {
        let mut process_ids = Vec::new();
        for manager in self.bound_managers(enumerator, stale)? {
            collect_capturing_process_ids(manager, &mut process_ids)?;
        }
        Ok(process_ids)
    }
}
