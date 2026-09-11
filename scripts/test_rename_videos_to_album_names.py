#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import json

from rename_videos_to_album_names import (
	TEST_PROFILE_NAME,
	BunNameCodec,
	PassthroughNameCodec,
	album_filename,
	load_profiles,
	main,
	profile_dbs,
	rename_in_db,
	resolve_bun,
	resolve_test_profile_id,
)


def write_registry(root: Path, rows: list[tuple[str, str]]) -> Path:
	root.mkdir(parents=True, exist_ok=True)
	path = root / 'registry.db'
	conn = sqlite3.connect(path)
	try:
		conn.execute(
			"""
            CREATE TABLE profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                passcode_hash TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
		)
		conn.executemany('INSERT INTO profiles (id, name) VALUES (?, ?)', rows)
		conn.commit()
	finally:
		conn.close()
	return path


def write_media_db(path: Path) -> None:
	path.parent.mkdir(parents=True, exist_ok=True)
	conn = sqlite3.connect(path)
	try:
		conn.executescript(
			"""
            CREATE TABLE albums (id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE media (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                media_type TEXT NOT NULL
            );
            CREATE TABLE album_media (
                album_id TEXT NOT NULL,
                media_id TEXT NOT NULL,
                PRIMARY KEY (album_id, media_id)
            );
            """
		)
		conn.execute("INSERT INTO albums VALUES ('a1', 'Beta'), ('a2', 'Alpha')")
		conn.execute(
			"""
            INSERT INTO media VALUES
                ('v1', 'old.mp4', 'video'),
                ('v2', 'Alpha and Beta.mp4', 'video'),
                ('p1', 'pic.jpg', 'image')
            """
		)
		conn.execute(
			"""
            INSERT INTO album_media VALUES
                ('a1', 'v1'),
                ('a2', 'v1'),
                ('a1', 'v2'),
                ('a2', 'v2'),
                ('a1', 'p1')
            """
		)
		conn.commit()
	finally:
		conn.close()


class AlbumFilenameTests(unittest.TestCase):
	def test_sorts_unique_names(self) -> None:
		self.assertEqual(album_filename(['Beta', 'Alpha', ' Alpha ']), 'Alpha and Beta.mp4')

	def test_rejects_empty(self) -> None:
		with self.assertRaises(ValueError):
			album_filename(['', '  '])


class ResolveTestProfileTests(unittest.TestCase):
	def setUp(self) -> None:
		self.tmp = tempfile.TemporaryDirectory()
		self.root = Path(self.tmp.name)
		self.registry = write_registry(
			self.root,
			[
				('id-test', 'Test'),
				('id-v', 'V'),
			],
		)

	def tearDown(self) -> None:
		self.tmp.cleanup()

	def test_load_profiles_reads_rows(self) -> None:
		self.assertEqual(
			load_profiles(self.registry),
			[('id-test', 'Test'), ('id-v', 'V')],
		)

	def test_missing_registry(self) -> None:
		missing = self.root / 'nope.db'
		with self.assertRaises(FileNotFoundError):
			load_profiles(missing)

	def test_default_picks_test(self) -> None:
		self.assertEqual(resolve_test_profile_id(self.registry, None), 'id-test')
		self.assertEqual(resolve_test_profile_id(self.registry, '  '), 'id-test')

	def test_accepts_test_name_and_id(self) -> None:
		self.assertEqual(resolve_test_profile_id(self.registry, 'test'), 'id-test')
		self.assertEqual(resolve_test_profile_id(self.registry, 'id-test'), 'id-test')

	def test_refuses_other_profile_name(self) -> None:
		with self.assertRaisesRegex(ValueError, "Refusing profile 'V'"):
			resolve_test_profile_id(self.registry, 'V')

	def test_refuses_other_profile_id(self) -> None:
		with self.assertRaisesRegex(ValueError, "Refusing profile 'V'"):
			resolve_test_profile_id(self.registry, 'id-v')

	def test_unknown_profile(self) -> None:
		with self.assertRaisesRegex(ValueError, 'Profile not found'):
			resolve_test_profile_id(self.registry, 'missing')

	def test_missing_test_profile(self) -> None:
		registry = write_registry(self.root / 'only-v', [('id-v', 'V')])
		with self.assertRaisesRegex(ValueError, "No 'Test' profile"):
			resolve_test_profile_id(registry, None)


class ProfileDbsTests(unittest.TestCase):
	def setUp(self) -> None:
		self.tmp = tempfile.TemporaryDirectory()
		self.root = Path(self.tmp.name)
		self.registry = write_registry(self.root, [('id-test', 'Test')])
		self.profiles_dir = self.root / 'profiles'

	def tearDown(self) -> None:
		self.tmp.cleanup()

	def test_explicit_db_bypasses_lookup(self) -> None:
		explicit = self.root / 'custom.db'
		self.assertEqual(
			profile_dbs(explicit, 'V', registry=self.registry, profiles_dir=self.profiles_dir),
			[explicit],
		)

	def test_resolves_test_media_db(self) -> None:
		self.assertEqual(
			profile_dbs(None, None, registry=self.registry, profiles_dir=self.profiles_dir),
			[self.profiles_dir / 'id-test' / 'media.db'],
		)


class RenameInDbTests(unittest.TestCase):
	def setUp(self) -> None:
		self.tmp = tempfile.TemporaryDirectory()
		self.db = Path(self.tmp.name) / 'media.db'
		write_media_db(self.db)

	def tearDown(self) -> None:
		self.tmp.cleanup()

	def test_dry_run_leaves_names(self) -> None:
		self.assertEqual(rename_in_db(self.db, True), 0)
		conn = sqlite3.connect(self.db)
		try:
			name = conn.execute("SELECT original_name FROM media WHERE id = 'v1'").fetchone()[0]
		finally:
			conn.close()
		self.assertEqual(name, 'old.mp4')

	def test_renames_mismatched_album_videos_only(self) -> None:
		self.assertEqual(rename_in_db(self.db, False), 0)
		conn = sqlite3.connect(self.db)
		try:
			rows = dict(conn.execute('SELECT id, original_name FROM media').fetchall())
		finally:
			conn.close()
		self.assertEqual(rows['v1'], 'Alpha and Beta.mp4')
		self.assertEqual(rows['v2'], 'Alpha and Beta.mp4')
		self.assertEqual(rows['p1'], 'pic.jpg')

	def test_second_pass_is_noop(self) -> None:
		rename_in_db(self.db, False)
		self.assertEqual(rename_in_db(self.db, False), 0)


class MainTests(unittest.TestCase):
	def setUp(self) -> None:
		self.tmp = tempfile.TemporaryDirectory()
		self.root = Path(self.tmp.name)
		self.registry = write_registry(
			self.root,
			[('id-test', TEST_PROFILE_NAME), ('id-v', 'V')],
		)
		self.profiles_dir = self.root / 'profiles'
		self.test_db = self.profiles_dir / 'id-test' / 'media.db'
		write_media_db(self.test_db)
		write_media_db(self.profiles_dir / 'id-v' / 'media.db')

	def tearDown(self) -> None:
		self.tmp.cleanup()

	def test_refuses_other_profile_cli(self) -> None:
		with (
			patch('rename_videos_to_album_names.REGISTRY_DB', self.registry),
			patch('rename_videos_to_album_names.PROFILES_DIR', self.profiles_dir),
		):
			self.assertEqual(main(['--profile', 'V'], codec=PassthroughNameCodec()), 1)

	def test_missing_db_file(self) -> None:
		missing = self.root / 'gone.db'
		self.assertEqual(main(['--db', str(missing)], codec=PassthroughNameCodec()), 1)

	def test_dry_run_cli_skips_write(self) -> None:
		self.assertEqual(main(['--dry-run', '--db', str(self.test_db)], codec=PassthroughNameCodec()), 0)
		conn = sqlite3.connect(self.test_db)
		try:
			name = conn.execute("SELECT original_name FROM media WHERE id = 'v1'").fetchone()[0]
		finally:
			conn.close()
		self.assertEqual(name, 'old.mp4')

	def test_runs_test_profile_only(self) -> None:
		with (
			patch('rename_videos_to_album_names.REGISTRY_DB', self.registry),
			patch('rename_videos_to_album_names.PROFILES_DIR', self.profiles_dir),
		):
			self.assertEqual(main([], codec=PassthroughNameCodec()), 0)
		conn = sqlite3.connect(self.test_db)
		try:
			test_name = conn.execute("SELECT original_name FROM media WHERE id = 'v1'").fetchone()[0]
		finally:
			conn.close()
		other = sqlite3.connect(self.profiles_dir / 'id-v' / 'media.db')
		try:
			other_name = other.execute("SELECT original_name FROM media WHERE id = 'v1'").fetchone()[0]
		finally:
			other.close()
		self.assertEqual(test_name, 'Alpha and Beta.mp4')
		self.assertEqual(other_name, 'old.mp4')

	def test_lookup_error_from_missing_registry(self) -> None:
		with (
			patch('rename_videos_to_album_names.REGISTRY_DB', self.root / 'missing.db'),
			patch('rename_videos_to_album_names.PROFILES_DIR', self.profiles_dir),
		):
			self.assertEqual(main([], codec=PassthroughNameCodec()), 1)


class PrefixCodec(PassthroughNameCodec):
	def decrypt(self, stored: str) -> str:
		if stored.startswith('enc:'):
			return stored[4:]
		raise ValueError('decrypt failed')

	def encrypt(self, plain: str) -> str:
		return f'enc:{plain}'


class EncryptedRenameTests(unittest.TestCase):
	def setUp(self) -> None:
		self.tmp = tempfile.TemporaryDirectory()
		self.db = Path(self.tmp.name) / 'media.db'
		self.db.parent.mkdir(parents=True, exist_ok=True)
		conn = sqlite3.connect(self.db)
		try:
			conn.executescript(
				"""
                CREATE TABLE albums (id TEXT PRIMARY KEY, name TEXT NOT NULL);
                CREATE TABLE media (
                    id TEXT PRIMARY KEY,
                    original_name TEXT NOT NULL,
                    media_type TEXT NOT NULL
                );
                CREATE TABLE album_media (
                    album_id TEXT NOT NULL,
                    media_id TEXT NOT NULL,
                    PRIMARY KEY (album_id, media_id)
                );
                """
			)
			conn.execute("INSERT INTO albums VALUES ('a1', 'enc:Beta'), ('a2', 'enc:Alpha')")
			conn.execute(
				"""
                INSERT INTO media VALUES
                    ('v1', 'enc:v1:mangled and enc:v1:other.mp4', 'video'),
                    ('v2', 'enc:Alpha and Beta.mp4', 'video')
                """
			)
			conn.execute("INSERT INTO album_media VALUES ('a1', 'v1'), ('a2', 'v1'), ('a2', 'v2')")
			conn.commit()
		finally:
			conn.close()

	def tearDown(self) -> None:
		self.tmp.cleanup()

	def test_passthrough_try_decrypt_none_on_error(self) -> None:
		class Boom(PassthroughNameCodec):
			def decrypt(self, stored: str) -> str:
				raise ValueError('nope')

		self.assertEqual(Boom().try_decrypt_many(['a']), [None])

	def test_decrypts_albums_and_encrypts_new_name(self) -> None:
		codec = PrefixCodec()
		self.assertEqual(rename_in_db(self.db, False, codec=codec), 0)
		conn = sqlite3.connect(self.db)
		try:
			rows = dict(conn.execute('SELECT id, original_name FROM media').fetchall())
		finally:
			conn.close()
		self.assertEqual(rows['v1'], 'enc:Alpha and Beta.mp4')
		self.assertEqual(rows['v2'], 'enc:Alpha.mp4')


class _Proc:
	def __init__(self, code: int, stdout: str, stderr: str = '') -> None:
		self.returncode = code
		self.stdout = stdout
		self.stderr = stderr


class BunNameCodecTests(unittest.TestCase):
	def test_decrypt_caches_success(self) -> None:
		codec = BunNameCodec()
		payload = json.dumps({'decrypted': [{'ok': True, 'value': 'Album'}], 'encrypted': []})
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, payload),
		) as run:
			self.assertEqual(codec.decrypt('enc:v1:x'), 'Album')
			self.assertEqual(codec.decrypt('enc:v1:x'), 'Album')
			self.assertEqual(run.call_count, 1)

	def test_decrypt_caches_failure(self) -> None:
		codec = BunNameCodec()
		payload = json.dumps({'decrypted': [{'ok': False, 'error': 'Corrupt encrypted name'}], 'encrypted': []})
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, payload),
		) as run:
			with self.assertRaises(ValueError):
				codec.decrypt('enc:v1:bad')
			with self.assertRaises(ValueError):
				codec.decrypt('enc:v1:bad')
			self.assertEqual(run.call_count, 1)

	def test_decrypt_rejects_non_dict_item(self) -> None:
		codec = BunNameCodec()
		payload = json.dumps({'decrypted': ['nope'], 'encrypted': []})
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, payload),
		):
			with self.assertRaises(ValueError):
				codec.decrypt('enc:v1:x')

	def test_decrypt_missing_list(self) -> None:
		codec = BunNameCodec()
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, json.dumps({'encrypted': []})),
		):
			with self.assertRaises(RuntimeError):
				codec.decrypt('enc:v1:x')

	def test_decrypt_value_missing(self) -> None:
		codec = BunNameCodec()
		payload = json.dumps({'decrypted': [{'ok': True}], 'encrypted': []})
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, payload),
		):
			with self.assertRaises(RuntimeError):
				codec.decrypt('enc:v1:x')

	def test_encrypt_ok_and_missing(self) -> None:
		codec = BunNameCodec()
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, json.dumps({'decrypted': [], 'encrypted': ['enc:v1:z']})),
		):
			self.assertEqual(codec.encrypt('A.mp4'), 'enc:v1:z')
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, json.dumps({'decrypted': [], 'encrypted': []})),
		):
			with self.assertRaises(RuntimeError):
				codec.encrypt('A.mp4')
		self.assertEqual(codec.encrypt_many([]), [])

	def test_try_decrypt_many_mixed_cache(self) -> None:
		codec = BunNameCodec()
		codec._decrypt_cache['ok'] = 'Album'
		codec._decrypt_cache['bad'] = ValueError('nope')
		payload = json.dumps({'decrypted': [{'ok': False, 'error': 'Corrupt encrypted name'}], 'encrypted': []})
		with patch(
			'rename_videos_to_album_names.subprocess.run',
			return_value=_Proc(0, payload),
		):
			self.assertEqual(codec.try_decrypt_many(['ok', 'bad', 'fresh']), ['Album', None, None])

	def test_decrypt_many_uses_cache_and_raises_cached_error(self) -> None:
		codec = BunNameCodec()
		codec._decrypt_cache['ok'] = 'Album'
		codec._decrypt_cache['bad'] = ValueError('nope')
		self.assertEqual(codec.decrypt_many(['ok']), ['Album'])
		with self.assertRaises(ValueError):
			codec.decrypt_many(['bad'])

	def test_batch_errors(self) -> None:
		codec = BunNameCodec()
		with patch(
			'rename_videos_to_album_names.resolve_bun',
			return_value='bun',
		):
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				return_value=_Proc(1, '', 'boom'),
			):
				with self.assertRaisesRegex(RuntimeError, 'boom'):
					codec.encrypt('A.mp4')
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				return_value=_Proc(1, 'out', ''),
			):
				with self.assertRaisesRegex(RuntimeError, 'out'):
					codec.encrypt('A.mp4')
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				return_value=_Proc(1, '', ''),
			):
				with self.assertRaisesRegex(RuntimeError, 'bun name crypto failed'):
					codec.encrypt('A.mp4')
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				return_value=_Proc(0, 'not-json'),
			):
				with self.assertRaisesRegex(RuntimeError, 'invalid JSON'):
					codec.encrypt('A.mp4')
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				return_value=_Proc(0, json.dumps(['nope'])),
			):
				with self.assertRaisesRegex(RuntimeError, 'invalid JSON'):
					codec.encrypt('A.mp4')
			with patch(
				'rename_videos_to_album_names.subprocess.run',
				side_effect=FileNotFoundError('missing'),
			):
				with self.assertRaisesRegex(RuntimeError, 'bun not found on PATH'):
					codec.encrypt('A.mp4')

	def test_resolve_bun_missing(self) -> None:
		with patch('rename_videos_to_album_names.shutil.which', return_value=None):
			with self.assertRaisesRegex(RuntimeError, 'bun not found on PATH'):
				resolve_bun()

	def test_resolve_bun_prefers_bun_then_cmd(self) -> None:
		with patch('rename_videos_to_album_names.shutil.which', return_value='C:/bun.exe'):
			self.assertEqual(resolve_bun(), 'C:/bun.exe')

		def which(name: str) -> str | None:
			return 'C:/bun.cmd' if name == 'bun.cmd' else None

		with patch('rename_videos_to_album_names.shutil.which', side_effect=which):
			self.assertEqual(resolve_bun(), 'C:/bun.cmd')

	def test_main_reports_codec_failure(self) -> None:
		tmp = tempfile.TemporaryDirectory()
		try:
			db = Path(tmp.name) / 'media.db'
			write_media_db(db)

			class Boom(PassthroughNameCodec):
				def decrypt_many(self, stored_list: list[str]) -> list[str]:
					raise RuntimeError('codec down')

			self.assertEqual(main(['--db', str(db)], codec=Boom()), 1)
		finally:
			tmp.cleanup()


if __name__ == '__main__':
	unittest.main()
