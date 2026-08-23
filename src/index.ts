/**
 * AgentOrchestra for DeepSeek Harness.
 *
 * A host-plane plugin that registers the `orchestra_*` tools and one usage
 * section into the global system prompt. After installation any session can
 * run multi-agent teamwork through natural language (e.g. "use AgentOrchestra to research X"):
 * the model creates a team (it becomes the captain), spawns members as
 * durable continuable subagents, breaks the goal into tasks with
 * dependencies, wakes members with messages, relays reports, and collects
 * results.
 *
 * Installation (bundle): `dsh plugin --profile <name> add dsh-agent-orchestra`
 * (or a local path). The bundle patch mounts this plugin row into the host
 * composition; the tools register into the shared `tools` registry and the
 * usage section into the global system prompt, so the plugin needs no realm.
 *
 * @module dsh-agent-orchestra
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Declaration merge only: makes ctx.subagents and ctx.systemPrompt visible.
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerAgentOrchestraTools, type ToolsConfig } from './tools.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectArchivedTeamsActivity, collectTeamsActivity } from './snapshot.ts'

/**
 * Structural slice of the web server service, compatible with both the
 * published `dsh-host-webserver@0.0.1-rc.1` (`ctx.httpServer` /
 * `HttpServerService`) and the renamed `webServer` / `WebServer` in later
 * builds: the beta transition renames the service without changing the route
 * registration shape.
 */
