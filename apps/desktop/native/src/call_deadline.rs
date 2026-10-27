use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use windows::Win32::System::Com::CoCancelCall;
use windows::Win32::System::Threading::GetCurrentThreadId;

const CANCEL_REPEAT_INTERVAL: Duration = Duration::from_millis(100);

pub struct CallDeadline {
    expires_at: Instant,
    finished: Option<Sender<()>>,
    watchdog: Option<JoinHandle<()>>,
}

fn cancel_pending_calls_until_finished(thread_id: u32, budget: Duration, finished: std::sync::mpsc::Receiver<()>) {
    let mut wait = budget;
    loop {
        match finished.recv_timeout(wait) {
            Err(RecvTimeoutError::Timeout) => {
                let _ = unsafe { CoCancelCall(thread_id, 0) };
                wait = CANCEL_REPEAT_INTERVAL;
            }
            _ => return,
        }
    }
}

impl CallDeadline {
    pub fn arm(budget: Duration) -> Self {
        let thread_id = unsafe { GetCurrentThreadId() };
        let (finished, finished_signal) = channel::<()>();
        let watchdog = thread::Builder::new()
            .name("alpine-tabs-deadline".to_string())
            .spawn(move || cancel_pending_calls_until_finished(thread_id, budget, finished_signal))
            .ok();
        CallDeadline {
            expires_at: Instant::now() + budget,
            finished: Some(finished),
            watchdog,
        }
    }

    pub fn expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }
}

impl Drop for CallDeadline {
    fn drop(&mut self) {
        drop(self.finished.take());
        if let Some(watchdog) = self.watchdog.take() {
            let _ = watchdog.join();
        }
    }
}
