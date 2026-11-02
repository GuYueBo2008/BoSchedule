#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            let url = tauri::Url::parse("http://localhost:5173").unwrap();

            #[cfg(not(debug_assertions))]
            let url = {
                let port = server::start()?;
                tauri::Url::parse(&format!("http://127.0.0.1:{port}")).unwrap()
            };

            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("波日程")
                .inner_size(1200.0, 820.0)
                .min_inner_size(380.0, 640.0)
                .center()
                .on_navigation(move |target| {
                    let internal = matches!(target.host_str(), Some("127.0.0.1" | "localhost"))
                        || matches!(target.scheme(), "tauri" | "asset");
                    if internal {
                        return true;
                    }
                    if matches!(target.scheme(), "http" | "https") {
                        let _ = handle.opener().open_url(target.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start BoSchedule");
}
