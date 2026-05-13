use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

pub(crate) type KeysMap = HashMap<String, String>;

pub(crate) fn load_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<T, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Read {}: {}", path.display(), e))?;
    serde_json::from_str(&text).map_err(|e| format!("Parse {}: {}", path.display(), e))
}

pub(crate) fn save_json<T: Serialize>(path: &PathBuf, data: &T) -> Result<(), String> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| format!("Mkdir: {}", e))?;
    }
    let text = serde_json::to_string_pretty(data).map_err(|e| format!("Serialize: {}", e))?;
    std::fs::write(path, text).map_err(|e| format!("Write {}: {}", path.display(), e))
}

pub(crate) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub(crate) fn load_keys(path: &PathBuf) -> KeysMap {
    if !path.exists() { return HashMap::new(); }
    load_json(path).unwrap_or_default()
}

pub(crate) fn save_keys(path: &PathBuf, keys: &KeysMap) -> Result<(), String> {
    save_json(path, keys)
}
