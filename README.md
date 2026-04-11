# FileDrop

**Free temporary file sharing** — Share files and text with a temporary link. Password protection, auto-expiration, zero permanent storage.

**[Use it now → drop.purvanas.fr](https://drop.purvanas.fr)**

A self-hosted, privacy-focused alternative to WeTransfer, Smash, and SwissTransfer.

## Features

- **File sharing**: upload up to 500 MB, get a shareable link
- **Text/paste sharing**: share code snippets, notes, text
- **Password protection**: optional password on any upload
- **Auto-expiration**: 15 min to 24 hours, files are deleted automatically
- **Chunked upload**: large files are uploaded in 5 MB chunks (works through Cloudflare)
- **No account required**: upload, share, done
- **Privacy**: no tracking, no cookies, no analytics

## Tech Stack

- **Backend**: Node.js, Express, Multer
- **Frontend**: Vanilla HTML/CSS/JS (single file)
- **Storage**: local filesystem with auto-cleanup
- **Hosting**: Self-hosted on Ubuntu Server, behind Cloudflare Tunnel

## Self-hosting

```bash
git clone https://github.com/Purvanas/file-drop.git
cd file-drop
npm install
node server.js
```

Runs on port 3200 by default.

## License

MIT

## Links

- **Live demo**: [drop.purvanas.fr](https://drop.purvanas.fr)
- **Author**: [Purvanas](https://purvanas.fr)
- **Other tools**: [Universal Downloader](https://dl.purvanas.fr) · [QR Generator](https://qr.purvanas.fr) · [Converter](https://convert.purvanas.fr) · [Photo Editor](https://edit.purvanas.fr)
