import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
createApp().listen(port, () => {
  console.log(`S×S 小窝共读 MCP server: http://localhost:${port}/mcp`);
});
