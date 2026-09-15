use std::process::Child;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const DEV_URL: &str = "http://127.0.0.1:1420";
const PROD_URL: &str = "http://127.0.0.1:4173";

struct ServerChild(Mutex<Option<Child>>);

#[cfg(not(debug_assertions))]
mod prod_server {
	use std::net::TcpStream;
	use std::path::PathBuf;
	use std::process::{Child, Command, Stdio};
	use std::thread;
	use std::time::{Duration, Instant};

	const PROD_PORT: u16 = 4173;
	use super::PROD_URL;

	fn port_open(addr: &str) -> bool {
		TcpStream::connect_timeout(
			&addr
				.parse()
				.unwrap_or_else(|_| "127.0.0.1:9".parse().unwrap()),
			Duration::from_millis(200),
		)
		.is_ok()
	}

	fn wait_for_http(url_host_port: &str, timeout: Duration) -> bool {
		let start = Instant::now();
		while start.elapsed() < timeout {
			if port_open(url_host_port) {
				return true;
			}
			thread::sleep(Duration::from_millis(150));
		}
		false
	}

	pub fn spawn_node_server(resource_dir: PathBuf) -> Result<Child, String> {
		let server_entry = resource_dir.join("server").join("index.js");
		if !server_entry.is_file() {
			return Err(format!(
				"Missing bundled server at {}. Run `bun run build` before `tauri build`.",
				server_entry.display()
			));
		}

		let data_dir = resource_dir.join("data");
		std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

		Command::new("node")
			.arg(&server_entry)
			.current_dir(resource_dir.join("server"))
			.env("HOST", "127.0.0.1")
			.env("PORT", PROD_PORT.to_string())
			.env("ORIGIN", PROD_URL)
			.env("MEDIA_DATA_DIR", data_dir.to_string_lossy().as_ref())
			.stdin(Stdio::null())
			.stdout(Stdio::null())
			.stderr(Stdio::null())
			.spawn()
			.map_err(|e| {
				format!(
					"Failed to start Node server ({e}). Install Node.js 20+ or Bun and ensure `node` is on PATH."
				)
			})
	}

	pub fn wait_ready() -> Result<(), String> {
		if wait_for_http(
			&format!("127.0.0.1:{PROD_PORT}"),
			Duration::from_secs(30),
		) {
			Ok(())
		} else {
			Err("Media Organizer server did not become ready on port 4173".into())
		}
	}
}

fn kill_managed_server(app: &tauri::AppHandle) {
	let Some(state) = app.try_state::<ServerChild>() else {
		return;
	};
	let Ok(mut guard) = state.0.lock() else {
		return;
	};
	let Some(mut child) = guard.take() else {
		return;
	};
	let _ = child.kill();
	let _ = child.wait();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.manage(ServerChild(Mutex::new(None)))
		.setup(|app| {
			#[cfg(not(debug_assertions))]
			{
				let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
				let child = prod_server::spawn_node_server(resource_dir)?;
				*app.state::<ServerChild>().0.lock().expect("server lock") = Some(child);
				prod_server::wait_ready()?;
			}

			let url = if cfg!(debug_assertions) {
				DEV_URL
			} else {
				PROD_URL
			};

			let mut window = WebviewWindowBuilder::new(
				app,
				"main",
				WebviewUrl::External(url.parse()?),
			)
			.title("Media Organizer")
			.inner_size(1280.0, 800.0)
			.min_inner_size(900.0, 600.0)
			// Tauri's native file-drop handler blocks HTML5 DnD (OS files + in-app album drops).
			.disable_drag_drop_handler();

			// Bundle icons alone often miss title-bar / taskbar in dev; set window icon too.
			// Use include_bytes (not include_image!) so rust-analyzer / check work without OUT_DIR.
			window = window.icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)?;

			window.build()?;

			Ok(())
		})
		.build(tauri::generate_context!())
		.expect("error while building Media Organizer")
		.run(|app_handle, event| {
			if let RunEvent::Exit = event {
				kill_managed_server(app_handle);
			}
		});
}
