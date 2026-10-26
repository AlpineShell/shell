use std::panic::{catch_unwind, AssertUnwindSafe};

use napi::bindgen_prelude::{Object, ToNapiValue};
use napi::{Env, JsDeferred};

use crate::audio_session::AudioSession;

pub type AudioWork<T> = Box<dyn FnOnce(&mut AudioSession) -> Result<T, String> + Send>;

type Settlement<T> = Box<dyn FnOnce(Env) -> napi::Result<T> + Send>;

pub enum CallOutcome {
    Completed,
    Panicked,
}

pub trait PendingAudioCall: Send {
    fn run(self: Box<Self>, session: &mut AudioSession) -> CallOutcome;
    fn fail(self: Box<Self>, reason: String);
}

pub struct AudioCall<T: ToNapiValue + Send + 'static> {
    work: Option<AudioWork<T>>,
    deferred: Option<JsDeferred<T, Settlement<T>>>,
}

impl<T: ToNapiValue + Send + 'static> AudioCall<T> {
    pub fn create<'env>(env: &'env Env, work: AudioWork<T>) -> napi::Result<(Box<Self>, Object<'env>)> {
        let (deferred, promise) = env.create_deferred::<T, Settlement<T>>()?;
        let call = Box::new(AudioCall {
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

impl<T: ToNapiValue + Send + 'static> PendingAudioCall for AudioCall<T> {
    fn run(mut self: Box<Self>, session: &mut AudioSession) -> CallOutcome {
        let Some(work) = self.work.take() else {
            self.reject("the audio call already ran".to_string());
            return CallOutcome::Completed;
        };
        match catch_unwind(AssertUnwindSafe(|| work(session))) {
            Ok(Ok(value)) => {
                self.resolve(value);
                CallOutcome::Completed
            }
            Ok(Err(reason)) => {
                self.reject(reason);
                CallOutcome::Completed
            }
            Err(_) => {
                self.reject("the audio call panicked".to_string());
                CallOutcome::Panicked
            }
        }
    }

    fn fail(mut self: Box<Self>, reason: String) {
        self.reject(reason);
    }
}

impl<T: ToNapiValue + Send + 'static> Drop for AudioCall<T> {
    fn drop(&mut self) {
        self.reject("the audio thread stopped before running this call".to_string());
    }
}
