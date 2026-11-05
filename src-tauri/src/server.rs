use std::{
    collections::{HashMap, HashSet},
    fs, io,
    net::{IpAddr, SocketAddr, TcpListener, UdpSocket},
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    body::Body,
    extract::{ConnectInfo, DefaultBodyLimit, Query, State},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use include_dir::{include_dir, Dir};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

/// 前端构建产物在编译期嵌入 exe，运行时不需要额外的 dist 目录。
static DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

const MAX_BODY_SIZE: usize = 40 * 1024 * 1024;
const DISCOVERY_PORT: u16 = 41730;

#[derive(Clone)]
struct AppState {
    store: Arc<Mutex<Store>>,
    port: u16,
}

#[derive(Default, Serialize, Deserialize)]
struct Store {
    #[serde(rename = "serverId", default)]
    server_id: String,
    #[serde(rename = "pairCode")]
    pair_code: String,
    data: Option<Value>,
    devices: Vec<Value>,
}

#[derive(Deserialize)]
struct PairBody {
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(default)]
    code: Value,
    #[serde(default)]
    name: String,
    #[serde(default)]
    platform: Option<String>,
    #[serde(default)]
    address: Option<String>,
    #[serde(default)]
    data: Option<Value>,
}

#[derive(Deserialize)]
struct SyncBody {
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(default)]
    data: Option<Value>,
}

#[derive(Deserialize)]
struct RemoveDeviceBody {
    #[serde(rename = "clientId", default)]
    client_id: String,
    #[serde(rename = "deviceId")]
    device_id: String,
}

pub fn start() -> io::Result<u16> {
    let listener = TcpListener::bind(("0.0.0.0", 4173))
        .or_else(|_| TcpListener::bind(("0.0.0.0", 0)))?;
    let port = listener.local_addr()?.port();
    listener.set_nonblocking(true)?;

    let store = load_store();
    let server_id = store.server_id.clone();
    let state = AppState {
        store: Arc::new(Mutex::new(store)),
        port,
    };
    let app = router(state);
    start_discovery(server_id, port);

    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => {
                let _ = axum::serve(
                    listener,
                    app.into_make_service_with_connect_info::<SocketAddr>(),
                )
                .await;
            }
            Err(error) => eprintln!("局域网同步服务启动失败：{error}"),
        }
    });

    Ok(port)
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/sync/info", get(info))
        .route("/api/sync/pair", post(pair))
        .route("/api/sync/sync", post(sync))
        .route("/api/sync/local-devices", get(local_devices))
        .route("/api/sync/devices", get(list_devices))
        .route("/api/sync/remove-device", post(remove_device))
        .fallback(serve_static)
        .layer(DefaultBodyLimit::max(MAX_BODY_SIZE))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn info(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
) -> Response {
    let store = state.store.lock().await;
    let mut body = Map::new();
    body.insert("service".into(), json!("BoSchedule"));
    body.insert("version".into(), json!(1));
    body.insert("protocol".into(), json!(1));
    body.insert("id".into(), json!(store.server_id.clone()));
    body.insert("name".into(), json!(host_name()));
    body.insert("platform".into(), json!(local_platform()));
    body.insert("port".into(), json!(state.port));
    body.insert("addresses".into(), json!(local_addresses()));
    if is_local(address.ip()) {
        body.insert("pairCode".into(), json!(store.pair_code));
    }
    Json(Value::Object(body)).into_response()
}

