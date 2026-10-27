use std::collections::HashMap;
use std::path::Path;

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextLengthW, GetWindowThreadProcessId, IsHungAppWindow, IsWindowVisible,
};

const CHROMIUM_WINDOW_CLASS: &str = "Chrome_WidgetWin_1";
const FIREFOX_WINDOW_CLASS: &str = "MozillaWindowClass";
const BROWSER_PROCESS_NAMES: [&str; 6] = ["chrome", "msedge", "brave", "opera", "vivaldi", "firefox"];

pub struct BrowserWindow {
    pub hwnd: HWND,
    pub browser: String,
    pub is_firefox: bool,
}

impl BrowserWindow {
    pub fn handle_value(&self) -> i64 {
        self.hwnd.0 as isize as i64
    }
}

unsafe extern "system" fn collect_window(hwnd: HWND, collected: LPARAM) -> BOOL {
    let windows = unsafe { &mut *(collected.0 as *mut Vec<HWND>) };
    windows.push(hwnd);
    BOOL(1)
}

fn top_level_windows() -> Vec<HWND> {
    let mut windows: Vec<HWND> = Vec::new();
    let _ = unsafe { EnumWindows(Some(collect_window), LPARAM(&mut windows as *mut Vec<HWND> as isize)) };
    windows
}

fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 64];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

fn is_titled_visible_window(hwnd: HWND) -> bool {
    unsafe { IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 }
}

fn process_image_stem(process_id: u32) -> Option<String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;
    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let queried = unsafe { QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut size) };
    let _ = unsafe { CloseHandle(process) };
    queried.ok()?;
    let image = String::from_utf16_lossy(&buffer[..size as usize]);
    Path::new(&image).file_stem().map(|stem| stem.to_string_lossy().to_lowercase())
}

fn window_process_id(hwnd: HWND) -> u32 {
    let mut process_id = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    process_id
}

fn browser_process_name(hwnd: HWND, names_by_process: &mut HashMap<u32, Option<String>>) -> Option<String> {
    let process_id = window_process_id(hwnd);
    names_by_process
        .entry(process_id)
        .or_insert_with(|| process_image_stem(process_id).filter(|name| BROWSER_PROCESS_NAMES.contains(&name.as_str())))
        .clone()
}

fn as_browser_window(hwnd: HWND, names_by_process: &mut HashMap<u32, Option<String>>) -> Option<BrowserWindow> {
    if !is_titled_visible_window(hwnd) {
        return None;
    }
    let class = window_class(hwnd);
    let is_firefox = class == FIREFOX_WINDOW_CLASS;
    if !is_firefox && class != CHROMIUM_WINDOW_CLASS {
        return None;
    }
    let browser = browser_process_name(hwnd, names_by_process)?;
    Some(BrowserWindow { hwnd, browser, is_firefox })
}

pub fn find_browser_windows() -> Vec<BrowserWindow> {
    let mut names_by_process = HashMap::new();
    top_level_windows()
        .into_iter()
        .filter_map(|hwnd| as_browser_window(hwnd, &mut names_by_process))
        .collect()
}

pub fn is_window_hung(window: &BrowserWindow) -> bool {
    unsafe { IsHungAppWindow(window.hwnd).as_bool() }
}
