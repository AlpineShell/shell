use windows::Win32::System::Variant::{
    VariantClear, VariantGetElementCount, VariantGetInt32Elem, VariantToInt32, VariantToStringAlloc, VARENUM, VARIANT,
    VT_EMPTY, VT_I4, VT_NULL, VT_UI1,
};

use crate::com_strings::take_co_task_string;

pub struct OwnedVariant(VARIANT);

impl OwnedVariant {
    pub fn empty() -> Self {
        OwnedVariant(VARIANT::default())
    }

    fn with_scalar(variant_type: VARENUM, fill: impl FnOnce(&mut VARIANT)) -> Self {
        let mut variant = VARIANT::default();
        unsafe {
            (*variant.Anonymous.Anonymous).vt = variant_type;
        }
        fill(&mut variant);
        OwnedVariant(variant)
    }

    pub fn from_i32(value: i32) -> Self {
        Self::with_scalar(VT_I4, |variant| unsafe { (*variant.Anonymous.Anonymous).Anonymous.lVal = value })
    }

    pub fn from_u8(value: u8) -> Self {
        Self::with_scalar(VT_UI1, |variant| unsafe { (*variant.Anonymous.Anonymous).Anonymous.bVal = value })
    }

    pub fn as_ptr(&self) -> *const VARIANT {
        &self.0
    }

    pub fn as_mut_ptr(&mut self) -> *mut VARIANT {
        &mut self.0
    }

    fn variant_type(&self) -> VARENUM {
        unsafe { self.0.Anonymous.Anonymous.vt }
    }

    fn holds_nothing(&self) -> bool {
        let variant_type = self.variant_type();
        variant_type == VT_EMPTY || variant_type == VT_NULL
    }

    pub fn to_i32(&self) -> Option<i32> {
        if self.holds_nothing() {
            return None;
        }
        unsafe { VariantToInt32(&self.0) }.ok()
    }

    pub fn to_i32_elements(&self) -> Vec<i32> {
        if self.holds_nothing() {
            return Vec::new();
        }
        let count = unsafe { VariantGetElementCount(&self.0) };
        (0..count)
            .filter_map(|index| unsafe { VariantGetInt32Elem(&self.0, index) }.ok())
            .collect()
    }

    pub fn to_text(&self) -> Option<String> {
        if self.holds_nothing() {
            return None;
        }
        let allocated = unsafe { VariantToStringAlloc(&self.0) }.ok()?;
        take_co_task_string(allocated).ok()
    }
}

impl Drop for OwnedVariant {
    fn drop(&mut self) {
        let _ = unsafe { VariantClear(&mut self.0) };
    }
}
