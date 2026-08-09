# Media Organizer

A **local-only** media library for organizing pictures and videos. Built with **SvelteKit**, **DaisyUI**, and **SQLite**.

- Metadata (profiles, folders, names) lives in a SQLite database: `data/media.db`
- Media bytes are stored as files under `data/files/` and streamed on upload/playback
- No Docker, no MongoDB, no cloud database — when the app is off, nothing keeps running in the background

Each **profile** has its own folders and media.

---

## Requirements (what you need)

| Tool | Why | Version |
|------|-----|---------|
| **Git** | Clone / get the project | Any recent |
| **Node.js** | Runs the app (`npm`) | **20+** (LTS recommended) |
| **A browser** | Use the UI | Chrome, Firefox, Edge, Safari |

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

### B. Install Node.js (includes `npm`)

1. Open [https://nodejs.org/](https://nodejs.org/).
2. Download the **LTS** installer (20.x or newer).
3. Install with “Add to PATH” enabled.
4. **Close and reopen** your terminal, then check:

```bash
node -v
npm -v
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
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

The first run creates `data/media.db` and `data/files/` automatically.

### 3. Open the app

Go to [http://localhost:5173](http://localhost:5173).

Create a **profile** on the welcome screen, then upload and organize media.

### 4. Stop the app

Press `Ctrl+C` in the terminal. No background database process remains.

---

## Quick checklist

```bash
cd MediaOrganizer
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## How storage works (local efficiency)

| Piece | Location | Notes |
|-------|----------|--------|
| Profiles, folders, media metadata | `data/media.db` (SQLite) | Embedded in the app process |
| Images / videos | `data/files/<id>` | Streamed to/from disk; supports multi‑GB MP4 |
| Upload | HTTP body → disk stream | Does not load whole files into RAM |
| Playback | File stream + HTTP Range | Efficient seeking for large videos |

Back up the whole `data/` folder to keep your library.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `node` / `npm` not found | Reinstall Node LTS; reopen the terminal |
| Port 5173 in use | `npm run dev -- --port 5174` |
| Upload / APIs return 401 | Create or select a profile first |
| `better-sqlite3` build errors | Use Node 20+ LTS; on Windows, a normal Node install is enough (prebuilds) |
| Lost library after moving the project | Copy the `data/` directory with the project |

---

## Production build (still local)

```bash
npm run build
npm run preview
```

Still uses local `data/` — this project is not intended for remote production servers.

---

## What you can do

### Profiles

- Create and switch profiles from the welcome screen or the sidebar header
- Delete a profile (removes that profile’s folders, media rows, and files)
- Each profile only sees its own library

### Library & folders

- **All media** view, plus a nested folder tree (VS Code–style)
- Create root folders or subfolders (`+` on the Folders header or on a folder row)
- Drag folders into folders; drag media onto folders
- Right‑click a folder: copy name, rename, duplicate, move, new subfolder, delete

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
- Multi‑select to move, download, duplicate, cut/copy, or delete

### Media context menu (right‑click)

| Action | Notes |
|--------|--------|
| Copy / Cut | Clipboard for paste |
| Duplicate | Immediate copy in the current folder |
| Move to… | Submenu of folders / unfiled |
| Copy name | System clipboard |
| Rename | Single item |
| Download | One or many |
| Delete | Confirms first |

Empty area: **Paste**, **Upload…**

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + C | Copy |
| Ctrl/Cmd + X | Cut |
| Ctrl/Cmd + V | Paste (copy → duplicate, cut → move) |
| F2 | Rename |
| Delete | Delete selection |

---

## Project scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run check` | Typecheck / Svelte check |

---

## Tech stack

- **SvelteKit** + **Svelte 5** (runes)
- **Tailwind CSS** + **DaisyUI**
- **SQLite** (`better-sqlite3`) for metadata
- **Local filesystem** under `data/files/` for media bytes
