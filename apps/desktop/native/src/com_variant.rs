use std::mem::ManuallyDrop;

use windows::Win32::System::Com::IDispatch;
use windows::Win32::System::Variant::{VariantClear, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BOOL, VT_DISPATCH, VT_I4};

pub struct OwnedVariant(pub VARIANT);

impl OwnedVariant {
    pub fn int(value: i32) -> Self {
        OwnedVariant(VARIANT {
            Anonymous: VARIANT_0 {
                Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                    vt: VT_I4,
                    wReserved1: 0,
                    wReserved2: 0,
                    wReserved3: 0,
                    Anonymous: VARIANT_0_0_0 { lVal: value },
                }),
            },
        })
    }

    pub fn as_int(&self) -> Option<i32> {
        unsafe {
            let inner = &self.0.Anonymous.Anonymous;
            (inner.vt == VT_I4).then_some(inner.Anonymous.lVal)
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        unsafe {
            let inner = &self.0.Anonymous.Anonymous;
            (inner.vt == VT_BOOL).then(|| inner.Anonymous.boolVal.as_bool())
        }
    }

    pub fn as_dispatch(&self) -> Option<IDispatch> {
        unsafe {
            let inner = &self.0.Anonymous.Anonymous;
            if inner.vt != VT_DISPATCH {
                return None;
            }
            (*inner.Anonymous.pdispVal).clone()
        }
    }
}

impl Drop for OwnedVariant {
    fn drop(&mut self) {
        let _ = unsafe { VariantClear(&mut self.0) };
    }
}