interface WebRouteHost {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Web-server service key candidates, newest first. */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const
/** Workspace registry service key candidates, newest first. */
const WORKSPACE_KEYS = ['workspaceRegistry', 'workspace'] as const

export const name = 'agent-orchestra'
export const inject = ['tools', 'subagents', 'systemPrompt', 'agents']

/** Plugin configuration. */
export interface Config {
  /**
   * State directory name under the captain's workspace; team state lives at
   * `<workspace>/<stateDir>/<teamId>/` (default `.agent-orchestra`).
   */
  stateDir?: string
  /** `ctx.subagents` provider used to spawn members; must support continuable children and personas (default `spawn`). */
  memberProvider?: string
  /** Optional model override applied to every member. */
  memberModel?: string
  /** Member delegation depth cap (default `1`; `0` forbids delegation entirely). */
  memberMaxDepth?: number
  /** Team size cap in members (default `8`). */
  maxMembers?: number
  /** Prompt-section order for the usage policy (default `117`, after delegation policy). */
  promptSectionOrder?: number
}

export const Config: z<Config> = z.object({
  stateDir: z.string().default('.agent-orchestra'),
  memberProvider: z.string().default('spawn'),
  memberModel: z.string(),
  memberMaxDepth: z.natural().default(1),
  maxMembers: z.natural().min(1).default(8),
  promptSectionOrder: z.natural().default(117),
})

/** The model-facing usage policy: when and how to drive AgentOrchestra. */
function usageSectionText(toolNames: string): string {
  return `When the user asks to run something with AgentOrchestra (e.g. "use AgentOrchestra to do X"), you are the captain of a multi-agent team. Follow this protocol:
1. Call orchestra_create with a team name and the goal as description. You become the captain and may lead one team at a time.
2. Call orchestra_add_member once per role the goal needs (researcher, engineer, reviewer, ...). Members are durable subagents: they wait for your messages, then work a full turn.
3. Break the goal into tasks with orchestra_create_task; wire dependencies between tasks (a task is claimable only when its dependencies are completed). Assign each task to a member when it fits a role.
4. Dispatch work: claim each assigned task (orchestra_claim_task with assignee) and wake the member with orchestra_send_message naming its task id and instructions. One task per message keeps turns focused.
5. Poll orchestra_status until members are idle; relay member-to-member messages (orchestra_send_message with from=<sender>) and collect completed tasks' outputs. If a member reports a blocker, reassign the task or adjust the plan.
6. Present the team's results to the user, then orchestra_delete the team unless the user wants to keep working with it.

Member dispatch preference (model + mode):
- Members using DeepSeek series models (Flash/Pro) ALWAYS inherit the Anchored Standard preset and use the default \`mode: standard\` — do NOT use \`mode: minimal\` (its toolFilter cuts the promoted full toolset and breaks the anchor-then-promote trajectory). Implementers and reviewers share the same optimal trajectory.
- Explicitly pass the model as \`provider/model\` (e.g. \`trae-solo/DeepSeek-V4-Flash-Official\`) so the provider is pinned too; do not leave it to inherit the captain's provider accidentally.
- Non-DeepSeek members (e.g. vision tasks using Doubao): may use \`mode: minimal\` for a focused single-coding member, or the shape mapping (generative→minimal, batch→PTC, exploratory→standard).

Complex goals: use orchestra_define_workflow to pick a template, orchestra_assemble to form the team, orchestra_relay to advance steps, orchestra_dispatch_step to dispatch a step to a member.

Tools: ${toolNames}`
}

export function apply(ctx: Context, config: Config): void {
  const resolved: ToolsConfig = {
    stateDir: config.stateDir ?? '.agent-orchestra',
    memberProvider: config.memberProvider ?? 'spawn',
    memberModel: config.memberModel,
    memberMaxDepth: config.memberMaxDepth ?? 1,
    maxMembers: config.maxMembers ?? 8,
  }

  // Provider registration is a sibling plugin's effect (`subagent-spawn` /
  // `subagent-fork` rows), which can land after this mount under the Loader's
  // concurrent activation — so capability validation happens at the first
  // member spawn (`spawnMember`), the earliest point the provider list is
  // settled, rather than here.

  const toolNames = [
    'orchestra_create',
    'orchestra_add_member',
    'orchestra_remove_member',
    'orchestra_create_task',
    'orchestra_claim_task',
    'orchestra_update_task',
    'orchestra_send_message',
    'orchestra_status',
    'orchestra_delete',
    'orchestra_define_workflow',
    'orchestra_assemble',
    'orchestra_relay',
    'orchestra_dispatch_step',
  ].join(', ')
  ctx.systemPrompt.section({
    name: 'agent-orchestra:usage',
    order: config.promptSectionOrder ?? 117,
    text: usageSectionText(toolNames),
  })

  registerAgentOrchestraTools(ctx, resolved)

  // The activity panel data/artwork routes need the Web server and the
  // workspace registry, which headless profiles do not mount; under
  // concurrent activation they may also bind after this plugin. Register the
  // routes lazily: try now, then on each service binding event. In a webless
  // profile the plugin stays tool-only and never blocks boot.
  let webRegistered = false
  const registerWebSurface = (): void => {
    if (webRegistered) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebRouteHost | undefined
    const workspaceRegistry = (ctx.get(WORKSPACE_KEYS[0]) ?? ctx.get(WORKSPACE_KEYS[1])) as WorkspaceRegistry | undefined
    if (webServer === undefined || workspaceRegistry === undefined) return
    webRegistered = true

    // Activity panel data route: the browser floater polls this for team
    // snapshots (disk truth + live subagent activity). Mirrors the Claude
    // Code desktop watcher's server-side snapshot pattern.
    ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/plugins/dsh-agent-orchestra/state',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const roots = workspaceRegistry.list().map((workspace) => ({
        workspace: workspace.title,
        stateRoot: join(workspace.path, resolved.stateDir),
      }))
      // ?archived=1 serves teams moved to archive/ (post-delete review).
      const snapshots = url.searchParams.get('archived') === '1'
        ? await collectArchivedTeamsActivity(ctx, roots)
        : await collectTeamsActivity(ctx, roots)
      const body = JSON.stringify({ teams: snapshots })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  }), 'agent-orchestra: activity route')

  // Whale mascot artwork: serve the packaged role/action images to the
  // activity panel. An explicit allowlist guards the route (no path
  // traversal); the images ship with the bundle (files: assets/).
  const artDir = fileURLToPath(new URL('../assets/agent-orchestra/', import.meta.url))
  const ART_ALLOWLIST = new Set([
    'team-lead.png', 'researcher.png', 'engineer.png', 'designer.png',
    'qa-engineer.png', 'security-reviewer.png', 'data-analyst.png',
    'docs-coordinator.png', 'action-working.png', 'action-thinking.png',
    'action-reporting.png', 'action-celebrating.png', 'action-sleeping.png',
    'action-sending.png',
  ])
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/plugins/dsh-agent-orchestra/assets',
    handler: async (req, res) => {
      let name: string
      try {
        name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.split('/').pop() ?? '')
      } catch {
        // Malformed percent-encoding: treat as an unknown asset, not a 400.
        res.writeHead(404)
        res.end()
        return
      }
      if (!ART_ALLOWLIST.has(name)) {
        res.writeHead(404)
        res.end()
        return
      }
      try {
        const data = await readFile(join(artDir, name))
        res.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
        })
        res.end(data)
      } catch (error: unknown) {
        ctx.logger.warn(`agent-orchestra: artwork read failed for ${name}: ${String(error)}`)
        res.writeHead(404)
        res.end()
      }
      },
    }), 'agent-orchestra: artwork route')
  }

  registerWebSurface()
  ctx.on('internal/service', (name) => {
    if (WEB_SERVER_KEYS.includes(name as (typeof WEB_SERVER_KEYS)[number])
      || WORKSPACE_KEYS.includes(name as (typeof WORKSPACE_KEYS)[number])) {
      registerWebSurface()
    }
  })
}
