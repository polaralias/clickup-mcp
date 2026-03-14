# Tool Reference

This reference is generated from `tool_manifest_clickup.json` and covers all 79 ClickUp tools exposed by the server.

Parameter format notes:
- `required` means the schema marks the field as mandatory.
- `default ...` only appears when the manifest defines a default value.
- Output shape is tool-specific and usually mirrors the underlying ClickUp API response plus server-side normalization.

## Diagnostics

### `health`

Report server readiness and enforced safety limits.

- Parameters:
  - `verbose` | `boolean` | optional

### `ping`

Echo request for connectivity checks.

- Parameters:
  - `message` | `string` | optional

### `tool_catalogue`

Enumerate all available tools with their annotations.

- Parameters:
  - `verbose` | `boolean` | optional

## Workspace And Hierarchy

### `folder_create_in_space`

Create a folder inside a space by spaceId or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | required
  - `description` | `string` | optional
  - `statuses` | `array<object>` | optional

### `folder_delete`

Delete a folder by folderId or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `folderId` | `string` | optional
  - `path` | `array<object | string>` | optional

### `folder_list_for_space`

List folders within a ClickUp space. Use when you already know spaceId.

- Parameters:
  - `spaceId` | `string` | required
  - `forceRefresh` | `boolean` | optional

### `folder_update`

Update folder properties using folderId or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `folderId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | optional
  - `description` | `string` | optional
  - `statuses` | `array<object>` | optional

### `hierarchy_resolve_path`

Resolve workspace/space/folder/list names into IDs. Use before tools that require IDs.

- Parameters:
  - `path` | `array<object | string>` | required
  - `forceRefresh` | `boolean` | optional

### `list_create_for_container`

Create a list in a space or folder by ID or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | optional
  - `folderId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | required
  - `description` | `string` | optional
  - `statuses` | `array<object>` | optional

### `list_create_from_template`

Create a list from a template in a space or folder.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `templateId` | `string` | required
  - `spaceId` | `string` | optional
  - `folderId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | optional
  - `useTemplateOptions` | `boolean` | optional

### `list_custom_field_list`

List custom fields configured for a list by listId.

- Parameters:
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `forceRefresh` | `boolean` | optional

### `list_delete`

Delete a list by listId or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional

### `list_list_for_space_or_folder`

List lists inside a space or folder by ID. If you only know names, resolve them first with resolve_path_to_ids.

- Parameters:
  - `folderId` | `string` | optional
  - `spaceId` | `string` | optional
  - `forceRefresh` | `boolean` | optional

### `list_update`

Update a list by listId or path.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | optional
  - `description` | `string` | optional
  - `statuses` | `array<object>` | optional

### `list_view_create`

Create a view on a list by listId. Supports advanced filtering via 'filters' object.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | required
  - `description` | `string` | optional
  - `viewType` | `string` | optional
  - `statuses` | `array<object>` | optional
  - `tags` | `array<string>` | optional
  - `filters` | `object` | optional

### `reference_link_list`

List public ClickUp API reference links.

- Parameters:
  - `limit` | `integer` | optional | default `50`

### `reference_page_fetch`

Fetch a public ClickUp API reference page from a link returned by reference_link_list.

- Parameters:
  - `url` | `string` | required
  - `maxCharacters` | `integer` | optional

### `space_list_for_workspace`

List spaces for a workspace by workspaceId. Use search when you only know workspace names.

- Parameters:
  - `workspaceId` | `string` | required
  - `forceRefresh` | `boolean` | optional

### `space_tag_create`

Create a space tag by spaceId. Use space_tag_update to rename or recolor existing tags.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | required
  - `name` | `string` | required
  - `foregroundColor` | `string` | optional
  - `backgroundColor` | `string` | optional

### `space_tag_delete`

Delete a space tag from a space. Prefer dryRun first.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | required
  - `name` | `string` | required

### `space_tag_list`

List tags configured for a space using spaceId.

- Parameters:
  - `spaceId` | `string` | required
  - `forceRefresh` | `boolean` | optional

### `space_tag_update`

Update a space tag name or color. Requires spaceId and currentName.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | required
  - `currentName` | `string` | required
  - `name` | `string` | optional
  - `foregroundColor` | `string` | optional
  - `backgroundColor` | `string` | optional

### `space_view_create`

Create a view at space level by spaceId. Supports advanced filtering via 'filters' object.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `spaceId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `name` | `string` | required
  - `description` | `string` | optional
  - `viewType` | `string` | optional
  - `statuses` | `array<object>` | optional
  - `tags` | `array<string>` | optional
  - `filters` | `object` | optional

