# S×S 小窝共读 / Reading Nest

一个移动端优先的 AI 共读小窝，运行在 ChatGPT Apps SDK + MCP 之上。用户可以导入自己的小说文本或漫画图片，记录自己和 AI 的阅读位置，并使用补课同步、轻量短评、书签、摘录与短评 Dock。

本项目适合个人私有部署、学习和二次改造。公开仓库只提供代码、测试和原创 demo，不包含作者的阅读内容、聊天记录或线上数据。

## 当前状态

项目仍处于早期开发阶段：

- 当前公开快照基于 `v0.2.2`。
- 小说粘贴或 TXT / Markdown 文件导入、分段、阅读和云端恢复链路基本可用。
- 当前小说使用 segmentation v3 合并短段落；旧版云端正文可以恢复并继续阅读。
- 漫画上传与页面显示仍有已知 bug，后续会继续修复。
- 当前优先优化 iPad / iOS ChatGPT App 阅读体验。
- 桌面端布局和小说体验仍在改进。
- AI 短评手动保存可用；自动保存尚未作为默认稳定功能。
- 当前架构是个人单用户方案，不适合作为未经改造的公共多用户服务。

## 功能

- 小说粘贴或 TXT / Markdown 文件导入
- 章节识别与 segmentation v3 阅读单元分段
- 漫画图片导入与逐页阅读
- 用户阅读位置与 AI 同步位置分离
- skipped range 分批补课机制
- 轻松共读、吐槽、剧情猜测与深度分析模式
- 书签、摘录、用户反应与短评 Dock
- IndexedDB 本地阅读缓存
- Cloudflare Worker、D1 与私有 R2 存储
- iPad 移动端和沉浸阅读体验

## 项目结构

```text
server/   TypeScript MCP server、Cloudflare Worker、D1/R2 adapters
web/      React + Vite ChatGPT widget
shared/   共享数据模型、迁移和 Zod schemas
demo/     可公开使用的原创示例内容
```

## 快速开始

需要 Node.js 22+ 和 pnpm 10+。

```bash
pnpm install
pnpm build
pnpm dev
```

常用检查：

```bash
pnpm test
pnpm typecheck
pnpm build
```

本地 MCP server 默认使用：

- MCP endpoint：`http://localhost:8787/mcp`
- 健康检查：`http://localhost:8787/health`

## Cloudflare 部署

1. 复制 `.env.example`，只在本机或 Cloudflare 中填写真实值，不要提交。
2. 创建自己的 D1 database 和私有 R2 bucket。
3. 将 `server/wrangler.jsonc` 中的 D1 database ID、资源名称改成自己的值。
4. 为 Worker 设置随机且足够长的 `MCP_PATH_TOKEN` secret。
5. 执行迁移、构建并部署。

```bash
pnpm --filter @ss/server exec wrangler login
pnpm --filter @ss/server exec wrangler d1 create ss-reading-nest-db
pnpm --filter @ss/server exec wrangler r2 bucket create ss-reading-nest-sources
pnpm --filter @ss/server exec wrangler secret put MCP_PATH_TOKEN
pnpm --filter @ss/server exec wrangler d1 migrations apply ss-reading-nest-db --remote
pnpm build
pnpm --filter @ss/server deploy
```

R2 bucket 必须保持 private。项目不生成 public URL 或 signed URL。部署完成后，使用你自己的 Worker 地址与私密 MCP path 在 ChatGPT Developer Mode 中添加 app。

## 环境变量

示例见 `.env.example`：

| 变量 | 用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID，仅用于部署或 smoke test |
| `CLOUDFLARE_API_TOKEN` | 可选的自动化部署凭证 |
| `D1_DATABASE_ID` | 你自己的 D1 database ID |
| `R2_BUCKET_NAME` | 你自己的私有 R2 bucket 名称 |
| `MCP_PATH_TOKEN` | Worker 私密 MCP/source 路径 token |
| `WORKER_URL` | 已部署 Worker 的 HTTPS origin |
| `SMOKE_D1_DATABASE_ID` | remote smoke 使用的 D1 database ID |

本项目不需要 `OPENAI_API_KEY`。模型由 ChatGPT host 提供，服务端不直接调用 OpenAI 模型 API。

## 数据与隐私

- 使用者应自行部署并管理 D1、R2、Cloudflare secrets 与本地缓存。
- 不要把私人聊天、日记、阅读记录、书签、摘录或用户上传源文件提交到仓库。
- D1 只应保存 session、位置、偏好和 source metadata；小说正文与漫画图片存放在私有 R2，本地 IndexedDB 仅作设备缓存。
- IndexedDB 是本设备加速缓存，不是跨设备的唯一长期存储。
- 正文上传与恢复走 component-only 的组件与 Worker 受控路径，不应通过聊天消息返回整本内容。
- ChatGPT 模型不会自动读取整本小说或整套漫画，只在用户主动触发时接收必要的当前阅读范围。
- 不要把受版权保护的整本书或漫画作为 demo 发布，也不建议上传到面向公众的共享服务。
- demo 应使用原创文本或确认属于公共领域的内容。

该版本仅使用随机私密路径保护个人部署，不提供完整的用户账号、认证与多租户隔离。公开提供服务前必须重新设计认证、授权、数据隔离、删除策略和滥用防护。

删除操作分为三层：删除云端阅读记录、同时删除云端正文副本、同时删除本设备正文缓存。使用者应根据自己的保留策略明确选择，不应把三者混为一次隐式删除。

`server/scripts/remote-smoke/cloud-source-smoke.mjs` 可用于部署后验证。remote smoke 只使用临时原创内容，并会尽力清理测试 session 与 R2 objects；运行前必须通过本机环境变量提供自己的部署信息。

## 二次开发

你可以按自己和 AI 伴侣的相处方式调整：

- UI 风格、主题和称呼
- 共读评论模式与 prompt
- 手动或自动保存策略
- 小说分段和漫画导入方式
- 本地优先或云端优先的数据策略
- 自己的 Cloudflare 私有部署方式

建议保留“用户主动触发才发送当前阅读范围”的隐私边界，并让评论保存失败不阻塞正常聊天。

## 已知问题

- 漫画链路仍有上传和页面显示问题。
- 桌面端小说布局仍需更多适配。
- AI 评论自动保存仍不够稳定，默认建议使用手动保存。

## License

本项目基于 [MIT License](LICENSE) 开源，可以自由使用、修改和分发。使用者需自行确保导入、存储和分享内容时符合版权与当地法律要求。
