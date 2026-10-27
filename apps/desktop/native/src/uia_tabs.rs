use windows::core::Interface;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Accessibility::{
    CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationCacheRequest, IUIAutomationCondition, IUIAutomationElement,
    IUIAutomationSelectionItemPattern, IUIAutomationTreeWalker, TreeScope_Children, TreeScope_Descendants, UIA_CONTROLTYPE_ID,
    UIA_ControlTypePropertyId, UIA_DocumentControlTypeId, UIA_NamePropertyId, UIA_SelectionItemIsSelectedPropertyId,
    UIA_SelectionItemPatternId, UIA_TabControlTypeId, UIA_TabItemControlTypeId,
};

use crate::com_variant::OwnedVariant;
use crate::tab_selection::{pick_tab_to_activate, ActivationResult, TabReading};

const CONNECTION_TIMEOUT_MS: u32 = 2000;
const TRANSACTION_TIMEOUT_MS: u32 = 5000;
const MAX_ANCESTOR_DEPTH: usize = 24;

pub struct UiaTabReader {
    automation: IUIAutomation,
    tab_strip_condition: IUIAutomationCondition,
    tab_item_condition: IUIAutomationCondition,
    tab_item_cache: IUIAutomationCacheRequest,
    ancestor_cache: IUIAutomationCacheRequest,
    control_view: IUIAutomationTreeWalker,
}

fn control_type_condition(automation: &IUIAutomation, control_type: UIA_CONTROLTYPE_ID) -> windows::core::Result<IUIAutomationCondition> {
    let value = OwnedVariant::int(control_type.0);
    unsafe { automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &value.0) }
}

fn create_bounded_automation() -> windows::core::Result<IUIAutomation> {
    let automation: IUIAutomation2 = unsafe { CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)? };
    unsafe {
        automation.SetConnectionTimeout(CONNECTION_TIMEOUT_MS)?;
        automation.SetTransactionTimeout(TRANSACTION_TIMEOUT_MS)?;
    }
    automation.cast()
}

fn element_array(found: windows::core::Result<windows::Win32::UI::Accessibility::IUIAutomationElementArray>) -> Vec<IUIAutomationElement> {
    let Ok(array) = found else {
        return Vec::new();
    };
    let length = unsafe { array.Length() }.unwrap_or(0);
    (0..length).filter_map(|index| unsafe { array.GetElement(index) }.ok()).collect()
}

fn cached_name(item: &IUIAutomationElement) -> Option<String> {
    unsafe { item.CachedName() }.ok().map(|name| name.to_string())
}

fn cached_selected(item: &IUIAutomationElement) -> bool {
    unsafe { item.GetCachedPropertyValue(UIA_SelectionItemIsSelectedPropertyId) }
        .ok()
        .map(OwnedVariant)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn select_item(item: &IUIAutomationElement) -> ActivationResult {
    let selected = unsafe {
        item.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
            .and_then(|pattern| pattern.Select())
    };
    match selected {
        Ok(()) => ActivationResult::Activated,
        Err(_) => ActivationResult::Failed,
    }
}

impl UiaTabReader {
    pub fn create() -> windows::core::Result<Self> {
        let automation = create_bounded_automation()?;
        let tab_item_cache = unsafe { automation.CreateCacheRequest()? };
        unsafe {
            tab_item_cache.AddProperty(UIA_NamePropertyId)?;
            tab_item_cache.AddProperty(UIA_SelectionItemIsSelectedPropertyId)?;
        }
        let ancestor_cache = unsafe { automation.CreateCacheRequest()? };
        unsafe { ancestor_cache.AddProperty(UIA_ControlTypePropertyId)? };
        Ok(UiaTabReader {
            tab_strip_condition: control_type_condition(&automation, UIA_TabControlTypeId)?,
            tab_item_condition: control_type_condition(&automation, UIA_TabItemControlTypeId)?,
            control_view: unsafe { automation.ControlViewWalker()? },
            tab_item_cache,
            ancestor_cache,
            automation,
        })
    }

    fn is_inside_document(&self, element: &IUIAutomationElement, window: &IUIAutomationElement) -> bool {
        let mut current = element.clone();
        for _ in 0..MAX_ANCESTOR_DEPTH {
            let parent = match unsafe { self.control_view.GetParentElementBuildCache(&current, &self.ancestor_cache) } {
                Ok(parent) => parent,
                Err(error) => return !error.code().is_ok(),
            };
            match unsafe { self.automation.CompareElements(&parent, window) } {
                Ok(same) if same.as_bool() => return false,
                Ok(_) => {}
                Err(_) => return true,
            }
            match unsafe { parent.CachedControlType() } {
                Ok(control_type) if control_type == UIA_DocumentControlTypeId => return true,
                Ok(_) => {}
                Err(_) => return true,
            }
            current = parent;
        }
        true
    }

    fn tab_strip(&self, window: &IUIAutomationElement) -> Option<IUIAutomationElement> {
        let first = unsafe { window.FindFirst(TreeScope_Descendants, &self.tab_strip_condition) }.ok()?;
        if !self.is_inside_document(&first, window) {
            return Some(first);
        }
        element_array(unsafe { window.FindAll(TreeScope_Descendants, &self.tab_strip_condition) })
            .into_iter()
            .find(|candidate| !self.is_inside_document(candidate, window))
    }

    fn tab_items(&self, hwnd: HWND) -> Option<Vec<IUIAutomationElement>> {
        let window = unsafe { self.automation.ElementFromHandle(hwnd) }.ok()?;
        let strip = self.tab_strip(&window)?;
        let items = unsafe { strip.FindAllBuildCache(TreeScope_Children, &self.tab_item_condition, &self.tab_item_cache) };
        items.is_ok().then(|| element_array(items))
    }

    pub fn read_tabs(&self, hwnd: HWND) -> Vec<TabReading> {
        self.tab_items(hwnd)
            .unwrap_or_default()
            .iter()
            .map(|item| TabReading {
                name: cached_name(item),
                selected: cached_selected(item),
            })
            .collect()
    }

    pub fn activate(&self, hwnd: HWND, index: i32, title: &str) -> ActivationResult {
        let items = self.tab_items(hwnd).unwrap_or_default();
        if items.is_empty() {
            return ActivationResult::NoTabs;
        }
        let names: Vec<Option<String>> = items.iter().map(cached_name).collect();
        match pick_tab_to_activate(&names, index, title) {
            Some(position) => select_item(&items[position]),
            None => ActivationResult::NotFound,
        }
    }
}
