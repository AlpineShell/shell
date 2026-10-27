use windows::core::Interface;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{
    AccessibleChildren, AccessibleObjectFromWindow, IAccessible, ROLE_SYSTEM_DOCUMENT, ROLE_SYSTEM_PAGETAB, ROLE_SYSTEM_PAGETABLIST,
    SELFLAG_TAKESELECTION,
};
use windows::Win32::UI::WindowsAndMessaging::{CHILDID_SELF, OBJID_CLIENT, STATE_SYSTEM_SELECTED};

use crate::call_deadline::CallDeadline;
use crate::com_variant::OwnedVariant;
use crate::tab_selection::{pick_tab_to_activate, ActivationResult, TabReading};

const MAX_TAB_LIST_DEPTH: usize = 14;
const MAX_CHILDREN: i32 = 512;

fn self_child() -> OwnedVariant {
    OwnedVariant::int(CHILDID_SELF as i32)
}

fn accessible_from_window(hwnd: HWND) -> Option<IAccessible> {
    let mut object = std::ptr::null_mut();
    unsafe { AccessibleObjectFromWindow(hwnd, OBJID_CLIENT.0 as u32, &IAccessible::IID, &mut object) }.ok()?;
    if object.is_null() {
        return None;
    }
    Some(unsafe { IAccessible::from_raw(object) })
}

fn accessible_children(accessible: &IAccessible) -> Vec<IAccessible> {
    let count = unsafe { accessible.accChildCount() }.unwrap_or(0);
    if count <= 0 || count > MAX_CHILDREN {
        return Vec::new();
    }
    let mut raw = vec![Default::default(); count as usize];
    let mut obtained = 0i32;
    if unsafe { AccessibleChildren(accessible, 0, &mut raw, &mut obtained) }.is_err() {
        return Vec::new();
    }
    let children: Vec<OwnedVariant> = raw.into_iter().map(OwnedVariant).collect();
    children
        .iter()
        .take(obtained.max(0) as usize)
        .filter_map(|child| child.as_dispatch()?.cast::<IAccessible>().ok())
        .collect()
}

fn accessible_role(accessible: &IAccessible) -> Option<u32> {
    let role = unsafe { accessible.get_accRole(&self_child().0) }.ok().map(OwnedVariant)?;
    role.as_int().map(|value| value as u32)
}

fn accessible_name(accessible: &IAccessible) -> Option<String> {
    unsafe { accessible.get_accName(&self_child().0) }.ok().map(|name| name.to_string())
}

fn accessible_selected(accessible: &IAccessible) -> bool {
    unsafe { accessible.get_accState(&self_child().0) }
        .ok()
        .map(OwnedVariant)
        .and_then(|state| state.as_int())
        .is_some_and(|state| state as u32 & STATE_SYSTEM_SELECTED != 0)
}

fn find_tab_list(accessible: &IAccessible, depth: usize, deadline: &CallDeadline) -> Option<IAccessible> {
    if deadline.expired() {
        return None;
    }
    let role = accessible_role(accessible);
    if role == Some(ROLE_SYSTEM_PAGETABLIST) {
        return Some(accessible.clone());
    }
    if role == Some(ROLE_SYSTEM_DOCUMENT) || depth > MAX_TAB_LIST_DEPTH {
        return None;
    }
    accessible_children(accessible)
        .iter()
        .find_map(|child| find_tab_list(child, depth + 1, deadline))
}

fn tab_items(hwnd: HWND, deadline: &CallDeadline) -> Vec<IAccessible> {
    let Some(root) = accessible_from_window(hwnd) else {
        return Vec::new();
    };
    let Some(tab_list) = find_tab_list(&root, 0, deadline) else {
        return Vec::new();
    };
    accessible_children(&tab_list)
        .into_iter()
        .filter(|child| accessible_role(child) == Some(ROLE_SYSTEM_PAGETAB))
        .collect()
}

pub fn read_tabs(hwnd: HWND, deadline: &CallDeadline) -> Vec<TabReading> {
    tab_items(hwnd, deadline)
        .iter()
        .map(|item| TabReading {
            name: accessible_name(item),
            selected: accessible_selected(item),
        })
        .collect()
}

fn select_item(item: &IAccessible) -> ActivationResult {
    let child = self_child();
    if unsafe { item.accDoDefaultAction(&child.0) }.is_ok() {
        return ActivationResult::Activated;
    }
    if unsafe { item.accSelect(SELFLAG_TAKESELECTION as i32, &child.0) }.is_ok() {
        return ActivationResult::Activated;
    }
    ActivationResult::Failed
}

pub fn activate(hwnd: HWND, index: i32, title: &str, deadline: &CallDeadline) -> ActivationResult {
    let items = tab_items(hwnd, deadline);
    if items.is_empty() {
        return ActivationResult::NoTabs;
    }
    let names: Vec<Option<String>> = items.iter().map(accessible_name).collect();
    match pick_tab_to_activate(&names, index, title) {
        Some(position) => select_item(&items[position]),
        None => ActivationResult::NotFound,
    }
}
