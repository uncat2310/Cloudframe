# Settings reference

English · [简体中文](settings.md)

Cloudframe keeps its upload and gallery settings in each browser, so a new device starts from the defaults. The bucket, public URL and login password are configured on the server; see the [deployment guide](../selfhost/README.md) (in Chinese).

<a id="upload-settings"></a>

## Upload settings

### Image conversion and compression

Convert or compress images before uploading. Off by default (images are uploaded as they are).

| Option        | Description                                                                            |
| ------------- | -------------------------------------------------------------------------------------- |
| Target format | `WebP`, `AVIF`, `JPEG` or `PNG`. The file extension changes with the format            |
| Quality       | An integer from 1 to 100; higher is sharper and larger. `PNG` is lossless and has none |

Compression runs in your browser, not on the server. In the upload list you can recompress a single image, or edit its name before uploading.

> If very large images occasionally fail to upload, turning on compression usually fixes it (the Workers free plan limits CPU time per request).

<a id="key-template"></a>

## Key (name) template

The template decides an image's path and file name in the bucket, which is the part of the image URL after the domain. The default is:

```
i/{{year}}/{{month}}/{{day}}/{{ulid-dayslice}}.{{ext}}
```

Uploading `photo.jpg` gives a name like `i/2026/10/20/bzrxwg-gabb.jpg`.

### Placeholders

| Placeholder         | Replaced with                                                              | Example         |
| ------------------- | -------------------------------------------------------------------------- | --------------- |
| `{{year}}`          | Year of upload (4 digits)                                                  | `2026`          |
| `{{month}}`         | Month (2 digits)                                                           | `10`            |
| `{{day}}`           | Day (2 digits)                                                             | `20`            |
| `{{timestamp}}`     | Unix timestamp in milliseconds                                             | `1792483583079` |
| `{{filename}}`      | The original file name up to its first `.`                                 | `photo`         |
| `{{ext}}`           | File extension (no `.`, lowercase); after conversion, the new format's one | `jpg`, `webp`   |
| `{{ulid}}`          | A full ULID: globally unique and time-ordered                              | `01JAB3...`     |
| `{{ulid-dayslice}}` | A slice of a ULID (6 + 4 characters), unique within a day                  | `bzrxwg-gabb`   |

Tips:

- **End with `.{{ext}}`** so the extension matches the real format and browsers display the file correctly.
- `{{ulid-dayslice}}` is only unique within a day, so use it together with `{{year}}/{{month}}/{{day}}`; on its own, use `{{ulid}}`.
- `{{filename}}` alone lets files with the same name overwrite each other; add a time or ULID, e.g. `{{filename}}-{{timestamp}}.{{ext}}`.
- `{{random}}` is an old spelling of `{{ulid-dayslice}}`; use the latter.

### Default template and presets

- **Default template**: used for every upload. Click Edit in the upload list to rename just one image.
- **Presets**: save templates you use often and make one the default with a click.
- The preset marked **System** is the built-in default template above; it is always available and cannot be deleted.
- With `CLOUDFRAME_KEY_TEMPLATE` set on the server, browsers opening the panel for the first time use it as their default template.

<a id="gallery-settings"></a>

## Gallery settings

| Option       | Description                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto refresh | On by default: the file list is fetched again each time the gallery opens. When off, the cached list is used; click Refresh above the gallery when needed |

In the gallery you can also:

- **Search** by file name (path), fuzzy; results are ordered by match.
- **Filter** by path prefix (browse like folders) or by upload date.
- **Sort** by date or name, ascending or descending.
- **Act on several images**: select the current page (Ctrl+A), copy the selected URLs, delete in bulk.
- **Act on one image**: open, view info, copy URL or Markdown, download, rename, delete.

With `CLOUDFRAME_THUMBNAILS=cloudflare` on the server, gallery tiles show thumbnails (at most 800px on the longer side); opening an image, copying its link and downloading use the original, and a thumbnail that fails to load falls back to the original.

To show only files under one prefix, set `R2_INCLUDE_PATH` on the server (e.g. `i/`); see the [deployment guide](../selfhost/README.md).
