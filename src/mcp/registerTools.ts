import { z } from "zod"
import type { ZodRawShape, ZodTypeAny } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApplicationConfig } from "../application/config/applicationConfig.js"
import { ClickUpClient } from "../infrastructure/clickup/ClickUpClient.js"
import { readOnlyAnnotation, destructiveAnnotation } from "./annotations.js"
import { zodToJsonSchemaCompact } from "./zodToJsonSchema.js"
import {
  CreateTaskInput,
  CreateSubtaskInput,
  CreateSubtasksBulkInput,
  UpdateTaskInput,
  DeleteTaskInput,
  DuplicateTaskInput,
  CommentTaskInput,
  AttachFileInput,
  AddTagsInput,
  RemoveTagsInput,
  CreateTasksBulkInput,
  UpdateTasksBulkInput,
  DeleteTasksBulkInput,
  AddTagsBulkInput,
  GetTaskInput,
  ListTasksInListInput,
  GetTaskCommentsInput,
  SearchTasksInput,
  FuzzySearchInput,
  BulkFuzzySearchInput,
  TaskStatusReportInput,
  TaskRiskReportInput,
  CreateDocInput,
  ListDocumentsInput,
  GetDocumentInput,
  GetDocumentPagesInput,
  CreateDocumentPageInput,
  ListDocPagesInput,
  GetDocPageInput,
  UpdateDocPageInput,
  DocSearchInput,
  BulkDocSearchInput,
  StartTimerInput,
  StopTimerInput,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  DeleteTimeEntryInput,
  ListTimeEntriesInput,
  ReportTimeForTagInput,
  ReportTimeForContainerInput,
  ReportTimeForContextInput,
  ReportTimeForSpaceTagInput,
  GetTaskTimeEntriesInput,
  GetCurrentTimeEntryInput,
  ListWorkspacesInput,
  ListSpacesInput,
  ListFoldersInput,
  ListListsInput,
  ListTagsForSpaceInput,
  CreateSpaceTagInput,
  UpdateSpaceTagInput,
  DeleteSpaceTagInput,
  ListMembersInput,
  ResolveMembersInput,
  FindMemberByNameInput,
  ResolveAssigneesInput,
  ResolvePathToIdsInput,
  GetWorkspaceOverviewInput,
  GetWorkspaceHierarchyInput,
  ListReferenceLinksInput,
  FetchReferencePageInput,
  CreateFolderInput,
  UpdateFolderInput,
  DeleteFolderInput,
  CreateListInput,
  CreateListFromTemplateInput,
  UpdateListInput,
  DeleteListInput,
  CreateListViewInput,
  CreateSpaceViewInput,
  UpdateViewInput,
  DeleteViewInput,
  ListCustomFieldsInput,
  SetTaskCustomFieldValueInput,
  ClearTaskCustomFieldValueInput,
  PingInput,
  HealthInput,
  ToolCatalogueInput,
  WorkspaceCapabilitySnapshotInput
} from "./schemas/index.js"
import { withSafetyConfirmation } from "../application/safety/withSafetyConfirmation.js"
import { ensureWriteAllowed } from "../application/safety/writeAccess.js"
import { createTask } from "../application/usecases/tasks/CreateTask.js"
import { updateTask } from "../application/usecases/tasks/UpdateTask.js"
import { deleteTask } from "../application/usecases/tasks/DeleteTask.js"
import { duplicateTask } from "../application/usecases/tasks/DuplicateTask.js"
import { commentTask } from "../application/usecases/tasks/CommentTask.js"
import { attachFileToTask } from "../application/usecases/tasks/AttachFileToTask.js"
import { addTagsToTask } from "../application/usecases/tasks/AddTagsToTask.js"
import { removeTagsFromTask } from "../application/usecases/tasks/RemoveTagsFromTask.js"
import { createTasksBulk } from "../application/usecases/tasks/CreateTasksBulk.js"
import { createSubtasksBulk } from "../application/usecases/tasks/CreateSubtasksBulk.js"
import { updateTasksBulk } from "../application/usecases/tasks/UpdateTasksBulk.js"
import { deleteTasksBulk } from "../application/usecases/tasks/DeleteTasksBulk.js"
import { addTagsBulk } from "../application/usecases/tasks/AddTagsBulk.js"
import { getTask } from "../application/usecases/tasks/GetTask.js"
import { listTasksInList } from "../application/usecases/tasks/ListTasksInList.js"
import { getTaskComments } from "../application/usecases/tasks/GetTaskComments.js"
import { searchTasks } from "../application/usecases/tasks/SearchTasks.js"
import { fuzzySearch } from "../application/usecases/tasks/FuzzySearch.js"
import { bulkFuzzySearch } from "../application/usecases/tasks/BulkFuzzySearch.js"
import { taskStatusReport } from "../application/usecases/tasks/TaskStatusReport.js"
import { taskRiskReport } from "../application/usecases/tasks/TaskRiskReport.js"
import { createDoc } from "../application/usecases/docs/CreateDoc.js"
import { listDocuments } from "../application/usecases/docs/ListDocuments.js"
import { getDocument } from "../application/usecases/docs/GetDocument.js"
import { getDocumentPages } from "../application/usecases/docs/GetDocumentPages.js"
import { listDocPages } from "../application/usecases/docs/ListDocPages.js"
import { getDocPage } from "../application/usecases/docs/GetDocPage.js"
import { updateDocPage } from "../application/usecases/docs/UpdateDocPage.js"
import { docSearch } from "../application/usecases/docs/DocSearch.js"
import { bulkDocSearch } from "../application/usecases/docs/BulkDocSearch.js"
import { createDocumentPage } from "../application/usecases/docs/CreateDocumentPage.js"
import { startTimer } from "../application/usecases/time/StartTimer.js"
import { stopTimer } from "../application/usecases/time/StopTimer.js"
import { createTimeEntry } from "../application/usecases/time/CreateTimeEntry.js"
import { updateTimeEntry } from "../application/usecases/time/UpdateTimeEntry.js"
import { deleteTimeEntry } from "../application/usecases/time/DeleteTimeEntry.js"
import { listTimeEntries } from "../application/usecases/time/ListTimeEntries.js"
import { reportTimeForTag } from "../application/usecases/time/ReportTimeForTag.js"
import { reportTimeForContainer } from "../application/usecases/time/ReportTimeForContainer.js"
import { reportTimeForContext } from "../application/usecases/time/ReportTimeForContext.js"
import { reportTimeForSpaceTag } from "../application/usecases/time/ReportTimeForSpaceTag.js"
import { getTaskTimeEntries } from "../application/usecases/time/GetTaskTimeEntries.js"
import { getCurrentTimeEntry } from "../application/usecases/time/GetCurrentTimeEntry.js"
import { listReferenceLinks } from "../application/usecases/reference/ListReferenceLinks.js"
import { fetchReferencePage } from "../application/usecases/reference/FetchReferencePage.js"
import { listCustomFields } from "../application/usecases/customFields/ListCustomFields.js"
import { setTaskCustomFieldValue } from "../application/usecases/customFields/SetTaskCustomFieldValue.js"
import { clearTaskCustomFieldValue } from "../application/usecases/customFields/ClearTaskCustomFieldValue.js"
import { listWorkspaces } from "../application/usecases/hierarchy/ListWorkspaces.js"
import { listSpaces } from "../application/usecases/hierarchy/ListSpaces.js"
import { listFolders } from "../application/usecases/hierarchy/ListFolders.js"
import { listLists } from "../application/usecases/hierarchy/ListLists.js"
import { listTagsForSpace } from "../application/usecases/hierarchy/ListTagsForSpace.js"
import { createSpaceTag } from "../application/usecases/hierarchy/CreateSpaceTag.js"
import { updateSpaceTag } from "../application/usecases/hierarchy/UpdateSpaceTag.js"
import { deleteSpaceTag } from "../application/usecases/hierarchy/DeleteSpaceTag.js"
import { listMembers } from "../application/usecases/hierarchy/ListMembers.js"
import { resolveMembers } from "../application/usecases/hierarchy/ResolveMembers.js"
import { resolvePathToIds } from "../application/usecases/hierarchy/ResolvePathToIds.js"
import { getWorkspaceOverview } from "../application/usecases/hierarchy/GetWorkspaceOverview.js"
import { getWorkspaceHierarchy } from "../application/usecases/hierarchy/GetWorkspaceHierarchy.js"
import { findMemberByName } from "../application/usecases/members/FindMemberByName.js"
import { resolveAssignees } from "../application/usecases/members/ResolveAssignees.js"
import { HierarchyDirectory } from "../application/services/HierarchyDirectory.js"
import { MemberDirectory } from "../application/services/MemberDirectory.js"
import { TaskCatalogue } from "../application/services/TaskCatalogue.js"
import { SpaceTagCache } from "../application/services/SpaceTagCache.js"
import { CapabilityTracker } from "../application/services/CapabilityTracker.js"
import { SessionCache } from "../application/services/SessionCache.js"
import {
  ensureDocsCapability,
  isDocCapabilityError,
  isDocsCapabilityUnavailableError
} from "../application/services/DocCapability.js"
import { createFolder } from "../application/usecases/hierarchy/CreateFolder.js"
import { updateFolder } from "../application/usecases/hierarchy/UpdateFolder.js"
import { deleteFolder } from "../application/usecases/hierarchy/DeleteFolder.js"
import { createList } from "../application/usecases/hierarchy/CreateList.js"
import { createListFromTemplate } from "../application/usecases/hierarchy/CreateListFromTemplate.js"
import { updateList } from "../application/usecases/hierarchy/UpdateList.js"
import { deleteList } from "../application/usecases/hierarchy/DeleteList.js"
import { createListView } from "../application/usecases/hierarchy/CreateListView.js"
import { createSpaceView } from "../application/usecases/hierarchy/CreateSpaceView.js"
import { updateView } from "../application/usecases/hierarchy/UpdateView.js"
import { deleteView } from "../application/usecases/hierarchy/DeleteView.js"
import { ping } from "../application/usecases/system/Ping.js"
import { health } from "../application/usecases/system/Health.js"
import { toolCatalogue, type ToolCatalogueEntry } from "../application/usecases/system/ToolCatalogue.js"

