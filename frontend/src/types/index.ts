export type Device = {
    macAddress: string;
    name: string;
    active?: boolean; // Optional for backward compatibility, indicates if device is currently owned
};

export type Alarm = {
    id: number;
    device_mac_address: string;
    device_name: string;
    severity: string;
    message: string;
    acknowledged: boolean;
    acknowledged_at: string | null;
    timestamp: string;
};

export type TelemetryData = {
    id: number;
    device_mac_address: string;
    device_name: string;
    sensor_name: string | null;
    message: string;
    value: number | null;
    unit: string | null;
    timestamp: string;
};

export type SensorInfo = {
    sensor_name: string;
    reading_count: number;
    last_reading: string;
};

export type ImageData = {
    id: number;
    device_mac_address: string;
    device_name: string;
    image_id: string;
    file_path: string;
    file_size: number;
    metadata: any;
    timestamp: string;
};