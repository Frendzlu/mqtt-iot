# MQTT Message Format Specification

## Overview

All MQTT messages must be valid JSON with standardized fields for consistency and proper acknowledgment handling.

## Message Topics

- **Telemetry**: `/{userUuid}/devices/{deviceId}/telemetry`
- **Alarms**: `/{userUuid}/devices/{deviceId}/alarms`
- **Images**: `/{userUuid}/devices/{deviceId}/images`
- **Commands/Acknowledgments**: `/{userUuid}/devices/{deviceId}/commands`

## 1. Telemetry Messages

### Single Reading Format

```json
{
  "sensor": "temperature",
  "value": 25.5,
  "unit": "°C",
  "isBatch": false,
  "messageId": "msg-12345"
}
```

**Fields:**
- `sensor` (required): Sensor name/type (string)
- `value` (required): Sensor reading (number)
- `unit` (optional): Unit of measurement (string)
- `isBatch` (optional): Always `false` for single readings (boolean)
- `messageId` (optional): Unique message ID for acknowledgment tracking (string)

### Batch Reading Format

For battery conservation, devices can send multiple readings in one message:

```json
{
  "sensor": "temperature",
  "value": [
    ["2026-01-13T10:00:00Z", 24.5],
    ["2026-01-13T10:05:00Z", 24.8],
    ["2026-01-13T10:10:00Z", 25.1]
  ],
  "unit": "°C",
  "isBatch": true,
  "messageId": "batch-67890"
}
```

**Fields:**
- `sensor` (required): Sensor name/type (string)
- `value` (required): Array of `[timestamp, value]` tuples (array)
  - `timestamp`: ISO 8601 format (string)
  - `value`: Sensor reading (number)
- `unit` (optional): Unit of measurement (string)
- `isBatch` (required): Must be `true` for batch readings (boolean)
- `messageId` (optional): Unique message ID for acknowledgment tracking (string)

### Acknowledgment Response

After successful storage, the backend sends an acknowledgment to the device:

```json
{
  "type": "ack",
  "messageId": "msg-12345",
  "status": "success",
  "recordCount": 1,
  "timestamp": "2026-01-13T10:15:00Z"
}
```

**Success Response:**
- `type`: Always `"ack"` (string)
- `messageId`: The original message ID (string)
- `status`: `"success"` or `"error"` (string)
- `recordCount`: Number of records stored (number)
- `timestamp`: Server timestamp (string)

**Error Response:**
```json
{
  "type": "ack",
  "messageId": "msg-12345",
  "status": "error",
  "error": "Missing required fields: sensor and value",
  "timestamp": "2026-01-13T10:15:00Z"
}
```

## 2. Alarm Messages

```json
{
  "severity": "critical",
  "message": "Temperature exceeded 50°C"
}
```

**Fields:**
- `severity` (optional): `"critical"`, `"warning"`, or `"info"` (default: `"info"`)
- `message` (required): Alarm description (string)

## 3. Image Messages

Images are sent as Base64-encoded strings with metadata:

```json
{
  "imageId": "img-abc123",
  "messageId": "msg-img-456",
  "data": "iVBORw0KGgoAAAANSUhEUgA...(base64 data)...",
  "metadata": {
    "contentType": "image/jpeg",
    "width": 1920,
    "height": 1080,
    "size": 245678,
    "camera": "front",
    "timestamp": "2026-01-13T10:20:00Z"
  }
}
```

**Fields:**
- `imageId` (required): Unique image identifier (string)
- `messageId` (optional): Message ID for acknowledgment (string)
- `data` (required): Base64-encoded image data (string)
- `metadata` (optional): Image metadata object
  - `contentType`: MIME type (e.g., `"image/jpeg"`, `"image/png"`)
  - `width`: Image width in pixels
  - `height`: Image height in pixels
  - `size`: Original file size in bytes
  - `camera`: Camera identifier (e.g., `"front"`, `"rear"`)
  - `timestamp`: When the image was captured

