/**
 * @recursive/mcp-protocol
 * Model Context Protocol server implementation for Recursive platform
 */

const MCPServer = require('./server');
const { MCPCoreHandlers, MCPToolsHandlers, MCPUtils } = require('./handlers');

module.exports = {
    MCPServer,
    MCPCoreHandlers,
    MCPToolsHandlers,
    MCPUtils
}; 