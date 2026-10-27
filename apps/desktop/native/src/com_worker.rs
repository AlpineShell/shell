use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::thread;

use napi::bindgen_prelude::{Object, ToNapiValue};
use napi::Env;
use windows::Win32::System::Com::{CoInitializeEx, COINIT};

use crate::com_call::{CallOutcome, ComCall, PendingCall};
use crate::com_post::PostedCall;

type QueuedCall<S> = Box<dyn PendingCall<S>>;

pub struct ComWorker<S: Default + 'static> {
    thread_name: &'static str,
    label: &'static str,
    apartment: COINIT,
    running_thread: Mutex<Option<Sender<QueuedCall<S>>>>,
}

fn initialize_com_for_thread(label: &str, apartment: COINIT) -> Result<(), String> {
    unsafe { CoInitializeEx(None, apartment) }
        .ok()
        .map_err(|error| format!("could not initialize COM on the {label} thread: {}", error.message()))
}

fn reject_queued_calls<S>(calls: &Receiver<QueuedCall<S>>, reason: &str) {
    while let Ok(call) = calls.try_recv() {
        call.fail(reason.to_string());
    }
}

fn serve_calls<S: Default>(label: &str, apartment: COINIT, calls: Receiver<QueuedCall<S>>) {
    if let Err(reason) = initialize_com_for_thread(label, apartment) {
        reject_queued_calls(&calls, &reason);
        return;
    }
    let mut state = S::default();
    for call in calls.iter() {
        if let CallOutcome::Panicked = call.run(&mut state) {
            state = S::default();
        }
    }
}

fn send_to_running_thread<S>(slot: &mut Option<Sender<QueuedCall<S>>>, call: QueuedCall<S>) -> Result<(), QueuedCall<S>> {
    match slot {
        Some(sender) => sender.send(call).map_err(|failed| failed.0),
        None => Err(call),
    }
}

impl<S: Default + 'static> ComWorker<S> {
    pub const fn new(thread_name: &'static str, label: &'static str, apartment: COINIT) -> Self {
        ComWorker {
            thread_name,
            label,
            apartment,
            running_thread: Mutex::new(None),
        }
    }

    fn spawn_thread(&self) -> Result<Sender<QueuedCall<S>>, String> {
        let (sender, receiver) = channel::<QueuedCall<S>>();
        let label = self.label;
        let apartment = self.apartment;
        thread::Builder::new()
            .name(self.thread_name.to_string())
            .spawn(move || serve_calls(label, apartment, receiver))
            .map_err(|error| format!("could not start the {label} thread: {error}"))?;
        Ok(sender)
    }

    fn send_to_respawned_thread(&self, slot: &mut Option<Sender<QueuedCall<S>>>, call: QueuedCall<S>) {
        match self.spawn_thread() {
            Ok(sender) => {
                let sent = sender.send(call);
                *slot = Some(sender);
                if let Err(failed) = sent {
                    failed.0.fail(format!("the {} thread is not running", self.label));
                }
            }
            Err(reason) => {
                *slot = None;
                call.fail(reason);
            }
        }
    }

    pub(crate) fn submit(&self, call: QueuedCall<S>) {
        let mut slot = self.running_thread.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Err(unsent) = send_to_running_thread(&mut slot, call) {
            self.send_to_respawned_thread(&mut slot, unsent);
        }
    }

    pub fn queue<'env, T: ToNapiValue + Send + 'static>(
        &self,
        env: &'env Env,
        work: impl FnOnce(&mut S) -> Result<T, String> + Send + 'static,
    ) -> napi::Result<Object<'env>> {
        let (call, promise) = ComCall::create(env, self.label, Box::new(work))?;
        self.submit(call);
        Ok(promise)
    }

    pub fn post(&self, work: impl FnOnce(&mut S) + Send + 'static) {
        self.submit(PostedCall::create(Box::new(work)));
    }
}
