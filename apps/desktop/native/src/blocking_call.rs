use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::{sync_channel, RecvTimeoutError, SyncSender};
use std::time::Duration;

use crate::com_call::{CallOutcome, PendingCall};
use crate::com_worker::ComWorker;

type BlockingWork<S, T> = Box<dyn FnOnce(&mut S) -> Result<T, String> + Send>;

struct BlockingCall<S: 'static, T: Send + 'static> {
    label: &'static str,
    work: Option<BlockingWork<S, T>>,
    reply: SyncSender<Result<T, String>>,
}

impl<S: 'static, T: Send + 'static> PendingCall<S> for BlockingCall<S, T> {
    fn run(mut self: Box<Self>, state: &mut S) -> CallOutcome {
        let Some(work) = self.work.take() else {
            return CallOutcome::Completed;
        };
        match catch_unwind(AssertUnwindSafe(|| work(state))) {
            Ok(result) => {
                let _ = self.reply.send(result);
                CallOutcome::Completed
            }
            Err(_) => {
                let _ = self.reply.send(Err(format!("the {} call panicked", self.label)));
                CallOutcome::Panicked
            }
        }
    }

    fn fail(self: Box<Self>, reason: String) {
        let _ = self.reply.send(Err(reason));
    }
}

pub fn run_blocking<S: Default + 'static, T: Send + 'static>(
    worker: &ComWorker<S>,
    label: &'static str,
    timeout: Duration,
    work: impl FnOnce(&mut S) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (reply, answer) = sync_channel(1);
    worker.submit(Box::new(BlockingCall {
        label,
        work: Some(Box::new(work)),
        reply,
    }));
    answer.recv_timeout(timeout).map_err(|error| match error {
        RecvTimeoutError::Timeout => format!("the {label} call did not finish within {} ms", timeout.as_millis()),
        RecvTimeoutError::Disconnected => format!("the {label} thread stopped before running this call"),
    })?
}
