use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use crate::models::{ToolCall, ToolDef, ToolPermissionConfig};
use crate::llm::safe_truncate;
use crate::AppState;

pub(crate) fn tool_definitions(enabled_names: &[String]) -> Vec<ToolDef> {
    let all: Vec<ToolDef> = vec![
        ToolDef {
            name: "read_file".into(),
            description: "Read the text contents of a file. Supports plain text, PDF (.pdf), Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) — text is extracted automatically. Use this before editing to see current content.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute or relative file path" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "write_file".into(),
            description: "Write content to a file, creating or overwriting it entirely. Prefer edit_file for partial changes.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string", "description": "Complete file content to write" }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDef {
            name: "edit_file".into(),
            description: "Replace an exact string in a file. Token-efficient for partial edits. old_str must match exactly (whitespace included) and must appear exactly once in the file. WARNING: old_str must match EXACTLY, including all indentation, leading/trailing spaces, and newlines. If it fails, use read_file first to copy the exact text.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "old_str": { "type": "string", "description": "Exact string to replace. Must be unique in the file." },
                    "new_str": { "type": "string", "description": "Replacement string" }
                },
                "required": ["path", "old_str", "new_str"]
            }),
        },
        ToolDef {
            name: "list_directory".into(),
            description: "List files and folders in a directory. To list the current root project folder, pass '.' or the absolute path.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Directory path to list. Use '.' for root." } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "search_files".into(),
            description: "Search for text in files under a directory. Returns matching lines with file paths and line numbers.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Root directory to search under" },
                    "pattern": { "type": "string", "description": "Text to search for (case-insensitive)" },
                    "file_glob": { "type": "string", "description": "Optional file extension filter, e.g. '*.rs' or '*.ts'" }
                },
                "required": ["path", "pattern"]
            }),
        },
        ToolDef {
            name: "create_directory".into(),
            description: "Create a directory and all parent directories as needed.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "delete_file".into(),
            description: "Delete a file permanently. User will be asked to confirm.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ToolDef {
            name: "move_file".into(),
            description: "Move or rename a file.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "src": { "type": "string", "description": "Source file path" },
                    "dst": { "type": "string", "description": "Destination file path" }
                },
                "required": ["src", "dst"]
            }),
        },
        ToolDef {
            name: "run_shell_command".into(),
            description: "Execute a shell command. User will be asked to confirm before running.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Shell command to execute" },
                    "working_dir": { "type": "string", "description": "Working directory (optional, defaults to workspace)" }
                },
                "required": ["command"]
            }),
        },
        ToolDef {
            name: "fetch_url".into(),
            description: "Fetch the text content of a URL.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": { "url": { "type": "string" } },
                "required": ["url"]
            }),
        },
    ];
    if enabled_names.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|d| enabled_names.iter().any(|n| n == &d.name))
        .collect()
}

pub(crate) fn resolve_path(path: &str, workspace_path: Option<&str>) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_absolute() {
        p
    } else if let Some(ws) = workspace_path {
        if path == "." || path == "./" || path.is_empty() {
            PathBuf::from(ws)
        } else {
            PathBuf::from(ws).join(p)
        }
    } else {
        p
    }
}

pub(crate) fn platform_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub(crate) fn canonicalize_or_parent(path: &Path) -> std::io::Result<PathBuf> {
    if path.exists() {
        return dunce::canonicalize(path);
    }
    let mut current = path.to_path_buf();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    loop {
        match current.file_name() {
            Some(name) => suffix.push(name.to_os_string()),
            None => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("No existing ancestor found for '{}'", path.display()),
                ))
            }
        }
        current = match current.parent() {
            Some(p) => p.to_path_buf(),
            None => return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Reached filesystem root without finding an existing directory",
            )),
        };
        if current.exists() {
            let mut canonical = dunce::canonicalize(&current)?;
            for component in suffix.into_iter().rev() {
                canonical.push(component);
            }
            return Ok(canonical);
        }
    }
}

