# vodhub

Mac CMS 聚合，基于 React + Vite + [@ouonnki/cms-core](https://www.npmjs.com/package/@ouonnki/cms-core)，支持 Vercel、Cloudflare Pages、Netlify 与 Docker 部署，最初基于 [LunaTV](https://github.com/MoonTechLab/LunaTV)，现已完全重构。

## 部署

后端基于 [Hono](https://hono.dev/) 构建，业务路由集中在 `server/app.mjs`。各平台入口都是 2–3 行的薄壳 adapter。

| 平台             | 入口                             | 命令 / 说明                                                |
| ---------------- | -------------------------------- | ---------------------------------------------------------- |
| Vercel           | `api/[...route].mjs` + `vercel.json` | `/api/*` 由 Vercel Function 转发到 Hono；`vercel.json` 提供 SPA 回退 |
| Cloudflare Pages | `functions/api/[[route]].mjs` + `wrangler.toml` | 构建命令 `pnpm build`，输出目录 `dist`                     |
| Netlify          | `netlify/edge-functions/api.mjs` | `netlify.toml` 已配置 Edge Functions 与 SPA 回退           |
| Docker           | `Dockerfile` + `compose.yaml`    | 下载 `compose.yaml` 文件后 使用`docker compose up -d` 部署 |
| 本地开发         | `vite.config.ts` 内嵌中间件      | `pnpm dev`                                                 |

Cloudflare Pages 直接使用 Wrangler 部署时，先执行 `pnpm build`，再执行 `npx wrangler pages deploy`。

## 环境变量

| 变量                      | 必填   | 说明                                             |
| ------------------------- | ------ | ------------------------------------------------ |
| `SITE_NAME`               | 否     | 站点名称，默认 `vodhub`                          |
| `SITE_ANNOUNCEMENT`       | 否     | 站点公告内容，登录后首页顶部展示（留空则不显示） |
| `SITE_ANNOUNCEMENT_TITLE` | 否     | 站点公告标题（可选，配合 `SITE_ANNOUNCEMENT`）   |
| `ADMIN_PASSWORD`          | 是     | 站点登录密码                                     |
| `AUTH_SECRET`             | 是     | 登录 token 签名密钥（建议 32+ 字符随机串）       |
| `AUTH_TOKEN_TTL`          | 否     | token 有效期（秒），默认 604800                  |
| `SOURCES_URL`             | 二选一 | 视频源订阅地址（JSON）                           |
| `SOURCES_JSON`            | 二选一 | 视频源 JSON 内联配置                             |
| `SEARCH_CONCURRENCY`      | 否     | CMS 聚合搜索并发数，默认 5，上限 20              |

## 视频源配置

与 [OuonnkiTV](https://github.com/Ouonnki/OuonnkiTV) 源格式一致。

```json
[
  {
    "id": "my_source",
    "name": "示例资源",
    "url": "http://xxx.com/api.php/provide/vod",
    "detailUrl": "http://xxx.com",
    "timeout": 10000,
    "retry": 2,
    "isEnabled": true
  }
]
```

## 重要提醒

> [!IMPORTANT]
>
> - 本项目仅用于技术学习和交流目的，不提供任何商业服务。
> - 本应用不提供或分发任何视频源，用户自行聚合的内容来源于第三方平台，我们不对内容的合法性、准确性、完整性或可用性承担任何责任。
> - 所有影视内容的版权归原作者和版权方所有，请用户自觉遵守相关法律法规，支持正版。
> - 用户使用本应用所产生的任何直接或间接损失，开发者不承担任何责任。
> - 请用户在使用过程中遵守当地法律法规，不得用于任何违法用途。
> - 请用户自行承担数据安全风险。
>   使用本应用即表示您已阅读并同意上述免责声明。

## License

[CC BY-NC-SA](./LICENSE)
