use windows::core::{BSTR, HSTRING};
use windows::Win32::System::Wmi::{IWbemClassObject, IWbemContext, IWbemServices, WBEM_GENERIC_FLAG_TYPE};

use crate::wmi_connection::{connect_to_namespace, describe_wmi_error, query_rows, read_property};
use crate::wmi_variant::OwnedVariant;

pub const MONITOR_NAMESPACE: &str = "root\\WMI";
const BRIGHTNESS_METHODS_CLASS: &str = "WmiMonitorBrightnessMethods";
const SET_BRIGHTNESS_METHOD: &str = "WmiSetBrightness";
const SET_BRIGHTNESS_TIMEOUT_SECONDS: i32 = 1;

pub struct MonitorIdentityRow {
    pub instance_name: Option<String>,
    pub manufacturer: String,
    pub product_code: String,
    pub serial: String,
}

#[derive(Default)]
pub struct BrightnessSession {
    services: Option<IWbemServices>,
}

fn text_from_code_units(units: Vec<i32>) -> String {
    let nonzero: Vec<u16> = units.into_iter().filter(|unit| *unit != 0).map(|unit| unit as u16).collect();
    String::from_utf16_lossy(&nonzero)
}

fn identity_from_row(row: &IWbemClassObject) -> Result<MonitorIdentityRow, String> {
    Ok(MonitorIdentityRow {
        instance_name: read_property(row, "InstanceName")?.to_text(),
        manufacturer: text_from_code_units(read_property(row, "ManufacturerName")?.to_i32_elements()),
        product_code: text_from_code_units(read_property(row, "ProductCodeID")?.to_i32_elements()),
        serial: text_from_code_units(read_property(row, "SerialNumberID")?.to_i32_elements()),
    })
}

fn put_parameter(parameters: &IWbemClassObject, name: &str, value: &OwnedVariant) -> Result<(), String> {
    unsafe { parameters.Put(&HSTRING::from(name), 0, value.as_ptr(), 0) }
        .map_err(|error| describe_wmi_error(&format!("could not set the {name} parameter"), &error))
}

fn brightness_methods_class(services: &IWbemServices) -> Result<IWbemClassObject, String> {
    let mut class = None;
    unsafe {
        services.GetObject(
            &BSTR::from(BRIGHTNESS_METHODS_CLASS),
            WBEM_GENERIC_FLAG_TYPE(0),
            None::<&IWbemContext>,
            Some(&mut class),
            None,
        )
    }
    .map_err(|error| describe_wmi_error("could not load WmiMonitorBrightnessMethods", &error))?;
    class.ok_or_else(|| "WMI returned no WmiMonitorBrightnessMethods class".to_string())
}

fn set_brightness_parameters(services: &IWbemServices, percent: u8) -> Result<IWbemClassObject, String> {
    let class = brightness_methods_class(services)?;
    let mut signature = None;
    unsafe { class.GetMethod(&HSTRING::from(SET_BRIGHTNESS_METHOD), 0, &mut signature, std::ptr::null_mut()) }
        .map_err(|error| describe_wmi_error("could not read the WmiSetBrightness signature", &error))?;
    let signature = signature.ok_or("WMI returned no WmiSetBrightness signature")?;
    let parameters = unsafe { signature.SpawnInstance(0) }
        .map_err(|error| describe_wmi_error("could not create the WmiSetBrightness parameters", &error))?;
    put_parameter(&parameters, "Timeout", &OwnedVariant::from_i32(SET_BRIGHTNESS_TIMEOUT_SECONDS))?;
    put_parameter(&parameters, "Brightness", &OwnedVariant::from_u8(percent))?;
    Ok(parameters)
}

fn instance_paths(services: &IWbemServices) -> Result<Vec<String>, String> {
    query_rows(services, "SELECT __PATH FROM WmiMonitorBrightnessMethods")?
        .iter()
        .map(|row| {
            read_property(row, "__PATH")?
                .to_text()
                .ok_or_else(|| "a WmiMonitorBrightnessMethods instance has no path".to_string())
        })
        .collect()
}

fn set_brightness_on_every_panel(services: &IWbemServices, percent: u8) -> Result<bool, String> {
    let paths = instance_paths(services)?;
    if paths.is_empty() {
        return Ok(false);
    }
    let parameters = set_brightness_parameters(services, percent)?;
    let method = BSTR::from(SET_BRIGHTNESS_METHOD);
    for path in paths {
        unsafe {
            services.ExecMethod(
                &BSTR::from(path.as_str()),
                &method,
                WBEM_GENERIC_FLAG_TYPE(0),
                None::<&IWbemContext>,
                &parameters,
                None,
                None,
            )
        }
        .map_err(|error| describe_wmi_error(&format!("WmiSetBrightness failed on {path}"), &error))?;
    }
    Ok(true)
}

fn first_current_brightness(services: &IWbemServices) -> Result<Option<u32>, String> {
    let rows = query_rows(services, "SELECT CurrentBrightness FROM WmiMonitorBrightness")?;
    match rows.first() {
        Some(row) => Ok(read_property(row, "CurrentBrightness")?.to_i32().map(|value| value as u32)),
        None => Ok(None),
    }
}

fn video_output_technologies(services: &IWbemServices) -> Result<Vec<u32>, String> {
    let mut technologies = Vec::new();
    for row in query_rows(services, "SELECT VideoOutputTechnology FROM WmiMonitorConnectionParams")? {
        if let Some(value) = read_property(&row, "VideoOutputTechnology")?.to_i32() {
            technologies.push(value as u32);
        }
    }
    Ok(technologies)
}

fn monitor_identities(services: &IWbemServices) -> Result<Vec<MonitorIdentityRow>, String> {
    query_rows(
        services,
        "SELECT InstanceName, ManufacturerName, ProductCodeID, SerialNumberID FROM WmiMonitorID",
    )?
    .iter()
    .map(identity_from_row)
    .collect()
}

impl BrightnessSession {
    fn services(&mut self) -> Result<IWbemServices, String> {
        if let Some(services) = &self.services {
            return Ok(services.clone());
        }
        let connected = connect_to_namespace(MONITOR_NAMESPACE)?;
        self.services = Some(connected.clone());
        Ok(connected)
    }

    fn attempt<T>(&mut self, work: &impl Fn(&IWbemServices) -> Result<T, String>) -> Result<T, String> {
        let services = self.services()?;
        work(&services).inspect_err(|_| self.services = None)
    }

    fn with_services<T>(&mut self, work: impl Fn(&IWbemServices) -> Result<T, String>) -> Result<T, String> {
        self.attempt(&work).or_else(|_| self.attempt(&work))
    }

    pub fn read_current_brightness(&mut self) -> Result<Option<u32>, String> {
        self.with_services(first_current_brightness)
    }

    pub fn read_video_output_technologies(&mut self) -> Result<Vec<u32>, String> {
        self.with_services(video_output_technologies)
    }

    pub fn read_monitor_identities(&mut self) -> Result<Vec<MonitorIdentityRow>, String> {
        self.with_services(monitor_identities)
    }

    pub fn set_brightness(&mut self, percent: u8) -> Result<bool, String> {
        self.with_services(|services| set_brightness_on_every_panel(services, percent))
    }
}
