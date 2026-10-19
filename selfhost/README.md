# 部署指南：Cloudflare R2 开箱即用

这是 S3 Image Port 的个人自用版本：

- **只需登录密码**：R2 的访问权限保存在服务器端，浏览器打开后输入密码即可使用，换设备、换浏览器都不用再填参数。
- **不需要配置 CORS**：浏览器只访问面板自己的域名，由服务器代为访问 R2；HEIC 图片和 Live Photo 也经由服务器转发。
- **密钥不出服务器**：浏览器拿不到任何 R2 凭据。
- 图片展示、复制链接仍然直接使用 R2 的公开地址，不经过面板。

「上传」「画廊」设置（路径模板、压缩等）保存在各自的浏览器中。

有三种部署方式：

| 方式                                                   | 费用         | 需要                                |
| ------------------------------------------------------ | ------------ | ----------------------------------- |
| [Cloudflare Workers](#2-部署到-cloudflare-workers免费) | 个人使用免费 | Cloudflare 账号，不需要 R2 API 令牌 |
| [Docker](#3-用-docker-部署vps-或电脑)                  | 服务器费用   | VPS 或常开的电脑，R2 API 令牌       |
| [直接运行 Node](#4-不用-docker直接在电脑上运行)        | 无           | Node.js 22，R2 API 令牌             |

## 1. 准备 R2

1. **创建存储桶**：Cloudflare 控制台 → R2 → 创建存储桶。
2. **开启公开访问**：进入存储桶 → 设置 → 公开访问，二选一：

   - 连接自定义域名（推荐，可走 Cloudflare 缓存），例如 `https://img.example.com`；
   - 或启用 `r2.dev` 子域名（Cloudflare 有速率限制，仅适合轻量使用）。

   记下这个地址，后面填到 `R2_PUBLIC_URL`。

3. **（仅 Docker / Node 需要）创建 API 令牌**：R2 概览页 → 管理 API 令牌 → 创建 API 令牌，权限选「对象读和写」，并限定到这个存储桶。记下 **访问密钥 ID**、**机密访问密钥**，以及概览页上的 **账户 ID**。

> 不需要给存储桶配置 CORS 规则。

## 2. 部署到 Cloudflare Workers（免费）

Worker 通过 **R2 绑定** 直接读写存储桶，不需要创建 API 令牌；访问地址自带 HTTPS。

### 2.1 修改配置

在你的仓库里编辑 `apps/web/wrangler.jsonc`，改两处后提交：

```jsonc
"bucket_name": "my-image-bucket",              // 你的存储桶名称
"R2_PUBLIC_URL": "https://img.example.com",    // 存储桶的公开访问地址
```

`binding` 必须保持为 `BUCKET`。`name`（Worker 名称，默认 `s3-image-port`）可以按需修改。

### 2.2 方式 A：在 Cloudflare 后台连接 GitHub（推荐，不用装任何工具）

1. Cloudflare 控制台 → Workers 和 Pages → 创建 → 导入 Git 仓库，选择你的仓库。
2. 构建设置：
   - **项目名称**：与 `wrangler.jsonc` 里的 `name` 一致（默认 `s3-image-port`）
   - **构建命令**：`pnpm --filter s3-image-port-web build:worker`
   - **部署命令**：`pnpm --filter s3-image-port-web deploy:worker`
   - **根目录**：保持默认（仓库根目录）
3. 首次部署完成后，进入该 Worker → 设置 → 变量和机密 → 添加，类型选 **机密（Secret）**，名称 `S3IP_PASSWORD`，值为你的登录密码。
4. 打开 `https://s3-image-port.<你的子域>.workers.dev`，输入密码即可。也可以在 Worker 设置里绑定自己的域名。

之后每次推送到仓库都会自动重新部署。（后台菜单名称可能随 Cloudflare 更新略有不同。）

### 2.3 方式 B：在电脑上用命令行部署

需要 Node.js 22 和 pnpm（`corepack enable` 即可）：

```bash
pnpm install
pnpm --filter s3-image-port-web build:worker
cd apps/web
npx wrangler@4 login                 # 浏览器里授权一次
pnpm deploy:worker
npx wrangler@4 secret put S3IP_PASSWORD -c .output/server/wrangler.json
```

### 2.4 Workers 上的可选变量

在 Worker 设置 → 变量和机密里添加（`wrangler.jsonc` 开启了 `keep_vars`，重新部署不会清掉它们）：

| 变量                  | 说明                                           |
| --------------------- | ---------------------------------------------- |
| `R2_INCLUDE_PATH`     | 画廊只显示该前缀下的文件，例如 `i/`            |
| `S3IP_KEY_TEMPLATE`   | 新浏览器的默认上传路径模板                     |
| `R2_BUCKET`           | 仅用于在设置页显示存储桶名称                   |
| `S3IP_SESSION_SECRET` | 登录会话签名密钥（机密），设置后与密码共同签名 |

### 2.5 免费额度

个人图床一般用不完：Workers 免费版每天 10 万次请求，每次请求 10 ms CPU 时间（等待 R2 的时间不计）；R2 每月免费 10 GB 存储、100 万次写类操作、1000 万次读类操作，流量免费。

如果上传特别大的图片时偶尔失败，可能是超出了单次请求的 CPU 时间，可以先在上传设置里开启压缩，或升级 Workers 付费版。

## 3. 用 Docker 部署（VPS 或电脑）

需要 Docker 和 Docker Compose。

```bash
git clone <你的仓库地址> s3-image-port
cd s3-image-port/selfhost
cp .env.example .env
# 编辑 .env，填写第 1 步得到的信息和登录密码
docker compose up -d --build
```

浏览器打开 `http://服务器IP:3000`，输入 `S3IP_PASSWORD` 即可。登录状态保存 30 天；修改密码后所有浏览器都需要重新登录。

更新版本：

```bash
git pull
docker compose up -d --build
```

## 4. 不用 Docker，直接在电脑上运行

需要 Node.js 22 和 pnpm：

```bash
pnpm install
pnpm --filter s3-image-port-web build
cp selfhost/.env.example selfhost/.env   # 然后编辑
node --env-file=selfhost/.env apps/web/.output/server/index.mjs
```

默认监听 3000 端口，可以用 `PORT` 修改。

## Docker / Node 的环境变量

| 变量                   | 必填 | 说明                                                                      |
| ---------------------- | ---- | ------------------------------------------------------------------------- |
| `S3IP_PASSWORD`        | 是   | 面板登录密码                                                              |
| `R2_ACCOUNT_ID`        | 是\* | Cloudflare 账户 ID，用来拼出 S3 Endpoint                                  |
| `R2_ACCESS_KEY_ID`     | 是   | API 令牌的访问密钥 ID                                                     |
| `R2_SECRET_ACCESS_KEY` | 是   | API 令牌的机密访问密钥                                                    |
| `R2_BUCKET`            | 是   | 存储桶名称                                                                |
| `R2_PUBLIC_URL`        | 是   | 公开访问地址（自定义域名或 r2.dev 地址）                                  |
| `R2_INCLUDE_PATH`      | 否   | 画廊只显示该前缀下的文件，例如 `i/`                                       |
| `S3IP_KEY_TEMPLATE`    | 否   | 新浏览器的默认上传路径模板                                                |
| `R2_ENDPOINT`          | 否   | 覆盖 Endpoint（\*设置后可不填 `R2_ACCOUNT_ID`），如欧盟区域的 `.eu.` 地址 |
| `S3IP_SESSION_SECRET`  | 否   | 登录会话签名密钥，默认使用 `R2_SECRET_ACCESS_KEY`                         |
| `PORT`                 | 否   | 监听端口，默认 3000                                                       |

配置不完整时，面板会直接列出缺少或填错的变量，服务器日志里也会打印。

## 安全建议

- 密码就是你存储桶的钥匙，请用足够长的随机密码。登录接口按 IP 限制为每分钟 10 次。
- Workers 自带 HTTPS。Docker / Node **暴露到公网时请加 HTTPS**，否则密码会明文传输。例如用 Caddy 反向代理（自动申请证书）：

  ```
  panel.example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

  这时把 `docker-compose.yml` 里的端口改成 `"127.0.0.1:3000:3000"`，只允许通过反向代理访问。也可以用 Cloudflare Tunnel。

- 只在自己电脑或局域网使用时，直接访问 `http://localhost:3000` 即可。

## 流量说明

上传、删除、重命名、列出文件，以及 HEIC 和 Live Photo 的读取会经过面板（Worker 或你的服务器）；普通图片的展示和外链直接走 R2 公开地址，不经过面板。
