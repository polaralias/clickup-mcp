import { describe, it, expect, vi } from "vitest"
import { createTask } from "../CreateTask.js"

describe("createTask", () => {
  it("returns a preview in dryRun mode without calling the API", async () => {
    const client = { createTask: vi.fn() }

    const result = await createTask(
      {
        listId: "list-1",
        name: "Test Task",
        description: "Description",
        assigneeIds: ["user-1"],
        tags: ["urgent"],
        parentTaskId: "parent-1",
        dryRun: true
      },
      client as any
    )

    expect(result.preview).toEqual({
      listId: "list-1",
      name: "Test Task",
      hasDescription: true,
      assigneeCount: 1,
      tagCount: 1,
      parentTaskId: "parent-1"
    })
    expect(client.createTask).not.toHaveBeenCalled()
  })

  it("calls client.createTask with the expected payload", async () => {
    const client = { createTask: vi.fn().mockResolvedValue({ id: "task-123", name: "Test Task" }) }

    const result = await createTask(
      {
        listId: "list-1",
        name: "Test Task",
        description: "Description",
        assigneeIds: ["user-1"],
        tags: ["urgent"],
        parentTaskId: "parent-1",
        priority: 2,
        dueDate: 1700000000000
      },
      client as any
    )

    expect(client.createTask).toHaveBeenCalledWith("list-1", expect.objectContaining({
      name: "Test Task",
      description: "Description",
      assignees: ["user-1"],
      tags: ["urgent"],
      parent: "parent-1",
      priority: 2,
      due_date: 1700000000000
    }))
    expect(result.task).toBeDefined()
  })
})
