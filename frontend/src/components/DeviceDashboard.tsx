import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Device = {
    macAddress: string;
    name: string;
};

type TelemetryData = {
    id: number;
    device_mac_address: string;
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

type ImageData = {
    id: number;
    device_mac_address: string;
    device_name: string;
    image_id: string;
    file_path: string;
    file_size: number;
    metadata: any;
    timestamp: string;
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
    const [images, setImages] = useState<ImageData[]>([]);
    const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);

    useEffect(() => {
        fetchSensors();
        fetchTelemetry();
        fetchImages();
        const interval = setInterval(() => {
            fetchTelemetry();
            fetchImages();
        }, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [device.macAddress, timeRange, selectedSensor]);

    const fetchSensors = async () => {
        try {
            const res = await fetch(`${backendUrl}/sensors/${userUuid}/${device.macAddress}`);
            const data = await res.json();
            setSensors(data);
        } catch (err) {
            console.error("Failed to fetch sensors:", err);
        }
    };

    const fetchTelemetry = async () => {
        try {
            let url = `${backendUrl}/telemetry/${userUuid}/${device.macAddress}?hours=${timeRange}&limit=200`;
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

    const fetchImages = async () => {
        try {
            const res = await fetch(`${backendUrl}/images/${userUuid}/${device.macAddress}?limit=20`);
            if (!res.ok) throw new Error('Failed to fetch images');
            const data = await res.json();
            setImages(data);
        } catch (err) {
            console.error("Failed to fetch images:", err);
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
                    macAddress: device.macAddress,
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
    const prepareChartData = () => {
        if (selectedSensor) {
            // Single sensor selected - return one dataset
            return {
                [selectedSensor]: telemetry
                    .filter((t) => t.value !== null && t.sensor_name === selectedSensor)
                    .map((t) => ({
                        timestamp: new Date(t.timestamp).toLocaleTimeString(),
                        value: t.value,
                        unit: t.unit,
                        fullTime: new Date(t.timestamp).toLocaleString(),
                    }))
            };
        } else {
            // All sensors selected - group by sensor_name
            const grouped: Record<string, typeof telemetry> = {};
            telemetry.forEach((t) => {
                if (t.value !== null && t.sensor_name) {
                    if (!grouped[t.sensor_name]) {
                        grouped[t.sensor_name] = [];
                    }
                    grouped[t.sensor_name].push(t);
                }
            });

            // Convert to chart data format
            const chartDataBySensor: Record<string, any[]> = {};
            Object.entries(grouped).forEach(([sensorName, data]) => {
                chartDataBySensor[sensorName] = data.map((t) => ({
                    timestamp: new Date(t.timestamp).toLocaleTimeString(),
                    value: t.value,
                    unit: t.unit,
                    fullTime: new Date(t.timestamp).toLocaleString(),
                }));
            });
            return chartDataBySensor;
        }
    };

    const chartDataBySensor = prepareChartData();
    const hasNumericData = Object.values(chartDataBySensor).some(data => data.length > 0);

    // Get latest values for each sensor
    const getLatestValues = () => {
        if (selectedSensor) {
            const latest = telemetry
                .filter((t) => t.sensor_name === selectedSensor)
                .slice(-1)[0];
            return latest ? { [selectedSensor]: latest } : {};
        } else {
            // Group by sensor and get latest for each
            const latestBySensor: Record<string, TelemetryData> = {};
            telemetry.forEach((t) => {
                if (t.sensor_name) {
                    latestBySensor[t.sensor_name] = t; // This will keep overwriting with newer values
                }
            });
            return latestBySensor;
        }
    };

    const latestValues = getLatestValues();

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
                {/* Latest Value Cards */}
                {Object.entries(latestValues).map(([sensorName, latestValue]) => (
                    <div key={`latest-${sensorName}`} className="card latest-value-card">
                        <h3>Latest Reading: {sensorName}</h3>
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
                            <div className="sensor-badge">{sensorName}</div>
                            <div className="value-time">
                                {new Date(latestValue.timestamp).toLocaleString()}
                            </div>
                        </div>
                    </div>
                ))}

                {Object.keys(latestValues).length === 0 && (
                    <div className="card latest-value-card">
                        <h3>Latest Reading{selectedSensor ? `: ${selectedSensor}` : ""}</h3>
                        <p className="no-data">No data received yet</p>
                    </div>
                )}

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
                                    <span className="stat-label">Sensors Active</span>
                                    <span className="stat-value">{Object.keys(chartDataBySensor).length}</span>
                                </div>
                                {selectedSensor && chartDataBySensor[selectedSensor] && (
                                    <>
                                        <div className="stat-item">
                                            <span className="stat-label">Average</span>
                                            <span className="stat-value">
                                                {(
                                                    chartDataBySensor[selectedSensor].reduce((sum, d) => sum + (d.value || 0), 0) / chartDataBySensor[selectedSensor].length
                                                ).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-label">Min</span>
                                            <span className="stat-value">
                                                {Math.min(...chartDataBySensor[selectedSensor].map((d) => d.value || 0)).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-label">Max</span>
                                            <span className="stat-value">
                                                {Math.max(...chartDataBySensor[selectedSensor].map((d) => d.value || 0)).toFixed(2)}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Chart Cards - One per sensor when "all" selected, or single chart for selected sensor */}
                {Object.entries(chartDataBySensor).map(([sensorName, chartData]) => 
                    chartData.length > 0 && (
                        <div key={`chart-${sensorName}`} className="card chart-card">
                            <h3>📈 {sensorName} Time Series</h3>
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
                                            sensorName,
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
                                        name={sensorName}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )
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

                {/* Images Card */}
                <div className="card images-card" style={{ gridColumn: '1 / -1' }}>
                    <h3>📷 Images ({images.length})</h3>
                    {images.length > 0 ? (
                        <div>
                            <div className="images-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '16px',
                                marginBottom: '20px'
                            }}>
                                {images.map((img) => (
                                    <div
                                        key={img.id}
                                        className="image-thumbnail"
                                        style={{
                                            border: selectedImage?.id === img.id ? '3px solid #4f46e5' : '1px solid #e0e0e0',
                                            borderRadius: '8px',
                                            padding: '8px',
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s',
                                        }}
                                        onClick={() => setSelectedImage(img)}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <img
                                            src={`${backendUrl}/images/${userUuid}/${device.macAddress}/${img.image_id}/file`}
                                            alt={img.image_id}
                                            style={{
                                                width: '100%',
                                                height: '150px',
                                                objectFit: 'cover',
                                                borderRadius: '4px',
                                            }}
                                        />
                                        <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                            <div style={{ fontWeight: 'bold' }}>{img.image_id}</div>
                                            <div style={{ color: '#666' }}>
                                                {new Date(img.timestamp).toLocaleString()}
                                            </div>
                                            {img.metadata && (
                                                <div style={{ color: '#888', fontSize: '11px' }}>
                                                    {img.metadata.width}x{img.metadata.height} · {(img.file_size / 1024).toFixed(1)}KB
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Selected Image Detail View */}
                            {selectedImage && (
                                <div style={{
                                    border: '2px solid #4f46e5',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    backgroundColor: '#f9fafb',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <h4 style={{ margin: 0 }}>📷 {selectedImage.image_id}</h4>
                                        <button
                                            onClick={() => setSelectedImage(null)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                fontSize: '20px',
                                                cursor: 'pointer',
                                                color: '#666'
                                            }}
                                        >×</button>
                                    </div>
                                    <img
                                        src={`${backendUrl}/images/${userUuid}/${device.macAddress}/${selectedImage.image_id}/file`}
                                        alt={selectedImage.image_id}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '500px',
                                            objectFit: 'contain',
                                            display: 'block',
                                            margin: '0 auto',
                                            borderRadius: '4px',
                                        }}
                                    />
                                    <div style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
                                        <div><strong>Timestamp:</strong> {new Date(selectedImage.timestamp).toLocaleString()}</div>
                                        {selectedImage.metadata && (
                                            <>
                                                <div><strong>Dimensions:</strong> {selectedImage.metadata.width} x {selectedImage.metadata.height}</div>
                                                <div><strong>Format:</strong> {selectedImage.metadata.format}</div>
                                                <div><strong>Size:</strong> {(selectedImage.file_size / 1024).toFixed(1)} KB</div>
                                                {selectedImage.metadata.camera && <div><strong>Camera:</strong> {selectedImage.metadata.camera}</div>}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="no-data">No images received yet</p>
                    )}
                </div>
            </div>
        </div>
    );
}
