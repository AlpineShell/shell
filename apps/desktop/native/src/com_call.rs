use std::panic::{catch_unwind, AssertUnwindSafe};

use napi::bindgen_prelude::{Object, ToNapiValue};
use napi::{Env, JsDeferred};

pub type ComWork<S, T> = Box<dyn FnOnce(&mut S) -> Result<T, String> + Send>;

type Settlement<T> = Box<dyn FnOnce(Env) -> napi::Result<T> + Send>;

pub enum CallOutcome {
    Completed,
    Panicked,
}

pub trait PendingCall<S>: Send {
    fn run(self: Box<Self>, state: &mut S) -> CallOutcome;
    fn fail(self: Box<Self>, reason: String);
}

pub struct ComCall<S: 'static, T: ToNapiValue + Send + 'static> {
    label: &'static str,
    work: Option<ComWork<S, T>>,
    deferred: Option<JsDeferred<T, Settlement<T>>>,
}

impl<S: 'static, T: ToNapiValue + Send + 'static> ComCall<S, T> {
    pub fn create<'env>(
        env: &'env Env,
        label: &'static str,
        work: ComWork<S, T>,
    ) -> napi::Result<(Box<Self>, Object<'env>)> {
        let (deferred, promise) = env.create_deferred::<T, Settlement<T>>()?;
        let call = Box::new(ComCall {
            label,
            work: Some(work),
            deferred: Some(deferred),
        });
        Ok((call, promise))
    }

    fn resolve(&mut self, value: T) {
        if let Some(deferred) = self.deferred.take() {
            deferred.resolve(Box::new(move |_env| Ok(value)));
        }
    }

    fn reject(&mut self, reason: String) {
        if let Some(deferred) = self.deferred.take() {
            deferred.reject(napi::Error::from_reason(reason));
        }
    }
}

impl<S: 'static, T: ToNapiValue + Send + 'static> PendingCall<S> for ComCall<S, T> {
    fn run(mut self: Box<Self>, state: &mut S) -> CallOutcome {
        let Some(work) = self.work.take() else {
            self.reject(format!("the {} call already ran", self.label));
            return CallOutcome::Completed;
        };
        match catch_unwind(AssertUnwindSafe(|| work(state))) {
            Ok(Ok(value)) => {
                self.resolve(value);
                CallOutcome::Completed
            }
            Ok(Err(reason)) => {
                self.reject(reason);
                CallOutcome::Completed
            }
            Err(_) => {
                self.reject(format!("the {} call panicked", self.label));
                CallOutcome::Panicked
            }
        }
    }

    fn fail(mut self: Box<Self>, reason: String) {
        self.reject(reason);
    }
}

impl<S: 'static, T: ToNapiValue + Send + 'static> Drop for ComCall<S, T> {
    fn drop(&mut self) {
        if self.deferred.is_none() {
            return;
        }
        self.reject(format!("the {} thread stopped before running this call", self.label));
    }
}
