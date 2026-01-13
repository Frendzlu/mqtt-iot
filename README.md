# MQTT IoT Dashboard

A full-stack IoT device management system with real-time telemetry monitoring, time series visualization, and alarm management.

## Features

- 🔐 **User Authentication**: Register/login with secure password hashing
- 📱 **Device Management**: Create and manage multiple IoT devices
- 📊 **Time Series Visualization**: Real-time charts showing telemetry data
- 🔔 **Alarm System**: Receive, display, and acknowledge device alarms
- 💾 **PostgreSQL Storage**: Persistent storage for telemetry and alarm data
- 🔌 **MQTT Integration**: Full MQTT broker with authentication and ACLs
- 🎨 **Modern UI**: Responsive dashboard with clean design

## Architecture

- **Frontend**: React + TypeScript + Vite + Recharts (port 5173)
- **Backend**: Node.js + Express + Socket.IO (port 3001)
- **MQTT Broker**: Mosquitto (TCP: 1883, WebSocket: 9001)
- **Database**: PostgreSQL (port 5432)

## Quick Start

```bash
# Start all services
docker compose up --build

# Access the dashboard
open http://localhost:5173
```

## Endpoints

### Frontend
- Dashboard: `http://localhost:5173`

### Backend API
- `POST /register` - Register new user
- `POST /login` - Login user
- `GET /devices/:uuid` - Get user's devices
- `POST /add-device` - Add new device
- `POST /publish` - Publish command to device(s)
- `GET /telemetry/:userUuid/:deviceId` - Get device telemetry
- `GET /alarms/:userUuid` - Get user's alarms
- `POST /alarms/:alarmId/acknowledge` - Acknowledge an alarm

### MQTT Broker
- TCP: `tcp://localhost:1883`
- WebSocket: `ws://localhost:9001`

## MQTT Topics

### Telemetry (Device → Backend)
```
/{userUuid}/devices/{deviceId}/telemetry
```

The system supports multiple sensors per device. You can send data in several formats:

**Single sensor - simple value:**
```bash
mosquitto_pub -h localhost -u <userUuid> -P <password> \
  -t "/<userUuid>/devices/<deviceId>/telemetry" -m "25.5°C"
```

**Single sensor - with name:**
```bash
mosquitto_pub -h localhost -u <userUuid> -P <password> \
  -t "/<userUuid>/devices/<deviceId>/telemetry" -m "temperature:25.5°C"
```

**Multiple sensors - JSON format (recommended):**
```bash
mosquitto_pub -h localhost -u <userUuid> -P <password> \
  -t "/<userUuid>/devices/<deviceId>/telemetry" \
  -m '{"temperature":25.5,"humidity":60,"pressure":1013.25}'
```

Each sensor will be stored separately and can be filtered independently in the dashboard.

### Commands (Backend → Device)
```
/{userUuid}/devices/{deviceId}/commands
```
Example: Subscribe to commands
```bash
mosquitto_sub -h localhost -u <userUuid> -P <password> \
  -t "/<userUuid>/devices/<deviceId>/commands"
```

### Alarms (Device → Backend)
```
/{userUuid}/devices/{deviceId}/alarms
```
Example: Send critical alarm
```bash
mosquitto_pub -h localhost -u <userUuid> -P <password> \
  -t "/<userUuid>/devices/<deviceId>/alarms" \
  -m '{"severity":"critical","message":"Temperature exceeded 50°C"}'
```

Supported severities: `info`, `warning`, `critical`

## Device Simulator

Use the included test script to simulate a device:

```bash
# Make executable
chmod +x test-device.sh

# Run simulator
./test-device.sh
```

The simulator supports:
1. **Temperature sensor mode**: Sends random temperature readings
2. **Manual mode**: Enter custom values
3. **Stress test mode**: Rapid data generation

## Database Schema

### Telemetry Table
- Stores all device telemetry with timestamps
- Automatically extracts numeric values and units
- Indexed for fast queries

### Alarms Table
- Stores alarm events with severity levels
- Track acknowledgment status
- Filter by device, severity, or acknowledgment status

## Development

### Backend Environment Variables
```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=mqtt_user
DB_PASSWORD=mqtt_pass
DB_NAME=mqtt_db
BROKER_USER=backend-manager
BROKER_PASS=supersecret
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Backend Development
```bash
cd backend
npm install
node server.js
```

## Usage Flow

1. **Register**: Create account at `http://localhost:5173`
2. **Add Devices**: Use the sidebar to add IoT devices
3. **Get Credentials**: Copy your UUID and password from the dashboard
4. **Connect Device**: Use credentials to connect your MQTT device
5. **Monitor**: View real-time telemetry charts and statistics
6. **Control**: Send commands to devices from the dashboard
7. **Respond**: Acknowledge alarms as they arrive

## Tips

- **Time Series Data**: The system automatically parses numeric values from telemetry messages
- **Alarm Format**: Use JSON with `severity` and `message` fields for structured alarms
- **Command History**: All commands sent are logged in the backend
- **Data Retention**: Telemetry queries default to last 24 hours but are configurable
- **Multiple Devices**: Commands can be sent to all devices or individual ones

## Troubleshooting

**Connection refused to PostgreSQL:**
```bash
docker compose down -v
docker compose up --build
```

**MQTT authentication failed:**
- Ensure you're using the UUID as username (not your account username)
- Use the password you set during registration

**Frontend can't connect to backend:**
- Check backend is running on port 3001
- Verify no firewall blocking connections

**No data in charts:**
- Ensure devices are publishing to correct topics
- Check telemetry format includes parseable numeric values
- Verify time range selector shows appropriate window

## License

MIT