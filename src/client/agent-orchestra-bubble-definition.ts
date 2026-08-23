/** AgentOrchestra conversation bubble node data. */
import type { AgentOrchestraBubbleData } from './bubble-pure.ts'
export type { AgentOrchestraBubbleData }
export { parseSendMessageBubble, parseUpdateTaskBubble, collapseText, BUBBLE_EXCERPT_LEN } from './bubble-pure.ts'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One member's interaction bubble in the conversation. */
    'agent-orchestra-bubble': AgentOrchestraBubbleData
  }
}