### `view_delete`

Delete a view by viewId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `viewId` | `string` | required

### `view_update`

Update a view by viewId. Supports advanced filtering via 'filters' object.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `viewId` | `string` | required
  - `name` | `string` | optional
  - `description` | `string` | optional
  - `viewType` | `string` | optional
  - `statuses` | `array<object>` | optional
  - `tags` | `array<string>` | optional
  - `filters` | `object` | optional
  - `filters_remove` | `boolean` | optional

### `workspace_capability_snapshot`

Expose cached ClickUp capability probes for this session.

- Parameters:
  - `forceRefresh` | `boolean` | optional

### `workspace_hierarchy`

Fetch nested hierarchy (spaces, folders, lists) for one or more workspaces. Use this to browse structure without task data.

- Parameters:
  - `workspaceIds` | `array<string>` | optional
  - `workspaceNames` | `array<string>` | optional
  - `workspaces` | `array<object>` | optional
  - `maxDepth` | `integer` | optional
  - `maxWorkspaces` | `integer` | optional
  - `maxSpacesPerWorkspace` | `integer` | optional
  - `maxFoldersPerSpace` | `integer` | optional
  - `maxListsPerSpace` | `integer` | optional
  - `maxListsPerFolder` | `integer` | optional
  - `concurrency` | `integer` | optional
  - `forceRefresh` | `boolean` | optional

### `workspace_list`

List accessible ClickUp workspaces (teams). Use when you need workspace IDs before exploring spaces.

- Parameters:
  - `forceRefresh` | `boolean` | optional

### `workspace_overview`

Summarise workspace metrics and recent spaces/folders/lists when you have a workspaceId.

- Parameters:
  - `workspaceId` | `string` | required
  - `forceRefresh` | `boolean` | optional

## Members

### `member_list_for_workspace`

List members in a workspace by teamId. Use when you already know the workspaceId.

- Parameters:
  - `teamId` | `string` | optional

### `member_resolve`

Resolve member identifiers (id, email, username) into member records for a workspace.

- Parameters:
  - `identifiers` | `array<string>` | required
  - `teamId` | `string` | optional
  - `limit` | `integer` | optional
  - `refresh` | `boolean` | optional

### `member_search_by_name`

Fuzzy search member names to find member IDs.

- Parameters:
  - `query` | `string` | required
  - `teamId` | `string` | optional
  - `limit` | `integer` | optional
  - `refresh` | `boolean` | optional

## Tasks And Subtasks

### `subtask_create`

Create a subtask in a list linked to parentTaskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `listId` | `string` | required
  - `name` | `string` | required
  - `description` | `string` | optional
  - `assigneeIds` | `array<string>` | optional
  - `priority` | `integer` | optional
  - `dueDate` | `string` | optional
  - `tags` | `array<string>` | optional | default ``
  - `parentTaskId` | `string` | required

### `subtask_create_bulk`

Bulk create subtasks across one or many parents. Provide parentTaskId per entry or via defaults; each subtask is created with the parent field.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `teamId` | `string` | optional
  - `defaults` | `object` | optional
  - `subtasks` | `array<object>` | required

### `task_assignee_resolve`

Translate assignee references into suggested member IDs for tasks.

- Parameters:
  - `identifiers` | `array<string>` | required
  - `teamId` | `string` | optional
  - `limitPerIdentifier` | `integer` | optional
  - `refresh` | `boolean` | optional

### `task_attachment_add`

Attach a file to a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `filename` | `string` | required
  - `dataUri` | `string` | required

### `task_comment_add`

