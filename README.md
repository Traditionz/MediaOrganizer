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
| **Bun**       | Runtime + packages      | **1.4+**                      |
| **A browser** | Use the UI              | Chrome, Firefox, Edge, Safari |

No Docker, npm, or MongoDB install is required. Node is not required for day-to-day use (Bun runs the app).

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

### B. Install Bun 1.4+

**macOS / Linux / WSL / Git Bash**

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.4.0"
```

Add Bun to your PATH if the installer says so, then reopen the terminal:

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version
```

**Windows (PowerShell)**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
bun --version
```

Or see [https://bun.com/docs/installation](https://bun.com/docs/installation).

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
bun install
```

### 2. Start the dev server

```bash
bun run dev
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
bun install
bun run dev
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

| Problem                               | What to try                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `bun` not found                       | Install Bun 1.4+; add `~/.bun/bin` to PATH; reopen the terminal          |
| Port 5173 in use                      | `bun run dev -- --port 5174`                                             |
| Upload / APIs return 401              | Create or select a profile first                                         |
| `better-sqlite3` build errors         | Use Bun 1.4+; on Windows, a normal install is usually enough (prebuilds) |
| Lost library after moving the project | Copy the `data/` directory with the project                              |

---

## Production build (still local)

```bash
bun run build
bun run preview
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

| Command           | Description                   |
| ----------------- | ----------------------------- |
| `bun run dev`     | Dev server with HMR           |
| `bun run build`   | Production build              |
| `bun run preview` | Preview the production build  |
| `bun run check`   | Typecheck / Svelte check      |
| `bun run format`  | Format with Oxfmt             |
| `bun run lint`    | Oxlint (anti-slop + defaults) |

---

## Tech stack

- **SvelteKit** + **Svelte 5** (runes)
- **Tailwind CSS** + **DaisyUI**
- **Drizzle ORM** + **SQLite** (`better-sqlite3`) for metadata
- **@lucide/svelte** for icons
- **Oxfmt** for formatting
- **Bun 1.4+** for runtime and packages
- **Local filesystem** under `data/files/` for media bytes
- **ffmpeg-static** + **sharp** for duration/size probes and optional manual AV1 / AVIF compression
