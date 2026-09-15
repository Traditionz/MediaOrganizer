# Media Organizer

A **local-only** media library for organizing pictures and videos. Built with **SvelteKit**, **shadcn-svelte**, **Drizzle**, and **SQLite**.

- Profile list lives in `data/registry.db`
- Each profile has its own SQLite DB and files: `data/profiles/{profileId}/media.db` + `data/profiles/{profileId}/files/`
- Media bytes are streamed on upload/playback (HTTP Range for video seek)
- No Docker, no MongoDB, no cloud database — when the app is off, nothing keeps running in the background

Each **profile** has its own albums and media. Passcodes are **optional** per profile.

---

## Requirements (what you need)

| Tool          | Why                     | Version                       |
| ------------- | ----------------------- | ----------------------------- |
| **Git**       | Clone / get the project | Any recent                    |
| **Bun**       | Runtime + packages      | **1.4+**                      |
| **A browser** | Use the UI              | Chrome, Firefox, Edge, Safari |
| **Rust** (optional) | Desktop shell (`tauri:*`) | Stable toolchain + MSVC on Windows |

No Docker, npm, or MongoDB install is required. Node is not required for day-to-day use (Bun runs the app). Production `bun run start` uses the Node adapter output (`node build`). Desktop packaging also needs **Node** on PATH at runtime (shell spawns `node` against the bundled server).

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

The first run creates `data/registry.db` and `data/profiles/` automatically.

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

| Piece                            | Location                                      | Notes                                              |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| Profile registry                 | `data/registry.db`                            | Profile names + optional passcode hashes           |
| Albums + media metadata          | `data/profiles/{id}/media.db`                 | Per-profile SQLite                                 |
| Images / videos + thumbnails     | `data/profiles/{id}/files/`                   | Streamed; supports multi‑GB MP4                    |
| Upload                           | HTTP body → disk stream                       | Does not load whole files into RAM                 |
| Playback                         | File stream + HTTP Range                      | Efficient seeking for large videos                 |
| Library list                     | Paginated (`limit`/`offset`, default 120)     | Scroll loads more; filters/sort run on the server  |

Back up the whole `data/` folder to keep your library.

Display names are encrypted at rest. Duplicate detection uses an HMAC `name_key` (exact / case-insensitive), not a full-library client scan.

---

## Troubleshooting

| Problem                               | What to try                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `bun` not found                       | Install Bun 1.4+; add `~/.bun/bin` to PATH; reopen the terminal          |
| Port 5173 in use                      | `bun run dev -- --port 5174`                                             |
| Upload / APIs return 401              | Create or select a profile first                                         |
| `better-sqlite3` build errors         | Use Bun 1.4+; on Windows, a normal install is usually enough (prebuilds) |
| Lost library after moving the project | Copy the `data/` directory with the project                              |
| Folder import fails                   | Path must be a local folder outside `data/`; use an absolute path        |

---

## Production build (still local)

```bash
bun run build
bun run start
```

Uses `@sveltejs/adapter-node` → `node build`. Still uses local `data/` — this project is not intended for remote multi-tenant servers.

`bun run preview` remains available for a quick Vite preview of the build.

---

## Desktop shell (optional Tauri)

Browser + `bun run dev` stays the easy path. Optional **Tauri 2** wraps the same app in a native window.

### Prerequisites (one-time)

| Tool | Why | Check |
| ---- | --- | ----- |
| **Bun 1.4+** | App + Vite | `bun --version` |
| **Rust stable** | Compile the shell | `rustc --version` |
| **MSVC** (Windows only) | Linker for `x86_64-pc-windows-msvc` | See below |
| **Node 20+** | Packaged app spawns `node` at runtime | `node --version` |
| **WebView2** | Windows webview (usually preinstalled) | — |

