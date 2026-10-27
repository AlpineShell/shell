use windows::core::{BSTR, HRESULT, HSTRING, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoSetProxyBlanket, CLSCTX_INPROC_SERVER, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
    RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Rpc::{RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE};
use windows::Win32::System::Wmi::{
    IEnumWbemClassObject, IWbemClassObject, IWbemContext, IWbemLocator, IWbemServices, WbemLocator,
    WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_GENERIC_FLAG_TYPE, WBEM_S_TIMEDOUT,
};

use crate::wmi_variant::OwnedVariant;

const QUERY_LANGUAGE: &str = "WQL";
const ROW_WAIT_MS: i32 = 10_000;

pub enum NextRow {
    Row(IWbemClassObject),
    TimedOut,
    Finished,
}

pub fn describe_wmi_error(context: &str, error: &windows::core::Error) -> String {
    format!("{context}: 0x{:08X} {}", error.code().0, error.message())
}

fn semisynchronous_flags() -> WBEM_GENERIC_FLAG_TYPE {
    WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY
}

pub fn connect_to_namespace(namespace: &str) -> Result<IWbemServices, String> {
    let locator: IWbemLocator = unsafe { CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER) }
        .map_err(|error| describe_wmi_error("could not create the WMI locator", &error))?;
    let empty = BSTR::new();
    let services = unsafe {
        locator.ConnectServer(&BSTR::from(namespace), &empty, &empty, &empty, 0, &empty, None::<&IWbemContext>)
    }
    .map_err(|error| describe_wmi_error(&format!("could not connect to {namespace}"), &error))?;
    unsafe {
        CoSetProxyBlanket(
            &services,
            RPC_C_AUTHN_WINNT,
            RPC_C_AUTHZ_NONE,
            PCWSTR::null(),
            RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            None,
            EOAC_NONE,
        )
    }
    .map_err(|error| describe_wmi_error("could not set the WMI proxy security", &error))?;
    Ok(services)
}

pub fn next_row(rows: &IEnumWbemClassObject, wait_ms: i32, source: &str) -> Result<NextRow, String> {
    let mut next = [None];
    let mut returned = 0u32;
    let status = unsafe { rows.Next(wait_ms, &mut next, &mut returned) };
    status
        .ok()
        .map_err(|error| describe_wmi_error(&format!("could not read the rows of \"{source}\""), &error))?;
    if let Some(row) = next[0].take() {
        return Ok(NextRow::Row(row));
    }
    if status == HRESULT(WBEM_S_TIMEDOUT.0) {
        return Ok(NextRow::TimedOut);
    }
    Ok(NextRow::Finished)
}

pub fn query_rows(services: &IWbemServices, query: &str) -> Result<Vec<IWbemClassObject>, String> {
    let rows = unsafe {
        services.ExecQuery(&BSTR::from(QUERY_LANGUAGE), &BSTR::from(query), semisynchronous_flags(), None::<&IWbemContext>)
    }
    .map_err(|error| describe_wmi_error(&format!("could not run \"{query}\""), &error))?;
    let mut collected = Vec::new();
    loop {
        match next_row(&rows, ROW_WAIT_MS, query)? {
            NextRow::Row(row) => collected.push(row),
            NextRow::TimedOut => return Err(format!("\"{query}\" did not return its rows within {ROW_WAIT_MS} ms")),
            NextRow::Finished => return Ok(collected),
        }
    }
}

pub fn subscribe_to_events(services: &IWbemServices, query: &str) -> Result<IEnumWbemClassObject, String> {
    unsafe {
        services.ExecNotificationQuery(
            &BSTR::from(QUERY_LANGUAGE),
            &BSTR::from(query),
            semisynchronous_flags(),
            None::<&IWbemContext>,
        )
    }
    .map_err(|error| describe_wmi_error(&format!("could not subscribe to \"{query}\""), &error))
}

pub fn read_property(row: &IWbemClassObject, name: &str) -> Result<OwnedVariant, String> {
    let mut value = OwnedVariant::empty();
    unsafe { row.Get(&HSTRING::from(name), 0, value.as_mut_ptr(), None, None) }
        .map_err(|error| describe_wmi_error(&format!("could not read {name}"), &error))?;
    Ok(value)
}
