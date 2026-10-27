use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::CoEnableCallCancellation;

use crate::browser_windows::{find_browser_windows, is_window_hung, BrowserWindow};
use crate::call_deadline::CallDeadline;
use crate::msaa_tabs;
use crate::tab_selection::{rows_for_window, ActivationResult, TabRow};
use crate::uia_tabs::UiaTabReader;

const CALL_BUDGET: Duration = Duration::from_secs(30);
const FIREFOX_RETRY_DELAY: Duration = Duration::from_millis(300);

#[derive(Default)]
pub struct TabsSession {
    uia: Option<UiaTabReader>,
    cancellation_enabled: bool,
}

fn read_firefox_window(window: &BrowserWindow, deadline: &CallDeadline) -> Vec<TabRow> {
    let rows = rows_for_window(window, msaa_tabs::read_tabs(window.hwnd, deadline));
    if !rows.is_empty() || deadline.expired() {
        return rows;
    }
    thread::sleep(FIREFOX_RETRY_DELAY);
    rows_for_window(window, msaa_tabs::read_tabs(window.hwnd, deadline))
}

fn read_window(uia: &UiaTabReader, window: &BrowserWindow, deadline: &CallDeadline) -> Vec<TabRow> {
    if window.is_firefox {
        read_firefox_window(window, deadline)
    } else {
        rows_for_window(window, uia.read_tabs(window.hwnd))
    }
}

impl TabsSession {
    fn prepare(&mut self) -> Result<&UiaTabReader, String> {
        if !self.cancellation_enabled {
            unsafe { CoEnableCallCancellation(None) }
                .map_err(|error| format!("could not enable COM call cancellation: {}", error.message()))?;
            self.cancellation_enabled = true;
        }
        if self.uia.is_none() {
            let reader = UiaTabReader::create()
                .map_err(|error| format!("could not create UI Automation: 0x{:08X} {}", error.code().0, error.message()))?;
            self.uia = Some(reader);
        }
        Ok(self.uia.as_ref().expect("the UI Automation reader was just created"))
    }

    pub fn warm(&mut self) -> Result<(), String> {
        self.prepare().map(|_| ())
    }

    pub fn list(&mut self) -> Result<Vec<TabRow>, String> {
        let deadline = CallDeadline::arm(CALL_BUDGET);
        let uia = self.prepare()?;
        let mut rows = Vec::new();
        for window in find_browser_windows() {
            if deadline.expired() {
                break;
            }
            if !is_window_hung(&window) {
                rows.extend(read_window(uia, &window, &deadline));
            }
        }
        Ok(rows)
    }

    pub fn activate(&mut self, hwnd: i64, index: i32, title: &str) -> Result<String, String> {
        let deadline = CallDeadline::arm(CALL_BUDGET);
        let uia = self.prepare()?;
        let target = HWND(hwnd as isize as *mut core::ffi::c_void);
        let result = match find_browser_windows().into_iter().find(|window| window.hwnd == target) {
            None => ActivationResult::NotFound,
            Some(window) if is_window_hung(&window) => ActivationResult::Failed,
            Some(window) if window.is_firefox => msaa_tabs::activate(window.hwnd, index, title, &deadline),
            Some(window) => uia.activate(window.hwnd, index, title),
        };
        Ok(result.label().to_string())
    }
}
