use std::time::Duration;

use windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties;
use windows::Storage::Streams::{DataReader, IRandomAccessStreamWithContentType, InputStreamOptions};

use crate::winrt_async::join_within;

const THUMBNAIL_WAIT: Duration = Duration::from_secs(3);
const THUMBNAIL_CHUNK_BYTES: u32 = 256 * 1024;
const THUMBNAIL_MAX_BYTES: usize = 16 * 1024 * 1024;

pub struct Thumbnail {
    pub bytes: Vec<u8>,
    pub content_type: Option<String>,
}

fn open_thumbnail_stream(
    properties: &GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<IRandomAccessStreamWithContentType> {
    let reference = properties.Thumbnail().ok()?;
    let opening = reference.OpenReadAsync().ok()?;
    join_within(&opening, THUMBNAIL_WAIT, "opening the media thumbnail").ok()
}

fn content_type_of(stream: &IRandomAccessStreamWithContentType) -> Option<String> {
    let content_type = stream.ContentType().ok()?.to_string();
    (!content_type.is_empty()).then_some(content_type)
}

fn read_all_bytes(stream: &IRandomAccessStreamWithContentType) -> Result<Vec<u8>, String> {
    let reader = DataReader::CreateDataReader(stream)
        .map_err(|error| format!("could not read the media thumbnail: {}", error.message()))?;
    reader
        .SetInputStreamOptions(InputStreamOptions::Partial)
        .map_err(|error| format!("could not read the media thumbnail: {}", error.message()))?;
    let mut bytes = Vec::new();
    loop {
        let loading = reader
            .LoadAsync(THUMBNAIL_CHUNK_BYTES)
            .map_err(|error| format!("could not read the media thumbnail: {}", error.message()))?;
        let loaded = join_within(&loading, THUMBNAIL_WAIT, "reading the media thumbnail")? as usize;
        if loaded == 0 {
            return Ok(bytes);
        }
        if bytes.len() + loaded > THUMBNAIL_MAX_BYTES {
            return Err("the media thumbnail is too large".to_string());
        }
        let start = bytes.len();
        bytes.resize(start + loaded, 0);
        reader
            .ReadBytes(&mut bytes[start..])
            .map_err(|error| format!("could not read the media thumbnail: {}", error.message()))?;
    }
}

pub fn read_thumbnail(properties: &GlobalSystemMediaTransportControlsSessionMediaProperties) -> Option<Thumbnail> {
    let stream = open_thumbnail_stream(properties)?;
    let content_type = content_type_of(&stream);
    let bytes = read_all_bytes(&stream).ok()?;
    let _ = stream.Close();
    (!bytes.is_empty()).then_some(Thumbnail { bytes, content_type })
}