**A. Rust** — [https://rustup.rs/](https://rustup.rs/). After install, **reopen the terminal** (or Cursor) so `~/.cargo/bin` is on `PATH`.

```bash
rustc --version
cargo --version
```

If `rustc` is missing in Git Bash / Cursor:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

**B. Windows MSVC** — Install [VS Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe) and select workload **Desktop development with C++** (MSVC + Windows SDK). Without this, `cargo` may call Git’s `link` and fail. Reopen the terminal after install.

**C. Project deps**

```bash
cd path/to/MediaOrganizer
bun install
```

**D. Sanity check**

```bash
bunx tauri info
```

Expect green checks for `rustc`, `cargo`, and (on Windows) Visual Studio / Build Tools. `resources/server` must exist as an empty placeholder (shipped in the repo); `tauri:build` fills it later.

### Dev: native window + Vite

```bash
bun run tauri:dev
```

What that does:

1. Starts Vite on `http://127.0.0.1:1420` (`beforeDevCommand`).
2. Compiles the Rust shell (first run downloads crates — slow).
3. Opens a desktop window pointed at that Vite URL.

Use the app in the window. Stop with `Ctrl+C` in the terminal.

Same library data as browser dev: repo `data/`.

### Package: installer / `.exe`

Needs a successful `bun run build` plus Node on `PATH` when you **run** the packaged app.

```bash
bun run tauri:build
```

What that does:

1. `bun run build` → adapter-node output in `build/`.
2. `scripts/prepare-tauri-resources.ts` → copies `build/` into `src-tauri/resources/server` and installs production native deps (`better-sqlite3`, `sharp`, `ffmpeg-static`).
3. Compiles release Rust + bundles resources.
4. Writes installers / binaries under `src-tauri/target/release/bundle/`.

At runtime the shell starts `node` on `http://127.0.0.1:4173` and loads that URL. Desktop library data uses the bundle resource `data/` (`MEDIA_DATA_DIR`), **not** the repo `data/` folder from `bun run dev`.

### Troubleshooting

| Problem | Fix |
| ------- | --- |
| `resource path resources\server doesn't exist` | Ensure `src-tauri/resources/server/` exists (placeholder `.gitkeep`). Re-pull or `mkdir -p src-tauri/resources/server && touch src-tauri/resources/server/.gitkeep`. |
| `rustc: not installed` / command not found | Install rustup; reopen terminal; or `export PATH="$HOME/.cargo/bin:$PATH"`. |
| `linking with link.exe failed` / Git `link --help` | Install VS Build Tools with C++ workload; reopen terminal. |
| Port `1420` in use | Stop other Vite/Tauri processes, or change `devUrl` + `beforeDevCommand` port in `src-tauri/tauri.conf.json`. |
| Drag-and-drop dead in desktop window | Shell must call `disable_drag_drop_handler()` (already in `src-tauri/src/lib.rs`). Restart `tauri:dev` after Rust changes. |
| Packaged app blank / server missing | Run full `bun run tauri:build` (not only `cargo build`). Confirm `node` works on PATH. |
| Want browser instead | `bun run dev` → [http://localhost:5173](http://localhost:5173). |

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

### Upload, import & playback

- Upload via **Upload**, drag‑and‑drop, or empty‑area context menu
- **Import folder…** (empty-area context menu): paste an absolute folder path on this machine; one-shot import of images/videos (optional recursive). Does **not** watch the folder.
- Images and videos (including large **H.264 / AV1 MP4** files) with upload progress
- Double‑click a card to open the lightbox (videos play there)

### Browse & filter

- **Grid** or **Collage** layout (virtualized; only visible cards mount)
- Column slider in grid view (2–8 columns)
- Filter by **Pictures** / **Videos**, date range, search, and sort — applied **server-side** with pagination
- Scroll near the bottom to load the next page
- Trash loads only when you open the Trash view (badge count still shows)
- Light / dark theme toggle

### Selection & organization

- Click to select; **Ctrl/Cmd** toggle; **Shift** range select
- Drag on empty space for a Windows‑style **marquee** selection
- Multi‑select to add to an album, download, duplicate, cut/copy, or move to trash

### Trash

- **Move to trash** soft-deletes media (files stay on disk)
- Sidebar **Trash** view: restore or delete forever
- Items in trash longer than **30 days** are permanently deleted on page load

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
| Move to trash       | Soft delete; permanently removed after 30 days        |

Empty area: **Paste**, **Upload…**, **Import folder…** (in Trash: **Empty trash**)

### Upload settings

The toolbar **Upload settings** group (separate from filters) has:

| Setting             | Default | Effect                                                                                                                                                                                            |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warn duplicates** | on      | If a file name already exists (HMAC lookup), ask: **Skip duplicates** (default) or **Upload as duplicates**. Skipping into an album links the existing library item. Off = skip silently. |

### Compression

Uploads are stored as-is. There is **no** background or on-upload recompress.

**Manual Compress** (selection bar or right‑click) re‑encodes selected items on demand (videos → AV1 MP4, images → AVIF). Default preset is **fast** (`libaom` cpu-used 8); pass `preset: "quality"` on the API for a slower encode. Smaller result wins; if compression does not shrink the file, the original is kept.

### Keyboard shortcuts

| Shortcut     | Action                                               |
| ------------ | ---------------------------------------------------- |
| Ctrl/Cmd + C | Copy                                                 |
| Ctrl/Cmd + X | Cut                                                  |
| Ctrl/Cmd + V | Paste (copy → duplicate, cut → move)                 |
| F2           | Rename                                               |
| Delete       | Move selection to trash (or delete forever in Trash) |

---

## Project scripts

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `bun run dev`       | Dev server with HMR                              |
| `bun run build`     | Production build (adapter-node)                  |
| `bun run start`     | Run production server (`node build`)             |
| `bun run preview`   | Vite preview of the production build             |
| `bun run check`     | Typecheck / Svelte check                         |
| `bun run format`    | Format with Oxfmt                                |
| `bun run lint`      | Oxlint (anti-slop + defaults)                    |
| `bun run reinstall` | Reinstall deps + sync types                      |
| `bun run tauri:dev` | Optional desktop shell around Vite (needs Rust)  |
| `bun run tauri:build` | Package desktop app (needs Rust + Node)        |

---

## Tech stack

- **SvelteKit** + **Svelte 5** (runes)
- **Tailwind CSS** + **shadcn-svelte**
- **Drizzle ORM** + **SQLite** (`better-sqlite3`) for metadata
- **@lucide/svelte** for icons
- **Oxfmt** for formatting
- **Bun 1.4+** for runtime and packages
- **@sveltejs/adapter-node** for local production
- **Tauri 2** (optional) desktop shell around the local server
- **Local filesystem** under `data/profiles/{id}/files/` for media bytes
- **ffmpeg-static** + **sharp** for duration/size probes, thumbnails, and optional manual AV1 / AVIF compression
