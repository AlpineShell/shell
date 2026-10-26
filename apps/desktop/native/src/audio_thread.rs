use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::thread;

use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use crate::audio_call::{CallOutcome, PendingAudioCall};
use crate::audio_session::AudioSession;

type QueuedCall = Box<dyn PendingAudioCall>;

static AUDIO_THREAD: Mutex<Option<Sender<QueuedCall>>> = Mutex::new(None);

fn initialize_com_for_thread() -> Result<(), String> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(|error| format!("could not initialize COM on the audio thread: {}", error.message()))
}

fn reject_queued_calls(calls: &Receiver<QueuedCall>, reason: &str) {
    while let Ok(call) = calls.try_recv() {
        call.fail(reason.to_string());
    }
}

fn serve_audio_calls(calls: Receiver<QueuedCall>) {
    if let Err(reason) = initialize_com_for_thread() {
        reject_queued_calls(&calls, &reason);
        return;
    }
    let mut session = AudioSession::default();
    for call in calls.iter() {
        if let CallOutcome::Panicked = call.run(&mut session) {
            session = AudioSession::default();
        }
    }
}

fn spawn_audio_thread() -> Result<Sender<QueuedCall>, String> {
    let (sender, receiver) = channel::<QueuedCall>();
    thread::Builder::new()
        .name("alpine-audio".to_string())
        .spawn(move || serve_audio_calls(receiver))
        .map_err(|error| format!("could not start the audio thread: {error}"))?;
    Ok(sender)
}

fn send_to_running_thread(slot: &mut Option<Sender<QueuedCall>>, call: QueuedCall) -> Result<(), QueuedCall> {
    match slot {
        Some(sender) => sender.send(call).map_err(|failed| failed.0),
        None => Err(call),
    }
}

fn send_to_respawned_thread(slot: &mut Option<Sender<QueuedCall>>, call: QueuedCall) {
    match spawn_audio_thread() {
        Ok(sender) => {
            let sent = sender.send(call);
            *slot = Some(sender);
            if let Err(failed) = sent {
                failed.0.fail("the audio thread is not running".to_string());
            }
        }
        Err(reason) => {
            *slot = None;
            call.fail(reason);
        }
    }
}

pub fn submit_audio_call(call: QueuedCall) {
    let mut slot = AUDIO_THREAD.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Err(unsent) = send_to_running_thread(&mut slot, call) {
        send_to_respawned_thread(&mut slot, unsent);
    }
}
