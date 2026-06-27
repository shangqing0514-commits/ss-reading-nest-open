import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.MCP_ENDPOINT;
const workerUrl = buildWorkerUrl();
const token = process.env.MCP_PATH_TOKEN ?? deriveToken(workerUrl);
const mcpUrl = new URL(`/mcp/${token}`, workerUrl.origin);
const sourceBase = `${workerUrl.origin}/source/${token}`;
const bucket = process.env.SMOKE_R2_BUCKET ?? "ss-reading-nest-sources";
const databaseId = requiredEnv("SMOKE_D1_DATABASE_ID");
const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
const serverDir = fileURLToPath(new URL("../..", import.meta.url));
const runId = `task9-${Date.now()}-${randomUUID().slice(0, 8)}`;
const novelText = `TASK9_NOVEL_SOURCE_${runId}\n\nSecond paragraph for restore.`;
const commentText = `Task 9 short comment ${runId}`;
const mangaPageOne = Uint8Array.from([1, 2, 3]);
const mangaPageTwo = Uint8Array.from([4, 5, 6]);
const forbidden = [
  novelText,
  "TASK9_NOVEL_SOURCE_",
  "BRIDGE_UPLOAD_",
  "bytesBase64",
  "data:image",
  "publicUrl",
  "signedUrl",
  "download_url",
  "file_id",
  "OPENAI_API_KEY"
];

const expectedTools = [
  "open_reading_nest",
  "start_reading_session",
  "update_reading_position",
  "confirm_assistant_synced_position",
  "set_live_reading_mode",
  "set_source_manifest",
  "get_cloud_source_status",
  "upload_cloud_source",
  "delete_cloud_source",
  "update_session_preferences",
  "publish_companion_comment",
  "list_companion_comments",
  "clear_companion_comments",
  "rename_reading_session",
  "set_reading_session_status",
  "delete_reading_session",
  "send_current_context",
  "save_quote",
  "save_reaction",
  "save_bookmark",
  "finish_today_reading",
  "complete_reading_session",
  "generate_diary_context"
];

const client = new Client({ name: "ss-task9-cloud-source-smoke", version: "0.2.2" });
const cleanup = {
  sessions: new Set(),
  r2Keys: new Set()
};

await client.connect(new StreamableHTTPClientTransport(mcpUrl));