type ToolHandler = (input: any, client: ClickUpClient, config: ApplicationConfig) => Promise<unknown>

type CatalogueEntryConfig = {
  entry: ToolCatalogueEntry
  requiresDocs?: boolean
}

type RegistrationOptions = {
  schema: z.ZodTypeAny | null
  description: string
  annotations?: Record<string, unknown>
  meta?: Record<string, unknown>
  handler: ToolHandler
  requiresDocs?: boolean
}

function unwrapToZodObject(schema: ZodTypeAny | null) {
  let current: ZodTypeAny | null = schema
  while (current instanceof z.ZodEffects) {
    current = current._def.schema
  }
  return current instanceof z.ZodObject ? current : null
}

function toRawShape(schema: ZodTypeAny | null): ZodRawShape | undefined {
  const obj = unwrapToZodObject(schema)
  return obj ? obj.shape : undefined
}

function formatContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  }
}

export function registerTools(server: McpServer, config: ApplicationConfig, sessionCache: SessionCache) {
  const entries: CatalogueEntryConfig[] = []

  const createClient = () => new ClickUpClient(config.apiKey)
  const sessionHierarchyDirectory = new HierarchyDirectory(
    config.hierarchyCacheTtlMs,
    sessionCache,
    config.teamId
  )
  const sessionTaskCatalogue = new TaskCatalogue()
  const sessionSpaceTagCache = new SpaceTagCache(
    config.spaceConfigCacheTtlMs,
    sessionCache,
    config.teamId
  )
  const sessionCapabilityTracker = new CapabilityTracker()
  const sessionMemberDirectory = new MemberDirectory({ credentialId: config.apiKey })

  const previousOnClose = server.server.onclose
  server.server.onclose = () => {
    sessionMemberDirectory.clear()
    previousOnClose?.()
  }

  function registerClientTool(name: string, options: RegistrationOptions & { _internalMeta?: Record<string, any> }) {
    const jsonSchema = zodToJsonSchemaCompact(options.schema)
    const rawShape = toRawShape(options.schema)
    const entry: ToolCatalogueEntry = {
      name,
      description: options.description,
      annotations: { ...options.annotations, ...options._internalMeta },
      inputSchema: jsonSchema
    }
    entries.push({ entry, requiresDocs: options.requiresDocs })

    const register = (name: string, description: string, meta?: Record<string, unknown>) => {
      server.registerTool(
        name,
        {
          description,
          ...(rawShape ? { inputSchema: rawShape } : {}),
          annotations: options.annotations as any,
          _meta: meta ?? options.meta ?? options._internalMeta
        },
        async (rawInput: unknown) => {
          const client = createClient()
          const parsed = options.schema ? options.schema.parse(rawInput ?? {}) : {}
          const result = await options.handler(parsed, client, config)
          return formatContent(result)
        }
      )
    }

    register(name, options.description, options.meta)
  }

  async function resolveCatalogue(client: ClickUpClient) {
    let docsAvailable = sessionCapabilityTracker.getDocsEndpoint(config.teamId)?.docsAvailable
    if (docsAvailable === undefined) {
      try {
        await ensureDocsCapability(config.teamId, client, sessionCapabilityTracker)
        docsAvailable = true
      } catch (error) {
        if (isDocsCapabilityUnavailableError(error)) {
          docsAvailable = false
        } else {
          docsAvailable = undefined
        }
      }
    }
    return entries
      .filter((entry) => !entry.requiresDocs || docsAvailable !== false)
      .map((entry) => entry.entry)
  }

  // System tools (no client)
  const pingAnnotation = readOnlyAnnotation("system", "echo", { scope: "connectivity", idempotent: true })
  const pingJsonSchema = zodToJsonSchemaCompact(PingInput)
  const pingShape = toRawShape(PingInput)
  entries.push({
    entry: {
      name: "ping",
      description: "Echo request for connectivity checks.",
      annotations: { ...pingAnnotation.annotations, ...pingAnnotation._internalMeta },
      inputSchema: pingJsonSchema
    }
  })
  server.registerTool(
    "ping",
    {
      description: "Echo request for connectivity checks.",
      ...(pingShape ? { inputSchema: pingShape } : {}),
      annotations: pingAnnotation.annotations,
      _meta: pingAnnotation._internalMeta
    },
    async (rawInput: unknown) => {
      const parsed = PingInput.parse(rawInput ?? {})
      return formatContent(await ping(parsed.message))
    }
  )

  const healthAnnotation = readOnlyAnnotation("system", "status", { scope: "server" })
  const healthJsonSchema = zodToJsonSchemaCompact(HealthInput)
  const healthShape = toRawShape(HealthInput)
  entries.push({
    entry: {
      name: "health",
      description: "Report server readiness and enforced safety limits.",
      annotations: { ...healthAnnotation.annotations, ...healthAnnotation._internalMeta },
      inputSchema: healthJsonSchema
    }
  })
  server.registerTool(
    "health",
    {
      description: "Report server readiness and enforced safety limits.",
      ...(healthShape ? { inputSchema: healthShape } : {}),
      annotations: healthAnnotation.annotations,
      _meta: healthAnnotation._internalMeta
    },
    async (rawInput: unknown) => {
      const _parsed = HealthInput.parse(rawInput ?? {})
      // ignoring verbose flag for now as health() doesn't support it yet
      return formatContent(await health(config))
    }
  )

  const catalogueAnnotation = readOnlyAnnotation("system", "tool manifest", { scope: "server" })
  const catalogueJsonSchema = zodToJsonSchemaCompact(ToolCatalogueInput)
  const catalogueShape = toRawShape(ToolCatalogueInput)
  entries.push({
    entry: {
      name: "tool_catalogue",
      description: "Enumerate all available tools with their annotations.",
      annotations: { ...catalogueAnnotation.annotations, ...catalogueAnnotation._internalMeta },
      inputSchema: catalogueJsonSchema
    }
  })
  server.registerTool(
    "tool_catalogue",
    {
      description: "Enumerate all available tools with their annotations.",
      ...(catalogueShape ? { inputSchema: catalogueShape } : {}),
      annotations: catalogueAnnotation.annotations,
      _meta: catalogueAnnotation._internalMeta
    },
    async (rawInput: unknown) => {
      const _parsed = ToolCatalogueInput.parse(rawInput ?? {})
      // ignoring verbose flag for now
      const client = createClient()
      const availableEntries = await resolveCatalogue(client)
      return formatContent(await toolCatalogue(availableEntries))
    }
  )

  const capabilityAnnotation = readOnlyAnnotation("system", "capability cache", { scope: "session" })
  registerClientTool(
    "workspace_capability_snapshot",
    {
      description: "Expose cached ClickUp capability probes for this session.",
      schema: WorkspaceCapabilitySnapshotInput,
      annotations: capabilityAnnotation.annotations,
      handler: async (input) => {
        if (input.forceRefresh) {
          // No direct way to clear capability cache here, but we can rely on next usage to refresh if needed
          // or just return snapshot.
          // For now just return snapshot as this is a read tool.
        }
        return sessionCapabilityTracker.snapshot()
      }
    }
  )

  const registerDestructive = (
    name: string,
    description: string,
    schema: z.ZodTypeAny,
    handler: ToolHandler,
    annotation: ReturnType<typeof destructiveAnnotation>,
    availability?: { requiresDocs?: boolean },
    meta?: Record<string, unknown>
  ) => {
    if (config.writeAccess.mode === "read" || config.authSource === "apikey") {
      return
    }
    const jsonSchema = zodToJsonSchemaCompact(schema)
    const rawShape = toRawShape(schema)
    entries.push({
      entry: {
        name,
        description,
        annotations: { ...annotation.annotations, ...annotation._internalMeta },
        inputSchema: jsonSchema
      },
      requiresDocs: availability?.requiresDocs
    })
    const register = (name: string, descriptionText: string, metaOverrides?: Record<string, unknown>) => {
      server.registerTool(
        name,
        {
          description: descriptionText,
          ...(rawShape ? { inputSchema: rawShape } : {}),
          annotations: annotation.annotations,
          _meta: metaOverrides ?? meta ?? annotation._internalMeta
        },
        withSafetyConfirmation(async (rawInput: unknown) => {
          const client = createClient()
          const parsed = schema.parse(rawInput ?? {})
          await ensureWriteAllowed(parsed as Record<string, unknown>, client, config)
          const result = await handler(parsed, client, config)
          return formatContent(result)
        })
      )
    }

    register(name, description, meta)
  }

  const registerReadOnly = (
    name: string,
    description: string,
    schema: z.ZodTypeAny | null,
    handler: ToolHandler,
    annotation: ReturnType<typeof readOnlyAnnotation>,
    availability?: { requiresDocs?: boolean },
    meta?: Record<string, unknown>
  ) => {
    registerClientTool(name, {
      description,
      schema,
      annotations: annotation.annotations,
      _internalMeta: annotation._internalMeta,
      handler,
      requiresDocs: availability?.requiresDocs,
      meta
    })
  }

  // Hierarchy tools
  registerReadOnly(
    "workspace_list",
    "List accessible ClickUp workspaces (teams). Use when you need workspace IDs before exploring spaces.",
    ListWorkspacesInput,
    async (input = {}, client) =>
      listWorkspaces(client, sessionHierarchyDirectory, { forceRefresh: input?.forceRefresh }),
    readOnlyAnnotation("hierarchy", "workspace list", { scope: "workspace", cache: "session|forceRefresh" })
  )
  registerReadOnly(
    "space_list_for_workspace",
    "List spaces for a workspace by workspaceId. Use search when you only know workspace names.",
    ListSpacesInput,
    (input, client) => listSpaces(input, client, sessionHierarchyDirectory),
    readOnlyAnnotation("hierarchy", "space list", { scope: "workspace", input: "workspaceId", cache: "session" }),
    undefined,
    {
      input_examples: [{ workspaceId: "12345" }]
    }
  )
  registerReadOnly(
    "folder_list_for_space",
    "List folders within a ClickUp space. Use when you already know spaceId.",
    ListFoldersInput,
    (input, client) => listFolders(input, client, sessionHierarchyDirectory),
    readOnlyAnnotation("hierarchy", "folder list", { scope: "space", input: "spaceId", cache: "session" })
  )
  registerReadOnly("list_list_for_space_or_folder", "List lists inside a space or folder by ID. If you only know names, resolve them first with resolve_path_to_ids.", ListListsInput, async (input, client) => {
    if (!input.spaceId && !input.folderId) {
      throw new Error("Provide spaceId or folderId")
    }
    return listLists(input, client, sessionHierarchyDirectory)
  }, readOnlyAnnotation("hierarchy", "list list", { scope: "space|folder", input: "spaceId|folderId", cache: "session" }), undefined, {
    input_examples: [{ spaceId: "23456" }]
  })
  registerReadOnly(
    "workspace_overview",
    "Summarise workspace metrics and recent spaces/folders/lists when you have a workspaceId.",
    GetWorkspaceOverviewInput,
    (input, client) => getWorkspaceOverview(input, client, sessionHierarchyDirectory),
    readOnlyAnnotation("hierarchy", "workspace overview", { scope: "workspace", input: "workspaceId" })
  )
  registerReadOnly(
    "workspace_hierarchy",
    "Fetch nested hierarchy (spaces, folders, lists) for one or more workspaces. Use this to browse structure without task data.",
    GetWorkspaceHierarchyInput,
    (input, client, config) => getWorkspaceHierarchy(input, client, config, sessionHierarchyDirectory),
    readOnlyAnnotation("hierarchy", "workspace tree", { scope: "workspace", input: "workspaceIds|names" }),
    undefined,
    {
      input_examples: [
        {
          workspaceIds: ["12345"],
          maxDepth: 2,
          maxSpacesPerWorkspace: 3
        }
      ]
    }
  )
  registerReadOnly(
    "hierarchy_resolve_path",
    "Resolve workspace/space/folder/list names into IDs. Use before tools that require IDs.",
    ResolvePathToIdsInput,
    (input, client) => resolvePathToIds(input, client, sessionHierarchyDirectory),
    readOnlyAnnotation("hierarchy", "path resolve", { scope: "workspace", input: "names", cache: "session|forceRefresh" }),
    undefined,
    {
      input_examples: [
        {
          path: ["Acme Workspace", "Engineering", "Backlog"]
        }
      ]
    }
  )
  registerReadOnly(
    "member_list_for_workspace",
    "List members in a workspace by teamId. Use when you already know the workspaceId.",
    ListMembersInput,
    (input, client, config) => listMembers(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("member", "member list", { scope: "workspace", input: "teamId?" })
  )
  registerReadOnly(
    "member_resolve",
    "Resolve member identifiers (id, email, username) into member records for a workspace.",
    ResolveMembersInput,
    (input, client, config) => resolveMembers(input, client, config, sessionMemberDirectory),
    readOnlyAnnotation("member", "member resolve", { scope: "workspace", input: "identifiers", cache: "session|forceRefresh" })
  )
  registerReadOnly(
    "member_search_by_name",
    "Fuzzy search member names to find member IDs.",
    FindMemberByNameInput,
    (input, client, config) => findMemberByName(input, client, config, sessionMemberDirectory),
    readOnlyAnnotation("member", "member search", { scope: "workspace", input: "query", cache: "session|refresh" })
  )
  registerReadOnly(
    "task_assignee_resolve",
    "Translate assignee references into suggested member IDs for tasks.",
    ResolveAssigneesInput,
    (input, client, config) => resolveAssignees(input, client, config, sessionMemberDirectory),
    readOnlyAnnotation("member", "assignee resolve", { scope: "workspace", input: "references" })
  )
  registerReadOnly(
    "space_tag_list",
    "List tags configured for a space using spaceId.",
    ListTagsForSpaceInput,
    (input, client) => listTagsForSpace(input, client, sessionSpaceTagCache),
    readOnlyAnnotation("tag", "space tags", { scope: "space", input: "spaceId", cache: "session|forceRefresh" })
  )

  registerDestructive(
    "space_tag_create",
    "Create a space tag by spaceId. Use space_tag_update to rename or recolor existing tags.",
    CreateSpaceTagInput,
    async (input, client) => createSpaceTag(input, client, sessionSpaceTagCache),
    destructiveAnnotation("tag", "create space tag", { scope: "space", input: "spaceId", dry: true })
  )
  registerDestructive(
    "space_tag_update",
    "Update a space tag name or color. Requires spaceId and currentName.",
    UpdateSpaceTagInput,
    async (input, client) => updateSpaceTag(input, client, sessionSpaceTagCache),
    destructiveAnnotation("tag", "update space tag", { scope: "space", input: "spaceId+currentName", dry: true, idempotent: true })
  )
  registerDestructive(
    "space_tag_delete",
    "Delete a space tag from a space. Prefer dryRun first.",
    DeleteSpaceTagInput,
    async (input, client) => deleteSpaceTag(input, client, sessionSpaceTagCache),
    destructiveAnnotation("tag", "delete space tag", { scope: "space", input: "spaceId+tagName", dry: true })
  )

  // Hierarchy management
  registerDestructive(
    "folder_create_in_space",
    "Create a folder inside a space by spaceId or path.",
    CreateFolderInput,
    async (input, client) => createFolder(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "create folder", { scope: "space", input: "spaceId|path", dry: true })
  )
  registerDestructive(
    "folder_update",
    "Update folder properties using folderId or path.",
    UpdateFolderInput,
    async (input, client) => updateFolder(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "update folder", { scope: "space", input: "folderId|path", dry: true, idempotent: true })
  )
  registerDestructive(
    "folder_delete",
    "Delete a folder by folderId or path.",
    DeleteFolderInput,
    async (input, client) => deleteFolder(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "delete folder", { scope: "space", input: "folderId|path", dry: true })
  )
  registerDestructive(
    "list_create_for_container",
    "Create a list in a space or folder by ID or path.",
    CreateListInput,
    async (input, client) => createList(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "create list", { scope: "space|folder", input: "spaceId|folderId|path", dry: true })
  )
  registerDestructive(
    "list_create_from_template",
    "Create a list from a template in a space or folder.",
    CreateListFromTemplateInput,
    async (input, client) => createListFromTemplate(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "create list from template", { scope: "space|folder", input: "templateId", dry: true })
  )
  registerDestructive(
    "list_update",
    "Update a list by listId or path.",
    UpdateListInput,
    async (input, client) => updateList(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "update list", { scope: "space|folder", input: "listId|path", dry: true, idempotent: true })
  )
  registerDestructive(
    "list_delete",
    "Delete a list by listId or path.",
    DeleteListInput,
    async (input, client) => deleteList(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("hierarchy", "delete list", { scope: "space|folder", input: "listId|path", dry: true })
  )
  registerDestructive(
    "list_view_create",
    "Create a view on a list by listId. Supports advanced filtering via 'filters' object.",
    CreateListViewInput,
    async (input, client) => createListView(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("view", "create list view", { scope: "list", input: "listId|path", dry: true })
  )
  registerDestructive(
    "space_view_create",
    "Create a view at space level by spaceId. Supports advanced filtering via 'filters' object.",
    CreateSpaceViewInput,
    async (input, client) => createSpaceView(input, client, sessionHierarchyDirectory),
    destructiveAnnotation("view", "create space view", { scope: "space", input: "spaceId|path", dry: true })
  )
  registerDestructive(
    "view_update",
    "Update a view by viewId. Supports advanced filtering via 'filters' object.",
    UpdateViewInput,
    async (input, client) => updateView(input, client),
    destructiveAnnotation("view", "update view", { scope: "view", input: "viewId", dry: true, idempotent: true })
  )
  registerDestructive(
    "view_delete",
    "Delete a view by viewId.",
    DeleteViewInput,
    async (input, client) => deleteView(input, client),
    destructiveAnnotation("view", "delete view", { scope: "view", input: "viewId", dry: true })
  )

  // Reference
  registerReadOnly(
    "reference_link_list",
    "List public ClickUp API reference links.",
    ListReferenceLinksInput,
    async (input) => listReferenceLinks(input),
    readOnlyAnnotation("reference", "doc link list", { scope: "public", input: "limit" })
  )
  registerReadOnly(
    "reference_page_fetch",
    "Fetch a public ClickUp API reference page from a link returned by reference_link_list.",
    FetchReferencePageInput,
    async (input, _client, config) => fetchReferencePage(input, config),
    readOnlyAnnotation("reference", "doc fetch", { scope: "public", input: "url", limit: "maxCharacters" })
  )

  // Task tools
  registerDestructive(
    "task_create",
    "Create a task in a list by listId.",
    CreateTaskInput,
    async (input, client) => createTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "create task", { scope: "list", input: "listId", dry: true }),
    undefined,
    {
      input_examples: [
        {
          listId: "654321",
          name: "Draft onboarding plan",
          description: "Outline steps for new hires",
          tags: ["people"],
          dryRun: true
        }
      ]
    }
  )
  registerDestructive(
    "subtask_create",
    "Create a subtask in a list linked to parentTaskId.",
    CreateSubtaskInput,
    async (input, client) => createTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "create subtask", { scope: "list", input: "listId+parentTaskId", dry: true }),
    undefined,
    {
      input_examples: [
        { listId: "654321", parentTaskId: "parent-1", name: "Write API docs" },
        { listId: "654321", parentTaskId: "parent-1", name: "Draft schema", dryRun: true }
      ]
    }
  )
  registerDestructive(
    "subtask_create_bulk",
    "Bulk create subtasks across one or many parents. Provide parentTaskId per entry or via defaults; each subtask is created with the parent field.",
    CreateSubtasksBulkInput,
    async (input, client, config) => createSubtasksBulk(input, client, config, sessionTaskCatalogue),
    destructiveAnnotation("task", "bulk create subtasks", { scope: "task", input: "subtasks[]", dry: true }),
    undefined,
    {
      input_examples: [
        {
          defaults: { listId: "123", parentTaskId: "parent-123" },
          subtasks: [
            { name: "Design" },
            { name: "Build", parentTaskId: "parent-override", listId: "456" }
          ]
        }
      ]
    }
  )
  registerDestructive(
    "task_create_bulk",
    "Bulk create tasks in lists using listId per task or defaults.",
    CreateTasksBulkInput,
    async (input, client, config) => createTasksBulk(input, client, config, sessionTaskCatalogue),
    destructiveAnnotation("task", "bulk create", { scope: "list", input: "tasks[]", dry: true })
  )
  registerDestructive(
    "task_update",
    "Update a task by taskId or lookup; description updates keep previous content appended.",
    UpdateTaskInput,
    async (input, client) => updateTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "update task", { scope: "task", input: "taskId", dry: true, idempotent: true }),
    undefined,
    {
      input_examples: [
        {
          taskId: "123456",
          description:
            "Latest summary for the team. Previous description content will remain below this section automatically.",
          confirm: "yes"
        },
        { taskId: "123456", status: "In Progress", priority: 3, confirm: "yes" }
      ]
    }
  )
  registerDestructive(
    "task_update_bulk",
    "Bulk update multiple tasks by taskIds; description updates keep previous content appended.",
    UpdateTasksBulkInput,
    async (input, client, config) => updateTasksBulk(input, client, config, sessionTaskCatalogue),
    destructiveAnnotation("task", "bulk update", { scope: "task", input: "tasks[]", dry: true, idempotent: true }),
    undefined,
    {
      input_examples: [
        {
          defaults: { status: "In Progress" },
          tasks: [
            {
              taskId: "123456",
              description: "Sprint kickoff notes for this week (older description will be preserved underneath)."
            },
            { taskId: "789012", status: "Review" }
          ],
          confirm: "yes"
        }
      ]
    }
  )
  registerDestructive(
    "task_delete",
    "Delete a task by taskId.",
    DeleteTaskInput,
    async (input, client) => deleteTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "delete task", { scope: "task", input: "taskId", dry: true })
  )
  registerDestructive(
    "task_delete_bulk",
    "Bulk delete tasks by taskIds.",
    DeleteTasksBulkInput,
    async (input, client, config) => deleteTasksBulk(input, client, config, sessionTaskCatalogue),
    destructiveAnnotation("task", "bulk delete", { scope: "task", input: "taskIds", dry: true })
  )
  registerDestructive(
    "task_duplicate",
    "Duplicate a task by taskId.",
    DuplicateTaskInput,
    duplicateTask,
    destructiveAnnotation("task", "duplicate task", { scope: "task", input: "taskId", dry: true })
  )
  registerDestructive(
    "task_comment_add",
    "Post a comment on a task by taskId.",
    CommentTaskInput,
    commentTask,
    destructiveAnnotation("task", "comment", { scope: "task", input: "taskId", dry: true }),
    undefined,
    {
      input_examples: [
        { taskId: "123456", comment: "Please review the latest spec", dryRun: true }
      ]
    }
  )
  registerDestructive(
    "task_attachment_add",
    "Attach a file to a task by taskId.",
    AttachFileInput,
    attachFileToTask,
    destructiveAnnotation("task", "attach file", { scope: "task", input: "taskId+file", dry: true })
  )
  registerDestructive(
    "task_tag_add",
    "Add tags to a task by taskId.",
    AddTagsInput,
    async (input, client) => addTagsToTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "add tags", { scope: "task", input: "taskId+tags", dry: true })
  )
  registerDestructive(
    "task_tag_add_bulk",
    "Bulk add tags across multiple tasks by taskIds.",
    AddTagsBulkInput,
    async (input, client, config) => addTagsBulk(input, client, config, sessionTaskCatalogue),
    destructiveAnnotation("task", "bulk add tags", { scope: "task", input: "tasks[]", dry: true })
  )
  registerDestructive(
    "task_tag_remove",
    "Remove tags from a task by taskId.",
    RemoveTagsInput,
    async (input, client) => removeTagsFromTask(input, client, sessionTaskCatalogue),
    destructiveAnnotation("task", "remove tags", { scope: "task", input: "taskId+tags", dry: true })
  )

  registerReadOnly(
    "task_search",
    "Structured task search with filters. Use when you have listIds/tagIds; returns tasks across lists.",
    SearchTasksInput,
    async (input, client, config) => {
      const result = await searchTasks(input, client, config, sessionTaskCatalogue)
      return { tasks: result.results, truncated: result.truncated }
    },
    readOnlyAnnotation("task", "search structured", { scope: "workspace", input: "query+filters" }),
    undefined,
    {
      input_examples: [
        { query: "onboarding checklist", listIds: ["321"], tagIds: ["backend"], pageSize: 10 },
        { statuses: ["In Progress"], tagIds: ["priority", "blocked"], includeTasksInMultipleLists: false }
      ]
    }
  )
  registerReadOnly(
    "task_search_fuzzy",
    "Fuzzy task search from natural language when you do not have precise filters.",
    FuzzySearchInput,
    async (input, client, config) => {
      const result = await fuzzySearch(input, client, config, sessionTaskCatalogue)
      return { tasks: result.results, guidance: result.guidance }
    },
    readOnlyAnnotation("task", "search fuzzy", { scope: "workspace", input: "query" }),
    undefined,
    {
      input_examples: [{ query: "recent hiring tasks", limit: 5 }]
    }
  )
  registerReadOnly(
    "task_search_fuzzy_bulk",
    "Batch fuzzy task searches for multiple natural language prompts.",
    BulkFuzzySearchInput,
    async (input, client, config) => {
      const result = await bulkFuzzySearch(input, client, config, sessionTaskCatalogue)
      return { queries: result }
    },
    readOnlyAnnotation("task", "search fuzzy bulk", { scope: "workspace", input: "queries[]" })
  )

  registerReadOnly(
    "task_status_report",
    "Summarise task status and priority for a workspace, space, folder or list without returning full task lists.",
    TaskStatusReportInput,
    async (input, client, config) =>
      taskStatusReport(input, client, config, sessionHierarchyDirectory, sessionTaskCatalogue),
    readOnlyAnnotation("reporting", "task status report", { scope: "container", weight: "medium" }),
    undefined,
    {
      input_examples: [
        { listId: "12345" },
        { path: ["Workspace A", "Space B", "Folder C"] },
        { path: ["Workspace A", "Space B", "List D"], tags: ["priority"], assignees: ["alex"] }
      ]
    }
  )

  registerReadOnly(
    "task_risk_report",
    "Summarise overdue and at-risk tasks within a workspace, space, folder or list. Subtasks are included by default; use includeSubtasks to focus on parent tasks and inspect isSubtask/parentId in results to understand hierarchy.",
    TaskRiskReportInput,
    async (input, client, config) =>
      taskRiskReport(input, client, config, sessionHierarchyDirectory, sessionTaskCatalogue),
    readOnlyAnnotation("reporting", "task risk report", {
      scope: "container",
      weight: "medium",
      window: `${config.defaultRiskWindowDays}d`
    }),
    undefined,
    {
      input_examples: [
        { listId: "12345" },
        { path: ["Workspace A", "Space B"], includeSubtasks: false },
        { path: ["Workspace A", "Space B", "List D"], dueWithinDays: 7 }
      ]
    }
  )

  registerReadOnly(
    "task_read",
    "Fetch task details including createdDate/updatedDate fields derived from ClickUp timestamps. Subtask cues (isSubtask, parentId, hasSubtasks, subtaskCount) are included; check them before claiming there are no subtasks. GET /task/{task_id}",
    GetTaskInput,
    (input, client, config) => getTask(input, client, config, sessionTaskCatalogue),
    readOnlyAnnotation("task", "task fetch", { scope: "task", input: "taskId|lookup" }),
    undefined,
    {
      input_examples: [
        { taskId: "abc123", detailLimit: 10 },
        {
          taskName: "Prepare release notes",
          context: { tasks: [{ id: "456", name: "Prepare release notes" }] }
        }
      ]
    }
  )
  registerReadOnly(
    "task_list_for_list",
    "List tasks in a list. Tasks linked from other lists are included by default (include_timl=true). Outputs include createdDate derived from ClickUp date_created and hierarchy cues (isSubtask, parentId, hasSubtasks, subtaskCount). Always review hasSubtasks/subtaskCount before asserting there are no subtasks. Results are paginated and may span multiple pages; iterate via the page input to retrieve additional pages. GET /list/{list_id}/task",
    ListTasksInListInput,
    async (input, client, config) => {
      const result = await listTasksInList(input, client, config, sessionTaskCatalogue)
      const rawTasks = (result as any)?.tasks ?? result

      const tasksArray = Array.isArray(rawTasks)
        ? rawTasks
        : rawTasks
          ? [rawTasks]
          : []

      const total = (result as any)?.total ?? tasksArray.length
      const truncated = !!(result as any)?.truncated
      const guidance = (result as any)?.guidance

      return { tasks: tasksArray, total, truncated, guidance }
    },
    readOnlyAnnotation("task", "list tasks", { scope: "list", input: "listId|path" }),
    undefined,
    {
      input_examples: [
        { listId: "12345" },
        { path: ["Workspace", "Space", "List"], includeTasksInMultipleLists: false }
      ]
    }
  )
  registerReadOnly(
    "task_comment_list",
    "Retrieve task comments for a taskId.",
    GetTaskCommentsInput,
    (input, client, config) => getTaskComments(input, client, config, sessionTaskCatalogue),
    readOnlyAnnotation("task", "task comments", { scope: "task", input: "taskId", limit: "limit" })
  )

  registerReadOnly(
    "list_custom_field_list",
    "List custom fields configured for a list by listId.",
    ListCustomFieldsInput,
    (input, client) => listCustomFields(input, client, sessionHierarchyDirectory),
    readOnlyAnnotation("custom-field", "list fields", { scope: "list", input: "listId|path" })
  )

  registerDestructive(
    "task_custom_field_set_value",
    "Set a custom field value on a task by taskId and fieldId.",
    SetTaskCustomFieldValueInput,
    (input, client) => setTaskCustomFieldValue(input, client, sessionTaskCatalogue),
    destructiveAnnotation("custom-field", "set value", { scope: "task", input: "taskId+fieldId", dry: true })
  )

  registerDestructive(
    "task_custom_field_clear_value",
    "Clear a custom field value on a task by taskId and fieldId.",
    ClearTaskCustomFieldValueInput,
    (input, client) => clearTaskCustomFieldValue(input, client, sessionTaskCatalogue),
    destructiveAnnotation("custom-field", "clear value", {
      scope: "task",
      input: "taskId+fieldId",
      dry: true,
      idempotent: true
    })
  )

  // Docs
  registerDestructive(
    "doc_create",
    "Create a document in a folder by folderId.",
    CreateDocInput,
    async (input, client, config) => createDoc(input, client, config, sessionCapabilityTracker),
    destructiveAnnotation("doc", "create doc", { scope: "folder", input: "folderId", dry: true }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_list",
    "List documents within a workspace using filters.",
    ListDocumentsInput,
    (input, client, config) => listDocuments(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("doc", "doc list", { scope: "workspace", input: "filters" }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_read",
    "Fetch document metadata and pages for a docId.",
    GetDocumentInput,
    (input, client, config) => getDocument(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("doc", "doc fetch", { scope: "doc", input: "docId", limit: "previewCharLimit" }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_pages_read",
    "Fetch selected document pages by docId and pageIds.",
    GetDocumentPagesInput,
    (input, client, config) => getDocumentPages(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("doc", "doc pages fetch", { scope: "doc", input: "docId+pageIds", limit: "previewCharLimit" }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_page_list",
    "List page hierarchy for a document by docId.",
    ListDocPagesInput,
    (input, client, config) => listDocPages(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("doc", "doc page list", { scope: "doc", input: "docId" }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_page_read",
    "Fetch a single document page by docId and pageId.",
    GetDocPageInput,
    (input, client, config) => getDocPage(input, client, config, sessionCapabilityTracker),
    readOnlyAnnotation("doc", "doc page fetch", { scope: "doc", input: "docId+pageId" }),
    { requiresDocs: true },
    {
      input_examples: [{ docId: "doc-123", pageId: "page-2" }]
    }
  )
  registerDestructive(
    "doc_page_create",
    "Create a document page under a docId.",
    CreateDocumentPageInput,
    (input, client, config) => createDocumentPage(input, client, config, sessionCapabilityTracker),
    destructiveAnnotation("doc", "create page", { scope: "doc", input: "docId", dry: true }),
    { requiresDocs: true },
    {
      input_examples: [
        {
          docId: "doc-123",
          title: "Retrospective notes",
          content: "Action items to follow up",
          parentId: "page-1",
          position: 0,
          dryRun: true
        }
      ]
    }
  )
  registerDestructive(
    "doc_page_update",
    "Update a document page by docId and pageId.",
    UpdateDocPageInput,
    (input, client, config) => updateDocPage(input, client, config, sessionCapabilityTracker),
    destructiveAnnotation("doc", "update page", { scope: "doc", input: "docId+pageId", dry: true, idempotent: true }),
    { requiresDocs: true }
  )
  registerReadOnly(
    "doc_search",
    "Search document content across a workspace. Use doc_page_read for specific pages.",
    DocSearchInput,
    async (input, client, config) => {
      const result = await docSearch(input, client, config, sessionCapabilityTracker)
      if (isDocCapabilityError(result)) {
        return result
      }
      return { docs: result.docs, expandedPages: result.expandedPages, guidance: result.guidance }
    },
    readOnlyAnnotation("doc", "doc search", { scope: "workspace", input: "query", option: "expandPages" }),
    { requiresDocs: true },
    {
      input_examples: [
        { workspaceId: "12345", query: "Q3 roadmap", limit: 5, expandPages: true }
      ]
    }
  )
  registerReadOnly(
    "doc_search_bulk",
    "Batch document searches when you need several queries processed together.",
    BulkDocSearchInput,
    async (input, client, config) => {
      const result = await bulkDocSearch(input, client, config, sessionCapabilityTracker)
      if (isDocCapabilityError(result)) {
        return result
      }
      return { queries: result }
    },
    readOnlyAnnotation("doc", "doc search bulk", { scope: "workspace", input: "queries[]" }),
    { requiresDocs: true }
  )

  // Time tracking
  registerDestructive(
    "task_timer_start",
    "Start a timer on a task by taskId.",
    StartTimerInput,
    startTimer,
    destructiveAnnotation("time", "start timer", { scope: "task", input: "taskId", dry: true })
  )
  registerDestructive(
    "task_timer_stop",
    "Stop the running timer for a task by taskId.",
    StopTimerInput,
    stopTimer,
    destructiveAnnotation("time", "stop timer", { scope: "task", input: "taskId", dry: true })
  )
  registerDestructive(
    "time_entry_create_for_task",
    "Create a manual time entry for a task by taskId.",
    CreateTimeEntryInput,
    createTimeEntry,
    destructiveAnnotation("time", "create entry", { scope: "task", input: "taskId", dry: true })
  )
  registerDestructive(
    "time_entry_update",
    "Update a time entry by entryId.",
    UpdateTimeEntryInput,
    (input, client, config) => updateTimeEntry(input, client, config),
    destructiveAnnotation("time", "update entry", { scope: "time", input: "entryId", dry: true, idempotent: true })
  )
  registerDestructive(
    "time_entry_delete",
    "Delete a time entry by entryId.",
    DeleteTimeEntryInput,
    (input, client, config) => deleteTimeEntry(input, client, config),
    destructiveAnnotation("time", "delete entry", { scope: "time", input: "entryId", dry: true })
  )

  registerReadOnly(
    "task_time_entry_list",
    "Fetch time entries for a taskId, including total duration.",
    GetTaskTimeEntriesInput,
    async (input, client) => {
      const result = await getTaskTimeEntries(input, client)
      return {
        taskId: result.taskId,
        entryCount: result.entryCount,
        totalDurationMs: result.totalDurationMs,
        entries: result.entries,
        truncated: result.truncated,
        guidance: result.guidance
      }
    },
    readOnlyAnnotation("time", "task entries", { scope: "task", input: "taskId", limit: "pageSize" })
  )

  registerReadOnly(
    "time_entry_current",
    "Retrieve the current running timer for the workspace.",
    GetCurrentTimeEntryInput,
    async (input, client, config) => {
      const result = await getCurrentTimeEntry(input, client, config)
      return {
        teamId: result.teamId,
        active: result.active,
        entry: result.entry,
        guidance: result.guidance
      }
    },
    readOnlyAnnotation("time", "current timer", { scope: "workspace", input: "teamId?" })
  )

  registerReadOnly(
    "time_entry_list",
    "List time entries with filters. Accepts ISO 8601 or epoch boundaries; include taskId when focusing on a single task.",
    ListTimeEntriesInput,
    async (input, client, config) => {
      const result = await listTimeEntries(input, client, config)
      return { entries: result.entries, truncated: result.truncated }
    },
    readOnlyAnnotation("time", "entry list", { scope: "workspace", input: "filters" }),
    undefined,
    {
      input_examples: [
        { from: "2024-05-01T00:00:00Z", to: "2024-05-07T00:00:00Z", pageSize: 10 }
      ]
    }
  )
  registerReadOnly(
    "time_report_for_tag",
    "Aggregate logged time for a tag across the workspace. Use space_tag_list to discover tags, and includeSubtasks to control whether child task time is counted.",
    ReportTimeForTagInput,
    reportTimeForTag,
    readOnlyAnnotation("time", "tag report", { scope: "workspace", input: "tag", window: "from|to" }),
    undefined,
    {
      input_examples: [
        { tag: "billing", includeSubtasks: true, from: "2024-05-01T00:00:00Z", to: "2024-05-07T00:00:00Z" }
      ]
    }
  )
  registerReadOnly(
    "time_report_for_container",
    "Aggregate time for a workspace, space, folder or list using containerId + containerType. Resolve IDs with resolve_path_to_ids, list_workspaces/spaces/folders/lists, and set includeSubtasks to clarify hierarchy handling.",
    ReportTimeForContainerInput,
    reportTimeForContainer,
    readOnlyAnnotation("time", "container report", { scope: "space|folder|list", input: "containerId", window: "from|to" }),
    undefined,
    {
      input_examples: [
        {
          containerType: "list",
          containerId: "list-123",
          includeSubtasks: false,
          from: "2024-04-01T00:00:00Z",
          to: "2024-04-08T00:00:00Z"
        }
      ]
    }
  )
  registerReadOnly(
    "time_report_for_context",
    "Aggregate time for a task, list (including filtered views), space or workspace. Use search_tasks or task_list_for_list to source listId/taskId before calling. Subtask handling is explicit via includeSubtasks.",
    ReportTimeForContextInput,
    reportTimeForContext,
    readOnlyAnnotation("time", "context report", { scope: "task|list|space|workspace", window: "from|to" }),
    undefined,
    {
      input_examples: [
        {
          _example: "Time per task in a list",
          listId: "12345",
          includeSubtasks: true,
          from: "2024-05-01T00:00:00Z",
          to: "2024-05-07T00:00:00Z"
        },
        {
          _example: "Time spent on tasks in this space last week",
          spaceId: "space-1",
          from: "2024-05-01T00:00:00Z",
          to: "2024-05-07T00:00:00Z"
        },
        {
          _example: "Filtered list view",
          listId: "list-123",
          filterQuery: "priority:high",
          statuses: ["active", "in progress"],
          includeSubtasks: false
        }
      ],
      prompt_examples: [
        {
          prompt: "How much time has been spent on tasks in this filtered list?",
          input: {
            listId: "list-123",
            viewId: "view-321",
            filterQuery: "assignee:me status:active",
            includeSubtasks: true
          }
        },
        {
          prompt: "Show time tracked on this task and its subtasks",
          input: { taskId: "task-1", includeSubtasks: true }
        }
      ]
    }
  )
  registerReadOnly(
    "time_report_for_space_tag",
    "Aggregate time for a tag within a space using spaceId. Use space_tag_list to pick the tag and includeSubtasks to control hierarchy.",
    ReportTimeForSpaceTagInput,
    reportTimeForSpaceTag,
    readOnlyAnnotation("time", "space tag report", { scope: "space", input: "spaceId+tag", window: "from|to" }),
    undefined,
    {
      input_examples: [
        { spaceId: "space-1", tag: "expedite", includeSubtasks: true, from: "2024-04-01", to: "2024-04-30" }
      ]
    }
  )
}