pub(crate) fn jail_path(path: &Path, workspace: &str) -> Result<PathBuf, String> {
    let ws_canon = dunce::canonicalize(workspace)
        .map_err(|e| format!("Cannot access workspace '{}': {}", workspace, e))?;

    let path_canon = canonicalize_or_parent(path)
        .map_err(|e| format!("Cannot resolve path '{}': {}", path.display(), e))?;

    if !path_canon.starts_with(&ws_canon) {
        return Err(format!(
            "SECURITY VIOLATION: '{}' is outside the workspace. Access denied.",
            path_canon.display()
        ));
    }
    Ok(path_canon)
}

pub(crate) fn check_denied(path: &Path, permissions: &ToolPermissionConfig) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let home = platform_home();
    for denied in &permissions.denied_paths {
        let expanded = denied.replace('~', &home.to_string_lossy());
        if path_str.starts_with(&expanded) {
            return Err(format!("Access to '{}' is denied by policy", path.display()));
        }
    }
    Ok(())
}

fn extract_xml_tagged_text(xml: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let mut result = String::new();
    let mut remaining = xml;
    while let Some(start) = remaining.find(&open) {
        remaining = &remaining[start + open.len()..];
        if let Some(end) = remaining.find(&close) {
            let fragment = &remaining[..end];
            let decoded = fragment
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&apos;", "'");
            if !decoded.trim().is_empty() {
                result.push_str(decoded.trim());
                result.push(' ');
            }
            remaining = &remaining[end + close.len()..];
        } else {
            break;
        }
    }
    result.trim().to_string()
}

pub(crate) fn extract_docx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid DOCX archive".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "Missing word/document.xml — may not be a valid DOCX".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| format!("Cannot read document.xml: {}", e))?;
    let text = extract_xml_tagged_text(&xml, "w:t");
    if text.is_empty() { Err("No text content found in DOCX".to_string()) } else { Ok(text) }
}

pub(crate) fn extract_pptx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid PPTX archive".to_string())?;
    let mut all_text = String::new();
    let count = zip.len();
    for i in 0..count {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml = String::new();
            entry.read_to_string(&mut xml).ok();
            let slide_text = extract_xml_tagged_text(&xml, "a:t");
            if !slide_text.is_empty() {
                all_text.push_str(&slide_text);
                all_text.push('\n');
            }
        }
    }
    if all_text.is_empty() { Err("No text content found in PPTX".to_string()) } else { Ok(all_text.trim().to_string()) }
}

pub(crate) fn extract_xlsx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "File is not a valid XLSX archive".to_string())?;

    let shared: Vec<String> = if let Ok(mut entry) = zip.by_name("xl/sharedStrings.xml") {
        let mut xml = String::new();
        entry.read_to_string(&mut xml).ok();
        let raw = extract_xml_tagged_text(&xml, "t");
        raw.split_whitespace().map(|s| s.to_string()).collect()
    } else {
        vec![]
    };

    let mut sheet_xml = String::new();
    if let Ok(mut entry) = zip.by_name("xl/worksheets/sheet1.xml") {
        entry.read_to_string(&mut sheet_xml).ok();
    } else {
        return Err("No sheet data found in XLSX".to_string());
    }

    let values = extract_xml_tagged_text(&sheet_xml, "v");
    let inline = extract_xml_tagged_text(&sheet_xml, "is");

    let mut result = String::new();
    if !shared.is_empty() {
        result.push_str("Spreadsheet text content:\n");
        result.push_str(&shared.join("  "));
    } else if !values.is_empty() {
        result.push_str("Spreadsheet values:\n");
        result.push_str(&values);
    }
    if !inline.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&inline);
    }
    if result.is_empty() { Err("No text content found in XLSX".to_string()) } else { Ok(result) }
}

pub(crate) fn extract_text_from_file(path: &Path) -> Result<String, String> {
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "pdf" => pdf_extract::extract_text(path)
            .map_err(|e| format!("PDF extraction failed: {}", e)),
        "docx" | "doc" => extract_docx_text(path),
        "pptx" | "ppt" => extract_pptx_text(path),
        "xlsx" | "xls" => extract_xlsx_text(path),
        _ => std::fs::read_to_string(path)
            .map_err(|e| format!("Cannot read '{}': {}", path.display(), e)),
    }
}

