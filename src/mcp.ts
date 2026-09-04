// Re-exports the response seam from @chrischall/mcp-utils; tools import from ./mcp.js.
// `minifiedResult`, not `textResult`: formatting whitespace is bytes a model
// pays for and nothing reads. Whitespace inside a value is content and is
// untouched.
// unchanged. Mirrors the fleet convention (see hemnet-mcp/src/mcp.ts) so the
// tool files never reach into the utils barrel directly.
export { minifiedResult } from '@chrischall/mcp-utils';
