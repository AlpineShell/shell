use std::collections::HashMap;
use std::path::Path;

use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

const LONG_PATH_CHARACTERS: usize = 32_768;
const FALLBACK_TRANSLATIONS: [&str; 3] = ["040904b0", "040904e4", "04090000"];

pub struct ProcessIdentity {
    pub name: String,
    pub path: Option<String>,
    pub description: Option<String>,
}

#[derive(Default)]
pub struct ProcessIdentities {
    descriptions_by_path: HashMap<String, Option<String>>,
}

struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

fn wide_to_string(wide: &[u16]) -> String {
    let end = wide.iter().position(|&unit| unit == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..end])
}

fn image_path_of(process_id: u32) -> Option<String> {
    let process = OwnedHandle(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?);
    let mut buffer = vec![0u16; LONG_PATH_CHARACTERS];
    let mut length = buffer.len() as u32;
    unsafe { QueryFullProcessImageNameW(process.0, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length) }
        .ok()?;
    Some(String::from_utf16_lossy(&buffer[..length as usize]))
}

fn executable_name_from_snapshot(process_id: u32) -> Option<String> {
    let snapshot = OwnedHandle(unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.ok()?);
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut found = unsafe { Process32FirstW(snapshot.0, &mut entry) }.is_ok();
    while found {
        if entry.th32ProcessID == process_id {
            return Some(wide_to_string(&entry.szExeFile));
        }
        found = unsafe { Process32NextW(snapshot.0, &mut entry) }.is_ok();
    }
    None
}

fn name_without_extension(file: &str) -> String {
    Path::new(file)
        .file_stem()
        .map_or_else(|| file.to_string(), |stem| stem.to_string_lossy().into_owned())
}

fn read_version_block(path: &str) -> Option<Vec<u8>> {
    let wide_path = HSTRING::from(path);
    let size = unsafe { GetFileVersionInfoSizeW(&wide_path, None) };
    if size == 0 {
        return None;
    }
    let mut block = vec![0u8; size as usize];
    unsafe { GetFileVersionInfoW(&wide_path, None, size, block.as_mut_ptr().cast()) }.ok()?;
    Some(block)
}

fn query_version_value(block: &[u8], sub_block: &str) -> Option<(*const u16, usize)> {
    let wide_sub_block = HSTRING::from(sub_block);
    let mut value: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut length = 0u32;
    let found = unsafe {
        VerQueryValueW(
            block.as_ptr().cast(),
            PCWSTR(wide_sub_block.as_ptr()),
            &mut value,
            &mut length,
        )
    };
    (found.as_bool() && !value.is_null() && length > 0).then_some((value as *const u16, length as usize))
}

fn declared_translations(block: &[u8]) -> Vec<String> {
    let Some((value, length_in_bytes)) = query_version_value(block, "\\VarFileInfo\\Translation") else {
        return Vec::new();
    };
    let words = unsafe { std::slice::from_raw_parts(value, length_in_bytes / 2) };
    words
        .as_chunks::<2>()
        .0
        .iter()
        .map(|[language, code_page]| format!("{language:04x}{code_page:04x}"))
        .collect()
}

fn version_string(block: &[u8], translation: &str, key: &str) -> Option<String> {
    let (value, length_in_characters) = query_version_value(block, &format!("\\StringFileInfo\\{translation}\\{key}"))?;
    let characters = unsafe { std::slice::from_raw_parts(value, length_in_characters) };
    let text = wide_to_string(characters).trim().to_string();
    (!text.is_empty()).then_some(text)
}

fn first_version_string(block: &[u8], translations: &[String], key: &str) -> Option<String> {
    translations
        .iter()
        .map(String::as_str)
        .chain(FALLBACK_TRANSLATIONS)
        .find_map(|translation| version_string(block, translation, key))
}

fn file_description_of(path: &str) -> Option<String> {
    let block = read_version_block(path)?;
    let translations = declared_translations(&block);
    first_version_string(&block, &translations, "FileDescription")
        .or_else(|| first_version_string(&block, &translations, "ProductName"))
}

impl ProcessIdentities {
    fn cached_description(&mut self, path: &str) -> Option<String> {
        self.descriptions_by_path
            .entry(path.to_string())
            .or_insert_with(|| file_description_of(path))
            .clone()
    }

    pub fn identify(&mut self, process_id: u32) -> Option<ProcessIdentity> {
        if let Some(path) = image_path_of(process_id) {
            return Some(ProcessIdentity {
                name: name_without_extension(&path),
                description: self.cached_description(&path),
                path: Some(path),
            });
        }
        let executable = executable_name_from_snapshot(process_id)?;
        Some(ProcessIdentity {
            name: name_without_extension(&executable),
            path: None,
            description: None,
        })
    }
}