Post a comment on a task by taskId.

- Parameters:
  - `dryRun` | `boolean` | optional
  - `confirm` | `string` | optional
  - `taskId` | `string` | required
  - `comment` | `string` | required

### `task_comment_list`

Retrieve task comments for a taskId.

- Parameters:
  - `taskId` | `string` | optional
  - `taskName` | `string` | optional
  - `context` | `object` | optional
  - `limit` | `integer` | optional | default `10`

### `task_create`

Create a task in a list by listId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `listId` | `string` | required
  - `name` | `string` | required
  - `description` | `string` | optional
  - `assigneeIds` | `array<string>` | optional
  - `priority` | `integer` | optional
  - `dueDate` | `string` | optional
  - `tags` | `array<string>` | optional | default ``

### `task_create_bulk`

Bulk create tasks in lists using listId per task or defaults.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `teamId` | `string` | optional
  - `defaults` | `object` | optional
  - `tasks` | `array<object>` | required

### `task_custom_field_clear_value`

Clear a custom field value on a task by taskId and fieldId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `fieldId` | `string` | required

### `task_custom_field_set_value`

Set a custom field value on a task by taskId and fieldId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `fieldId` | `string` | required
  - `value` | `unknown` | required

### `task_delete`

Delete a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required

### `task_delete_bulk`

Bulk delete tasks by taskIds.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `teamId` | `string` | optional
  - `tasks` | `array<object>` | required

### `task_duplicate`

Duplicate a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `listId` | `string` | optional
  - `includeChecklists` | `boolean` | optional
  - `includeAssignees` | `boolean` | optional

### `task_list_for_list`

List tasks in a list. Tasks linked from other lists are included by default (include_timl=true). Outputs include createdDate derived from ClickUp date_created and hierarchy cues (isSubtask, parentId, hasSubtasks, subtaskCount). Always review hasSubtasks/subtaskCount before asserting there are no subtasks. Results are paginated and may span multiple pages; iterate via the page input to retrieve additional pages. GET /list/{list_id}/task

- Parameters:
  - `taskId` | `string` | optional
  - `taskName` | `string` | optional
  - `context` | `object` | optional
  - `listId` | `string` | optional
  - `limit` | `integer` | optional | default `20`
  - `page` | `integer` | optional | default `0`
  - `includeClosed` | `boolean` | optional | default `false`
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `assigneePreviewLimit` | `integer` | optional | default `5`

### `task_read`

Fetch task details including createdDate/updatedDate fields derived from ClickUp timestamps. Subtask cues (isSubtask, parentId, hasSubtasks, subtaskCount) are included; check them before claiming there are no subtasks. GET /task/{task_id}

- Parameters:
  - `taskId` | `string` | optional
  - `taskName` | `string` | optional
  - `context` | `object` | optional
  - `detailLimit` | `integer` | optional | default `10`

### `task_risk_report`

Summarise overdue and at-risk tasks within a workspace, space, folder or list. Subtasks are included by default; use includeSubtasks to focus on parent tasks and inspect isSubtask/parentId in results to understand hierarchy.

- Parameters:
  - `workspaceId` | `string` | optional
  - `spaceId` | `string` | optional
  - `folderId` | `string` | optional
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `includeClosed` | `boolean` | optional
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `tags` | `array<string>` | optional
  - `assignees` | `array<string>` | optional
  - `statusFilter` | `array<string>` | optional
  - `dueWithinDays` | `integer` | optional
  - `forceRefresh` | `boolean` | optional

### `task_search`

Structured task search with filters. Use when you have listIds/tagIds; returns tasks across lists.

- Parameters:
  - `page` | `integer` | optional | default `0`
  - `pageSize` | `integer` | optional | default `20`
  - `query` | `string` | optional
  - `listIds` | `array<string>` | optional
  - `tagIds` | `array<string>` | optional | default ``
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `status` | `string` | optional
  - `statuses` | `array<string>` | optional

### `task_search_fuzzy`

Fuzzy task search from natural language when you do not have precise filters.

- Parameters:
  - `query` | `string` | required
  - `limit` | `integer` | optional | default `10`

