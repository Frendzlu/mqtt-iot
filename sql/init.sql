-- Initialize database schema for MQTT telemetry and alarms

-- Telemetry table: stores time series data from devices
CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    user_uuid VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    sensor_name VARCHAR(255),
    message TEXT NOT NULL,
    value NUMERIC,
    unit VARCHAR(50),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alarms table: stores alarm events from devices
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    user_uuid VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Images table: stores images from devices
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    user_uuid VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    image_id VARCHAR(255) NOT NULL,
    image_data TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_telemetry_user_device ON telemetry(user_uuid, device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_sensor ON telemetry(user_uuid, device_id, sensor_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_message_id ON telemetry(message_id);
CREATE INDEX IF NOT EXISTS idx_alarms_user_device ON alarms(user_uuid, device_id);
CREATE INDEX IF NOT EXISTS idx_alarms_timestamp ON alarms(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged);
CREATE INDEX IF NOT EXISTS idx_images_user_device ON images(user_uuid, device_id);
CREATE INDEX IF NOT EXISTS idx_images_timestamp ON images(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_images_image_id ON images(image_id);

-- Comments for documentation
COMMENT ON TABLE telemetry IS 'Stores time series telemetry data from IoT devices';
COMMENT ON TABLE alarms IS 'Stores alarm and alert events from IoT devices';
COMMENT ON TABLE images IS 'Stores images captured by IoT devices';
COMMENT ON COLUMN telemetry.message_id IS 'Optional message ID for tracking acknowledgments';
COMMENT ON COLUMN alarms.severity IS 'Alarm severity: critical, warning, info';
COMMENT ON COLUMN alarms.acknowledged IS 'Whether the alarm has been acknowledged by a user';
COMMENT ON COLUMN images.image_data IS 'Base64 encoded image data';
COMMENT ON COLUMN images.metadata IS 'Image metadata (content type, size, camera settings, etc.)';
