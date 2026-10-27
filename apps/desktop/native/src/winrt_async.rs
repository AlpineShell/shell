use std::sync::mpsc::sync_channel;
use std::time::Duration;

use windows_core::RuntimeType;
use windows_future::{AsyncOperationCompletedHandler, IAsyncOperation};

pub fn join_within<T: RuntimeType + 'static>(
    operation: &IAsyncOperation<T>,
    limit: Duration,
    what: &str,
) -> Result<T, String> {
    let (completed, finished) = sync_channel::<()>(1);
    operation
        .SetCompleted(&AsyncOperationCompletedHandler::new(move |_, _| {
            let _ = completed.try_send(());
            Ok(())
        }))
        .map_err(|error| format!("could not wait for {what}: {}", error.message()))?;
    if finished.recv_timeout(limit).is_err() {
        let _ = operation.Cancel();
        return Err(format!("{what} did not answer within {} ms", limit.as_millis()));
    }
    operation
        .GetResults()
        .map_err(|error| format!("{what} failed: {}", error.message()))
}
