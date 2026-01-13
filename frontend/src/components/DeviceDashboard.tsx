import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Device = {
    id: string;
    name: string;
};

type TelemetryData = {
    id: number;
    device_id: string;
    device_name: string;
    sensor_name: string | null;
    message: string;
    value: number | null;
    unit: string | null;
    timestamp: string;
};

type SensorInfo = {
    sensor_name: string;
    reading_count: number;
    last_reading: string;
};

type Props = {
    device: Device;
    userUuid: string;
    backendUrl: string;
};

export default function DeviceDashboard({ device, userUuid, backendUrl }: Props) {
    const [telemetry, setTelemetry] = useState<TelemetryData[]>([]);
    const [sensors, setSensors] = useState<SensorInfo[]>([]);
    const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
    const [command, setCommand] = useState("");
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState(24);

    useEffect(() => {
        fetchSensors();
        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [device.id, timeRange, selectedSensor]);

    const fetchSensors = async () => {
        try {
            const res = await fetch(`${backendUrl}/sensors/${userUuid}/${device.id}`);
            const data = await res.json();
            setSensors(data);
        } catch (err) {
            console.error("Failed to fetch sensors:", err);
        }
    };

    const fetchTelemetry = async () => {
        try {
            let url = `${backendUrl}/telemetry/${userUuid}/${device.id}?hours=${timeRange}&limit=200`;
            if (selectedSensor) {
                url += `&sensor=${encodeURIComponent(selectedSensor)}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            setTelemetry(data.reverse()); // Reverse to show oldest first for chart
        } catch (err) {
            console.error("Failed to fetch telemetry:", err);
        }
    };

    const sendCommand = async () => {
        if (!command.trim()) return;

        setLoading(true);
        try {
            await fetch(`${backendUrl}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userUuid,
                    deviceId: device.id,
                    message: command,
                }),
            });
            setCommand("");
        } catch (err) {
            console.error("Failed to send command:", err);
            alert("Failed to send command");
        }
        setLoading(false);
    };

    // Prepare chart data
    const chartData = telemetry
        .filter((t) => t.value !== null)
        .map((t) => ({
            timestamp: new Date(t.timestamp).toLocaleTimeString(),
            value: t.value,
            unit: t.unit,
            fullTime: new Date(t.timestamp).toLocaleString(),
        }));

    const hasNumericData = chartData.length > 0;
    const latestValue = telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;

    return (
        <div className="device-dashboard">
            <div className="dashboard-header">
                <div>
                    <h2>📱 {device.name}</h2>
                    <p className="device-id">ID: {device.id}</p>
                </div>
                <div className="header-controls">
                    {sensors.length > 0 && (
                        <div className="sensor-filter">
                            <label>Sensor: </label>
                            <select
                                value={selectedSensor || "all"}
                                onChange={(e) => setSelectedSensor(e.target.value === "all" ? null : e.target.value)}
                            >
                                <option value="all">All Sensors ({sensors.length})</option>
                                {sensors.map((s) => (
                                    <option key={s.sensor_name} value={s.sensor_name}>
                                        {s.sensor_name} ({s.reading_count})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="time-range-selector">
                        <label>Time Range: </label>
                        <select value={timeRange} onChange={(e) => setTimeRange(Number(e.target.value))}>
                            <option value={1}>Last Hour</option>
                            <option value={6}>Last 6 Hours</option>
                            <option value={24}>Last 24 Hours</option>
                            <option value={168}>Last Week</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Latest Value Card */}
                <div className="card latest-value-card">
                    <h3>Latest Reading{selectedSensor ? `: ${selectedSensor}` : ""}</h3>
                    {latestValue ? (
                        <div className="value-display">
                            <div className="value">
                                {latestValue.value !== null ? (
                                    <>
                                        <span className="value-number">{latestValue.value}</span>
                                        {latestValue.unit && <span className="value-unit">{latestValue.unit}</span>}
                                    </>
                                ) : (
                                    <span className="value-text">{latestValue.message}</span>
                                )}
                            </div>
                            {latestValue.sensor_name && (
                                <div className="sensor-badge">{latestValue.sensor_name}</div>
                            )}
                            <div className="value-time">
                                {new Date(latestValue.timestamp).toLocaleString()}
                            </div>
                        </div>
                    ) : (
                        <p className="no-data">No data received yet</p>
                    )}
                </div>

                {/* Statistics Card */}
                <div className="card stats-card">
                    <h3>Statistics</h3>
                    <div className="stats-grid">
                        <div className="stat-item">
                            <span className="stat-label">Total Readings</span>
                            <span className="stat-value">{telemetry.length}</span>
                        </div>
                        {hasNumericData && (
                            <>
                                <div className="stat-item">
                                    <span className="stat-label">Average</span>
                                    <span className="stat-value">
                                        {(
                                            chartData.reduce((sum, d) => sum + (d.value || 0), 0) / chartData.length
                                        ).toFixed(2)}
                                    </span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Min</span>
                                    <span className="stat-value">
                                        {Math.min(...chartData.map((d) => d.value || 0)).toFixed(2)}
                                    </span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-label">Max</span>
                                    <span className="stat-value">
                                        {Math.max(...chartData.map((d) => d.value || 0)).toFixed(2)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Chart Card */}
                {hasNumericData && (
                    <div className="card chart-card">
                        <h3>Telemetry Time Series</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                <XAxis
                                    dataKey="timestamp"
                                    tick={{ fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#fff",
                                        border: "1px solid #ccc",
                                        borderRadius: "8px",
                                    }}
                                    formatter={(value: any) => [
                                        `${value}${chartData[0]?.unit || ""}`,
                                        "Value",
                                    ]}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#4f46e5"
                                    strokeWidth={2}
                                    dot={{ fill: "#4f46e5", r: 3 }}
                                    activeDot={{ r: 6 }}
                                    name="Value"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Command Card */}
                <div className="card command-card">
                    <h3>Send Command</h3>
                    <div className="command-form">
                        <textarea
                            placeholder="Enter command for device..."
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            rows={3}
                            className="command-input"
                            onKeyPress={(e) => {
                                if (e.key === "Enter" && e.ctrlKey) {
                                    sendCommand();
                                }
                            }}
                        />
                        <button onClick={sendCommand} disabled={loading || !command.trim()} className="btn btn-primary">
                            {loading ? "Sending..." : "Send Command"}
                        </button>
                        <p className="hint">Press Ctrl+Enter to send</p>
                    </div>
                    <div className="command-examples">
                        <p className="examples-title">Quick Commands:</p>
                        <div className="example-buttons">
                            <button onClick={() => setCommand("STATUS")} className="btn-example">
                                STATUS
                            </button>
                            <button onClick={() => setCommand("RESET")} className="btn-example">
                                RESET
                            </button>
                            <button onClick={() => setCommand('{"led":"on"}')} className="btn-example">
                                LED ON
                            </button>
                            <button onClick={() => setCommand('{"led":"off"}')} className="btn-example">
                                LED OFF
                            </button>
                        </div>
                    </div>
                </div>

                {/* Recent Messages Card */}
                <div className="card messages-card">
                    <h3>Recent Messages</h3>
                    <div className="messages-list">
                        {telemetry.slice(-10).reverse().map((t) => (
                            <div key={t.id} className="message-item">
                                <div className="message-content">{t.message}</div>
                                <div className="message-time">
                                    {new Date(t.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                        {telemetry.length === 0 && <p className="no-data">No messages yet</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
