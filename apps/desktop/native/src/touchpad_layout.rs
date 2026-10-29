use windows::Win32::Devices::HumanInterfaceDevice::{
    HidP_GetCaps, HidP_GetUsageValue, HidP_GetUsages, HidP_GetValueCaps, HidP_Input, HIDP_CAPS, HIDP_STATUS_SUCCESS,
    HIDP_VALUE_CAPS, PHIDP_PREPARSED_DATA,
};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::UI::Input::{GetRawInputDeviceInfoW, RIDI_PREPARSEDDATA};

const GENERIC_DESKTOP_PAGE: u16 = 0x01;
const DIGITIZER_PAGE: u16 = 0x0D;
const USAGE_X: u16 = 0x30;
const USAGE_Y: u16 = 0x31;
const USAGE_TIP_SWITCH: u16 = 0x42;
const USAGE_CONTACT_ID: u16 = 0x51;
const USAGE_CONTACT_COUNT: u16 = 0x54;
const MAX_PRESSED_USAGES: usize = 32;

#[derive(Clone, Copy, Default)]
struct AxisRange {
    min: i32,
    max: i32,
}

impl AxisRange {
    fn from_caps(caps: &HIDP_VALUE_CAPS) -> Self {
        let declared_max = if caps.LogicalMax > caps.LogicalMin {
            caps.LogicalMax
        } else {
            ((1i64 << caps.BitSize.min(31)) - 1) as i32
        };
        AxisRange {
            min: caps.LogicalMin,
            max: declared_max,
        }
    }

    fn normalize(&self, raw: u32) -> f64 {
        let span = f64::from(self.max) - f64::from(self.min);
        if span <= 0.0 {
            return 0.0;
        }
        ((f64::from(raw as i32) - f64::from(self.min)) / span).clamp(0.0, 1.0)
    }
}

#[derive(Default)]
struct FingerSlot {
    link_collection: u16,
    x: Option<AxisRange>,
    y: Option<AxisRange>,
}

pub struct ContactReading {
    pub id: u32,
    pub touching: bool,
    pub x: f64,
    pub y: f64,
}

pub struct ReportReading {
    pub contact_count: u32,
    pub contacts: Vec<ContactReading>,
}

pub struct TouchpadLayout {
    preparsed: Vec<u64>,
    contact_count_collection: Option<u16>,
    fingers: Vec<FingerSlot>,
}

fn read_preparsed_data(device: HANDLE) -> Option<Vec<u64>> {
    let mut size = 0u32;
    unsafe { GetRawInputDeviceInfoW(Some(device), RIDI_PREPARSEDDATA, None, &mut size) };
    if size == 0 {
        return None;
    }
    let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
    let written = unsafe {
        GetRawInputDeviceInfoW(Some(device), RIDI_PREPARSEDDATA, Some(buffer.as_mut_ptr().cast()), &mut size)
    };
    if written == u32::MAX || written == 0 {
        return None;
    }
    Some(buffer)
}

fn caps_usage(caps: &HIDP_VALUE_CAPS) -> u16 {
    unsafe {
        if caps.IsRange {
            caps.Anonymous.Range.UsageMin
        } else {
            caps.Anonymous.NotRange.Usage
        }
    }
}

fn finger_slot(fingers: &mut Vec<FingerSlot>, link_collection: u16) -> &mut FingerSlot {
    let index = match fingers.iter().position(|slot| slot.link_collection == link_collection) {
        Some(index) => index,
        None => {
            fingers.push(FingerSlot {
                link_collection,
                ..FingerSlot::default()
            });
            fingers.len() - 1
        }
    };
    &mut fingers[index]
}

impl TouchpadLayout {
    fn preparsed_handle(&self) -> PHIDP_PREPARSED_DATA {
        PHIDP_PREPARSED_DATA(self.preparsed.as_ptr() as isize)
    }

