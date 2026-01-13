# Quick Start Guide

## 1. Start the System

```bash
docker compose up --build
```

Wait for all services to start:
- ✅ PostgreSQL database ready
- ✅ Mosquitto MQTT broker running
- ✅ Backend API server started
- ✅ Frontend served on port 5173

## 2. Access the Dashboard

Open your browser: http://localhost:5173

## 3. Create Your Account

1. Enter a username and password
2. Click **Register**
3. Your User UUID will be displayed (save this!)

## 4. Add Your First Device

1. In the sidebar, enter a device name (e.g., "Temperature Sensor")
2. Click **+ Add**
3. Device will appear in the list

## 5. Test with the Simulator

Open a new terminal and run:

```bash
./test-device.sh
```

Enter your credentials:
- **User UUID**: (from dashboard)
- **Password**: (your registration password)
- **Device ID**: (from dashboard, shown after device name)

Choose mode:
- **Mode 1**: Temperature sensor (automatic readings every 2s)
- **Mode 2**: Manual input
- **Mode 3**: Stress test (rapid data)

## 6. Watch the Data Flow

Back in the dashboard:
1. Select your device from the sidebar
2. Watch the **Latest Reading** card update
3. See the **Time Series Chart** populate
4. View **Statistics** update in real-time

## 7. Send a Command

1. In the **Send Command** section
2. Type a command (e.g., "STATUS" or "RESET")
3. Click **Send Command**
4. Command appears in the terminal running the simulator

## 8. Test Alarms

### Using the simulator:
In manual mode (Mode 2), type:
```
alarm:critical:Temperature too high!
```

### Using mosquitto_pub:
```bash
mosquitto_pub -h localhost -u <UUID> -P <password> \
  -t "/<UUID>/devices/<deviceId>/alarms" \
  -m '{"severity":"warning","message":"Low battery"}'
```

### View alarms:
1. Click the **🔔 Alarms** button in the header
2. See unacknowledged alarms highlighted
3. Click **✓ Acknowledge** to mark as read

## 9. Explore Features

### Time Series Visualization
- Change time range (1hr, 6hr, 24hr, 1 week)
- Hover over chart points for details
- View min/max/average statistics

### Multiple Devices
- Add more devices from the sidebar
- Switch between devices to see individual dashboards
- Send commands to specific devices or all at once

### MQTT Credentials
- View in the sidebar bottom section
- Username = Your UUID
- Password = Your registration password
- Use these to connect any MQTT client

## 10. Connect Real Devices

Use any MQTT client library:

### Python Example
```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.username_pw_set("your-uuid", "your-password")
client.connect("localhost", 1883, 60)

# Send telemetry
client.publish("/your-uuid/devices/device-id/telemetry", "25.5°C")

# Send alarm
import json
alarm = {"severity": "warning", "message": "Alert!"}
client.publish("/your-uuid/devices/device-id/alarms", json.dumps(alarm))

# Subscribe to commands
def on_message(client, userdata, message):
    print(f"Command: {message.payload.decode()}")

client.on_message = on_message
client.subscribe("/your-uuid/devices/device-id/commands")
client.loop_forever()
```

### Arduino/ESP32 Example
```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* mqtt_user = "your-uuid";
const char* mqtt_pass = "your-password";
const char* telemetry_topic = "/your-uuid/devices/device-id/telemetry";

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
    client.setServer("your-server-ip", 1883);
    client.connect("ESP32Client", mqtt_user, mqtt_pass);
}

void loop() {
    float temp = readTemperature();
    char msg[50];
    sprintf(msg, "%.2f°C", temp);
    client.publish(telemetry_topic, msg);
    delay(2000);
}
```

## Troubleshooting

**Can't see data in charts?**
- Check device is publishing to correct topic format
- Verify numeric values are in the message
- Select appropriate time range

**MQTT connection refused?**
- Ensure you're using UUID as username (not your account name)
- Double-check password
- Verify broker is running: `docker ps | grep mosquitto`

**No alarms showing?**
- Check alarm topic format
- Ensure JSON is valid for severity/message
- Look for errors in backend logs: `docker logs backend`

**Database errors?**
- Restart containers: `docker compose restart`
- Check PostgreSQL: `docker logs postgres`

## Next Steps

- Add more devices and organize them
- Set up monitoring for critical alarms
- Export telemetry data for analysis
- Configure alerting thresholds
- Integrate with your IoT hardware

## Support

Check the main README.md for detailed API documentation and advanced configuration options.
