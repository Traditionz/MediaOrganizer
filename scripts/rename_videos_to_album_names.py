#!/usr/bin/env python3
"""
Rename videos that belong to one or more albums.

Only the Test profile is processed. Other profiles are refused.

Display name becomes:
  "{Album}.mp4"
  or "{Album A and Album B}.mp4" when in multiple albums (names sorted).

Album and media names are stored encrypted (enc:v1:). This script decrypts
album names, then writes encrypt("{Album}.mp4") back to media.original_name.

Usage (from repo root):
  python scripts/rename_videos_to_album_names.py
  python scripts/rename_videos_to_album_names.py --dry-run
  python scripts/rename_videos_to_album_names.py --profile Test
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Protocol

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REGISTRY_DB = DATA_DIR / "registry.db"
PROFILES_DIR = DATA_DIR / "profiles"
NAME_CRYPTO_CLI = ROOT / "scripts" / "nameCryptoBatch.ts"
TEST_PROFILE_NAME = "Test"


def resolve_bun() -> str:
    found = shutil.which("bun") or shutil.which("bun.cmd")
    if not found:
        raise RuntimeError("bun not found on PATH")
    return found


class NameCodec(Protocol):
    def decrypt(self, stored: str) -> str: ...
    def encrypt(self, plain: str) -> str: ...
    def decrypt_many(self, stored_list: list[str]) -> list[str]: ...
    def try_decrypt_many(self, stored_list: list[str]) -> list[str | None]: ...
    def encrypt_many(self, plains: list[str]) -> list[str]: ...


class PassthroughNameCodec:
    def decrypt(self, stored: str) -> str:
        return stored

    def encrypt(self, plain: str) -> str:
        return plain

    def decrypt_many(self, stored_list: list[str]) -> list[str]:
        return [self.decrypt(s) for s in stored_list]

    def try_decrypt_many(self, stored_list: list[str]) -> list[str | None]:
        out: list[str | None] = []
        for stored in stored_list:
            try:
                out.append(self.decrypt(stored))
            except (ValueError, RuntimeError):
                out.append(None)
        return out

    def encrypt_many(self, plains: list[str]) -> list[str]:
        return [self.encrypt(p) for p in plains]


class BunNameCodec:
    def __init__(self, cli: Path = NAME_CRYPTO_CLI, cwd: Path = ROOT) -> None:
        self.cli = cli
        self.cwd = cwd
        self._decrypt_cache: dict[str, str | BaseException] = {}

    def _batch(self, decrypt: list[str], encrypt: list[str]) -> dict[str, object]:
        payload = json.dumps({"decrypt": decrypt, "encrypt": encrypt})
        try:
            proc = subprocess.run(
                [resolve_bun(), str(self.cli)],
                input=payload,
                capture_output=True,
                text=True,
                cwd=self.cwd,
                check=False,
            )
        except FileNotFoundError as err:
            raise RuntimeError("bun not found on PATH") from err
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "bun name crypto failed").strip()
            raise RuntimeError(err)
        try:
            data = json.loads(proc.stdout)
        except json.JSONDecodeError as err:
            raise RuntimeError(f"bun name crypto returned invalid JSON: {err}") from err
        if not isinstance(data, dict):
            raise RuntimeError("bun name crypto returned invalid JSON")
        return data

    def _parse_decrypt_item(self, stored: str, item: object, *, store_error: bool) -> str:
        if not isinstance(item, dict) or not item.get("ok"):
            err = ValueError(str(item.get("error") if isinstance(item, dict) else "decrypt failed"))
            if store_error:
                self._decrypt_cache[stored] = err
            raise err
        value = item.get("value")
        if not isinstance(value, str):
            raise RuntimeError("bun name crypto decrypt value missing")
        self._decrypt_cache[stored] = value
        return value

    def decrypt_many(self, stored_list: list[str]) -> list[str]:
        results: list[str | None] = [None] * len(stored_list)
        pending: list[str] = []
        pending_idx: list[int] = []
        for i, stored in enumerate(stored_list):
            cached = self._decrypt_cache.get(stored)
            if isinstance(cached, BaseException):
                raise cached
            if isinstance(cached, str):
                results[i] = cached
                continue
            pending.append(stored)
            pending_idx.append(i)
        if pending:
            data = self._batch(pending, [])
            items = data.get("decrypted")
            if not isinstance(items, list) or len(items) != len(pending):
                raise RuntimeError("bun name crypto missing decrypt result")
            for stored, item, idx in zip(pending, items, pending_idx, strict=True):
                results[idx] = self._parse_decrypt_item(stored, item, store_error=True)
        return [r if r is not None else "" for r in results]

    def try_decrypt_many(self, stored_list: list[str]) -> list[str | None]:
        out: list[str | None] = [None] * len(stored_list)
        pending: list[str] = []
        pending_idx: list[int] = []
        for i, stored in enumerate(stored_list):
            cached = self._decrypt_cache.get(stored)
            if isinstance(cached, BaseException):
                out[i] = None
                continue
            if isinstance(cached, str):
                out[i] = cached
                continue
            pending.append(stored)
            pending_idx.append(i)
        if pending:
            data = self._batch(pending, [])
            items = data.get("decrypted")
            if not isinstance(items, list) or len(items) != len(pending):
                raise RuntimeError("bun name crypto missing decrypt result")
            for stored, item, idx in zip(pending, items, pending_idx, strict=True):
                try:
                    out[idx] = self._parse_decrypt_item(stored, item, store_error=True)
                except (ValueError, RuntimeError) as err:
                    self._decrypt_cache[stored] = err
                    out[idx] = None
        return out

    def encrypt_many(self, plains: list[str]) -> list[str]:
        if not plains:
            return []
        data = self._batch([], plains)
        items = data.get("encrypted")
        if not isinstance(items, list) or len(items) != len(plains) or any(
            not isinstance(x, str) for x in items
        ):
            raise RuntimeError("bun name crypto missing encrypt result")
        return [str(x) for x in items]

    def decrypt(self, stored: str) -> str:
        return self.decrypt_many([stored])[0]

    def encrypt(self, plain: str) -> str:
        return self.encrypt_many([plain])[0]


def album_filename(album_names: list[str]) -> str:
    names = sorted({n.strip() for n in album_names if n and n.strip()}, key=str.casefold)
    if not names:
        raise ValueError("no album names")
    return f'{" and ".join(names)}.mp4'


def load_profiles(registry: Path) -> list[tuple[str, str]]:
    if not registry.is_file():
        raise FileNotFoundError(f"Registry not found: {registry}")
    conn = sqlite3.connect(registry)
    try:
        rows = conn.execute("SELECT id, name FROM profiles").fetchall()
        return [(str(row[0]), str(row[1])) for row in rows]
    finally:
        conn.close()


def resolve_test_profile_id(
    registry: Path,
    profile_arg: str | None,
    *,
    allowed_name: str = TEST_PROFILE_NAME,
) -> str:
    profiles = load_profiles(registry)
    allowed = allowed_name.casefold()
    test_rows = [(pid, name) for pid, name in profiles if name.casefold() == allowed]
    if not test_rows:
        raise ValueError(f"No {allowed_name!r} profile in {registry}")
    test_id, test_name = test_rows[0]
    if profile_arg is None or not profile_arg.strip():
        return test_id
    needle = profile_arg.strip()
    matches = [
        (pid, name)
        for pid, name in profiles
        if pid == needle or name.casefold() == needle.casefold()
    ]
    if not matches:
        raise ValueError(f"Profile not found: {needle}")
    pid, name = matches[0]
    if name.casefold() != allowed:
        raise ValueError(f"Refusing profile {name!r}; only {test_name!r} is allowed")
    return pid


def profile_dbs(
    explicit: Path | None,
    profile_arg: str | None,
    *,
    registry: Path | None = None,
    profiles_dir: Path | None = None,
) -> list[Path]:
    if explicit is not None:
        return [explicit]
    registry_path = registry if registry is not None else REGISTRY_DB
    profiles_root = profiles_dir if profiles_dir is not None else PROFILES_DIR
    pid = resolve_test_profile_id(registry_path, profile_arg)
    return [profiles_root / pid / "media.db"]


def rename_in_db(db_path: Path, dry_run: bool, codec: NameCodec | None = None) -> int:
    name_codec: NameCodec = codec if codec is not None else PassthroughNameCodec()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT
                m.id,
                m.original_name,
                GROUP_CONCAT(a.name, char(31)) AS album_names
            FROM media m
            INNER JOIN album_media am ON am.media_id = m.id
            INNER JOIN albums a ON a.id = am.album_id
            WHERE m.media_type = 'video'
            GROUP BY m.id
            ORDER BY m.original_name COLLATE NOCASE, m.id
            """
        ).fetchall()

        token_rows: list[list[str]] = []
        album_stored: list[str] = []
        for row in rows:
            tokens = [p for p in (row["album_names"] or "").split("\x1f") if p]
            token_rows.append(tokens)
            album_stored.extend(tokens)

        unique_albums = list(dict.fromkeys(album_stored))
        album_plain = dict(zip(unique_albums, name_codec.decrypt_many(unique_albums), strict=True))
        old_plains = name_codec.try_decrypt_many([str(row["original_name"]) for row in rows])

        pending_plain: list[str] = []
        pending_meta: list[tuple[str, str]] = []
        for row, tokens, old_plain in zip(rows, token_rows, old_plains, strict=True):
            next_plain = album_filename([album_plain[t] for t in tokens])
            if old_plain == next_plain:
                continue
            pending_plain.append(next_plain)
            pending_meta.append((str(row["id"]), str(row["original_name"])))

        if not pending_plain:
            print(f"{db_path}: nothing to rename ({len(rows)} album video(s) already match).")
            return 0

        pending_stored = name_codec.encrypt_many(pending_plain)
        for (media_id, old), new_plain, new_stored in zip(
            pending_meta, pending_plain, pending_stored, strict=True
        ):
            print(f"{db_path.name}: {old!r} -> {new_plain!r} ({media_id})")
            if not dry_run:
                conn.execute(
                    "UPDATE media SET original_name = ? WHERE id = ?",
                    (new_stored, media_id),
                )
        if not dry_run:
            conn.commit()
        print(f"{db_path}: {len(pending_plain)} rename(s){' (dry-run)' if dry_run else ''}.")
        return 0
    finally:
        conn.close()


def main(argv: list[str] | None = None, *, codec: NameCodec | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print renames without writing to the database",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="Path to a single profile media.db (bypasses Test-only lookup)",
    )
    parser.add_argument(
        "--profile",
        type=str,
        default=None,
        help="Profile name or id (must be Test)",
    )
    args = parser.parse_args(argv)

    try:
        dbs = profile_dbs(args.db, args.profile)
    except (FileNotFoundError, ValueError) as err:
        print(str(err), file=sys.stderr)
        return 1

    name_codec: NameCodec = codec if codec is not None else BunNameCodec()
    status = 0
    for db_path in dbs:
        if not db_path.is_file():
            print(f"Database not found: {db_path}", file=sys.stderr)
            status = 1
            continue
        try:
            status = rename_in_db(db_path, args.dry_run, codec=name_codec) or status
        except RuntimeError as err:
            print(str(err), file=sys.stderr)
            return 1
    return status


if __name__ == "__main__":
    raise SystemExit(main())
