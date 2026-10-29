use std::collections::HashMap;
use std::mem::size_of;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;

use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, UnknownReturnValue};
use napi::Status;
use napi_derive::napi;
use windows::core::w;
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK,
    RID_INPUT, RIM_TYPEHID,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostThreadMessageW, RegisterClassW,
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WM_QUIT, WNDCLASSW,
};

use crate::touchpad_layout::{ContactReading, ReportReading, TouchpadLayout};

const DIGITIZER_PAGE: u16 = 0x0D;
const PRECISION_TOUCHPAD_USAGE: u16 = 0x05;

#[napi(object)]
pub struct TouchpadContact {
    pub id: u32,
    pub touching: bool,
    pub x: f64,
    pub y: f64,
}

#[napi(object)]
pub struct TouchpadReport {
    pub contact_count: u32,
    pub contacts: Vec<TouchpadContact>,
}

pub type TouchpadListener = ThreadsafeFunction<TouchpadReport, UnknownReturnValue, TouchpadReport, Status, true, true>;

static RUNNING_WATCH_THREAD: Mutex<Option<u32>> = Mutex::new(None);

fn running_watch_thread() -> std::sync::MutexGuard<'static, Option<u32>> {
    RUNNING_WATCH_THREAD.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

unsafe extern "system" fn touchpad_window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

fn create_input_window() -> Result<HWND, String> {
    let instance = unsafe { GetModuleHandleW(None) }
        .map_err(|error| format!("could not read the module handle: {}", error.message()))?;
    let class_name = w!("AlpineTouchpadInput");
    let class = WNDCLASSW {
        lpfnWndProc: Some(touchpad_window_proc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..Default::default()
    };
    unsafe { RegisterClassW(&class) };
    unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            w!(""),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        )
    }
    .map_err(|error| format!("could not create the touchpad input window: {}", error.message()))
}

fn register_for_touchpad_input(window: HWND) -> Result<(), String> {
    let device = RAWINPUTDEVICE {
        usUsagePage: DIGITIZER_PAGE,
        usUsage: PRECISION_TOUCHPAD_USAGE,
        dwFlags: RIDEV_INPUTSINK,
        hwndTarget: window,
    };
    unsafe { RegisterRawInputDevices(&[device], size_of::<RAWINPUTDEVICE>() as u32) }
        .map_err(|error| format!("could not register for touchpad input: {}", error.message()))
}

fn read_raw_input(handle: HRAWINPUT) -> Option<Vec<u64>> {
    let header_size = size_of::<RAWINPUTHEADER>() as u32;
    let mut size = 0u32;
    unsafe { GetRawInputData(handle, RID_INPUT, None, &mut size, header_size) };
    if size == 0 {
        return None;
    }
    let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
    let written = unsafe { GetRawInputData(handle, RID_INPUT, Some(buffer.as_mut_ptr().cast()), &mut size, header_size) };
    (written != u32::MAX && written != 0).then_some(buffer)
}

fn hid_reports(input: &RAWINPUT) -> Vec<&[u8]> {
    let hid = unsafe { &input.data.hid };
    let report_size = hid.dwSizeHid as usize;
    if report_size == 0 {
        return Vec::new();
    }
    let all_reports = unsafe { std::slice::from_raw_parts(hid.bRawData.as_ptr(), report_size * hid.dwCount as usize) };
    all_reports.chunks_exact(report_size).collect()
}

fn to_touchpad_contact(reading: ContactReading) -> TouchpadContact {
    TouchpadContact {
        id: reading.id,
        touching: reading.touching,
        x: reading.x,
        y: reading.y,
    }
}

fn to_touchpad_report(reading: ReportReading) -> TouchpadReport {
    TouchpadReport {
        contact_count: reading.contact_count,
        contacts: reading.contacts.into_iter().map(to_touchpad_contact).collect(),
    }
}

struct TouchpadReader {
    layouts: HashMap<isize, Option<TouchpadLayout>>,
}

impl TouchpadReader {
    fn layout_for(&mut self, device: HANDLE) -> Option<&TouchpadLayout> {
        self.layouts
            .entry(device.0 as isize)
            .or_insert_with(|| TouchpadLayout::describe(device))
            .as_ref()
    }

    fn deliver_input(&mut self, handle: HRAWINPUT, listener: &TouchpadListener) {
        let Some(buffer) = read_raw_input(handle) else { return };
        let input = unsafe { &*(buffer.as_ptr() as *const RAWINPUT) };
        if input.header.dwType != RIM_TYPEHID.0 {
            return;
        }
        let Some(layout) = self.layout_for(input.header.hDevice) else { return };
        for report in hid_reports(input) {
            let reading = to_touchpad_report(layout.read_report(report));
            listener.call(Ok(reading), ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

fn pump_messages(listener: &TouchpadListener) {
    let mut reader = TouchpadReader { layouts: HashMap::new() };
    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {
        if message.message == WM_INPUT {
            reader.deliver_input(HRAWINPUT(message.lParam.0 as _), listener);
        }
        unsafe { DispatchMessageW(&message) };
    }
}

fn watch_touchpad(listener: TouchpadListener, ready: Sender<Result<u32, String>>) {
    let window = match create_input_window().and_then(|window| register_for_touchpad_input(window).map(|_| window)) {
        Ok(window) => window,
        Err(reason) => {
            let _ = ready.send(Err(reason));
            return;
        }
    };
    let _ = ready.send(Ok(unsafe { GetCurrentThreadId() }));
    pump_messages(&listener);
    let _ = unsafe { DestroyWindow(window) };
}

fn stop_thread(slot: &mut Option<u32>) {
    if let Some(thread_id) = slot.take() {
        let _ = unsafe { PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
    }
}

pub fn start_watching(listener: TouchpadListener) -> Result<(), String> {
    let mut slot = running_watch_thread();
    stop_thread(&mut slot);
    let (ready_sender, ready_receiver) = channel();
    thread::Builder::new()
        .name("alpine-touchpad".to_string())
        .spawn(move || watch_touchpad(listener, ready_sender))
        .map_err(|error| format!("could not start the touchpad thread: {error}"))?;
    let thread_id = ready_receiver
        .recv()
        .map_err(|_| "the touchpad thread ended before it started".to_string())??;
    *slot = Some(thread_id);
    Ok(())
}
