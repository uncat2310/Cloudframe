# 自部署：Cloudflare R2 开箱即用

这是 S3 Image Port 的自部署模式，适合个人在 VPS 或自己电脑上使用：

- **只需登录密码**：R2 密钥保存在服务器的环境变量里，浏览器打开后输入密码即可使用，换设备、换浏览器都不用再填参数。
- **不需要配置 CORS**：浏览器只访问面板自己的域名，由服务器代为访问 R2；HEIC 图片和 Live Photo 也经由服务器转发。
- **密钥不出服务器**：浏览器拿不到 Access Key / Secret。
- 图片展示、复制链接仍然直接使用 R2 的公开地址，不经过你的服务器。

界面和功能与公共版一致；「配置文件」和「同步」在此模式下隐藏，「上传」「画廊」设置仍保存在各自的浏览器中。

## 1. 准备 R2

1. **创建存储桶**：Cloudflare 控制台 → R2 → 创建存储桶。
2. **开启公开访问**：进入存储桶 → 设置 → 公开访问，二选一：

   - 连接自定义域名（推荐，可走 Cloudflare 缓存），例如 `https://img.example.com`；
   - 或启用 `r2.dev` 子域名（Cloudflare 有速率限制，仅适合轻量使用）。

   记下这个地址，填到 `R2_PUBLIC_URL`。

3. **创建 API 令牌**：R2 概览页 → 管理 API 令牌 → 创建 API 令牌，权限选「对象读和写」，并限定到这个存储桶。记下 **访问密钥 ID** 和 **机密访问密钥**。
4. **账户 ID**：在 R2 概览页右侧可以看到。

> 无需像公共版文档那样给存储桶配置 CORS 规则。

## 2. 用 Docker 部署（VPS 或电脑）

需要 Docker 和 Docker Compose。

```bash
git clone <你的仓库地址> s3-image-port
cd s3-image-port/selfhost
cp .env.example .env
# 编辑 .env，填写上一步得到的信息和登录密码
docker compose up -d --build
```

浏览器打开 `http://服务器IP:3000`，输入 `S3IP_PASSWORD` 即可。登录状态保存 30 天；修改密码后所有浏览器都需要重新登录。

更新版本：

```bash
git pull
docker compose up -d --build
```

## 3. 不用 Docker，直接在电脑上运行

需要 Node.js 22 和 pnpm（`corepack enable` 即可）：

```bash
pnpm install
VITE_S3IP_SELF_HOST=true pnpm --filter s3-image-port-web build
cp selfhost/.env.example selfhost/.env   # 然后编辑
node --env-file=selfhost/.env apps/web/.output/server/index.mjs
```

默认监听 3000 端口，可以用 `PORT` 修改。注意构建时必须带上 `VITE_S3IP_SELF_HOST=true`，否则得到的是需要手动填写 S3 参数的公共版。

## 环境变量

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
- **暴露到公网时请加 HTTPS**，否则密码会明文传输。例如用 Caddy 反向代理（自动申请证书）：

  ```
  panel.example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

  这时把 `docker-compose.yml` 里的端口改成 `"127.0.0.1:3000:3000"`，只允许通过反向代理访问。也可以用 Cloudflare Tunnel。

- 只在自己电脑或局域网使用时，直接访问 `http://localhost:3000` 即可。

## 流量说明

上传、删除、重命名、列出文件，以及 HEIC 和 Live Photo 的读取会经过你的服务器；普通图片的展示和外链直接走 R2 公开地址，不占用服务器流量。
