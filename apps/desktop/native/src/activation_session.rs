use windows::core::{HRESULT, HSTRING, PCWSTR};
use windows::Win32::Foundation::{CO_E_OBJNOTCONNECTED, RPC_E_DISCONNECTED, RPC_E_SERVER_DIED, RPC_E_SERVER_DIED_DNE};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::UI::Shell::{ApplicationActivationManager, IApplicationActivationManager, AO_NONE};

const RPC_S_SERVER_UNAVAILABLE: HRESULT = HRESULT(0x800706BA_u32 as i32);
const RPC_S_CALL_FAILED: HRESULT = HRESULT(0x800706BE_u32 as i32);

const DEAD_MANAGER_CODES: [HRESULT; 6] = [
    CO_E_OBJNOTCONNECTED,
    RPC_E_DISCONNECTED,
    RPC_E_SERVER_DIED,
    RPC_E_SERVER_DIED_DNE,
    RPC_S_SERVER_UNAVAILABLE,
    RPC_S_CALL_FAILED,
];

#[derive(Default)]
pub struct ActivationSession {
    manager: Option<IApplicationActivationManager>,
}

enum ActivationFailure {
    ManagerUnavailable(windows::core::Error),
    ManagerDisconnected(windows::core::Error),
    Refused(windows::core::Error),
}

fn classify_activation_error(error: windows::core::Error) -> ActivationFailure {
    if DEAD_MANAGER_CODES.contains(&error.code()) {
        ActivationFailure::ManagerDisconnected(error)
    } else {
        ActivationFailure::Refused(error)
    }
}

fn describe_activation_failure(aumid: &str, error: &windows::core::Error) -> String {
    format!("could not activate {aumid}: 0x{:08X} {}", error.code().0, error.message())
}

impl ActivationFailure {
    fn is_retryable(&self) -> bool {
        !matches!(self, ActivationFailure::Refused(_))
    }

    fn into_error(self) -> windows::core::Error {
        match self {
            ActivationFailure::ManagerUnavailable(error)
            | ActivationFailure::ManagerDisconnected(error)
            | ActivationFailure::Refused(error) => error,
        }
    }
}

impl ActivationSession {
    fn ensure_manager(&mut self) -> windows::core::Result<&IApplicationActivationManager> {
        if self.manager.is_none() {
            let created: IApplicationActivationManager =
                unsafe { CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_ALL)? };
            self.manager = Some(created);
        }
        Ok(self.manager.as_ref().expect("manager was just created"))
    }

    fn try_activate(&mut self, aumid: &HSTRING) -> Result<u32, ActivationFailure> {
        let manager = self.ensure_manager().map_err(ActivationFailure::ManagerUnavailable)?;
        unsafe { manager.ActivateApplication(aumid, PCWSTR::null(), AO_NONE) }.map_err(classify_activation_error)
    }

    pub fn warm(&mut self) -> Result<(), String> {
        self.ensure_manager()
            .map(|_| ())
            .map_err(|error| format!("could not create the application activation manager: 0x{:08X} {}", error.code().0, error.message()))
    }

    pub fn activate(&mut self, aumid: &str) -> Result<u32, String> {
        let wide_aumid = HSTRING::from(aumid);
        let first = match self.try_activate(&wide_aumid) {
            Ok(process_id) => return Ok(process_id),
            Err(failure) => failure,
        };
        if !first.is_retryable() {
            return Err(describe_activation_failure(aumid, &first.into_error()));
        }
        self.manager = None;
        self.try_activate(&wide_aumid).map_err(|failure| {
            self.manager = None;
            describe_activation_failure(aumid, &failure.into_error())
        })
    }
}