pub(crate) async fn request_tool_confirmation(
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    agent_name: &str,
    tool_call_id: &str,
    tool_name: &str,
    command: &str,
    state: &Arc<AppState>,
) -> Result<bool, String> {
    let (tx, rx) = oneshot::channel::<bool>();
    {
        let runs = state.active_runs.lock().unwrap();
        if let Some(handle) = runs.get(run_id) {
            handle.tool_confirm_senders.lock().unwrap()
                .insert(tool_call_id.to_string(), tx);
        } else {
            return Err("Run no longer active".into());
        }
    }
    let _ = app.emit(
        &format!("conductor://run/{}/tool_confirm_request", run_id),
        serde_json::json!({
            "nodeId": node_id,
            "agentName": agent_name,
            "toolCallId": tool_call_id,
            "toolName": tool_name,
            "command": command,
        }),
    );
    rx.await.map_err(|_| "Confirmation channel closed (run cancelled)".into())
}

pub(crate) async fn execute_tool(
    tc: &ToolCall,
    workspace_path: Option<&str>,
    enabled_tools: &[String],
    permissions: &ToolPermissionConfig,
    app: &AppHandle,
    run_id: &str,
    node_id: &str,
    agent_name: &str,
    state: &Arc<AppState>,
) -> Result<String, String> {
    if !enabled_tools.is_empty() && !enabled_tools.iter().any(|n| n == &tc.name) {
        return Err(format!("Tool '{}' is not enabled for this agent", tc.name));
    }
    let args = &tc.arguments;

    let ws = workspace_path.ok_or_else(|| {
        "No workspace directory is set. Select a workspace before running file tools.".to_string()
    });

    match tc.name.as_str() {
        "read_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let content = extract_text_from_file(&canonical)
                .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
            if content.len() > 200_000 {
                Ok(format!("{}...\n[truncated — file is {} bytes]", safe_truncate(&content, 200_000), content.len()))
            } else {
                Ok(content)
            }
        }

        "write_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let content = args["content"].as_str().ok_or("missing content")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            if let Some(parent) = canonical.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
            }
            std::fs::write(&canonical, content)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Written {} bytes to {}", content.len(), path))
        }

        "edit_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let old_str = args["old_str"].as_str().ok_or("missing old_str")?;
            let new_str = args["new_str"].as_str().ok_or("missing new_str")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let current = std::fs::read_to_string(&canonical)
                .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
            if !current.contains(old_str) {
                let snippet = safe_truncate(&current, 600);
                return Err(format!(
                    "old_str not found in '{}'.\n\nFile content (first 600 chars):\n{}\n\nUse read_file to see the exact content, then retry with a string that matches exactly (including whitespace and newlines).",
                    path, snippet
                ));
            }
            let count = current.matches(old_str).count();
            if count > 1 {
                return Err(format!(
                    "old_str matches {} times in '{}'. Provide a more specific string that appears exactly once.",
                    count, path
                ));
            }
            let updated = current.replacen(old_str, new_str, 1);
            std::fs::write(&canonical, &updated)
                .map_err(|e| format!("Cannot write '{}': {}", path, e))?;
            Ok(format!("Edited {} — replaced {} chars with {} chars", path, old_str.len(), new_str.len()))
        }

        "list_directory" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let mut entries: Vec<String> = std::fs::read_dir(&canonical)
                .map_err(|e| format!("Cannot list '{}': {}", path, e))?
                .filter_map(|e| e.ok())
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if e.path().is_dir() { format!("{}/", name) } else { name }
                })
                .collect();
            entries.sort();
            if entries.is_empty() { Ok("(empty directory)".into()) } else { Ok(entries.join("\n")) }
        }

        "search_files" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let pattern = args["pattern"].as_str().ok_or("missing pattern")?;
            let file_glob = args["file_glob"].as_str().unwrap_or("");
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let pattern_lower = pattern.to_lowercase();
            let mut matches: Vec<String> = vec![];

            for entry in walkdir::WalkDir::new(&canonical)
                .max_depth(20)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
            {
                if matches.len() >= 100 { break; }
                let fname = entry.file_name().to_string_lossy().to_string();
                if !file_glob.is_empty() {
                    let glob = file_glob.trim();
                    let hit = if let Some(ext) = glob.strip_prefix("*.") {
                        fname.ends_with(&format!(".{}", ext))
                    } else if glob.starts_with('*') {
                        fname.ends_with(&glob[1..])
                    } else {
                        fname == glob
                    };
                    if !hit { continue; }
                }
                if entry.metadata().map(|m| m.len()).unwrap_or(0) > 1_000_000 { continue; }
                let content = match std::fs::read_to_string(entry.path()) {
                    Ok(c) => c, Err(_) => continue,
                };
                for (lineno, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(&pattern_lower) {
                        let rel = entry.path().strip_prefix(&canonical)
                            .unwrap_or(entry.path())
                            .to_string_lossy().replace('\\', "/");
                        matches.push(format!("{}:{}: {}", rel, lineno + 1, line.trim()));
                        if matches.len() >= 100 { break; }
                    }
                }
            }

            if matches.is_empty() {
                Ok(format!("No matches found for '{}'", pattern))
            } else {
                let mut result = matches.join("\n");
                if matches.len() == 100 { result.push_str("\n[results capped at 100 matches]"); }
                Ok(result)
            }
        }

        "create_directory" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            std::fs::create_dir_all(&canonical)
                .map_err(|e| format!("Cannot create '{}': {}", path, e))?;
            Ok(format!("Created directory: {}", path))
        }

        "delete_file" => {
            let path = args["path"].as_str().ok_or("missing path")?;
            let raw = resolve_path(path, workspace_path);
            let canonical = jail_path(&raw, ws?)?;
            check_denied(&canonical, permissions)?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, agent_name, &tc.id, "delete_file",
                path, state,
            ).await?;
            if !confirmed { return Err("File deletion rejected by user.".into()); }
            std::fs::remove_file(&canonical)
                .map_err(|e| format!("Cannot delete '{}': {}", path, e))?;
            Ok(format!("Deleted: {}", path))
        }

        "move_file" => {
            let src = args["src"].as_str().ok_or("missing src")?;
            let dst = args["dst"].as_str().ok_or("missing dst")?;
            let src_r = resolve_path(src, workspace_path);
            let dst_r = resolve_path(dst, workspace_path);
            let ws_str = ws?;
            let src_c = jail_path(&src_r, ws_str)?;
            let dst_c = jail_path(&dst_r, ws_str)?;
            check_denied(&src_c, permissions)?;
            check_denied(&dst_c, permissions)?;
            std::fs::rename(&src_c, &dst_c)
                .map_err(|e| format!("Cannot move '{}' to '{}': {}", src, dst, e))?;
            Ok(format!("Moved {} → {}", src, dst))
        }

        "run_shell_command" => {
            let command = args["command"].as_str().ok_or("missing command")?;
            let confirmed = request_tool_confirmation(
                app, run_id, node_id, agent_name, &tc.id, "run_shell_command",
                command, state,
            ).await?;
            if !confirmed { return Err("Shell command rejected by user.".into()); }

            let working_dir = args["working_dir"].as_str()
                .map(|d| resolve_path(d, workspace_path))
                .or_else(|| workspace_path.map(PathBuf::from));

            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = tokio::process::Command::new("cmd");
                c.args(["/C", command]); c
            } else {
                let mut c = tokio::process::Command::new("sh");
                c.args(["-c", command]); c
            };
            if let Some(dir) = &working_dir {
                if dir.exists() { cmd.current_dir(dir); }
            }

            let output = cmd.output().await
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);
            let mut result = format!("Exit code: {}\n", exit_code);
            if !stdout.is_empty() { result.push_str(&format!("stdout:\n{}\n", stdout)); }
            if !stderr.is_empty() { result.push_str(&format!("stderr:\n{}\n", stderr)); }
            if result.len() > 50_000 {
                result.truncate(50_000);
                result.push_str("\n[output truncated at 50KB]");
            }
            Ok(result)
        }

        "fetch_url" => {
            let url = args["url"].as_str().ok_or("missing url")?;
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("HTTP client: {}", e))?;
            let text = client.get(url).send().await
                .map_err(|e| format!("Fetch failed: {}", e))?
                .text().await
                .map_err(|e| format!("Read body: {}", e))?;
            if text.len() > 50_000 {
                Ok(format!("{}...\n[truncated at 50KB]", safe_truncate(&text, 50_000)))
            } else {
                Ok(text)
            }
        }

        name => Err(format!("Unknown tool: {}", name)),
    }
}
