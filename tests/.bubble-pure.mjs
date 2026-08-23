function str(v) {
    return typeof v === 'string' ? v : '';
}
/** Parse orchestra_send_message tool/call args → bubble data (pure). */
export function parseSendMessageBubble(args, fromFallback = 'captain', ts = Date.now()) {
    if (typeof args !== 'object' || args === null)
        return undefined;
    const a = args;
    const to = str(a.to);
    const content = str(a.content);
    if (to === '' && content === '')
        return undefined;
    const from = str(a.from) || fromFallback;
    return {
        kind: 'member-message',
        fromMember: from,
        fromRole: '',
        fromId: '',
        toMember: to === '' ? undefined : to,
        text: content,
        ts,
    };
}
/** Parse orchestra_update_task (status completed) args → bubble data (pure). */
export function parseUpdateTaskBubble(args, fromFallback = 'captain', ts = Date.now()) {
    if (typeof args !== 'object' || args === null)
        return undefined;
    const a = args;
    if (str(a.status) !== 'completed')
        return undefined;
    const taskId = str(a.task_id);
    const output = str(a.output);
    if (taskId === '' && output === '')
        return undefined;
    return {
        kind: 'task-done',
        fromMember: fromFallback,
        fromRole: '',
        fromId: '',
        taskId: taskId === '' ? undefined : taskId,
        taskSubject: '',
        text: output,
        ts,
    };
}
/** Default excerpt length for collapsed bubble text. */
export const BUBBLE_EXCERPT_LEN = 200;
/** Collapse long text to excerpt + whether truncated (pure). */
export function collapseText(text, max = BUBBLE_EXCERPT_LEN) {
    if (text.length <= max)
        return { excerpt: text, truncated: false };
    return { excerpt: text.slice(0, max) + '…', truncated: true };
}
