<p align="center"><img src="apps/web/public/favicon.svg" width="72" alt=""></p>

# Cloudframe

[English](README.md) · [简体中文](README-zh.md)

A frame in the cloud: a private image-hosting panel on Cloudflare, with your images in your own R2 bucket.

- **Works out of the box**: R2 access stays on the server; the browser only needs a login password, on any device.
- **No CORS setup**: the browser only talks to the panel's own origin, which talks to R2.
- **Free to host**: deploy to Cloudflare Workers (using an R2 binding, no API token), or with Docker on a VPS or your own machine.
- Images are served straight from the bucket's public URL, so they keep working without the panel.

Features: upload with optional compression/format conversion and key templates; gallery with search, filters, HEIC and Live Photo support; copy URL/Markdown; rename, delete, download.

Deployment: see [selfhost/README.md](selfhost/README.md) (in Chinese).

## Acknowledgements

Cloudframe is built on [S3 Image Port](https://github.com/yy4382/s3-image-port) by [yy4382](https://github.com/yy4382). Uploading, the gallery, compression, HEIC and Live Photo support all come from the original project. Thank you!

Compared with it, Cloudframe only keeps the self-hosted mode and targets Cloudflare R2: browser-side S3 settings, multiple profiles, profile sync and the bundled docs site are removed. Help links for settings such as key templates still point to the original project's docs.