async fn pair(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(body): Json<PairBody>,
) -> Response {
    let mut store = state.store.lock().await;

    if text(&body.code) != store.pair_code {
        return error(StatusCode::FORBIDDEN, "配对码不正确");
    }
    if body.client_id.is_empty() || body.name.is_empty() {
        return error(StatusCode::BAD_REQUEST, "缺少设备信息");
    }

    let now = now_iso();
    let existing = store
        .devices
        .iter()
        .find(|device| device.get("clientId").and_then(Value::as_str) == Some(&body.client_id));
    let id = existing
        .and_then(|device| device.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("device_{}", body.client_id));
    let paired_at = existing
        .and_then(|device| device.get("pairedAt"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| now.clone());
    let platform = match body.platform.as_deref() {
        Some("Android") => "Android",
        Some("Windows") => "Windows",
        Some("macOS") => "macOS",
        _ => "Linux",
    };
    let device = json!({
        "id": id,
        "clientId": body.client_id,
        "name": body.name.chars().take(80).collect::<String>(),
        "platform": platform,
        "address": body.address.unwrap_or_else(|| address.ip().to_string()),
        "pairedAt": paired_at,
        "lastSync": now,
    });

    store
        .devices
        .retain(|item| item.get("clientId").and_then(Value::as_str) != Some(&body.client_id));
    store.devices.push(device);
    if let Some(data) = body.data {
        merge_into_store(&mut store, &data);
    }
    save_store(&store);

    Json(json!({ "ok": true, "data": store.data.clone(), "devices": public_devices(&store) }))
        .into_response()
}

async fn sync(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(body): Json<SyncBody>,
) -> Response {
    let mut store = state.store.lock().await;
    if !authorized(&store, &body.client_id) {
        return error(StatusCode::FORBIDDEN, "设备尚未配对");
    }

    let now = now_iso();
    for device in &mut store.devices {
        if device.get("clientId").and_then(Value::as_str) == Some(&body.client_id) {
            if let Some(object) = device.as_object_mut() {
                object.insert("lastSync".into(), json!(now));
                if object.get("address").and_then(Value::as_str).unwrap_or("").is_empty() {
                    object.insert("address".into(), json!(address.ip().to_string()));
                }
            }
        }
    }
    if let Some(data) = body.data {
        merge_into_store(&mut store, &data);
    }
    save_store(&store);

    Json(json!({ "ok": true, "data": store.data.clone(), "devices": public_devices(&store) }))
        .into_response()
}

async fn local_devices(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
) -> Response {
    if !is_local(address.ip()) {
        return error(StatusCode::FORBIDDEN, "仅限本机访问");
    }
    let store = state.store.lock().await;
    Json(json!({ "devices": public_devices(&store) })).into_response()
}

async fn list_devices(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let store = state.store.lock().await;
    let client_id = query.get("clientId").cloned().unwrap_or_default();
    if !authorized(&store, &client_id) {
        return error(StatusCode::FORBIDDEN, "设备尚未配对");
    }
    Json(json!({ "devices": public_devices(&store), "data": store.data.clone() })).into_response()
}

async fn remove_device(
    State(state): State<AppState>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Json(body): Json<RemoveDeviceBody>,
) -> Response {
    let mut store = state.store.lock().await;
    if !authorized(&store, &body.client_id) && !is_local(address.ip()) {
        return error(StatusCode::FORBIDDEN, "设备尚未配对");
    }
    store
        .devices
        .retain(|device| device.get("id").and_then(Value::as_str) != Some(&body.device_id));
    save_store(&store);
    Json(json!({ "ok": true, "devices": public_devices(&store) })).into_response()
}

async fn serve_static(uri: Uri) -> Response {
    let requested = uri.path().trim_start_matches('/');
    let requested = if requested.is_empty() {
        "index.html"
    } else {
        requested
    };
    let (path, contents) = match DIST.get_file(requested) {
        Some(file) => (requested, file.contents()),
        None => match DIST.get_file("index.html") {
            Some(file) => ("index.html", file.contents()),
            None => {
                return (StatusCode::SERVICE_UNAVAILABLE, "请先运行 npm run build").into_response()
            }
        },
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_for(path))
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(contents.to_vec()))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn merge_into_store(store: &mut Store, incoming: &Value) {
    let local = store.data.take();
    store.data = Some(merge_data(local, incoming));
}

fn merge_data(local: Option<Value>, incoming: &Value) -> Value {
    let Some(local) = local else {
        return shared_data(incoming);
    };
    let remote = shared_data(incoming);

    let mut tombstones = local
        .get("eventTombstones")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(remote_tombstones) = remote.get("eventTombstones").and_then(Value::as_object) {
        for (id, timestamp) in remote_tombstones {
            let incoming = timestamp.as_str().unwrap_or("");
            let current = tombstones.get(id).and_then(Value::as_str).unwrap_or("");
            if current.is_empty() || incoming > current {
                tombstones.insert(id.clone(), timestamp.clone());
            }
        }
    }

    let local_events = array_of(&local, "events");
    let remote_events = array_of(&remote, "events");
    let mut events = merge_by_id(&local_events, &remote_events);
    events.retain(|event| {
        let id = event.get("id").and_then(Value::as_str).unwrap_or("");
        match tombstones.get(id).and_then(Value::as_str) {
            Some(deleted_at) => timestamp(event) > deleted_at,
            None => true,
        }
    });

    let mut tags = array_of(&local, "tags");
    let mut tag_names: HashSet<String> = tags
        .iter()
        .filter_map(|tag| tag.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .collect();
    for tag in array_of(&remote, "tags") {
        let name = tag.get("name").and_then(Value::as_str).unwrap_or("");
        if !name.is_empty() && tag_names.insert(name.to_string()) {
            tags.push(tag);
        }
    }

    let mut history = merge_by_id(&array_of(&local, "history"), &array_of(&remote, "history"));
    history.sort_by(|first, second| timestamp(second).cmp(timestamp(first)));

    json!({
        "version": 1,
        "timetables": merge_by_id(&array_of(&local, "timetables"), &array_of(&remote, "timetables")),
        "events": events,
        "tags": tags,
        "history": history,
        "eventTombstones": tombstones,
    })
}

fn shared_data(data: &Value) -> Value {
    json!({
        "version": 1,
        "timetables": array_of(data, "timetables"),
        "events": array_of(data, "events"),
        "tags": array_of(data, "tags"),
        "history": array_of(data, "history"),
        "eventTombstones": data
            .get("eventTombstones")
            .and_then(Value::as_object)
            .cloned()
            .map(Value::Object)
            .unwrap_or_else(|| json!({})),
    })
}

fn array_of(data: &Value, key: &str) -> Vec<Value> {
    data.get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn merge_by_id(local: &[Value], incoming: &[Value]) -> Vec<Value> {
    let mut merged = local.to_vec();
    let mut positions: HashMap<String, usize> = HashMap::new();
    for (index, item) in merged.iter().enumerate() {
        if let Some(id) = item.get("id").and_then(Value::as_str) {
            positions.insert(id.to_string(), index);
        }
    }
    for item in incoming {
        match item.get("id").and_then(Value::as_str) {
            Some(id) => {
                if let Some(&position) = positions.get(id) {
                    if timestamp(item) > timestamp(&merged[position]) {
                        merged[position] = item.clone();
                    }
                } else {
                    positions.insert(id.to_string(), merged.len());
                    merged.push(item.clone());
                }
            }
            None => merged.push(item.clone()),
        }
    }
    merged
}

fn timestamp(value: &Value) -> &str {
    value
        .get("updatedAt")
        .and_then(Value::as_str)
        .or_else(|| value.get("timestamp").and_then(Value::as_str))
        .unwrap_or("")
}

fn authorized(store: &Store, client_id: &str) -> bool {
    !client_id.is_empty()
        && store
            .devices
            .iter()
            .any(|device| device.get("clientId").and_then(Value::as_str) == Some(client_id))
}

fn public_devices(store: &Store) -> Vec<Value> {
    store
        .devices
        .iter()
        .map(|device| {
            let mut copy = device.clone();
            if let Some(object) = copy.as_object_mut() {
                object.remove("clientId");
            }
            copy
        })
        .collect()
}

fn load_store() -> Store {
    let mut store = fs::read_to_string(data_file())
        .ok()
        .and_then(|text| serde_json::from_str::<Store>(&text).ok())
        .unwrap_or_default();
    if store.pair_code.is_empty() {
        store.pair_code = random_code();
    }
    if store.server_id.is_empty() {
        store.server_id = format!("server_{:x}", rand::thread_rng().gen::<u128>());
    }
    store
}

fn start_discovery(server_id: String, port: u16) {
    std::thread::spawn(move || {
        let socket = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
            Ok(socket) => socket,
            Err(_) => return,
        };
        let payload = json!({
            "service": "BoSchedule",
            "type": "service",
            "protocol": 1,
            "id": server_id,
            "name": host_name(),
            "platform": local_platform(),
            "port": port,
            "addresses": local_addresses(),
        })
        .to_string();

        loop {
            let mut buffer = [0u8; 1024];
            let (size, remote) = match socket.recv_from(&mut buffer) {
                Ok(result) => result,
                Err(_) => continue,
            };
            let probe = String::from_utf8_lossy(&buffer[..size]);
            let is_probe = serde_json::from_str::<Value>(&probe)
                .ok()
                .and_then(|value| value.get("service").and_then(Value::as_str).map(str::to_string))
                .is_some_and(|service| service == "BoSchedule");
            if is_probe {
                let _ = socket.send_to(payload.as_bytes(), remote);
            }
        }
    });
}

fn save_store(store: &Store) {
    let file = data_file();
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let temporary = file.with_extension("json.tmp");
    if let Ok(contents) = serde_json::to_vec(store) {
        if fs::write(&temporary, contents).is_ok() {
            let _ = fs::rename(&temporary, &file);
        }
    }
}

fn data_file() -> PathBuf {
    let directory = std::env::var_os("BOSCHEDULE_DATA_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".boschedule")))
        .unwrap_or_else(|| PathBuf::from(".boschedule"));
    directory.join("lan-sync.json")
}

fn random_code() -> String {
    rand::thread_rng().gen_range(100_000..=999_999).to_string()
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn host_name() -> String {
    hostname::get()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|_| "BoSchedule".to_string())
}

fn local_platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        _ => "Linux",
    }
}

fn local_addresses() -> Vec<String> {
    let mut addresses = Vec::new();
    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for interface in interfaces {
            if !interface.is_loopback() && interface.ip().is_ipv4() {
                addresses.push(interface.ip().to_string());
            }
        }
    }
    if addresses.is_empty() {
        addresses.push("127.0.0.1".to_string());
    }
    addresses
}

fn is_local(ip: IpAddr) -> bool {
    ip.is_loopback() || local_addresses().iter().any(|address| address == &ip.to_string())
}

fn text(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string().trim_matches('"').to_string())
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn mime_for(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
