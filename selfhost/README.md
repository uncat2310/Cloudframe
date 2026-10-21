# 部署指南：Cloudflare R2 开箱即用

这是 Cloudframe 的部署说明。Cloudframe 基于 [yy4382/s3-image-port](https://github.com/yy4382/s3-image-port) 改造：

- **只需登录密码**：R2 的访问权限保存在服务器端，浏览器打开后输入密码即可使用，换设备、换浏览器都不用再填参数。
- **不需要配置 CORS**：浏览器只访问面板自己的域名，由服务器代为访问 R2；HEIC 图片和 Live Photo 也经由服务器转发。
- **密钥不出服务器**：浏览器拿不到任何 R2 凭据。
- 图片展示、复制链接仍然直接使用 R2 的公开地址，不经过面板。

「上传」「画廊」设置（路径模板、压缩等）保存在服务器上，所有浏览器登录后共用一套（Workers 上用 Workers KV，Docker / Node 上存成文件）；没有配置时则保存在各自的浏览器中。语言和主题始终跟随浏览器。

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

Worker 通过 **R2 绑定** 直接读写存储桶，不需要创建 API 令牌；访问地址自带 HTTPS。下面按「在 Cloudflare 后台连接 GitHub」的方式一步步来，全程不用安装任何工具。（后台菜单名称可能随 Cloudflare 更新略有不同。）

### 2.1 Fork 并修改配置

1. 在 GitHub 上 Fork 本仓库。
2. 编辑你仓库里的 `apps/web/wrangler.jsonc`：

   | 字段            | 说明                                                                                                                                                                    |
   | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `name`          | Worker 名称，默认 `cloudframe`。后面创建 Worker 时的「项目名称」要和它一致                                                                                              |
   | `bucket_name`   | 你的 R2 存储桶名称                                                                                                                                                      |
   | `R2_PUBLIC_URL` | 存储桶的公开访问地址，不要带结尾的 `/`。不想把域名写进公开仓库的话，可以不填这里，改在 2.3 的「变量和机密」里添加同名的「文本」变量（`keep_vars` 会在每次部署时保留它） |
   | `workers_dev`   | 是否开启 `*.workers.dev` 地址。本仓库设为 `false`，只用自定义域名访问。**没有自己的域名就改成 `true`**，否则部署后没有访问地址                                          |

   | `kv_namespaces` | 设置同步用的 Workers KV。**里面的 `id` 是本仓库作者账号下的，Fork 后必须换成你自己的**（见 2.7），或者删掉这一段，设置就改为保存在各自的浏览器中 |

   `binding` 必须保持为 `BUCKET`，`ratelimits` 里的 `LOGIN_RATE_LIMITER` 和 `kv_namespaces` 里的 `SETTINGS` 也保持不变。

3. 提交到 `main` 分支。

### 2.2 在 Cloudflare 创建 Worker

1. Cloudflare 控制台 → Workers 和 Pages → 创建 → Connect GitHub（导入 Git 仓库）。
2. 授权 Cloudflare 的 GitHub 应用时，选 **Only select repositories**，只勾选你 Fork 的这个仓库。
3. 选择仓库，填写：
   - **项目名称**：与 `wrangler.jsonc` 里的 `name` 一致（默认 `cloudframe`）
   - **构建命令**：`pnpm --filter cloudframe-web build:worker`
   - **部署命令**：`pnpm --filter cloudframe-web deploy:worker`
   - **根目录**：保持默认（`/`）
4. 点「部署」，等构建完成（大约 2 分钟）。
5. **建议关闭预览分支构建**：Worker → 设置 → 构建 → 切到「预览基础」→ 关闭「预览分支构建」→ 保存。否则以后推送到其他分支或开 PR 时，都会出现一个失败的检查。

之后每次推送到 `main` 都会自动重新部署。

### 2.3 添加登录密码和会话密钥

Worker → 设置 → 运行时变量和密钥（确认上方选中的是「生产」）→ 添加变量。每一个都要**勾选「值」输入框右侧的「密钥」复选框**，再点「添加 1 个变量并部署」：

| 名称                        | 值                                                                          |
| --------------------------- | --------------------------------------------------------------------------- |
| `CLOUDFRAME_PASSWORD`       | 你的登录密码，建议 16 位以上的随机字符                                      |
| `CLOUDFRAME_SESSION_SECRET` | 用来签名登录 cookie 的随机字符串，在终端运行 `openssl rand -base64 32` 生成 |

保存后检查一下：这两行的类型应该显示为「密钥」，值显示为「值已加密」。如果显示为「变量」并且能看到明文，说明没有勾选「密钥」，把它删掉重新添加。

> 不设置 `CLOUDFRAME_SESSION_SECRET` 也能用，但登录 cookie 只用由密码派生的密钥签名：cookie 一旦泄露，就可能被离线暴力破解出密码。设置后平时使用没有任何区别；想让所有设备立即登出时，换一个新值即可。

### 2.4 绑定自己的域名

Worker → 域 → 添加域名 → 选择你托管在 Cloudflare 上的域名 → 填子域名（例如 `pic`）→ 添加域名。DNS 记录和证书会自动创建，一两分钟后打开 `https://pic.example.com`，输入密码即可。

没有自己的域名时跳过这一步：确认 `workers_dev` 是 `true`，用 `https://<Worker 名称>.<你的子域>.workers.dev` 访问。

### 2.5 加登录限速规则（推荐，需要自定义域名）

应用自带的登录限流只是近似计数，挡不住刻意分散的请求。在域名上再加一条 Cloudflare 免费的「速率限制规则」，会精确得多：

1. 进入你的域名 → 安全性 → 安全规则 → 「速率限制规则」→ 创建规则。
2. 规则名称随意，例如 `Cloudframe login limit`。
3. 点「编辑表达式」，填入（把域名换成你的）：

   ```
   (http.host eq "pic.example.com" and http.request.uri.path eq "/api/rpc/selfHost/login")
   ```

4. 具有相同特征：IP；请求：`4`；期间：10 秒；操作：阻止；持续时间：10 秒；状态：活动。
5. 点「部署」并确认。

免费版每个域名只能有 1 条速率限制规则。要让这条规则不被绕过，`workers_dev` 需要保持 `false`，不然别人可以改走 `workers.dev` 地址。

### 2.6 画廊缩略图（推荐，需要存储桶绑定自定义域名）

画廊默认按原图加载，图片多、文件大时会很慢。开启 Cloudflare 的图片变换后，画廊里每张图只加载一张长边不超过 800 像素的缩略图（通常几十 KB），点开大图、复制链接和下载仍然是原图。

1. Cloudflare 控制台 → Images & Stream → 转换 → 找到存储桶公开地址所在的域名（例如 `example.com`）→ 右侧「…」→ 启用。
2. `wrangler.jsonc` 的 `vars` 里设置 `"CLOUDFRAME_THUMBNAILS": "cloudflare"`（本仓库已开启），推送后自动部署。

说明：

- 免费版每月 5,000 张「不同的」缩略图。每张图片只生成一种尺寸，已生成的会被缓存，个人图床一般用不完；超出后新图片的缩略图会失败，画廊会自动改为显示原图，不会产生费用。
- HEIC、SVG 和视频不生成缩略图，按原样显示。
- 存储桶只用 `r2.dev` 地址时无法开启（图片变换需要自己的域名），把 `CLOUDFRAME_THUMBNAILS` 设为 `off` 或不设置即可。

### 2.7 设置同步（推荐）

上传设置（压缩、路径模板和预设）和画廊设置默认只保存在当前浏览器里。开启同步后，它们保存在服务器上，换浏览器、换设备登录都是同一套。

1. Cloudflare 控制台 → 存储和数据库 → Workers KV → 创建 KV 命名空间，名称随意（例如 `cloudframe-settings`），数据位置保持「标准」。
2. 复制它的 ID，填到 `wrangler.jsonc` 里 `kv_namespaces` 的 `id`（`binding` 保持 `SETTINGS`），推送后自动部署。
3. 打开面板 → 设置 → 存储，「设置同步」一行显示「已开启」即可。

说明：

- 改完设置约 1 秒后自动保存，连续修改只保存一次；切回面板的标签页时会拉取其他设备上的修改，但不会覆盖当前浏览器里还没保存的修改。
- 第一次开启时，第一个登录的浏览器里的设置会成为共用的设置。
- KV 免费额度是每天 10 万次读、1,000 次写，个人使用用不完。
- 语言和主题不同步，仍然跟随各自的浏览器。

### 2.8 回收站（推荐）

在面板里删除的图片不会立刻消失，而是移到存储桶的 `.trash/` 目录（保留原路径），可以在「设置 → 回收站」里恢复或永久删除。还需要两条 Cloudflare 规则：

1. **30 天后自动清除**：R2 → 你的存储桶 → 设置 → 对象生命周期规则 → 添加：
   - 规则名称随意，例如 `Cloudframe trash purge`；
   - 前缀填 **`.trash/`**（一定要填，留空会作用于整个存储桶，30 天后删除所有图片）；
   - 勾选「在此时间之后删除上传的对象」，填 `30` 天，保存。
2. **禁止公开访问回收站**（需要自定义域名）：存储桶是公开的，回收站里的文件本来也能通过公开地址打开。进入公开地址所在的域名 → 安全性 → 安全规则 → 自定义规则 → 创建规则，点「编辑表达式」填入（把域名换成你的）：

   ```
   (http.host eq "img.example.com" and http.request.uri.path contains "/.trash/")
   ```

   操作选「阻止」，部署。面板里的回收站预览经由 Worker 读取，不受影响。

说明：一次删除很多图片时，浏览器会自动分批（每批 10 张），以免超出 Workers 免费版每个请求 50 次子请求的限制。

### 2.9 查看日志

`wrangler.jsonc` 开启了 Workers 日志（`observability`）。面板出问题时，可以在 Cloudflare 控制台 → 这个 Worker → Observability 里查看最近几天的请求和报错。

### 2.10 另一种方式：在电脑上用命令行部署

需要 Node.js 22 和 pnpm（`corepack enable` 即可）：

```bash
pnpm install
pnpm --filter cloudframe-web build:worker
cd apps/web
npx wrangler@4 login                 # 浏览器里授权一次
pnpm deploy:worker
npx wrangler@4 secret put CLOUDFRAME_PASSWORD -c .output/server/wrangler.json
npx wrangler@4 secret put CLOUDFRAME_SESSION_SECRET -c .output/server/wrangler.json
```

使用自定义域名时，部署后同样按 2.4 在后台绑定域名。

### 2.11 Workers 上的可选变量

在 Worker 设置 → 运行时变量和密钥里添加（`wrangler.jsonc` 开启了 `keep_vars`，重新部署不会清掉它们）：

| 变量                      | 说明                                              |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `R2_INCLUDE_PATH`         | 面板只能查看和操作该前缀下的文件，例如 `i/`       |
| `CLOUDFRAME_KEY_TEMPLATE` | 新浏览器的默认上传路径模板                        |
| `R2_BUCKET`               | 仅用于在设置页显示存储桶名称                      |
| `CLOUDFRAME_DATA_DIR`     | 否                                                | 上传和画廊设置的保存目录（所有浏览器共用）；Docker 镜像默认 `/data`，不设置则保存在各自的浏览器中 |
| `CLOUDFRAME_THUMBNAILS`   | `cloudflare` 开启画廊缩略图（见 2.6），默认 `off` |

`wrangler.jsonc` 里的 `LOGIN_RATE_LIMITER` 是 Cloudflare 的限流绑定，用来在 Worker 实例之间共享登录次数（近似计数），不需要额外设置。分支预览地址（`preview_urls`）默认关闭，因为预览版本会使用和正式版相同的存储桶与密码。

### 2.12 免费额度

个人图床一般用不完：Workers 免费版每天 10 万次请求，每次请求 10 ms CPU 时间（等待 R2 的时间不计）；R2 每月免费 10 GB 存储、100 万次写类操作、1000 万次读类操作，流量免费。

如果上传特别大的图片时偶尔失败，可能是超出了单次请求的 CPU 时间，可以先在上传设置里开启压缩，或升级 Workers 付费版。

## 3. 用 Docker 部署（VPS 或电脑）

需要 Docker 和 Docker Compose。

```bash
git clone <你的仓库地址> cloudframe
cd cloudframe/selfhost
cp .env.example .env
# 编辑 .env，填写第 1 步得到的信息和登录密码
docker compose up -d --build
```

浏览器打开 `http://服务器IP:3000`，输入 `CLOUDFRAME_PASSWORD` 即可。登录状态保存 30 天；修改密码后所有浏览器都需要重新登录。

上传和画廊设置保存在容器的 `/data` 目录（`docker-compose.yml` 里的 `cloudframe-data` 数据卷），重建容器不会丢失，所有浏览器共用。

更新版本：

```bash
git pull
docker compose up -d --build
```

## 4. 不用 Docker，直接在电脑上运行

需要 Node.js 22 和 pnpm：

```bash
pnpm install
pnpm --filter cloudframe-web build
cp selfhost/.env.example selfhost/.env   # 然后编辑
node --env-file=selfhost/.env apps/web/.output/server/index.mjs
```

默认监听 3000 端口，可以用 `PORT` 修改。

## Docker / Node 的环境变量

| 变量                          | 必填 | 说明                                                                                |
| ----------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `CLOUDFRAME_PASSWORD`         | 是   | 面板登录密码                                                                        |
| `R2_ACCOUNT_ID`               | 是\* | Cloudflare 账户 ID，用来拼出 S3 Endpoint                                            |
| `R2_ACCESS_KEY_ID`            | 是   | API 令牌的访问密钥 ID                                                               |
| `R2_SECRET_ACCESS_KEY`        | 是   | API 令牌的机密访问密钥                                                              |
| `R2_BUCKET`                   | 是   | 存储桶名称                                                                          |
| `R2_PUBLIC_URL`               | 是   | 公开访问地址（自定义域名或 r2.dev 地址）                                            |
| `R2_INCLUDE_PATH`             | 否   | 面板只能查看和操作该前缀下的文件，例如 `i/`                                         |
| `CLOUDFRAME_KEY_TEMPLATE`     | 否   | 新浏览器的默认上传路径模板                                                          |
| `R2_ENDPOINT`                 | 否   | 覆盖 Endpoint（\*设置后可不填 `R2_ACCOUNT_ID`），如欧盟区域的 `.eu.` 地址           |
| `CLOUDFRAME_SESSION_SECRET`   | 否   | 登录会话签名密钥，默认使用 `R2_SECRET_ACCESS_KEY`                                   |
| `CLOUDFRAME_THUMBNAILS`       | 否   | `cloudflare` 开启画廊缩略图（公开地址的域名需在 Cloudflare 上启用图片变换，见 2.6） |
| `CLOUDFRAME_CLIENT_IP_HEADER` | 否   | 反向代理传递客户端 IP 的请求头，例如 `x-forwarded-for`，见下方安全建议              |
| `PORT`                        | 否   | 监听端口，默认 3000                                                                 |

配置不完整时，面板会直接列出缺少或填错的变量，服务器日志里也会打印。

## 安全建议

- 密码就是你存储桶的钥匙，请用足够长的随机密码（16 位以上）。
- 登录限流：每个 IP 每分钟最多 10 次，所有来源合计每分钟最多 60 次。
  - Workers 上用 Cloudflare 提供、无法伪造的 `CF-Connecting-IP` 识别 IP。计数由 Cloudflare 的限流绑定在实例之间共享，但只是近似值，大量分散的新连接仍可能超出限制，所以建议再按 2.5 加上域名的速率限制规则。
  - Docker / Node 默认不信任任何转发头（客户端可以随意伪造），所有请求共用一个计数。放在反向代理后面时，把 `CLOUDFRAME_CLIENT_IP_HEADER` 设为代理写入的请求头（Caddy / Nginx 一般是 `x-forwarded-for`，Cloudflare Tunnel 是 `cf-connecting-ip`），才会按 IP 分别计数。**不要在没有代理时设置它。**
- 只能上传图片和视频（Live Photo 的 `.mov`）。
- 登录状态保存 30 天，「退出登录」只清除当前浏览器的 cookie。想让所有设备失效，修改 `CLOUDFRAME_SESSION_SECRET` 或密码即可。
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
