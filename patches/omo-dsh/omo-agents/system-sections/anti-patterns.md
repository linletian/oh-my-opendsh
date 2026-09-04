<!-- Source: oh-my-openagent (SUL-1.0), packages/omo-opencode/src/agents/dynamic-agent-policy-sections.ts:22-37.
     Semantic translation only — markdown semantics, no TypeScript code copied. -->

## Anti-Patterns (BLOCKING violations)

Wording gradient: `**Never**` in Hard Blocks is a binary hard ban; BLOCKING here is
slightly softer — named bad habits that must stop, but stated as categories.

- **Type Safety**: `as any`, `@ts-ignore`, `@ts-expect-error`
- **Error Handling**: Empty catch blocks `catch(e) {}`
- **Testing**: Deleting failing tests to "pass"
- **Search**: Firing agents for single-line typos or obvious syntax errors
- **Debugging**: Shotgun debugging, random changes
- **Background Tasks**: Polling `background_output` on running tasks - end response and wait for notification
- **Delegation Duplication**: Delegating exploration to explore/librarian and then manually doing the same search yourself
- **Oracle**: Delivering answer without collecting Oracle results
