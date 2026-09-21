# PatternDrop

An app for transferring clothing drawings from paper to your computer’s browser.

## How it works

1. The computer generates a random 16-character session ID and displays a QR code.
2. The QR code opens a mobile page with the same ID—no account or sign-in required.
3. The phone estimates the paper color from local image tiles and uses a Canvas flood fill starting at the image edges. Only the connected outer background is removed; light areas inside closed drawing outlines are preserved.
4. Each processed PNG is stored in `.data/images`; its session and dimensions are stored in `.data/patterndrop.sqlite`.
5. The desktop page polls the API and displays all drawings in the session in an inventory grid. Selecting a drawing opens a preview that fits within the screen.
6. In the **Character** tab, you can drag drawings into RPG-style equipment slots and overlay them on a boy or girl model. Equipped items can be freely moved with a mouse or finger, scaled, and rotated in 1° increments.

The workflow does not use ChatGPT, the OpenAI API, or third-party recognition services.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

The required Node.js version is declared in `package.json` under `engines.node`. npm commands use the Node.js version active in your environment.

The app creates `.data/patterndrop.sqlite` and `.data/images` automatically. Set `PATTERNDROP_DATA_DIR` to store them elsewhere.

Set the URL encoded in the QR code in `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://192.168.0.164:3000
```

After startup, the terminal displays two addresses: `Local` and `Network`. Open the **Network URL** on your computer (for example, `http://192.168.1.42:3000`) to use it in the QR code when no URL is configured in `.env.local`. Your phone and computer must be on the same Wi-Fi network. No internet deployment is needed.

If macOS asks whether Node.js may accept incoming connections, allow it. On guest Wi-Fi networks, client isolation may block communication between devices.

## Main components

- `app/studio.tsx` — transfer interface and session lifecycle.
- `app/character-menu.tsx` — character equipment interface.
- `app/process-image.ts`, `app/remove-paper.ts` — on-device image processing.
- `app/*.types.ts`, `app/types.ts` — shared domain types.
- `app/constants.ts`, `shared/constants.ts` — UI settings and API limits.
- `app/api/sessions/[...path]/route.ts` — session API entry point.
- `server/storage.ts` — local SQLite database and image-file storage.
- `server/sessions.ts` — session API, PNG uploads, and image delivery.
- `db/schema.ts` — SQLite metadata schema.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```
