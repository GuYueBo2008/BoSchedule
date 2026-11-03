package com.guyuebo.boschedule;

import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "LanScan")
public class LanScanPlugin extends Plugin {
    private static final int DISCOVERY_PORT = 41730;
    private static final int SYNC_PORT = 4173;
    private static final String PROBE = "{\"service\":\"BoSchedule\",\"type\":\"discover\",\"version\":1}";

    @PluginMethod
    public void scan(PluginCall call) {
        new Thread(() -> {
            Map<String, JSONObject> found = new ConcurrentHashMap<>();
            String failure = null;
            List<String> prefixes = localSubnetPrefixes();

            DatagramSocket socket = null;
            try {
                socket = new DatagramSocket();
                socket.setBroadcast(true);
                socket.setSoTimeout(250);
                byte[] probe = PROBE.getBytes(StandardCharsets.UTF_8);
                for (InetAddress target : discoveryTargets()) {
                    socket.send(new DatagramPacket(probe, probe.length, target, DISCOVERY_PORT));
                }
                long deadline = System.currentTimeMillis() + 1800;
                while (System.currentTimeMillis() < deadline) {
                    byte[] buffer = new byte[2048];
                    DatagramPacket response = new DatagramPacket(buffer, buffer.length);
                    try {
                        socket.receive(response);
                        JSONObject info = new JSONObject(new String(buffer, 0, response.getLength(), StandardCharsets.UTF_8));
                        addDevice(found, info, response.getAddress().getHostAddress(), SYNC_PORT);
                    } catch (SocketTimeoutException ignored) {
                        // 继续等待广播响应直到超时
                    } catch (Exception ignored) {
                        // 跳过无法解析的响应
                    }
                }
            } catch (Exception error) {
                failure = error.getMessage();
            } finally {
                if (socket != null) socket.close();
            }

            if (found.isEmpty()) scanTcp(prefixes, found);

            JSArray devices = new JSArray();
            for (JSONObject device : found.values()) devices.put(device);
            JSObject result = new JSObject();
            result.put("devices", devices);

            String errorMessage = failure;
            boolean failed = found.isEmpty() && errorMessage != null;
            new Handler(Looper.getMainLooper()).post(() -> {
                if (failed) call.reject("局域网扫描失败：" + errorMessage);
                else call.resolve(result);
            });
        }).start();
    }

    private void addDevice(Map<String, JSONObject> found, JSONObject info, String address, int fallbackPort) {
        try {
            if (!"BoSchedule".equals(info.optString("service"))) return;
            int port = info.optInt("port", fallbackPort);
            if (port < 1 || port > 65535) port = fallbackPort;
            String id = info.optString("id", "");
            if (id.isEmpty()) id = address + ":" + port;

            JSONObject device = new JSONObject();
            device.put("id", id);
            device.put("name", info.optString("name", "波日程设备"));
            device.put("platform", info.optString("platform", "Linux"));
            device.put("address", address);
            device.put("port", port);
            found.put(id, device);
        } catch (Exception ignored) {
            // 忽略格式不完整的响应
        }
    }

    private Set<InetAddress> discoveryTargets() {
        Set<InetAddress> targets = new LinkedHashSet<>();
        try {
            targets.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {
            // 没有广播地址时仍会尝试子网广播
        }
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (InterfaceAddress address : network.getInterfaceAddresses()) {
                    if (address.getAddress() instanceof Inet4Address && address.getBroadcast() != null) {
                        targets.add(address.getBroadcast());
                    }
                }
            }
        } catch (Exception ignored) {
            // 部分系统不允许枚举网络接口
        }
        return targets;
    }

    private List<String> localSubnetPrefixes() {
        Set<String> prefixes = new LinkedHashSet<>();
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (InterfaceAddress address : network.getInterfaceAddresses()) {
                    InetAddress ip = address.getAddress();
                    if (!(ip instanceof Inet4Address) || !ip.isSiteLocalAddress()) continue;
                    byte[] bytes = ip.getAddress();
                    prefixes.add((bytes[0] & 0xff) + "." + (bytes[1] & 0xff) + "." + (bytes[2] & 0xff));
                }
            }
        } catch (Exception ignored) {
            // 无法读取网卡时使用常见网段兜底
        }
        if (prefixes.isEmpty()) prefixes.add("192.168.1");
        List<String> list = new ArrayList<>(prefixes);
        return list.size() > 2 ? list.subList(0, 2) : list;
    }

    private void scanTcp(List<String> prefixes, Map<String, JSONObject> found) {
        List<String> hosts = new ArrayList<>();
        for (String prefix : prefixes) {
            for (int index = 1; index <= 254; index += 1) hosts.add(prefix + "." + index);
        }
        ExecutorService pool = Executors.newFixedThreadPool(48);
        for (String host : hosts) {
            pool.execute(() -> {
                try (Socket socket = new Socket()) {
                    socket.connect(new InetSocketAddress(host, SYNC_PORT), 250);
                    JSONObject info = fetchInfo(host, SYNC_PORT);
                    if (info != null) addDevice(found, info, host, SYNC_PORT);
                } catch (Exception ignored) {
                    // 该地址没有波日程同步服务
                }
            });
        }
        pool.shutdown();
        try {
            pool.awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private JSONObject fetchInfo(String host, int port) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL("http://" + host + ":" + port + "/api/sync/info").openConnection();
            connection.setConnectTimeout(1200);
            connection.setReadTimeout(1200);
            connection.setRequestProperty("Accept", "application/json");
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder text = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
                JSONObject info = new JSONObject(text.toString());
                return "BoSchedule".equals(info.optString("service")) ? info : null;
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
