use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::{
    eCapture, eMultimedia, eRender, EDataFlow, IMMDevice, IMMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PROPVARIANT};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL, STGM_READ};
use windows::Win32::System::Variant::VT_LPWSTR;

use crate::com_strings::take_co_task_string;
use crate::policy_config::{IPolicyConfig, POLICY_CONFIG_CLIENT};

const DEFAULT_ROLE_COUNT: i32 = 3;

#[derive(Clone, Copy)]
pub enum EndpointFlow {
    Output,
    Input,
}

pub struct AudioEndpoint {
    pub id: String,
    pub name: Option<String>,
    pub flow: EndpointFlow,
    pub is_default: bool,
}

fn data_flow_of(flow: EndpointFlow) -> EDataFlow {
    match flow {
        EndpointFlow::Output => eRender,
        EndpointFlow::Input => eCapture,
    }
}

pub fn device_id(device: &IMMDevice) -> windows::core::Result<String> {
    take_co_task_string(unsafe { device.GetId()? })
}

fn default_endpoint_id(enumerator: &IMMDeviceEnumerator, flow: EndpointFlow) -> Option<String> {
    let device = unsafe { enumerator.GetDefaultAudioEndpoint(data_flow_of(flow), eMultimedia) }.ok()?;
    device_id(&device).ok()
}

fn wide_string_of(value: &PROPVARIANT) -> Option<String> {
    let inner = unsafe { &value.Anonymous.Anonymous };
    if inner.vt != VT_LPWSTR {
        return None;
    }
    unsafe { inner.Anonymous.pwszVal.to_string() }.ok()
}

fn friendly_name(device: &IMMDevice) -> Option<String> {
    let store = unsafe { device.OpenPropertyStore(STGM_READ) }.ok()?;
    let mut value = unsafe { store.GetValue(&PKEY_Device_FriendlyName) }.ok()?;
    let name = wide_string_of(&value);
    let _ = unsafe { PropVariantClear(&mut value) };
    name
}

fn endpoint_of(device: IMMDevice, flow: EndpointFlow, default_id: Option<&str>) -> Option<AudioEndpoint> {
    let id = device_id(&device).ok()?;
    Some(AudioEndpoint {
        is_default: default_id == Some(id.as_str()),
        name: friendly_name(&device),
        flow,
        id,
    })
}

fn active_endpoints_of(
    enumerator: &IMMDeviceEnumerator,
    flow: EndpointFlow,
) -> windows::core::Result<Vec<AudioEndpoint>> {
    let default_id = default_endpoint_id(enumerator, flow);
    let collection = unsafe { enumerator.EnumAudioEndpoints(data_flow_of(flow), DEVICE_STATE_ACTIVE)? };
    let count = unsafe { collection.GetCount()? };
    Ok((0..count)
        .filter_map(|index| unsafe { collection.Item(index) }.ok())
        .filter_map(|device| endpoint_of(device, flow, default_id.as_deref()))
        .collect())
}

pub fn list_active_endpoints(enumerator: &IMMDeviceEnumerator) -> windows::core::Result<Vec<AudioEndpoint>> {
    let mut endpoints = active_endpoints_of(enumerator, EndpointFlow::Output)?;
    endpoints.extend(active_endpoints_of(enumerator, EndpointFlow::Input)?);
    Ok(endpoints)
}

pub fn set_default_endpoint(id: &str) -> windows::core::Result<bool> {
    let policy: IPolicyConfig = unsafe { CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)? };
    let wide_id = HSTRING::from(id);
    Ok((0..DEFAULT_ROLE_COUNT)
        .all(|role| unsafe { policy.set_default_endpoint(PCWSTR(wide_id.as_ptr()), role) }.0 == 0))
}
