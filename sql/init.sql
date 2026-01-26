-- Initialize database schema for MQTT telemetry and alarms
-- This schema includes all migrations applied up to v5

-- Users table: stores user accounts with credentials
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices table: stores devices for each user (with ownership history)
-- Composite primary key (mac_address, user_uuid) allows tracking device ownership history
-- Only one entry per device can be active=true (enforced by unique index)
CREATE TABLE IF NOT EXISTS devices (
    mac_address VARCHAR(255) NOT NULL,
    user_uuid VARCHAR(255) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mac_address, user_uuid)
);

-- Telemetry table: stores time series data from devices
CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    user_uuid VARCHAR(255) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    device_mac_address VARCHAR(255) NOT NULL REFERENCES devices(mac_address) ON DELETE CASCADE,
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
    user_uuid VARCHAR(255) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    device_mac_address VARCHAR(255) NOT NULL REFERENCES devices(mac_address) ON DELETE CASCADE,
    device_name VARCHAR(255),
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Images table: stores images from devices
-- Note: image_data is nullable to support file-based storage
CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    user_uuid VARCHAR(255) NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    device_mac_address VARCHAR(255) NOT NULL REFERENCES devices(mac_address) ON DELETE CASCADE,
    device_name VARCHAR(255),
    image_id VARCHAR(255) NOT NULL,
    image_data TEXT,
    file_path VARCHAR(500),
    file_size BIGINT,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_uuid);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(user_uuid, active);
CREATE INDEX IF NOT EXISTS idx_devices_mac_active ON devices(mac_address, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_mac_active_unique ON devices(mac_address) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_telemetry_user_device ON telemetry(user_uuid, device_mac_address);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_sensor ON telemetry(user_uuid, device_mac_address, sensor_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_message_id ON telemetry(message_id);
CREATE INDEX IF NOT EXISTS idx_alarms_user_device ON alarms(user_uuid, device_mac_address);
CREATE INDEX IF NOT EXISTS idx_alarms_timestamp ON alarms(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged);
CREATE INDEX IF NOT EXISTS idx_images_user_device ON images(user_uuid, device_mac_address);
CREATE INDEX IF NOT EXISTS idx_images_timestamp ON images(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_images_image_id ON images(image_id);
CREATE INDEX IF NOT EXISTS idx_images_file_path ON images(file_path);

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user accounts with authentication credentials';
COMMENT ON TABLE devices IS 'Stores IoT devices owned by users with ownership history (active flag indicates current owner)';
COMMENT ON COLUMN devices.active IS 'Whether this device is currently owned by this user (false for historical ownership)';
COMMENT ON TABLE telemetry IS 'Stores time series telemetry data from IoT devices';
COMMENT ON TABLE alarms IS 'Stores alarm and alert events from IoT devices';
COMMENT ON TABLE images IS 'Stores images captured by IoT devices';
COMMENT ON COLUMN telemetry.message_id IS 'Optional message ID for tracking acknowledgments';
COMMENT ON COLUMN alarms.severity IS 'Alarm severity: critical, warning, info';
COMMENT ON COLUMN alarms.acknowledged IS 'Whether the alarm has been acknowledged by a user';
COMMENT ON COLUMN images.image_data IS 'Base64 encoded image data (deprecated, use file_path)';
COMMENT ON COLUMN images.file_path IS 'Path to image file in storage bucket';
COMMENT ON COLUMN images.file_size IS 'Size of image file in bytes';
COMMENT ON COLUMN images.metadata IS 'Image metadata (content type, size, camera settings, etc.)';
