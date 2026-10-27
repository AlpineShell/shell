use windows_core::{interface, IUnknown, IUnknown_Vtbl, GUID, HRESULT, PCWSTR};

pub const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[interface("F8679F50-850A-41CF-9C72-430F290290C8")]
pub unsafe trait IPolicyConfig: IUnknown {
    pub fn get_mix_format(&self) -> HRESULT;
    pub fn get_device_format(&self) -> HRESULT;
    pub fn reset_device_format(&self) -> HRESULT;
    pub fn set_device_format(&self) -> HRESULT;
    pub fn get_processing_period(&self) -> HRESULT;
    pub fn set_processing_period(&self) -> HRESULT;
    pub fn get_share_mode(&self) -> HRESULT;
    pub fn set_share_mode(&self) -> HRESULT;
    pub fn get_property_value(&self) -> HRESULT;
    pub fn set_property_value(&self) -> HRESULT;
    pub fn set_default_endpoint(&self, device_id: PCWSTR, role: i32) -> HRESULT;
    pub fn set_endpoint_visibility(&self) -> HRESULT;
}