try {
  const health = await getJson(`${workerUrl.origin}/health`);
  assert(health.ok === true, "health did not return ok=true");
  assertNoForbidden(JSON.stringify(health), "health");

  const wrong = await fetch(`${workerUrl.origin}/source/wrong/upload`, { method: "POST" });
  assert(wrong.status === 404, `wrong private source path expected 404, got ${wrong.status}`);

  const preflight = await fetch(`${sourceBase}/upload`, {
    method: "OPTIONS",
    headers: {
      origin: "https://chatgpt.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert(preflight.status === 204, `source preflight expected 204, got ${preflight.status}`);
  assert(preflight.headers.get("access-control-allow-origin") === "*", "source preflight missing CORS origin");
  assert(
    preflight.headers.get("access-control-allow-methods")?.includes("POST"),
    "source preflight missing POST method"
  );

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert(toolNames.length === expectedTools.length, `expected ${expectedTools.length} tools, got ${toolNames.length}`);
  for (const name of expectedTools) assert(toolNames.includes(name), `missing tool ${name}`);
  assert(!toolNames.includes("restore_cloud_source"), "assistant-visible restore_cloud_source must not exist");

  const openNest = await callTool("open_reading_nest", {});
  assert(
    openNest.structuredContent?.sourceEndpointBase === sourceBase,
    "open_reading_nest did not return the component source endpoint"
  );
  assertNoForbidden(JSON.stringify(openNest), "open_reading_nest");

  const bridgeUploadSession = await startSession(`${runId} bridge upload`, "novel");
  const bridgeText = `BRIDGE_UPLOAD_${runId}\n\nsecond`;
  const bridgeUpload = await callTool("upload_cloud_source", {
    sessionId: bridgeUploadSession.id,
    sourceKind: "pasted_text",
    title: `${runId} bridge upload`,
    sourceText: bridgeText
  });
  assert(bridgeUpload.structuredContent?.uploaded === true, "bridge upload did not report uploaded=true");
  assert(bridgeUpload.structuredContent?.cloudSync?.enabled === true, "bridge upload cloudSync not enabled");
  assert(!JSON.stringify(bridgeUpload.structuredContent).includes(bridgeText), "bridge upload leaked source text");
  assert(!JSON.stringify(bridgeUpload.structuredContent).includes("private/sources/"), "bridge upload leaked object key");
  const bridgeStatus = await callTool("get_cloud_source_status", { sessionId: bridgeUploadSession.id });
  assert(bridgeStatus.structuredContent?.status === "available", "bridge upload status was not available");
  const stateAfterBridge = await readD1State();
  const bridgeSession = stateAfterBridge.sessions.find((session) => session.id === bridgeUploadSession.id);
  assert(bridgeSession?.sourceManifest?.cloudSync?.enabled === true, "bridge upload did not update D1 manifest");
  rememberManifestKeys(bridgeSession.sourceManifest);

  const novelSession = await startSession(`${runId} novel`, "novel");
  const novelUpload = await componentPost("upload", {
    sessionId: novelSession.id,
    sourceKind: "pasted_text",
    title: `${runId} novel`,
    sourceText: novelText
  });
  const novelManifest = novelUpload.sourceManifest;
  rememberManifestKeys(novelManifest);
  assertMetadataOnly(novelUpload, "novel upload");
  assert(novelManifest.cloudSync?.enabled === true, "novel cloudSync not enabled");
  assert(novelManifest.cloudSync.objectKey, "novel objectKey missing");
  assert(novelManifest.cloudSync.manifestObjectKey, "novel manifestObjectKey missing");

  let state = await readD1State();
  assert(state.schemaVersion === 4, `schemaVersion expected 4, got ${state.schemaVersion}`);
  assert(JSON.stringify(state).includes(novelManifest.cloudSync.objectKey), "D1 missing novel objectKey metadata");
  assertNoForbidden(JSON.stringify(state), "D1 after novel upload");

  const novelRestore = await componentPost("restore", { sessionId: novelSession.id });
  assert(novelRestore.sourceText === novelText, "novel restore text mismatch");
  assert(novelRestore.sourceManifest.paragraphCount === 2, "novel paragraphCount mismatch");
  assert(sha256Text(novelRestore.sourceText) === novelManifest.contentHash, "novel restore hash mismatch");
  assert(!("structuredContent" in novelRestore), "component restore must not look like MCP tool result");

  await callTool("publish_companion_comment", {
    sessionId: novelSession.id,
    position: { kind: "paragraph", index: 1, label: "paragraph 1" },
    mode: "light_chat",
    length: "short",
    text: commentText,
    source: "quick_action",
    operationId: `${runId}-comment`
  });
  const comments = await callTool("list_companion_comments", {
    sessionId: novelSession.id,
    scope: "recent",
    limit: 20
  });
  assert(JSON.stringify(comments).includes(commentText), "CompanionComment was not visible");
  assert(!JSON.stringify(comments).includes(novelText), "CompanionComment leaked source text");

  const mangaSession = await startSession(`${runId} manga`, "manga");
  const mangaUpload = await componentPost("upload", {
    sessionId: mangaSession.id,
    sourceKind: "manga_import",
    title: `${runId} manga`,
    pages: [
      { index: 1, bytesBase64: base64(mangaPageOne), mimeType: "image/png", fileName: "smoke-1.png" },
      { index: 2, bytesBase64: base64(mangaPageTwo), mimeType: "image/png", fileName: "smoke-2.png" }
    ]
  });
  const mangaManifest = mangaUpload.sourceManifest;
  rememberManifestKeys(mangaManifest);
  assertMetadataOnly(mangaUpload, "manga upload");
  assert(mangaManifest.cloudSync?.pages?.length === 2, "manga page metadata missing");

  state = await readD1State();
  assert(JSON.stringify(state).includes(mangaManifest.cloudSync.pages[0].objectKey), "D1 missing manga page metadata");
  assertNoForbidden(JSON.stringify(state), "D1 after manga upload");

  const mangaRestore = await componentPost("restore", {
    sessionId: mangaSession.id,
    sourceKind: "manga_import",
    pageIndex: 1
  });
  assert(mangaRestore.bytesBase64 === base64(mangaPageOne), "manga restore bytes mismatch");
  assert(!("structuredContent" in mangaRestore), "manga component restore must not look like MCP tool result");

  const keepSourceSession = await startSession(`${runId} keep source`, "novel");
  const keepUpload = await componentPost("upload", {
    sessionId: keepSourceSession.id,
    sourceKind: "pasted_text",
    title: `${runId} keep source`,
    sourceText: `KEEP_SOURCE_${runId}\n\nsecond`
  });
  rememberManifestKeys(keepUpload.sourceManifest);
  const keepObjectKey = keepUpload.sourceManifest.cloudSync.objectKey;
  assert(r2ObjectExists(keepObjectKey), "record-only source object was not uploaded");
  await callTool("delete_reading_session", {
    sessionId: keepSourceSession.id,
    operationId: `${runId}-delete-record-only`
  });
  cleanup.sessions.delete(keepSourceSession.id);
  state = await readD1State();
  assert(!state.sessions.some((session) => session.id === keepSourceSession.id), "record-only delete left session in D1");
  assert(r2ObjectExists(keepObjectKey), "record-only delete should leave R2 source object");

  const deleteCloudSession = await startSession(`${runId} delete cloud`, "novel");
  const deleteCloudUpload = await componentPost("upload", {
    sessionId: deleteCloudSession.id,
    sourceKind: "pasted_text",
    title: `${runId} delete cloud`,
    sourceText: `DELETE_CLOUD_${runId}\n\nsecond`
  });
  rememberManifestKeys(deleteCloudUpload.sourceManifest);
  const deleteCloudObjectKey = deleteCloudUpload.sourceManifest.cloudSync.objectKey;
  const deleteResult = await callTool("delete_reading_session", {
    sessionId: deleteCloudSession.id,
    operationId: `${runId}-delete-cloud`,
    deleteCloudSource: true
  });
  cleanup.sessions.delete(deleteCloudSession.id);
  assertNoForbidden(JSON.stringify(deleteResult), "delete result");
  assert(deleteResult.structuredContent.deleted === true, "delete with cloud did not remove D1 session");
  state = await readD1State();
  assert(!state.sessions.some((session) => session.id === deleteCloudSession.id), "delete-cloud left session in D1");
  assert(!r2ObjectExists(deleteCloudObjectKey, { logMissing: false }), "deleteCloudSource should remove R2 source object");
  assert(r2ObjectExists(keepObjectKey), "deleting B should not delete A's source object");

  await cleanupAll();
  state = await readD1State();
  assert(!JSON.stringify(state).includes(runId), "cleanup left smoke D1 data");
  for (const key of cleanup.r2Keys) {
    assert(!r2ObjectExists(key, { logMissing: false }), `cleanup left R2 object ${key}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      workerOrigin: workerUrl.origin,
      appVersion: health.version,
      schemaVersion: state.schemaVersion,
      toolCount: toolNames.length,
      noAssistantVisibleRestoreTool: true,
      novelUpload: true,
      novelRestore: true,
      mangaUpload: true,
      mangaRestore: true,
      deleteWithoutCloudDeletion: true,
      deleteWithCloudDeletion: true,
      d1Privacy: true,
      r2Privacy: true,
      healthPrivacy: true,
      wrongPrivatePath404: true,
      sourcePreflightCors: true,
      openReadingNestSourceEndpoint: true,
      cleanupComplete: true
    })
  );
} finally {
  await cleanupAll().catch((error) => {
    console.error(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  await client.close();
}

function buildWorkerUrl() {
  if (process.env.WORKER_URL) return new URL(process.env.WORKER_URL);
  if (endpoint) return new URL(endpoint);
  throw new Error("Set WORKER_URL and MCP_PATH_TOKEN, or set MCP_ENDPOINT for compatibility");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running the remote smoke test`);
  return value;
}

function deriveToken(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const mcpIndex = parts.indexOf("mcp");
  const value = mcpIndex >= 0 ? parts[mcpIndex + 1] : undefined;
  if (!value) throw new Error("Set MCP_PATH_TOKEN, or include /mcp/<token> in MCP_ENDPOINT");
  return value;
}

async function startSession(title, type) {
  const result = await callTool("start_reading_session", { title, type });
  const session = result.structuredContent?.session;
  assert(session?.id, `start_reading_session returned no ${type} id`);
  cleanup.sessions.add(session.id);
  return session;
}

async function callTool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result;
}

async function getJson(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} failed with ${response.status}`);
  return response.json();
}

async function componentPost(action, body) {
  const response = await fetch(`${sourceBase}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert(response.ok, `${action} failed with ${response.status}: ${text}`);
  return JSON.parse(text);
}

function assertMetadataOnly(value, label) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("structuredContent"), `${label} returned MCP structuredContent`);
  assertNoForbidden(serialized, label);
}

