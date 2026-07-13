// Re-exports textResult from @chrischall/mcp-utils; tools import from ./mcp.js
// unchanged. Mirrors the fleet convention (see hemnet-mcp/src/mcp.ts) so the
// tool files never reach into the utils barrel directly.
export { textResult } from '@chrischall/mcp-utils';
