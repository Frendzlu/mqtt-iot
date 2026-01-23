import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import DeviceDashboard from "./components/DeviceDashboard";
import AlarmsPanel from "./components/AlarmsPanel";
import LoginForm from "./components/LoginForm";
import type { Device, Alarm } from "./types";
import { useApi } from "./hooks/useApi";
import "./App.css";

export default function App() {
    const [backendUrl, setBackendUrl] = useState(() => {
        return localStorage.getItem("backendUrl") || "http://localhost:3001";
    });
    const api = useApi(backendUrl);
    const [username, setUsername] = useState("");
    const [uuid, setUuid] = useState("");
    const [password, setPassword] = useState("");
    const [devices, setDevices] = useState<Device[]>([]);
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [showAlarms, setShowAlarms] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [telemetryRefreshTrigger, setTelemetryRefreshTrigger] = useState(0);

    const handleLoginSuccess = (data: { uuid: string; username: string; password: string }) => {
        setUuid(data.uuid);
        setUsername(data.username);
        setPassword(data.password);
        setBackendUrl(localStorage.getItem("backendUrl") || "http://localhost:3001");
        fetchDevices(data.uuid);
        fetchAlarms(data.uuid);
        startTelemetry(data.uuid);
    };

    // Logout function
    const logout = () => {
        setUuid("");
        setUsername("");
        setPassword("");
        setDevices([]);
        setAlarms([]);
        setSelectedDevice(null);
        setUnacknowledgedCount(0);
        if (socket) {
            socket.disconnect();
            setSocket(null);
        }
    };

    // Fetch devices
    const fetchDevices = async (userUuid: string) => {
        const data = await api.fetchDevices(userUuid);
        setDevices(data);
        if (data.length > 0 && !selectedDevice) {
            setSelectedDevice(data[0]);
            console.log('[DEVICES] Auto-selected first device:', data[0]);
        }
    };

    // Fetch alarms
    const fetchAlarms = async (userUuid: string) => {
        const data = await api.fetchAlarms(userUuid);
        setAlarms(data);
        setUnacknowledgedCount(data.filter((a: Alarm) => !a.acknowledged).length);
    };

    // Acknowledge an alarm
    const acknowledgeAlarm = async (alarmId: number) => {
        const success = await api.acknowledgeAlarm(alarmId);
        if (success) {
            // Immediately refresh alarms and update counts
            await fetchAlarms(uuid);
        } else {
            console.error("Failed to acknowledge alarm");
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
            // Trigger refresh in DeviceDashboard
            setTelemetryRefreshTrigger((prev) => prev + 1);
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
        return <LoginForm onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div className="app-container">
            <header className="app-header">
                    <div className="header-left">
                        <h1>MQTT IoT Dashboard</h1>
                        <span className="user-badge">👤 {username}</span>
                    </div>
                    
                    <div className="header-right">
                        <button
                            className={`btn-alarm ${unacknowledgedCount > 0 ? 'has-alarms' : ''}`}
                            onClick={() => setShowAlarms(!showAlarms)}
                        >
                            🔔 Alarms {unacknowledgedCount > 0 && `(${unacknowledgedCount})`}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={logout}
                            style={{ marginLeft: '12px', padding: '8px 16px', fontSize: '14px' }}
                        >
                            Logout
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
                                {devices.length === 0 && (
                                    <p style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                                        No devices yet. Devices auto-register via MQTT.
                                    </p>
                                )}
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
                            refreshTrigger={telemetryRefreshTrigger}
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