function assertNoForbidden(serialized, label) {
  for (const term of forbidden) {
    assert(!serialized.includes(term), `${label} leaked forbidden term ${term}`);
  }
}

function rememberManifestKeys(manifest) {
  const keys = [
    manifest.cloudSync?.objectKey,
    manifest.cloudSync?.manifestObjectKey,
    ...(manifest.cloudSync?.pages?.map((page) => page.objectKey) ?? [])
  ].filter(Boolean);
  for (const key of keys) {
    assert(key.startsWith("private/sources/"), `R2 key is not private: ${key}`);
    assert(!key.includes(manifest.title ?? "__never__"), `R2 key leaks title: ${key}`);
    assert(!key.includes(manifest.contentHash), `R2 key leaks hash: ${key}`);
    cleanup.r2Keys.add(key);
  }
}

async function readD1State() {
  const tokenValue = readWranglerOauthToken();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenValue}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ sql: "SELECT data FROM app_state WHERE id=1" })
    }
  );
  const body = await response.json();
  assert(response.ok && body.success !== false, `D1 query failed: ${JSON.stringify(body)}`);
  const data = body.result?.[0]?.results?.[0]?.data;
  assert(typeof data === "string", "D1 app_state data is missing");
  return JSON.parse(data);
}

function readWranglerOauthToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const configPath =
    process.env.WRANGLER_CONFIG ??
    join(process.env.APPDATA ?? "", "xdg.config", ".wrangler", "config", "default.toml");
  assert(existsSync(configPath), "Wrangler OAuth config not found; set CLOUDFLARE_API_TOKEN");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/oauth_token\s*=\s*"([^"]+)"/);
  assert(match?.[1], "Wrangler OAuth token not found; set CLOUDFLARE_API_TOKEN");
  return match[1];
}

