# MCP resource taxonomy for ClickUp

This taxonomy groups tools and resources by ClickUp concepts so LLM agents can pick the right action quickly.

## Naming convention

Tools and resources follow `<entity>_<action>` or `<entity>_<action>_for_<scope>` patterns. Common identifiers are shared across tools:

- `workspaceId`, `spaceId`, `folderId`, `listId`, `taskId`, `docId`, `pageId`
- Time scopes use `from`/`to` ISO 8601 timestamps and `entryId` for individual timers

Legacy `clickup_*` tool names remain registered but are marked as deprecated; prefer the canonical names listed below.

## Categories

### Workspaces
- **Tools**: `workspace_list`, `workspace_overview`, `workspace_hierarchy`, `workspace_capability_snapshot`
- **Typical flow**: list workspaces → fetch hierarchy for a specific workspace

### Spaces
- **Tools**: `space_list_for_workspace`, `space_view_create`
- **Typical flow**: list spaces for a workspace → create a space view when needed

### Folders and lists
- **Tools**: `folder_list_for_space`, `folder_create_in_space`, `folder_update`, `folder_delete`, `list_list_for_space_or_folder`, `list_create_for_container`, `list_update`, `list_delete`, `list_view_create`, `view_update`, `view_delete`, `list_custom_field_list`
- **Typical flow**: resolve names with `hierarchy_resolve_path` → list folders/lists → manage list or view → inspect custom fields

### Tasks and subtasks
- **Discovery**: `task_search`, `task_search_fuzzy`, `task_search_fuzzy_bulk`, `task_status_report`, `task_risk_report`, `task_list_for_list`, `task_read`
- **Modification**: `task_create`, `task_create_bulk`, `subtask_create`, `subtask_create_bulk`, `task_update`, `task_update_bulk`, `task_duplicate`, `task_delete`, `task_delete_bulk`
- **Collaboration**: `task_comment_add`, `task_comment_list`, `task_attachment_add`, `task_tag_add`, `task_tag_add_bulk`, `task_tag_remove`, `task_assignee_resolve`
- **Custom fields**: `task_custom_field_set_value`, `task_custom_field_clear_value`
- **Typical flow**: search tasks → read a task → update/comment/tag → report status or risk for a container

### Members and tags
- **Tools**: `member_list_for_workspace`, `member_search_by_name`, `member_resolve`, `task_assignee_resolve`, `space_tag_list`, `space_tag_create`, `space_tag_update`, `space_tag_delete`
- **Typical flow**: list or search members → resolve assignees → manage space tags for filtering

### Documents
- **Tools**: `doc_list`, `doc_read`, `doc_pages_read`, `doc_page_list`, `doc_page_read`, `doc_page_create`, `doc_page_update`, `doc_search`, `doc_search_bulk`, `doc_create`
- **Typical flow**: list docs → read doc/pages → search content → create/update pages

### Reference content
- **Tools**: `reference_link_list`, `reference_page_fetch`
- **Typical flow**: list proxy-friendly reference links → fetch the selected page for grounding

### Time and activity
- **Tools**: `task_timer_start`, `task_timer_stop`, `time_entry_create_for_task`, `time_entry_update`, `time_entry_delete`, `task_time_entry_list`, `time_entry_current`, `time_entry_list`, `time_report_for_tag`, `time_report_for_container`, `time_report_for_space_tag`
- **Typical flow**: find task → start/stop timer or create manual entry → list entries → run time reports (tag/container/space tag)

## Example chains

- **Find tasks in a list and summarise risk**: `hierarchy_resolve_path` → `task_list_for_list` → `task_risk_report`
- **Browse docs and read a specific page**: `doc_list` → `doc_page_list` → `doc_page_read`
- **Time reporting for a space**: `space_list_for_workspace` → `time_report_for_container` (with `containerId` for the space) → `time_report_for_space_tag` when filtering by tag

## Resource discovery

Registered resources mirror the taxonomy:
- `workspace_hierarchy` (browse workspace structure)
- `task_preview_for_list` (preview initial tasks for a list)
- `doc_preview` (preview docs and doc pages)

Use resources when you want quick, read-only previews; switch to the corresponding tools for parameterised queries or mutations.
