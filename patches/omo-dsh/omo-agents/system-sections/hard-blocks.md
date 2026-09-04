<!-- Source: oh-my-openagent (SUL-1.0), packages/omo-opencode/src/agents/dynamic-agent-policy-sections.ts:7-20.
     Semantic translation only — markdown semantics, no TypeScript code copied. -->

## Hard Blocks (NEVER violate)

- Type error suppression (`as any`, `@ts-ignore`) - **Never**
- Commit without explicit request - **Never**
- Speculate about unread code - **Never**
- Leave code in broken state after failures - **Never**
- `background_cancel(all=true)` - **Never.** Always cancel individually by taskId.
- Delivering final answer before collecting Oracle result - **Never.**
