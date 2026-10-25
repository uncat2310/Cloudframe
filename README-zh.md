<p align="center"><img src="apps/web/public/og.png" width="640" alt="Cloudframe"></p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

# Cloudframe · 云框

**云上的相框**：一个部署在 Cloudflare 上的私人图床面板。图片存放在你自己的 R2 存储桶里，面板只负责上传和管理，一个密码就能在任何设备上使用。

📖 **文档与教程**：图文版[使用指南](https://uncat2310.github.io/Cloudframe/)从部署讲起，覆盖上传、画廊、设置与安全，第一次用先看它。

## 为什么用它

- **一个密码就够**：R2 的访问权限只保存在服务器端，浏览器拿不到任何密钥。换设备、换浏览器，输入密码即可，不用再填一堆参数。
- **免费部署**：部署到 Cloudflare Workers，通过 R2 绑定直接读写存储桶，不需要创建 API 令牌。个人使用基本用不完免费额度。
- **不用配置 CORS**：浏览器只访问面板自己的域名，由服务器代为访问 R2。
- **图片不依赖面板**：图片的展示和外链直接走 R2 的公开地址。哪天不用这个面板了，已经发出去的链接照样能打开。

## 功能

- **上传**：拖拽、粘贴或选择文件上传；上传前可以压缩、转换格式（WebP / AVIF / JPEG / PNG）；支持自定义存储路径模板，例如 `i/{{year}}/{{month}}/{{day}}/{{ulid-dayslice}}.{{ext}}`
- **画廊**：网格浏览，按名称搜索，按日期筛选和排序；支持 HEIC 和 Apple Live Photo
- **分享**：一键复制图片链接或 Markdown
- **管理**：重命名、删除、下载；删除的图片先进回收站，30 天内可以恢复
- **设置同步**：压缩、路径模板等设置保存在服务器上，换浏览器、换设备登录都是同一套
- **界面**：中文 / English，浅色 / 深色主题

路径模板的占位符、压缩和画廊选项见[设置说明](docs/settings.md)。

## 部署

三种方式任选其一，详细步骤见 **[部署指南 selfhost/README.md](selfhost/README.md)**。

| 方式                                                                     | 费用         | 需要                                |
| ------------------------------------------------------------------------ | ------------ | ----------------------------------- |
| [Cloudflare Workers](selfhost/README.md#2-部署到-cloudflare-workers免费) | 个人使用免费 | Cloudflare 账号，不需要 R2 API 令牌 |
| [Docker](selfhost/README.md#3-用-docker-部署vps-或电脑)                  | 服务器费用   | VPS 或常开的电脑，R2 API 令牌       |
| [直接运行 Node](selfhost/README.md#4-不用-docker直接在电脑上运行)        | 无           | Node.js 22，R2 API 令牌             |

以 Workers 为例，大致流程是（每一步的具体操作见部署指南第 2 节）：

1. 在 Cloudflare 创建 R2 存储桶，开启公开访问（自定义域名或 r2.dev）；
2. Fork 本仓库，在 `apps/web/wrangler.jsonc` 里填上存储桶名称和公开地址；没有自己的域名时，把 `workers_dev` 改成 `true`；
3. Cloudflare 控制台 → Workers 和 Pages → 导入 Git 仓库，填写构建命令和部署命令；
4. 在 Worker 的「运行时变量和密钥」里添加 `CLOUDFRAME_PASSWORD`（登录密码）和 `CLOUDFRAME_SESSION_SECRET`（一串随机字符），**都要勾选「密钥」**；
5. 在 Worker → 域 里绑定自己的域名（例如 `pic.example.com`），再给它加一条登录速率限制规则；
6. 打开你的域名，输入密码即可。

之后每次推送到 main 都会自动重新部署。

## 安全

- 登录有限流：每个 IP 每分钟最多 10 次，所有来源合计每分钟最多 60 次；Workers 上使用 Cloudflare 提供、无法伪造的客户端 IP。配合域名上的 Cloudflare 速率限制规则，可以精确拦截暴力猜密码。
- 登录状态用签名 cookie 保存（HttpOnly、SameSite=Strict），有效期 30 天。
- 只允许上传图片和视频；通过面板读取的文件在沙箱中返回，不会被当成网页执行。
- 所有响应都带安全响应头：禁止被嵌入其他网站、禁止 MIME 嗅探、启用 HSTS 等。

更多建议见部署指南里的「安全建议」一节。

## 本地开发

需要 Node.js 22 和 pnpm（`corepack enable` 即可）：

```bash
pnpm install
pnpm --filter cloudframe-web dev     # 本地开发服务器
pnpm --filter cloudframe-web test    # 测试（在 Chromium 里运行）
pnpm --filter cloudframe-web lint
```

## 贡献者

- **[uncat2310](https://github.com/uncat2310)（薛定谔的猫）**：项目作者和维护者，负责 Cloudflare R2 自部署版本的改造、部署和日常使用。
- **Claude**（[Anthropic](https://www.anthropic.com) 的 AI 助手，通过 [Claude Code](https://claude.com/claude-code) 参与）：安全审查与加固、依赖漏洞升级、改名为 Cloudframe、图标和文档。相关提交都带有 `Co-Authored-By: Claude` 署名。

原项目 S3 Image Port 的作者和贡献者见下方致谢。

## 致谢

Cloudframe 基于 [yy4382](https://github.com/yy4382) 的 **[S3 Image Port](https://github.com/yy4382/s3-image-port)** 改造（同步至 v1.8.5 之后的上游代码）。上传、画廊、压缩、HEIC 和 Live Photo 等核心功能都来自原项目，非常感谢原作者的工作。

与原项目的区别：原项目是一个公共面板，S3 参数在浏览器里填写并保存在本地，支持多配置和同步。Cloudframe 只保留自部署模式，专门适配 Cloudflare R2，移除了浏览器端 S3 配置、多配置切换、配置同步和内置文档站，并加强了登录与上传的安全措施。设置说明也改为本仓库自己的文档。
