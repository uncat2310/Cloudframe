<p align="center"><img src="apps/web/public/favicon.svg" width="72" alt=""></p>

# Cloudframe · 云框

[English](README.md) · [简体中文](README-zh.md)

云上的相框：一个部署在 Cloudflare 上的私人图床面板，图片存放在你自己的 R2 存储桶里。

- **开箱即用**：R2 的访问权限保存在服务器端，浏览器打开后输入登录密码即可，换设备、换浏览器都不用再填参数。
- **不需要配置 CORS**：浏览器只访问面板自己的域名，由服务器代为访问 R2。
- **可以免费部署**：部署到 Cloudflare Workers（通过 R2 绑定访问存储桶，不需要 API 令牌），也可以用 Docker 部署在 VPS 或电脑上。
- 图片的展示和外链直接走 R2 公开地址；即使不用这个面板了，图片也不受影响。

## 功能

- 上传图片，支持上传前压缩和格式转换，支持自定义存储路径模板
- 画廊浏览、搜索、筛选，支持 HEIC 和 Apple Live Photo
- 一键复制图片链接或 Markdown
- 重命名、删除、下载

## 部署

见 [selfhost/README.md](selfhost/README.md)。

## 致谢

Cloudframe 基于 [yy4382](https://github.com/yy4382) 的 [S3 Image Port](https://github.com/yy4382/s3-image-port)（同步至 v1.8.5 之后的上游代码）改造。上传、画廊、压缩、HEIC 和 Live Photo 等核心功能都来自原项目，感谢原作者的工作。

与原项目的区别：原项目是一个公共面板（S3 参数在浏览器里填写并保存在本地，支持多配置和同步）。Cloudframe 只保留自部署模式，专门适配 Cloudflare R2，移除了浏览器端 S3 配置、多配置切换、配置同步以及内置文档站；路径模板等设置的说明仍链接到原项目的在线文档。
