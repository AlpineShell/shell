use std::panic::{catch_unwind, AssertUnwindSafe};

use crate::com_call::{CallOutcome, PendingCall};

pub type PostedWork<S> = Box<dyn FnOnce(&mut S) + Send>;

pub struct PostedCall<S: 'static> {
    work: PostedWork<S>,
}

impl<S: 'static> PostedCall<S> {
    pub fn create(work: PostedWork<S>) -> Box<Self> {
        Box::new(PostedCall { work })
    }
}

impl<S: 'static> PendingCall<S> for PostedCall<S> {
    fn run(self: Box<Self>, state: &mut S) -> CallOutcome {
        let work = self.work;
        match catch_unwind(AssertUnwindSafe(|| work(state))) {
            Ok(()) => CallOutcome::Completed,
            Err(_) => CallOutcome::Panicked,
        }
    }

    fn fail(self: Box<Self>, _reason: String) {}
}
