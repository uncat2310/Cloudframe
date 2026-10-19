# S3 Image Port

> **个人 Fork** · 已同步上游至 **v1.8.5**（2026-04-30）

[English](README.md) · [简体中文](README-zh.md)

S3 Image Port 是一个控制面板，用于管理 AWS S3 存储桶或 S3 兼容服务
（如 Cloudflare R2、DigitalOcean Spaces、腾讯 COS、阿里云 OSS 等）中的图片。

> 与传统的图床服务不同，S3 Image Port 既不负责储存图片，也不负责提供图片的访问服务，只负责管理图片。
>
> 我们开发本项目时是希望提供一个**没有供应商锁定**的图床解决方案：您的图片存储在与我们项目**无关**的一个 S3 存储桶中，即使 `S3 Image Port` 停止维护（短时间内不会发生）或者您不想使用 `S3 Image Port` 了，您也不需要进行任何迁移。

传统上这些存储服务没有专门的图片管理面板，该解决方案为图片的上传、管理和集成提供了一个简单而强大的界面。

本面板本身不存储任何数据，所有数据都存储在您的 S3 存储桶中。因此，您可以随时迁移或删除本面板，而不会丢失任何数据。

前往 <https://imageport.app>，您只需在 “设置 ”选项卡下输入特定的 S3 设置，即可立即开始使用。

## 特性和功能

- :cloud: **上传图片**：轻松上传您的图片，支持上传前压缩及格式转换。
- :framed_picture: **图库**：在图库中浏览和查找所有您已经上传的图片，支持丰富的过滤选项。
- :link: **复制图片地址**：只需一次点击，就可以复制图片的纯链接或 Markdown 格式链接。
- :wastebasket: **删除图片**：在管理面板中快速删除您已上传的图片。

## S3 Image Port 不是图床

`S3 Image Port` 不是一个传统意义上的图床服务。

一般来说，图床服务一般指的是提供图片上传、存储和访问传输的服务，而 `S3 Image Port` 不存储图片也不干涉图片访问流程，这有几点好处：

- 图片存放在您自己的 S3 储存桶中，访问也不流经本项目，这意味着即使本项目突然消失，您的图片访问也不会中断（更不会有数据丢失）。
- 传统图床除了存储图片本身外，一般还有一个数据库存储各种元信息，如果丢失了数据、仅剩下图片备份，很难完全恢复到之前状态（比如 URL 和 文件路径之间的对应可能依赖与这个数据库）。
- **完全可以自定义的访问路径**：由于 `S3 Image Port` 并不特别关心图片是怎么被访问的，因此您可以完全控制图片 URL。

## 使用方法

在使用本面板前，请在 “设置” 选项卡中配置您的 S3 存储桶设置。更详细的指引，请参考我们的 [入门文档](https://docs.imageport.app/zh/guide/getting-started)。

关于获取 S3 相关密钥，请参考存储服务提供商的文档。如果您使用的是 Cloudflare R2 Storage，可以查看文档站的 [Cloudflare R2 逐步指南](https://docs.imageport.app/zh/guide/for-cloudflare-r2)。

您也可以在一定程度上自定义此应用面板。进入 "设置 "页面，您可以配置一些重要选项。

### 自部署：服务器预设配置

S3 配置保存在浏览器的 localStorage 中，换浏览器、换设备、清除站点数据或者换了访问域名（比如 Vercel 每次部署生成的预览地址）后都需要重新填写。

自部署时可以把配置放在服务器环境变量里（如 Vercel 的 Environment Variables），新浏览器打开上传/图库页时，弹出的「S3 配置不正确」对话框中会出现「加载预设配置」，输入访问密码即可一键载入：

| 环境变量                        | 说明                                   |
| ------------------------------- | -------------------------------------- |
| `S3IP_PRESET_PASSWORD`          | 访问密码（必填，未设置则不启用此功能） |
| `S3IP_PRESET_ENDPOINT`          | S3 Endpoint（必填）                    |
| `S3IP_PRESET_BUCKET`            | 存储桶名（必填）                       |
| `S3IP_PRESET_REGION`            | 区域，默认 `auto`                      |
| `S3IP_PRESET_ACCESS_KEY_ID`     | Access Key ID（必填）                  |
| `S3IP_PRESET_SECRET_ACCESS_KEY` | Secret Access Key（必填）              |
| `S3IP_PRESET_PUBLIC_URL`        | 图片公开访问地址（必填）               |
| `S3IP_PRESET_FORCE_PATH_STYLE`  | 设为 `true` 启用 path-style            |
| `S3IP_PRESET_INCLUDE_PATH`      | 图库只显示该前缀下的图片（可选）       |
| `S3IP_PRESET_KEY_TEMPLATE`      | 上传路径模板（可选）                   |
| `S3IP_PRESET_PROFILE_NAME`      | 载入后的配置名，默认 `Preset`          |

密码保护的是你的 S3 密钥，请使用足够强的密码；接口按 IP 限制为每分钟 10 次尝试。

## 反馈和贡献

如果您遇到任何问题或有任何建议，请随时提出 [Issue](https://github.com/yy4382/s3-image-port/issues/new/choose)。

如果您有关于新功能的想法，也可以创建一个 [Issue](https://github.com/yy4382/s3-image-port/issues/new/choose)，任何想法都不会太牵强！
