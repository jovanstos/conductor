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

// ─────────────────────────────────────────────
// Injected instruction block appended to system
// prompts when a workspace is active
// ─────────────────────────────────────────────

pub const FILE_OUTPUT_INSTRUCTIONS: &str = r#"

## File output instructions

When you produce code or files, wrap each file in a fenced code block with the relative file path as a comment on the **first line inside** the block:

```python
# main.py
[full file content here]
```

```typescript
// src/components/App.tsx
[full file content here]
```

```html
<!-- index.html -->
[full file content here]
```

Rules:
- Always output **complete** files — never partial files, never diffs, never "add this line" instructions.
- If modifying an existing file, output the entire updated file.
- The system reads your code blocks and writes them to disk automatically — you do not need to describe the writes.
- Use relative paths from the project root (e.g. `src/main.py`, not `/home/user/project/src/main.py`)."#;

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

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

fn is_binary(path: &Path) -> bool {
    let Ok(mut f) = std::fs::File::open(path) else { return false };
    let mut buf = [0u8; 512];
    use std::io::Read;
    let n = f.read(&mut buf).unwrap_or(0);
    buf[..n].contains(&0u8)
}

// ─────────────────────────────────────────────
// File block parsing — extracts files from LLM output
// ─────────────────────────────────────────────

fn try_extract_path(line: &str) -> Option<String> {
    let line = line.trim();
    // Try common comment styles
    let candidate = if let Some(s) = line.strip_prefix("// ") {
        s.trim()
    } else if let Some(s) = line.strip_prefix("# ") {
        s.trim()
    } else if let Some(s) = line.strip_prefix("-- ") {
        s.trim()
    } else if line.starts_with("<!-- ") && line.ends_with(" -->") {
        line[5..line.len() - 4].trim()
    } else if line.starts_with("/* ") && line.ends_with(" */") {
        line[3..line.len() - 3].trim()
    } else {
        // bare path (no comment wrapper)
        line
    };

    if is_valid_file_path(candidate) {
        Some(candidate.to_string())
    } else {
        None
    }
}

fn is_valid_file_path(s: &str) -> bool {
    if s.is_empty() || s.len() > 260 { return false; }
    // Must not contain spaces and must have an extension
    if s.contains(' ') || s.contains('\t') { return false; }
    // Must not start with / or contain .. to prevent traversal in output
    if s.starts_with('/') || s.starts_with("..") { return false; }
    // Must have a recognisable extension
    if let Some(dot) = s.rfind('.') {
        let ext = &s[dot + 1..].to_lowercase();
        matches!(
            ext.as_str(),
            "py" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs"
                | "rs" | "go" | "java" | "kt" | "swift" | "rb" | "php" | "dart"
                | "cpp" | "c" | "h" | "hpp" | "cc"
                | "css" | "scss" | "less" | "html" | "htm" | "xml" | "svg"
                | "json" | "jsonc" | "toml" | "yaml" | "yml" | "env"
                | "md" | "txt" | "rst" | "tex" | "csv"
                | "sh" | "bash" | "zsh" | "fish" | "ps1" | "bat" | "cmd"
                | "sql" | "graphql" | "proto" | "r" | "jl"
                | "vue" | "svelte" | "astro"
                | "lock" | "conf" | "cfg" | "ini" | "gitignore" | "dockerignore"
                | "dockerfile" | "makefile"
        )
    } else {
        // Allow files without extension only if they look like known config files
        matches!(s.to_lowercase().as_str(), "dockerfile" | "makefile" | "jenkinsfile" | "procfile")
    }
}

/// Parse all fenced code blocks in an LLM response that have a file path comment
/// as their first content line. Returns a list of (path, content) pairs.
pub fn parse_file_blocks(response: &str) -> Vec<FileEntry> {
    let mut results = Vec::new();
    let lines: Vec<&str> = response.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if trimmed.starts_with("```") {
            // Opening fence — skip the language tag
            i += 1;

            // Check if next line is a file path comment
            if i < lines.len() {
                if let Some(file_path) = try_extract_path(lines[i]) {
                    i += 1; // skip the path comment line
                    let content_start = i;

                    // Collect lines until closing fence
                    while i < lines.len() {
                        let l = lines[i].trim_start();
                        if l.starts_with("```") && l.trim() == "```" {
                            break;
                        }
                        // Also catch ``` with trailing whitespace
                        if l.starts_with("```") && l.trim_end_matches('`').trim().is_empty() {
                            break;
                        }
                        i += 1;
                    }

                    let content = lines[content_start..i].join("\n");
                    results.push(FileEntry { path: file_path, content });
                    i += 1; // skip closing fence
                    continue;
                }
            }

            // Not a file block — scan to closing fence
            while i < lines.len() {
                let l = lines[i].trim_start();
                if l.starts_with("```") {
                    i += 1;
                    break;
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    results
}

/// Build the workspace manifest string to inject before the user message.
pub fn build_workspace_manifest(files: &[FileEntry]) -> String {
    let total_chars: usize = files.iter().map(|f| f.content.len()).sum();
    let mut out = String::from("## Current workspace files\n\n");

    if total_chars > 100_000 {
        // Over limit — list names + sizes only
        out.push_str("*(File contents truncated — too large to include in full. File names and sizes:)*\n\n");
        for f in files {
            out.push_str(&format!("- `{}` ({} chars)\n", f.path, f.content.len()));
        }
    } else {
        for f in files {
            out.push_str(&format!("### {}\n```\n{}\n```\n\n---\n\n", f.path, f.content));
        }
    }

    out.push_str("## End of workspace context\n");
    out
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
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let path = entry.path();
        // Skip .git directories
        if path.components().any(|c| c.as_os_str() == ".git") {
            continue;
        }
        if is_binary(path) {
            continue;
        }
        let rel = path
            .strip_prefix(&base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        let content = std::fs::read_to_string(path)
            .unwrap_or_default();
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
pub fn create_run_workspace(
    run_id: String,
    mode: String,
    project_name: Option<String>,
    base_path: Option<String>,
) -> Result<String, String> {
    let workspace = if mode == "existing" {
        // Use an existing project directory as-is — don't create anything new
        let path = base_path.ok_or_else(|| "base_path required for existing mode".to_string())?;
        let p = PathBuf::from(&path);
        if !p.exists() {
            return Err(format!("Project path does not exist: {}", path));
        }
        p
    } else if mode == "project" {
        let base = base_path
            .map(PathBuf::from)
            .unwrap_or_else(default_projects_base);
        let name = project_name.ok_or_else(|| "Project name is required".to_string())?;
        base.join(sanitize_name(&name))
    } else {
        std::env::temp_dir()
            .join("conductor_runs")
            .join(&run_id)
    };

    std::fs::create_dir_all(&workspace)
        .map_err(|e| format!("Create workspace dir: {}", e))?;

    Ok(workspace.to_string_lossy().replace('\\', "/"))
}

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
