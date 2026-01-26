import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import CommandBuilder from "./CommandBuilder";
import type { Device, TelemetryData, SensorInfo, ImageData } from "../types";
import { useApi } from "../hooks/useApi";

type Props = {
    device: Device;
    userUuid: string;
    backendUrl: string;
    refreshTrigger?: number;
};

export default function DeviceDashboard({ device, userUuid, backendUrl, refreshTrigger }: Props) {
    const api = useApi(backendUrl);
    const [telemetry, setTelemetry] = useState<TelemetryData[]>([]);
    const [sensors, setSensors] = useState<SensorInfo[]>([]);
    const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [timeRange, setTimeRange] = useState(24);
    const [customRange, setCustomRange] = useState({ start: "", end: "" });
    const [isCustomRange, setIsCustomRange] = useState(false);
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
    }, [device.macAddress, timeRange, isCustomRange, customRange, selectedSensor, refreshTrigger]);

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
            // Use higher limit when fetching all sensors to ensure enough data per sensor
            const limit = selectedSensor ? 1000 : 3000;
            let url = `${backendUrl}/telemetry/${userUuid}/${device.macAddress}?limit=${limit}`;

            if (isCustomRange && customRange.start && customRange.end) {
                // Custom date range
                url += `&startDate=${encodeURIComponent(customRange.start)}&endDate=${encodeURIComponent(customRange.end)}`;
            } else {
                // Hours-based range (0 = all time)
                url += `&hours=${timeRange}`;
            }

            if (selectedSensor) {
                url += `&sensor=${encodeURIComponent(selectedSensor)}`;
            }

            const res = await fetch(url);
            const data = await res.json();
            console.log(`[TELEMETRY] Fetched ${data.length} records:`, data.slice(0, 3));
            // Backend returns newest first (ORDER BY timestamp DESC), reverse for chart (oldest first)
            const reversed = data.reverse();
            setTelemetry(reversed);
            console.log('[TELEMETRY] After reverse, latest 3:', reversed.slice(-3));
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

    const sendCommand = async (commandText: string) => {
        if (!commandText.trim()) return;

        setLoading(true);
        try {
            await fetch(`${backendUrl}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userUuid,
                    macAddress: device.macAddress,
                    message: commandText,
                }),
            });
        } catch (err) {
            console.error("Failed to send command:", err);
            alert("Failed to send command");
        }
        setLoading(false);
    };

    const deleteImage = async (imageId: string) => {
        if (!confirm(`Are you sure you want to delete image ${imageId}?`)) {
            return;
        }

        try {
            const success = await api.deleteImage(userUuid, device.macAddress, imageId);
            if (success) {
                // Remove from local state immediately
                setImages(prev => prev.filter(img => img.image_id !== imageId));
                // Clear selected image if it was the deleted one
                if (selectedImage?.image_id === imageId) {
                    setSelectedImage(null);
                }
                console.log(`Successfully deleted image ${imageId}`);
            } else {
                alert(`Failed to delete image ${imageId}`);
            }
        } catch (err) {
            console.error("Failed to delete image:", err);
            alert(`Error deleting image: ${err}`);
        }
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
                        value: Number(t.value),
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
                    value: Number(t.value),
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
        console.log(`[LATEST] Computing latest values from ${telemetry.length} telemetry records`);
        if (selectedSensor) {
            const filtered = telemetry.filter((t) => t.sensor_name === selectedSensor);
            const latest = filtered.slice(-1)[0];
            console.log(`[LATEST] Selected sensor "${selectedSensor}": ${filtered.length} records, latest:`, latest);
            return latest ? { [selectedSensor]: latest } : {};
        } else {
            // Group by sensor and get latest for each (telemetry is oldest->newest, so last occurrence is latest)
            const latestBySensor: Record<string, TelemetryData> = {};
            telemetry.forEach((t) => {
                if (t.sensor_name) {
                    latestBySensor[t.sensor_name] = t; // This will keep overwriting with newer values
                }
            });
            console.log('[LATEST] All sensors, latest values:', latestBySensor);
            return latestBySensor;
        }
    };

    const latestValues = getLatestValues();
    // Sort sensor names alphabetically to prevent jumping when new data arrives
    const sortedLatestValues = Object.entries(latestValues).sort(([a], [b]) => a.localeCompare(b));

    return (
        <div className="device-dashboard">
            <div className="dashboard-header">
                <div>
                    <h2>📱 {device.name}</h2>
                    <p className="device-id">MAC: {device.macAddress}</p>
                    {device.active === false && (
                        <p style={{
                            color: '#f59e0b',
                            fontSize: '14px',
                            marginTop: '8px',
                            padding: '8px 12px',
                            background: '#fef3c7',
                            borderRadius: '6px',
                            display: 'inline-block'
                        }}>
                            📜 Historical Device - View-only mode (device is no longer active for your account)
                        </p>
                    )}
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
                        <select
                            value={isCustomRange ? "custom" : timeRange.toString()}
                            onChange={(e) => {
                                if (e.target.value === "custom") {
                                    setIsCustomRange(true);
                                } else {
                                    setIsCustomRange(false);
                                    setTimeRange(Number(e.target.value));
                                }
                            }}
                        >
                            <option value={1}>Last Hour</option>
                            <option value={6}>Last 6 Hours</option>
                            <option value={24}>Last 24 Hours</option>
                            <option value={168}>Last Week</option>
                            <option value={0}>All Time</option>
                            <option value="custom">Custom Range</option>
                        </select>

                        {isCustomRange && (
                            <div className="custom-date-range">
                                <input
                                    type="datetime-local"
                                    placeholder="Start Date"
                                    value={customRange.start}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="input-sm"
                                />
                                <input
                                    type="datetime-local"
                                    placeholder="End Date"
                                    value={customRange.end}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="input-sm"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Latest Value Cards */}
                {sortedLatestValues.map(([sensorName, latestValue]) => (
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
                                {selectedSensor && chartDataBySensor[selectedSensor] && chartDataBySensor[selectedSensor].length > 0 && (
                                    <>
                                        <div className="stat-item">
                                            <span className="stat-label">Average</span>
                                            <span className="stat-value">
                                                {(() => {
                                                    const values = chartDataBySensor[selectedSensor]
                                                        .map(d => Number(d.value))
                                                        .filter(v => !isNaN(v) && isFinite(v));
                                                    if (values.length === 0) return 'N/A';
                                                    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
                                                    return avg.toFixed(2);
                                                })()}
                                            </span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-label">Min</span>
                                            <span className="stat-value">
                                                {(() => {
                                                    const values = chartDataBySensor[selectedSensor]
                                                        .map(d => Number(d.value))
                                                        .filter(v => !isNaN(v) && isFinite(v));
                                                    if (values.length === 0) return 'N/A';
                                                    return Math.min(...values).toFixed(2);
                                                })()}
                                            </span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-label">Max</span>
                                            <span className="stat-value">
                                                {(() => {
                                                    const values = chartDataBySensor[selectedSensor]
                                                        .map(d => Number(d.value))
                                                        .filter(v => !isNaN(v) && isFinite(v));
                                                    if (values.length === 0) return 'N/A';
                                                    return Math.max(...values).toFixed(2);
                                                })()}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Chart Cards - One per sensor when "all" selected, or single chart for selected sensor */}
                {Object.entries(chartDataBySensor)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([sensorName, chartData]) =>
                        chartData.length > 0 && (
                            <div key={`chart-${sensorName}`} className="card chart-card">
                                <h3>{sensorName} Time Series</h3>
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
                                        <YAxis
                                            tick={{ fontSize: 12 }}
                                            domain={[
                                                (dataMin: number) => {
                                                    // Round down to nearest sensible value with padding
                                                    const padding = (dataMin) * 0.05; // 5% padding
                                                    const minWithPadding = dataMin - Math.abs(padding);
                                                    // Find order of magnitude
                                                    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(minWithPadding))));
                                                    const roundTo = magnitude >= 100 ? 50 : magnitude >= 10 ? 10 : magnitude >= 1 ? 1 : 0.1;
                                                    return Math.floor(minWithPadding / roundTo) * roundTo;
                                                },
                                                (dataMax: number) => {
                                                    // Round up to nearest sensible value with padding
                                                    const padding = (dataMax) * 0.05; // 5% padding
                                                    const maxWithPadding = dataMax + Math.abs(padding);
                                                    // Find order of magnitude
                                                    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(maxWithPadding))));
                                                    const roundTo = magnitude >= 100 ? 50 : magnitude >= 10 ? 10 : magnitude >= 1 ? 1 : 0.1;
                                                    return Math.ceil(maxWithPadding / roundTo) * roundTo;
                                                }
                                            ]}
                                            scale="linear"
                                        />
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
                                            type={chartData[0]?.unit === 'bin' ? "stepAfter" : "monotone"}
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
                    <CommandBuilder onSendCommand={sendCommand} loading={loading} />
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
                                            position: 'relative',
                                        }}
                                        onClick={() => setSelectedImage(img)}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent selecting the image
                                                deleteImage(img.image_id);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '4px',
                                                right: '4px',
                                                background: 'rgba(239, 68, 68, 0.9)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '24px',
                                                height: '24px',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                zIndex: 1
                                            }}
                                            title="Delete image"
                                        >×</button>
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
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => deleteImage(selectedImage.image_id)}
                                                style={{
                                                    background: 'var(--danger)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px'
                                                }}
                                                title="Delete image"
                                            >🗑️ Delete</button>
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
        </div >
    );
}