### `task_search_fuzzy_bulk`

Batch fuzzy task searches for multiple natural language prompts.

- Parameters:
  - `queries` | `array<string>` | required
  - `limit` | `integer` | optional | default `5`

### `task_status_report`

Summarise task status and priority for a workspace, space, folder or list without returning full task lists.

- Parameters:
  - `workspaceId` | `string` | optional
  - `spaceId` | `string` | optional
  - `folderId` | `string` | optional
  - `listId` | `string` | optional
  - `path` | `array<object | string>` | optional
  - `includeClosed` | `boolean` | optional
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `tags` | `array<string>` | optional
  - `assignees` | `array<string>` | optional
  - `statusFilter` | `array<string>` | optional
  - `dueWithinDays` | `integer` | optional
  - `forceRefresh` | `boolean` | optional

### `task_tag_add`

Add tags to a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `tags` | `array<string>` | optional | default ``

### `task_tag_add_bulk`

Bulk add tags across multiple tasks by taskIds.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `teamId` | `string` | optional
  - `defaults` | `object` | optional
  - `tasks` | `array<object>` | required

### `task_tag_remove`

Remove tags from a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `tags` | `array<string>` | optional | default ``

### `task_time_entry_list`

Fetch time entries for a taskId, including total duration.

- Parameters:
  - `taskId` | `string` | required
  - `pageSize` | `integer` | optional | default `20`

### `task_timer_start`

Start a timer on a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required

### `task_timer_stop`

Stop the running timer for a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required

### `task_update`

Update a task by taskId or lookup; description updates keep previous content appended.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `name` | `string` | optional
  - `description` | `string` | optional
  - `parentTaskId` | `string` | optional
  - `status` | `string` | optional
  - `priority` | `integer` | optional
  - `dueDate` | `string` | optional
  - `assigneeIds` | `array<string>` | optional
  - `tags` | `array<string>` | optional | default ``

### `task_update_bulk`

Bulk update multiple tasks by taskIds; description updates keep previous content appended.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `teamId` | `string` | optional
  - `defaults` | `object` | optional
  - `tasks` | `array<object>` | required

## Docs

### `doc_create`

Create a document in a folder by folderId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `workspaceId` | `string` | optional
  - `folderId` | `string` | required
  - `name` | `string` | required
  - `content` | `string` | optional

### `doc_list`

List documents within a workspace using filters.

- Parameters:
  - `workspaceId` | `string` | optional
  - `search` | `string` | optional
  - `spaceId` | `string` | optional
  - `folderId` | `string` | optional
  - `page` | `integer` | optional
  - `limit` | `integer` | optional | default `20`
  - `includePreviews` | `boolean` | optional | default `true`
  - `previewPageLimit` | `integer` | optional | default `3`
  - `previewCharLimit` | `integer` | optional

### `doc_page_create`

Create a document page under a docId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `workspaceId` | `string` | optional
  - `docId` | `string` | required
  - `title` | `string` | required
  - `content` | `string` | optional
  - `parentId` | `string` | optional
  - `position` | `integer` | optional

### `doc_page_list`

List page hierarchy for a document by docId.

- Parameters:
  - `workspaceId` | `string` | optional
  - `docId` | `string` | required

### `doc_page_read`

Fetch a single document page by docId and pageId.

- Parameters:
  - `docId` | `string` | required
  - `pageId` | `string` | required

### `doc_page_update`

Update a document page by docId and pageId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `workspaceId` | `string` | optional
  - `docId` | `string` | required
  - `pageId` | `string` | required
  - `title` | `string` | optional
  - `content` | `string` | optional

### `doc_pages_read`

Fetch selected document pages by docId and pageIds.

- Parameters:
  - `workspaceId` | `string` | optional
  - `docId` | `string` | required
  - `pageIds` | `array<string>` | required
  - `previewCharLimit` | `integer` | optional

### `doc_read`

Fetch document metadata and pages for a docId.