    fn read_value_caps(&self) -> Option<Vec<HIDP_VALUE_CAPS>> {
        let mut caps = HIDP_CAPS::default();
        if unsafe { HidP_GetCaps(self.preparsed_handle(), &mut caps) } != HIDP_STATUS_SUCCESS {
            return None;
        }
        let mut length = caps.NumberInputValueCaps;
        let mut value_caps = vec![HIDP_VALUE_CAPS::default(); usize::from(length)];
        let status = unsafe { HidP_GetValueCaps(HidP_Input, value_caps.as_mut_ptr(), &mut length, self.preparsed_handle()) };
        if status != HIDP_STATUS_SUCCESS {
            return None;
        }
        value_caps.truncate(usize::from(length));
        Some(value_caps)
    }

    fn index_value_caps(&mut self, value_caps: &[HIDP_VALUE_CAPS]) {
        for caps in value_caps {
            match (caps.UsagePage, caps_usage(caps)) {
                (GENERIC_DESKTOP_PAGE, USAGE_X) => finger_slot(&mut self.fingers, caps.LinkCollection).x = Some(AxisRange::from_caps(caps)),
                (GENERIC_DESKTOP_PAGE, USAGE_Y) => finger_slot(&mut self.fingers, caps.LinkCollection).y = Some(AxisRange::from_caps(caps)),
                (DIGITIZER_PAGE, USAGE_CONTACT_COUNT) => self.contact_count_collection = Some(caps.LinkCollection),
                _ => {}
            }
        }
        self.fingers.retain(|slot| slot.x.is_some() && slot.y.is_some());
    }

    pub fn describe(device: HANDLE) -> Option<Self> {
        let mut layout = TouchpadLayout {
            preparsed: read_preparsed_data(device)?,
            contact_count_collection: None,
            fingers: Vec::new(),
        };
        let value_caps = layout.read_value_caps()?;
        layout.index_value_caps(&value_caps);
        if layout.fingers.is_empty() || layout.contact_count_collection.is_none() {
            return None;
        }
        Some(layout)
    }

    fn read_value(&self, page: u16, link_collection: u16, usage: u16, report: &[u8]) -> Option<u32> {
        let mut value = 0u32;
        let status = unsafe {
            HidP_GetUsageValue(HidP_Input, page, Some(link_collection), usage, &mut value, self.preparsed_handle(), report)
        };
        (status == HIDP_STATUS_SUCCESS).then_some(value)
    }

    fn is_tip_pressed(&self, link_collection: u16, report: &mut [u8]) -> bool {
        let mut pressed = [0u16; MAX_PRESSED_USAGES];
        let mut length = MAX_PRESSED_USAGES as u32;
        let status = unsafe {
            HidP_GetUsages(
                HidP_Input,
                DIGITIZER_PAGE,
                Some(link_collection),
                pressed.as_mut_ptr(),
                &mut length,
                self.preparsed_handle(),
                report,
            )
        };
        status == HIDP_STATUS_SUCCESS && pressed[..length as usize].contains(&USAGE_TIP_SWITCH)
    }

    fn read_contact(&self, slot: &FingerSlot, report: &mut [u8]) -> Option<ContactReading> {
        let x_range = slot.x?;
        let y_range = slot.y?;
        let collection = slot.link_collection;
        Some(ContactReading {
            id: self.read_value(DIGITIZER_PAGE, collection, USAGE_CONTACT_ID, report).unwrap_or(u32::from(collection)),
            touching: self.is_tip_pressed(collection, report),
            x: x_range.normalize(self.read_value(GENERIC_DESKTOP_PAGE, collection, USAGE_X, report)?),
            y: y_range.normalize(self.read_value(GENERIC_DESKTOP_PAGE, collection, USAGE_Y, report)?),
        })
    }

    pub fn read_report(&self, report: &[u8]) -> ReportReading {
        let mut writable_report = report.to_vec();
        let contact_count = self
            .contact_count_collection
            .and_then(|collection| self.read_value(DIGITIZER_PAGE, collection, USAGE_CONTACT_COUNT, report))
            .unwrap_or(0);
        let contacts = self
            .fingers
            .iter()
            .filter_map(|slot| self.read_contact(slot, &mut writable_report))
            .collect();
        ReportReading { contact_count, contacts }
    }
}
