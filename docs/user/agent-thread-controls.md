# Agent thread controls

Agents running in T4 Code can use the built-in `t3-code` MCP server to manage
work in the current project. These controls are provided by the server, so they
work when you connect locally or from another device.

Ask the agent to use an existing conversation when you want to continue its
work. It can find conversations with `t3_thread_list`, read their messages and
status with `t3_thread_read`, and send instructions with `t3_thread_send`.
Long conversations support paginated reads.

Sending has four modes:

| Mode      | Behavior                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `auto`    | Starts an idle conversation, steers a running turn, or queues behind a turn that is still starting or waiting. |
| `queue`   | Starts a separate follow-up turn after the active turn finishes.                                               |
| `steer`   | Updates the running turn. A provider may handle the update directly or interrupt and resume the same app turn. |
| `restart` | Explicitly interrupts and restarts the running turn, when the provider supports it.                            |

`t3_thread_interrupt` stops a running turn. `t3_thread_wait` waits for a turn's
result; reaching its timeout leaves the work running. Agents can retain the
returned `runId` to wait for or interrupt a specific turn. Sending the same
request again with the same `clientRequestId` does not create duplicate work,
including retrying a steering message after its turn has finished.

For separate conversations, use `t3_thread_start` or `create_threads`. For
parallel child tasks that report back to the current conversation, use
`delegate_task`. `task_status` reads a child's result and `task_cancel` stops
it. `orchestrator_capabilities` lists available providers and models.

Thread controls stay within the calling conversation's project. Sending to
another conversation also respects the caller's runtime and interaction
permissions. Archived conversations must be reopened before receiving new
messages.