- Parameters:
  - `workspaceId` | `string` | optional
  - `docId` | `string` | required
  - `includePages` | `boolean` | optional | default `true`
  - `pageIds` | `array<string>` | optional
  - `pageLimit` | `integer` | optional | default `20`
  - `previewCharLimit` | `integer` | optional

### `doc_search`

Search document content across a workspace. Use doc_page_read for specific pages.

- Parameters:
  - `workspaceId` | `string` | optional
  - `query` | `string` | required
  - `limit` | `integer` | optional | default `10`
  - `expandPages` | `boolean` | optional | default `false`

### `doc_search_bulk`

Batch document searches when you need several queries processed together.

- Parameters:
  - `workspaceId` | `string` | optional
  - `queries` | `array<string>` | required
  - `limit` | `integer` | optional | default `5`
  - `expandPages` | `boolean` | optional | default `false`

## Time Tracking

### `time_entry_create_for_task`

Create a manual time entry for a task by taskId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `taskId` | `string` | required
  - `start` | `string` | required
  - `end` | `string` | optional
  - `durationMs` | `integer` | optional
  - `description` | `string` | optional

### `time_entry_current`

Retrieve the current running timer for the workspace.

- Parameters:
  - `teamId` | `string` | optional

### `time_entry_delete`

Delete a time entry by entryId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `entryId` | `string` | required
  - `teamId` | `string` | optional

### `time_entry_list`

List time entries with filters. Accepts ISO 8601 or epoch boundaries; include taskId when focusing on a single task.

- Parameters:
  - `taskId` | `string` | optional
  - `from` | `string | number` | optional
  - `to` | `string | number` | optional
  - `page` | `integer` | optional | default `0`
  - `pageSize` | `integer` | optional | default `20`

### `time_entry_update`

Update a time entry by entryId.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `entryId` | `string` | required
  - `start` | `string` | optional
  - `end` | `string` | optional
  - `durationMs` | `integer` | optional
  - `description` | `string` | optional
  - `teamId` | `string` | optional

### `time_report_for_container`

Aggregate time for a workspace, space, folder or list using containerId + containerType. Resolve IDs with resolve_path_to_ids, list_workspaces/spaces/folders/lists, and set includeSubtasks to clarify hierarchy handling.

- Parameters:
  - `containerType` | `string` | required
  - `containerId` | `string` | required
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `from` | `string` | optional
  - `to` | `string` | optional

### `time_report_for_context`

Aggregate time for a task, list (including filtered views), space or workspace. Use search_tasks or task_list_for_list to source listId/taskId before calling. Subtask handling is explicit via includeSubtasks.

- Parameters:
  - `confirm` | `string` | optional
  - `dryRun` | `boolean` | optional
  - `workspaceId` | `string` | optional
  - `spaceId` | `string` | optional
  - `listId` | `string` | optional
  - `taskId` | `string` | optional
  - `viewId` | `string` | optional
  - `filterQuery` | `string` | optional
  - `status` | `string` | optional
  - `statuses` | `array<string>` | optional
  - `tagIds` | `array<string>` | optional
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `includeTasksInMultipleLists` | `boolean` | optional | default `true`
  - `from` | `string | number` | optional
  - `to` | `string | number` | optional
  - `entryPageSize` | `integer` | optional | default `100`
  - `entryPageLimit` | `integer` | optional | default `10`
  - `taskSampleSize` | `integer` | optional | default `50`
  - `taskPage` | `integer` | optional | default `0`
  - `guidance` | `string` | optional

### `time_report_for_space_tag`

Aggregate time for a tag within a space using spaceId. Use space_tag_list to pick the tag and includeSubtasks to control hierarchy.

- Parameters:
  - `spaceId` | `string` | required
  - `tag` | `string` | required
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `from` | `string` | optional
  - `to` | `string` | optional

### `time_report_for_tag`

Aggregate logged time for a tag across the workspace. Use space_tag_list to discover tags, and includeSubtasks to control whether child task time is counted.

- Parameters:
  - `teamId` | `string` | optional
  - `tag` | `string` | required
  - `includeSubtasks` | `boolean` | optional | default `true`
  - `from` | `string` | optional
  - `to` | `string` | optional