function r2ObjectExists(key, options = {}) {
  const tmpFile = join(tmpdir(), `ss-r2-check-${randomUUID()}`);
  const result = runWrangler(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--file", tmpFile]);
  rm(tmpFile, { force: true }).catch(() => {});
  if (result.status === 0) return true;
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (details && options.logMissing !== false) {
    console.error(`R2 object check failed for ${key}:\n${details}`);
  }
  return false;
}

async function deleteR2Object(key) {
  runWrangler(["r2", "object", "delete", `${bucket}/${key}`, "--remote"]);
}

async function cleanupAll() {
  for (const sessionId of [...cleanup.sessions]) {
    await callTool("delete_reading_session", {
      sessionId,
      operationId: `${runId}-cleanup-${sessionId}`,
      deleteCloudSource: true
    }).catch(() => {});
    cleanup.sessions.delete(sessionId);
  }
  for (const key of cleanup.r2Keys) {
    await deleteR2Object(key).catch(() => {});
  }
}

function runWrangler(args) {
  if (process.env.WRANGLER_JS_PATH) {
    return spawnSync(process.execPath, [process.env.WRANGLER_JS_PATH, ...args], {
      cwd: serverDir,
      encoding: "utf8"
    });
  }
  const command = process.env.WRANGLER_BIN ?? "wrangler";
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `"${command}"`, ...args], {
      cwd: serverDir,
      encoding: "utf8"
    });
  }
  return spawnSync(command, args, {
    cwd: serverDir,
    encoding: "utf8"
  });
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function sha256Text(text) {
  return createHash("sha256").update(new TextEncoder().encode(text)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
