use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub path: String,
    pub last_modified: String,
}

/// A node in the project directory tree. Dirs have children; files have content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    /// Relative path from the project root (forward slashes)
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<DirEntry>,
    /// File text content — `None` for directories or binary files
    pub content: Option<String>,
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

fn platform_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn default_projects_base() -> PathBuf {
    platform_home().join("conductor_projects")
}

fn is_binary(path: &Path) -> bool {
    let Ok(mut f) = std::fs::File::open(path) else { return false };
    let mut buf = [0u8; 512];
    use std::io::Read;
    let n = f.read(&mut buf).unwrap_or(0);
    buf[..n].contains(&0u8)
}

// ─────────────────────────────────────────────
// Internal filesystem helpers (called from main.rs)
// ─────────────────────────────────────────────
pub fn read_manifest_internal(workspace_path: &str) -> Result<Vec<FileEntry>, String> {
    let base = PathBuf::from(workspace_path);
    if !base.exists() {
        return Ok(vec![]);
    }
    let mut files = Vec::new();
    let mut total_chars = 0usize;

    for entry in walkdir::WalkDir::new(&base)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // Stop walkdir from even entering these directories
            !should_skip_dir(&name) && name != ".git"
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let path = entry.path();
        if is_binary(path) {
            continue;
        }
        let rel = path
            .strip_prefix(&base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        let content = std::fs::read_to_string(path).unwrap_or_default();
        total_chars += content.len();
        files.push(FileEntry { path: rel, content });

        if total_chars > 200_000 {
            break; // safety cap on read
        }
    }
    Ok(files)
}

pub fn write_files_internal(workspace_path: &str, files: Vec<FileEntry>) -> Result<Vec<String>, String> {
    let base = PathBuf::from(workspace_path);
    let mut written = Vec::new();

    for entry in files {
        // Sanitize path — prevent traversal
        let rel = PathBuf::from(&entry.path);
        for component in rel.components() {
            use std::path::Component;
            if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
                return Err(format!("Unsafe path rejected: {}", entry.path));
            }
        }

        let dest = base.join(&rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
        }
        std::fs::write(&dest, &entry.content)
            .map_err(|e| format!("write {}: {}", dest.display(), e))?;
        written.push(entry.path);
    }
    Ok(written)
}

// ─────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────

#[tauri::command]
pub fn read_workspace_manifest(workspace_path: String) -> Result<Vec<FileEntry>, String> {
    read_manifest_internal(&workspace_path)
}

#[tauri::command]
pub fn write_workspace_files(workspace_path: String, files: Vec<FileEntry>) -> Result<(), String> {
    write_files_internal(&workspace_path, files)?;
    Ok(())
}

#[tauri::command]
pub fn delete_workspace(workspace_path: String) -> Result<(), String> {
    let path = PathBuf::from(&workspace_path);
    let temp_root = std::env::temp_dir().join("conductor_runs");

    // Safety: only allow deleting inside the temp conductor_runs directory
    if !path.starts_with(&temp_root) {
        return Err(
            "delete_workspace can only remove temporary workspaces inside the OS temp directory"
                .to_string(),
        );
    }

    if path.exists() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| format!("Delete workspace: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn zip_and_save_workspace(workspace_path: String, destination_path: String) -> Result<(), String> {
    use std::io::Read;

    let base = PathBuf::from(&workspace_path);
    let dest_file = std::fs::File::create(&destination_path)
        .map_err(|e| format!("Create zip: {}", e))?;

    let mut zip = zip::ZipWriter::new(dest_file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for entry in walkdir::WalkDir::new(&base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let path = entry.path();
        if path.components().any(|c| c.as_os_str() == ".git") {
            continue;
        }
        let rel = path
            .strip_prefix(&base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        zip.start_file(&rel, options)
            .map_err(|e| format!("Zip start_file: {}", e))?;

        let mut content = Vec::new();
        std::fs::File::open(path)
            .and_then(|mut f| f.read_to_end(&mut content))
            .map_err(|e| format!("Read for zip: {}", e))?;
        zip.write_all(&content)
            .map_err(|e| format!("Zip write: {}", e))?;
    }

    zip.finish().map_err(|e| format!("Zip finish: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn list_projects(base_path: Option<String>) -> Result<Vec<ProjectEntry>, String> {
    let base = base_path
        .map(PathBuf::from)
        .unwrap_or_else(default_projects_base);

    if !base.exists() {
        return Ok(vec![]);
    }

    let mut projects = Vec::new();
    for entry in std::fs::read_dir(&base).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let last_modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .map(|t| {
                    let secs = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    chrono::DateTime::from_timestamp(secs as i64, 0)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_else(|| "unknown".to_string())
                })
                .unwrap_or_else(|_| "unknown".to_string());

            projects.push(ProjectEntry {
                name,
                path: path.to_string_lossy().replace('\\', "/"),
                last_modified,
            });
        }
    }

    // Sort by last_modified descending
    projects.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(projects)
}

#[tauri::command]
pub fn open_project(project_path: String) -> Result<Vec<FileEntry>, String> {
    read_manifest_internal(&project_path)
}

// ─────────────────────────────────────────────
// Directory tree — for the UI file explorer
// ─────────────────────────────────────────────

/// Directories to skip when building the tree (heavy / not relevant to source)
fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "__pycache__" | "target" | "dist" | "build"
            | ".git" | ".svn" | ".hg" | "vendor" | ".next" | ".nuxt"
            | "coverage" | ".turbo" | ".cache" | "out" | ".idea" | ".vscode"
    )
}

fn build_dir_tree(base: &Path, dir: &Path) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();

    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        // Skip hidden entries
        if name.starts_with('.') {
            continue;
        }

        let rel = path
            .strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if path.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            let children = build_dir_tree(base, &path)?;
            entries.push(DirEntry { name, path: rel, is_dir: true, children, content: None });
        } else {
            let content = if is_binary(&path) {
                None
            } else {
                let text = std::fs::read_to_string(&path).unwrap_or_default();
                // Cap individual file at 200KB to stay responsive
                if text.len() > 200_000 {
                    Some(format!("[File too large to preview — {} bytes]", text.len()))
                } else {
                    Some(text)
                }
            };
            entries.push(DirEntry { name, path: rel, is_dir: false, children: vec![], content });
        }
    }

    // Dirs first, then files; alphabetical within each group (case-insensitive)
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub fn open_project_tree(project_path: String) -> Result<Vec<DirEntry>, String> {
    let base = PathBuf::from(&project_path);
    if !base.exists() {
        return Ok(vec![]);
    }
    build_dir_tree(&base, &base)
}