### Image Acknowledgment

```json
{
  "type": "ack",
  "messageId": "msg-img-456",
  "imageId": "img-abc123",
  "status": "success",
  "timestamp": "2026-01-13T10:21:00Z"
}
```

## Example Usage

### Arduino/ESP32 Example

```cpp
#include <ArduinoJson.h>
#include <PubSubClient.h>

// Single reading
void sendTelemetry(float temp) {
  StaticJsonDocument<256> doc;
  doc["sensor"] = "temperature";
  doc["value"] = temp;
  doc["unit"] = "°C";
  doc["isBatch"] = false;
  doc["messageId"] = "msg-" + String(millis());
  
  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(telemetryTopic, buffer);
}

// Batch reading
void sendBatchTelemetry(float readings[][2], int count) {
  DynamicJsonDocument doc(2048);
  doc["sensor"] = "temperature";
  doc["unit"] = "°C";
  doc["isBatch"] = true;
  doc["messageId"] = "batch-" + String(millis());
  
  JsonArray valueArray = doc.createNestedArray("value");
  for (int i = 0; i < count; i++) {
    JsonArray entry = valueArray.createNestedArray();
    entry.add(getISOTimestamp(readings[i][0]));
    entry.add(readings[i][1]);
  }
  
  char buffer[2048];
  serializeJson(doc, buffer);
  mqttClient.publish(telemetryTopic, buffer);
}
```

### Python Example

```python
import json
import paho.mqtt.client as mqtt
from datetime import datetime
import base64

# Single reading
def send_telemetry(sensor, value, unit=None):
    message = {
        "sensor": sensor,
        "value": value,
        "unit": unit,
        "isBatch": False,
        "messageId": f"msg-{int(time.time() * 1000)}"
    }
    client.publish(telemetry_topic, json.dumps(message))

# Batch reading
def send_batch_telemetry(sensor, readings, unit=None):
    message = {
        "sensor": sensor,
        "value": [[ts.isoformat(), val] for ts, val in readings],
        "unit": unit,
        "isBatch": True,
        "messageId": f"batch-{int(time.time() * 1000)}"
    }
    client.publish(telemetry_topic, json.dumps(message))

# Send image
def send_image(image_path, camera="default"):
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    message = {
        "imageId": f"img-{int(time.time() * 1000)}",
        "messageId": f"msg-img-{int(time.time() * 1000)}",
        "data": image_data,
        "metadata": {
            "contentType": "image/jpeg",
            "camera": camera,
            "timestamp": datetime.now().isoformat()
        }
    }
    client.publish(image_topic, json.dumps(message))

# Handle acknowledgments
def on_message(client, userdata, msg):
    if "commands" in msg.topic:
        ack = json.loads(msg.payload)
        if ack.get("type") == "ack":
            if ack.get("status") == "success":
                # Delete local storage after successful upload
                delete_local_data(ack.get("messageId"))
            else:
                print(f"Error: {ack.get('error')}")
```

## Benefits

### 1. Unified Format
- Consistent JSON structure across all message types
- Easier parsing and validation
- Better error handling

### 2. Batch Telemetry
- Reduces MQTT message overhead
- Conserves battery on IoT devices
- Maintains timestamp accuracy for each reading
- Backend stores each reading with its original timestamp

### 3. Acknowledgment System
- Devices know when data is successfully received
- Enables reliable local storage cleanup
- Supports retry logic for failed transmissions
- Prevents data loss

### 4. Image Support
- Base64 encoding for binary data transmission
- Metadata for image context
- Same acknowledgment system as telemetry
- Suitable for surveillance cameras, quality inspection, etc.

## Migration from Old Format

The old formats are no longer supported. Update your devices to use the new JSON format:

**Old format (deprecated):**
```
temperature:25.5°C
```

**New format:**
```json
{"sensor": "temperature", "value": 25.5, "unit": "°C", "isBatch": false}
```
