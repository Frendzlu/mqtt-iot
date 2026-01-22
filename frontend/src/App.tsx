import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import DeviceDashboard from "./components/DeviceDashboard";
import AlarmsPanel from "./components/AlarmsPanel";
import "./App.css";

type Device = {
    macAddress: string;
    name: string;
};

type Alarm = {
    id: number;
    device_mac_address: string;
    device_name: string;
    severity: string;
    message: string;
    acknowledged: boolean;
    acknowledged_at: string | null;
    timestamp: string;
};

export default function App() {
    const [backendUrl] = useState("http://localhost:3001");
    const [username, setUsername] = useState("");
    const [uuid, setUuid] = useState("");
    const [password, setPassword] = useState("");
    const [devices, setDevices] = useState<Device[]>([]);
    const [newDeviceName, setNewDeviceName] = useState("");
    const [newDeviceMacAddress, setNewDeviceMacAddress] = useState("");
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [showAlarms, setShowAlarms] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);

    // Register a new user
    const register = async () => {
        if (!username || !password) return alert("username and password required");
        const res = await fetch(`${backendUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
            const err = await res.json();
            return alert("Register failed: " + (err.error || JSON.stringify(err)));
        }
        const data = await res.json();
        setUuid(data.uuid);
        fetchDevices(data.uuid);
        fetchAlarms(data.uuid);
        startTelemetry(data.uuid);
    };

    const login = async () => {
        if (!username || !password) return alert("username and password required");
        const res = await fetch(`${backendUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
            const err = await res.json();
            return alert("Login failed: " + (err.error || JSON.stringify(err)));
        }
        const data = await res.json();
        setUuid(data.uuid);
        fetchDevices(data.uuid);
        fetchAlarms(data.uuid);
        startTelemetry(data.uuid);
    };

    // Fetch devices
    const fetchDevices = async (userUuid: string) => {
        try {
            const res = await fetch(`${backendUrl}/devices/${userUuid}`);
            if (!res.ok) {
                console.error("Failed to fetch devices:", res.statusText);
                return;
            }
            const data = await res.json();
            console.log(`[DEVICES] Fetched ${data.length} device(s):`, data);
            setDevices(data);
            if (data.length > 0 && !selectedDevice) {
                setSelectedDevice(data[0]);
                console.log('[DEVICES] Auto-selected first device:', data[0]);
            }
        } catch (err) {
            console.error("Error fetching devices:", err);
        }
    };

    // Fetch alarms
    const fetchAlarms = async (userUuid: string) => {
        try {
            const res = await fetch(`${backendUrl}/alarms/${userUuid}?limit=50`);
            if (!res.ok) {
                console.error("Failed to fetch alarms:", res.statusText);
                return;
            }
            const data = await res.json();
            setAlarms(data);
            setUnacknowledgedCount(data.filter((a: Alarm) => !a.acknowledged).length);
        } catch (err) {
            console.error("Error fetching alarms:", err);
        }
    };

    // Add a new device
    const addDevice = async () => {
        if (!newDeviceName || !newDeviceMacAddress) {
            return alert("Device name and MAC address are required");
        }
        try {
            const res = await fetch(`${backendUrl}/add-device`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userUuid: uuid,
                    deviceName: newDeviceName,
                    macAddress: newDeviceMacAddress
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                return alert("Failed to add device: " + (err.error || JSON.stringify(err)));
            }
            const device = await res.json();
            setDevices((prev) => [...prev, device]);
            setNewDeviceName("");
            setNewDeviceMacAddress("");
            if (!selectedDevice) {
                setSelectedDevice(device);
            }
        } catch (err) {
            console.error("Error adding device:", err);
            alert("Failed to add device");
        }
    };

    // Acknowledge an alarm
    const acknowledgeAlarm = async (alarmId: number) => {
        try {
            const res = await fetch(`${backendUrl}/alarms/${alarmId}/acknowledge`, {
                method: "POST",
            });
            if (!res.ok) {
                console.error("Failed to acknowledge alarm:", res.statusText);
                return;
            }
            fetchAlarms(uuid);
        } catch (err) {
            console.error("Error acknowledging alarm:", err);
        }
    };

    // Start Socket.IO telemetry and alarms
    const startTelemetry = (userUuid: string) => {
        if (socket) {
            socket.disconnect();
        }

        const s = io(backendUrl);
        setSocket(s);

        s.on("connect", () => {
            console.log("Connected to Socket.IO backend");
            s.emit("join", userUuid);
        });

        s.on("telemetry", (data: any) => {
            console.log("Telemetry received:", data);
        });

        s.on("alarm", (alarm: Alarm) => {
            console.log("Alarm received:", alarm);
            setAlarms((prev) => [alarm, ...prev]);
            setUnacknowledgedCount((prev) => prev + 1);
        });

        s.on("device-registered", (data: any) => {
            console.log("[SOCKET] Device registered:", data);
            // Refresh devices list to include the new device
            console.log('[SOCKET] Refreshing devices list...');
            fetchDevices(userUuid);
        });

        s.on("disconnect", () => {
            console.log("Socket.IO disconnected");
        });
    };

    // Cleanup socket on unmount
    useEffect(() => {
        return () => {
            socket?.disconnect();
        };
    }, [socket]);

    if (!uuid) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <h1>🔌 MQTT IoT Dashboard</h1>
                    <p className="subtitle">Manage your IoT devices and monitor telemetry in real-time</p>

                    <div className="form-group">
                        <input
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="input"
                        />
                    </div>

                    <div className="form-group">
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input"
                            onKeyPress={(e) => e.key === "Enter" && login()}
                        />
                    </div>

                    <div className="button-group">
                        <button onClick={login} className="btn btn-primary">
                            Login
                        </button>
                        <button onClick={register} className="btn btn-secondary">
                            Register
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-left">
                    <h1>🔌 MQTT IoT Dashboard</h1>
                    <span className="user-badge">👤 {username}</span>
                </div>
                <div className="header-right">
                    <button
                        className={`btn-alarm ${unacknowledgedCount > 0 ? 'has-alarms' : ''}`}
                        onClick={() => setShowAlarms(!showAlarms)}
                    >
                        🔔 Alarms {unacknowledgedCount > 0 && `(${unacknowledgedCount})`}
                    </button>
                </div>
            </header>

            <div className="main-content">
                <aside className="sidebar">
                    <div className="sidebar-section">
                        <h3>Devices</h3>
                        <div className="device-list">
                            {devices.map((device) => (
                                <button
                                    key={device.macAddress}
                                    className={`device-item ${selectedDevice?.macAddress === device.macAddress ? 'active' : ''}`}
                                    onClick={() => setSelectedDevice(device)}
                                >
                                    <span className="device-icon">📱</span>
                                    <span className="device-name">{device.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="add-device-form">
                            <input
                                placeholder="Device name"
                                value={newDeviceName}
                                onChange={(e) => setNewDeviceName(e.target.value)}
                                className="input input-sm"
                                style={{ marginBottom: '8px' }}
                            />
                            <input
                                placeholder="MAC address (e.g., 00:11:22:33:44:55)"
                                value={newDeviceMacAddress}
                                onChange={(e) => setNewDeviceMacAddress(e.target.value)}
                                className="input input-sm"
                                onKeyPress={(e) => e.key === "Enter" && addDevice()}
                            />
                            <button onClick={addDevice} className="btn btn-sm btn-primary" style={{ marginTop: '8px' }}>
                                + Add Device
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-section mqtt-info">
                        <h4>MQTT Credentials</h4>
                        <div className="info-item">
                            <span className="label">Username:</span>
                            <code>{uuid}</code>
                        </div>
                        <div className="info-item">
                            <span className="label">Password:</span>
                            <code>{password || "(your password)"}</code>
                        </div>
                        <div className="info-item">
                            <span className="label">Broker:</span>
                            <code>localhost:1883</code>
                        </div>
                    </div>
                </aside>

                <main className="content-area">
                    {showAlarms ? (
                        <AlarmsPanel
                            alarms={alarms}
                            onAcknowledge={acknowledgeAlarm}
                            onClose={() => setShowAlarms(false)}
                        />
                    ) : selectedDevice ? (
                        <DeviceDashboard
                            device={selectedDevice}
                            userUuid={uuid}
                            backendUrl={backendUrl}
                        />
                    ) : (
                        <div className="empty-state">
                            <h2>No device selected</h2>
                            <p>Select a device from the sidebar or add a new one</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
