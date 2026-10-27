use windows::core::PWSTR;
use windows::Win32::Foundation::E_UNEXPECTED;
use windows::Win32::System::Com::CoTaskMemFree;

pub fn take_co_task_string(value: PWSTR) -> windows::core::Result<String> {
    let converted = unsafe { value.to_string() };
    unsafe { CoTaskMemFree(Some(value.0 as *const _)) };
    converted.map_err(|_| windows::core::Error::from(E_UNEXPECTED))
}
