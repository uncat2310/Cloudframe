# S3 Image Port (personal edition)

[English](README.md) · [简体中文](README-zh.md)

A personal image-hosting panel for Cloudflare R2, adapted from [yy4382/s3-image-port](https://github.com/yy4382/s3-image-port):

- **Works out of the box**: R2 access stays on the server; the browser only needs a login password, on any device.
- **No CORS setup**: the browser only talks to the panel's own origin, which talks to R2.
- **Free to host**: deploy to Cloudflare Workers (using an R2 binding, no API token), or with Docker on a VPS or your own machine.
- Images live in your own R2 bucket and are served from its public URL.

Features: upload with optional compression/format conversion and key templates; gallery with search, filters, HEIC and Live Photo support; copy URL/Markdown; rename, delete, download.

Deployment: see [selfhost/README.md](selfhost/README.md) (in Chinese).

Compared with upstream, this fork only keeps the self-hosted mode: browser-side S3 settings, multiple profiles, profile sync and the bundled docs site are removed.
