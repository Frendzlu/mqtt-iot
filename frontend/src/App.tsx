import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";

type Device = {
    id: string;
    name: string;
};

export default function App() {
    const [backendUrl, setBackendUrl] = useState("http://localhost:3001");
    const [username, setUsername] = useState("");
    const [uuid, setUuid] = useState("");
    const [devices, setDevices] = useState<Device[]>([]);
    const [newDeviceName, setNewDeviceName] = useState("");
    const [message, setMessage] = useState("");
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
    const [telemetry, setTelemetry] = useState<string[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);

    // Create a new user
    const createUser = async () => {
        const res = await fetch(`${backendUrl}/create-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
        });
        const data = await res.json();
        setUuid(data.uuid);
        fetchDevices(data.uuid);
        startTelemetry(data.uuid);
    };

    // Fetch devices
    const fetchDevices = async (userUuid: string) => {
        const res = await fetch(`${backendUrl}/devices/${userUuid}`);
        const data = await res.json();
        setDevices(data);
    };

    // Add a new device
    const addDevice = async () => {
        if (!newDeviceName) return;
        const res = await fetch(`${backendUrl}/add-device`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userUuid: uuid, deviceName: newDeviceName }),
        });
        const device = await res.json();
        setDevices((prev) => [...prev, device]);
        setNewDeviceName("");
    };

    // Publish a message
    const publishMessage = async () => {
        if (!message) return;
        await fetch(`${backendUrl}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userUuid: uuid, deviceId: selectedDevice, message }),
        });
        setMessage("");
    };

    // Start Socket.IO telemetry
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

        s.on("telemetry", (msg: string) => {
            console.log("Telemetry received:", msg);
            setTelemetry((prev) => [msg, ...prev].slice(0, 50));
        });

        s.on("disconnect", () => {
            console.log("Socket.IO disconnected, retrying in 3s...");
            setTimeout(() => startTelemetry(userUuid), 3000);
        });
    };

    // Cleanup socket on unmount
    useEffect(() => {
        return () => {
            socket?.disconnect();
        };
    }, [socket]);

    return (
        <div style={{ padding: "20px", fontFamily: "Arial" }}>
            <h1>MQTT Dashboard (Socket.IO)</h1>

            <div style={{ marginBottom: "20px" }}>
                <label>Backend URL: </label>
                <input
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    style={{ width: "300px" }}
                />
            </div>

            <div style={{ marginBottom: "20px" }}>
                <input
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
                <button onClick={createUser} style={{ marginLeft: "10px" }}>
                    Create User
                </button>
            </div>

            {uuid && (
                <>
                    <p>
                        <strong>User UUID:</strong> {uuid}
                    </p>

                    <h3>Devices</h3>
                    <ul>
                        {devices.map((d) => (
                            <li key={d.id}>
                                <input
                                    type="radio"
                                    name="selectedDevice"
                                    value={d.id}
                                    checked={selectedDevice === d.id}
                                    onChange={() => setSelectedDevice(d.id)}
                                />{" "}
                                {d.name} ({d.id})
                            </li>
                        ))}
                    </ul>

                    <input
                        placeholder="New device name"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                    />
                    <button onClick={addDevice} style={{ marginLeft: "10px" }}>
                        Add Device
                    </button>

                    <h3 style={{ marginTop: "20px" }}>Publish Message</h3>
                    <textarea
                        placeholder="Message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        cols={50}
                    />
                    <br />
                    <button onClick={publishMessage}>Send</button>

                    <h3 style={{ marginTop: "20px" }}>Telemetry (latest 50 messages)</h3>
                    <div
                        style={{
                            maxHeight: "300px",
                            overflowY: "scroll",
                            border: "1px solid #ccc",
                            padding: "10px",
                        }}
                    >
                        {telemetry.map((t, i) => (
                            <div key={i}>{t}</div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
