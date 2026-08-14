# Media Organizer

A **local-only** media library for organizing pictures and videos. Built with **SvelteKit**, **DaisyUI**, **Drizzle**, and **SQLite**.

- Metadata (profiles, albums, names) lives in a SQLite database: `data/media.db`
- Media bytes are stored as files under `data/files/` and streamed on upload/playback
- No Docker, no MongoDB, no cloud database — when the app is off, nothing keeps running in the background

Each **profile** has its own albums and media. Passcodes are **optional** per profile.

---

## Requirements (what you need)

| Tool          | Why                     | Version                       |
| ------------- | ----------------------- | ----------------------------- |
| **Git**       | Clone / get the project | Any recent                    |
| **Node.js**   | Runs the app            | **20+** (LTS recommended)     |
| **pnpm**      | Installs dependencies   | **11+** (`corepack enable`)   |
| **A browser** | Use the UI              | Chrome, Firefox, Edge, Safari |

No Docker or MongoDB install is required.

---

## Install from scratch (nothing installed yet)

Skip any step for tools you already have.

### A. Install Git

**Windows**

1. Download from [https://git-scm.com/download/win](https://git-scm.com/download/win).
2. Run the installer (defaults are fine).
3. Check in PowerShell or Git Bash:

```bash
git --version
```

**macOS**

```bash
xcode-select --install
# or: brew install git
```

**Linux (Debian/Ubuntu)**

```bash
sudo apt update
sudo apt install -y git
git --version
```

### B. Install Node.js and pnpm

1. Open [https://nodejs.org/](https://nodejs.org/).
2. Download the **LTS** installer (20.x or newer).
3. Install with “Add to PATH” enabled.
4. **Close and reopen** your terminal, then check:

```bash
node -v
corepack enable
pnpm -v
```

Optional: [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows), or `brew install node` on macOS.

### C. Get the project

```bash
git clone <your-repo-url> MediaOrganizer
cd MediaOrganizer
```

Or:

```bash
cd path/to/MediaOrganizer
```

---

## Step-by-step: run the app

### 1. Install project dependencies

```bash
pnpm install
```

### 2. Start the dev server

```bash
pnpm dev
```

The first run creates `data/media.db` and `data/files/` automatically.

### 3. Open the app

Go to [http://localhost:5173](http://localhost:5173).

Create a **profile** on the welcome screen, then upload and organize media.

### Optional: UI defaults via `.env`

Copy [`.env.example`](.env.example) to `.env` (or `.env.local`) to customize install-time defaults such as default view, columns, filters, album view, warn-duplicates, theme, and upload concurrency. Restart the dev server after changes. Theme and Upload settings toggles still persist in `localStorage` after the user changes them in the UI.

### 4. Stop the app

Press `Ctrl+C` in the terminal. No background database process remains.

---

## Quick checklist

```bash
cd MediaOrganizer
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## How storage works (local efficiency)

| Piece                            | Location                 | Notes                                        |
| -------------------------------- | ------------------------ | -------------------------------------------- |
| Profiles, albums, media metadata | `data/media.db` (SQLite) | Embedded in the app process                  |
| Images / videos                  | `data/files/<id>`        | Streamed to/from disk; supports multi‑GB MP4 |
| Upload                           | HTTP body → disk stream  | Does not load whole files into RAM           |
| Playback                         | File stream + HTTP Range | Efficient seeking for large videos           |

Back up the whole `data/` folder to keep your library.

---

## Troubleshooting

| Problem                               | What to try                                                               |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `node` / `pnpm` not found             | Reinstall Node LTS; run `corepack enable`; reopen the terminal            |
| Port 5173 in use                      | `pnpm dev -- --port 5174`                                                 |
| Upload / APIs return 401              | Create or select a profile first                                          |
| `better-sqlite3` build errors         | Use Node 20+ LTS; on Windows, a normal Node install is enough (prebuilds) |
| Lost library after moving the project | Copy the `data/` directory with the project                               |

---

## Production build (still local)

```bash
pnpm build
pnpm preview
```

Still uses local `data/` — this project is not intended for remote production servers.

---

## What you can do

### Profiles

- Create and switch profiles from the welcome screen or the sidebar header
- Delete a profile (removes that profile’s albums, media rows, and files)
- Each profile only sees its own library

### Library & albums

- **All media**, **Unassigned**, and a flat list of **albums** — media can belong to any number of albums (many‑to‑many)
- Create an album (`+` on the Albums header)
- Drag media onto an album to add it (additive; media keeps its other album memberships)
- Right‑click an album: copy name, rename, duplicate, delete (deleting an album only removes the membership — media itself is kept)

### Upload & playback

- Upload via **Upload**, drag‑and‑drop, or empty‑area context menu
- Images and videos (including large **H.264 / AV1 MP4** files) with upload progress
- Double‑click a card to open the lightbox (videos play there)

### Browse & filter

- **Grid** or **Collage** layout
- Column slider in grid view (2–8 columns)
- Filter by **Pictures** / **Videos** and date range
- Light / dark theme toggle

### Selection & organization

- Click to select; **Ctrl/Cmd** toggle; **Shift** range select
- Drag on empty space for a Windows‑style **marquee** selection
- Multi‑select to add to an album, download, duplicate, cut/copy, or delete

### Media context menu (right‑click)

| Action              | Notes                                                 |
| ------------------- | ----------------------------------------------------- |
| Copy / Cut          | Clipboard for paste                                   |
| Duplicate           | Immediate copy in the current album                   |
| Add to album…       | Alphabetical popup; multi‑select albums, then confirm |
| Copy name           | System clipboard                                      |
| Rename              | Single item                                           |
| Download            | One or many                                           |
| Compress (AV1/AVIF) | Manual re‑encode (see Compression below)              |
| Delete              | Confirms first                                        |

Empty area: **Paste**, **Upload…**

### Upload settings

The toolbar **Upload settings** group (separate from filters) has:

| Setting             | Default | Effect                                                                                                                                                 |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warn duplicates** | on      | If a file name already exists in the library (or twice in the same batch), ask before saving a duplicate. Turn off to always upload without prompting. |

### Compression

Uploads are stored as-is. There is **no** background or on-upload recompress.

**Manual Compress** (selection bar or right‑click) re‑encodes selected items on demand (videos → AV1 MP4, images → AVIF). Smaller result wins; if compression does not shrink the file, the original is kept. AV1 encoding is CPU‑heavy (libaom).

### Keyboard shortcuts

| Shortcut     | Action                               |
| ------------ | ------------------------------------ |
| Ctrl/Cmd + C | Copy                                 |
| Ctrl/Cmd + X | Cut                                  |
| Ctrl/Cmd + V | Paste (copy → duplicate, cut → move) |
| F2           | Rename                               |
| Delete       | Delete selection                     |

---

## Project scripts

| Command        | Description                  |
| -------------- | ---------------------------- |
| `pnpm dev`     | Dev server with HMR          |
| `pnpm build`   | Production build             |
| `pnpm preview` | Preview the production build |
| `pnpm check`   | Typecheck / Svelte check     |
| `pnpm format`  | Format with Prettier         |

---

## Tech stack

- **SvelteKit** + **Svelte 5** (runes)
- **Tailwind CSS** + **DaisyUI**
- **Drizzle ORM** + **SQLite** (`better-sqlite3`) for metadata
- **@lucide/svelte** for icons
- **Prettier** for formatting
- **pnpm** for packages
- **Local filesystem** under `data/files/` for media bytes
- **ffmpeg-static** + **sharp** for duration/size probes and optional manual AV1 / AVIF compression
