use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, UnknownReturnValue};
use napi::Status;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

use crate::wmi_brightness::MONITOR_NAMESPACE;
use crate::wmi_connection::{connect_to_namespace, next_row, read_property, subscribe_to_events, NextRow};

const BRIGHTNESS_EVENT_QUERY: &str = "SELECT * FROM WmiMonitorBrightnessEvent";
const STOP_CHECK_INTERVAL_MS: i32 = 500;

pub type BrightnessListener = ThreadsafeFunction<u32, UnknownReturnValue, u32, Status, true, true>;

static RUNNING_WATCH: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

struct ComApartment;

impl ComApartment {
    fn enter() -> Result<Self, String> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            .ok()
            .map_err(|error| format!("could not initialize COM on the brightness watch thread: {}", error.message()))?;
        Ok(ComApartment)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn running_watch() -> MutexGuard<'static, Option<Arc<AtomicBool>>> {
    RUNNING_WATCH.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn is_stopped(stop: &AtomicBool) -> bool {
    stop.load(Ordering::Acquire)
}

fn announce_brightness(stop: &AtomicBool, listener: &BrightnessListener, brightness: u32) {
    if !is_stopped(stop) {
        listener.call(Ok(brightness), ThreadsafeFunctionCallMode::NonBlocking);
    }
}

fn deliver_brightness_events(stop: &AtomicBool, listener: &BrightnessListener) -> Result<(), String> {
    let services = connect_to_namespace(MONITOR_NAMESPACE)?;
    let events = subscribe_to_events(&services, BRIGHTNESS_EVENT_QUERY)?;
    while !is_stopped(stop) {
        match next_row(&events, STOP_CHECK_INTERVAL_MS, BRIGHTNESS_EVENT_QUERY)? {
            NextRow::Row(event) => {
                if let Some(brightness) = read_property(&event, "Brightness")?.to_i32() {
                    announce_brightness(stop, listener, brightness as u32);
                }
            }
            NextRow::TimedOut => {}
            NextRow::Finished => return Err("the brightness event subscription ended".to_string()),
        }
    }
    Ok(())
}

fn watch_until_stopped(stop: Arc<AtomicBool>, listener: BrightnessListener) {
    let outcome = ComApartment::enter().and_then(|_apartment| deliver_brightness_events(&stop, &listener));
    if let Err(reason) = outcome {
        if !is_stopped(&stop) {
            listener.call(Err(napi::Error::from_reason(reason)), ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

fn signal_stop(slot: &mut Option<Arc<AtomicBool>>) {
    if let Some(previous) = slot.take() {
        previous.store(true, Ordering::Release);
    }
}

pub fn start_watching(listener: BrightnessListener) -> Result<(), String> {
    let mut slot = running_watch();
    signal_stop(&mut slot);
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    thread::Builder::new()
        .name("alpine-brightness-watch".to_string())
        .spawn(move || watch_until_stopped(thread_stop, listener))
        .map_err(|error| format!("could not start the brightness watch thread: {error}"))?;
    *slot = Some(stop);
    Ok(())
}
