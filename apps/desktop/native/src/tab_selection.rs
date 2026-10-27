use crate::browser_windows::BrowserWindow;

pub struct TabRow {
    pub hwnd: i64,
    pub browser: String,
    pub index: u32,
    pub selected: bool,
    pub title: String,
}

pub struct TabReading {
    pub name: Option<String>,
    pub selected: bool,
}

pub enum ActivationResult {
    Activated,
    NoTabs,
    NotFound,
    Failed,
}

impl ActivationResult {
    pub fn label(&self) -> &'static str {
        match self {
            ActivationResult::Activated => "ok",
            ActivationResult::NoTabs => "notabs",
            ActivationResult::NotFound => "notfound",
            ActivationResult::Failed => "error",
        }
    }
}

pub fn rows_for_window(window: &BrowserWindow, readings: Vec<TabReading>) -> Vec<TabRow> {
    readings
        .into_iter()
        .enumerate()
        .filter_map(|(index, reading)| {
            let name = reading.name.filter(|name| !name.is_empty())?;
            Some(TabRow {
                hwnd: window.handle_value(),
                browser: window.browser.clone(),
                index: index as u32,
                selected: reading.selected,
                title: sanitize_tab_title(&name),
            })
        })
        .collect()
}

fn sanitize_tab_title(value: &str) -> String {
    value.replace(['\t', '\r', '\n'], " ")
}

fn name_starts_with(name: &Option<String>, title: &str) -> bool {
    name.as_deref().is_some_and(|name| sanitize_tab_title(name).starts_with(title))
}

pub fn pick_tab_to_activate(names: &[Option<String>], index: i32, title: &str) -> Option<usize> {
    let index_in_range = usize::try_from(index).ok().filter(|position| *position < names.len());
    if let Some(position) = index_in_range.filter(|position| name_starts_with(&names[*position], title)) {
        return Some(position);
    }
    names
        .iter()
        .position(|name| name_starts_with(name, title))
        .or(index_in_range)
}
