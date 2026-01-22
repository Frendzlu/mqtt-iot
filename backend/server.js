import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid"; // Still needed for user UUIDs
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }, // allow all origins for dev
});

// --- PostgreSQL connection pool ---
const pool = new Pool({
    host: process.env.DB_HOST || "postgres",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "mqtt_user",
    password: process.env.DB_PASSWORD || "mqtt_pass",
    database: process.env.DB_NAME || "mqtt_db",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on("connect", () => {
    console.log("[DB] Connected to PostgreSQL");
});

pool.on("error", (err) => {
    console.error("[DB] Unexpected error on idle client", err);
});

// --- Load users from database at startup ---
async function loadUsersFromDB() {
    try {
        const result = await pool.query('SELECT uuid, username, password_hash FROM users');
        const users = result.rows.map(row => ({
            uuid: row.uuid,
            username: row.username,
            passwordHash: row.password_hash,
            devices: []
        }));

        // Load devices for each user
        const devicesResult = await pool.query('SELECT mac_address, user_uuid, name FROM devices');
        for (const deviceRow of devicesResult.rows) {
            const user = users.find(u => u.uuid === deviceRow.user_uuid);
            if (user) {
                user.devices.push({ macAddress: deviceRow.mac_address, name: deviceRow.name });
            }
        }

        console.log(`[STARTUP] Loaded ${users.length} users with ${devicesResult.rows.length} devices from database`);
        return users;
    } catch (err) {
        console.error('[STARTUP] Failed to load users from database:', err);
        return [];
    }
}

// in-memory map for quick access (loaded at start from database)
let users = new Map();

// --- MQTT client ---
const mqttClient = mqtt.connect("mqtt://mosquitto:1883", {
    clientId: process.env.BROKER_CLIENTID || "backend-manager",
    username: process.env.BROKER_USER || "backend-manager",
    password: process.env.BROKER_PASS || "supersecret",
    clean: true,
});

mqttClient.on("connect", () => {
    console.log("[MQTT] Connected to broker");
    mqttClient.subscribe("#", { qos: 0 }, (err) => {
        if (err) console.error("[MQTT] Subscribe error:", err);
    });
});

mqttClient.on("message", async (topic, message) => {
    const msg = message.toString();
    console.log(`[MQTT] ${topic}: ${msg}`);

    // Parse topic: /{uuid}/devices/{deviceId}/{type} or /{uuid}/devices for self-registration
    const parts = topic.split("/");
    
    // Handle device self-registration: /{uuid}/devices
    if (parts.length === 3 && parts[2] === "devices") {
        const userUuid = parts[1];
        const user = users.get(userUuid);
        if (!user) {
            console.warn(`[DEVICE-REGISTER] User not found: ${userUuid}`);
            return;
        }

        let registrationData;
        try {
            registrationData = JSON.parse(msg);
        } catch (e) {
            // If not JSON, treat the entire message as device name
            registrationData = { name: msg };
        }

        const deviceName = registrationData.name || `Device-${macAddress}`;
        const macAddress = registrationData.macAddress;
        
        if (!macAddress) {
            console.warn(`[DEVICE-REGISTER] MAC address required in message: ${msg}`);
            return;
        }

        // Convert MAC address format (replace : with _)
        const deviceMacAddress = macAddress.replace(/:/g, '_');

        // Check if device with this MAC address exists for ANY user
        let existingDevice = null;
        let existingUser = null;
        
        for (const [userUuid, userData] of users) {
            const device = userData.devices.find(d => d.macAddress === deviceMacAddress);
            if (device) {
                existingDevice = device;
                existingUser = userData;
                break;
            }
        }

        if (existingDevice && existingUser && existingUser.uuid !== userUuid) {
            // Device exists for another user - reassign it
            // Historical data stays with the old user, new data goes to new user
            console.log(`[DEVICE-REGISTER] Reassigning device ${deviceMacAddress} from user ${existingUser.username} to ${user.username}`);
            
            try {
                // Update device ownership in database (but leave historical data with old user)
                await pool.query('UPDATE devices SET user_uuid = $1, name = $2 WHERE mac_address = $3', [userUuid, deviceName, deviceMacAddress]);
                
                // Update in-memory data
                existingUser.devices = existingUser.devices.filter(d => d.macAddress !== deviceMacAddress);
                const reassignedDevice = { macAddress: deviceMacAddress, name: deviceName };
                user.devices.push(reassignedDevice);
                
                console.log(`[DEVICE-REGISTER] Reassigned device: ${deviceName} (${deviceMacAddress}) to user ${user.username}. Historical data remains with ${existingUser.username}`);
                
                // Send response back to device
                const responseTopic = `/${userUuid}/devices/register-response`;
                const responseMessage = JSON.stringify({
                    name: deviceName,
                    macAddress: deviceMacAddress,
                    status: "reassigned",
                    timestamp: new Date().toISOString()
                });
                mqttClient.publish(responseTopic, responseMessage);
                
                // Broadcast device creation to frontend via Socket.IO
                io.to(userUuid).emit("device-registered", {
                    macAddress: deviceMacAddress,
                    deviceName: deviceName,
                    timestamp: new Date().toISOString()
                });
                
                return;
            } catch (err) {
                console.error('[DEVICE-REGISTER] Database error during reassignment:', err);
                const responseTopic = `/${userUuid}/devices/register-response`;
                const responseMessage = JSON.stringify({
                    name: deviceName,
                    macAddress: deviceMacAddress,
                    status: "error",
                    error: err.message,
                    timestamp: new Date().toISOString()
                });
                mqttClient.publish(responseTopic, responseMessage);
                return;
            }
        } else if (existingDevice && existingUser && existingUser.uuid === userUuid) {
            // Device already exists for this user
            if (existingDevice.name !== deviceName) {
                // Update device name only
                try {
                    await pool.query('UPDATE devices SET name = $1 WHERE mac_address = $2', [deviceName, deviceMacAddress]);
                    existingDevice.name = deviceName;
                    console.log(`[DEVICE-REGISTER] Updated device name: ${deviceName} (${deviceMacAddress})`);
                    
                    // Send response back to device
                    const responseTopic = `/${userUuid}/devices/register-response`;
                    const responseMessage = JSON.stringify({
                        name: deviceName,
                        macAddress: deviceMacAddress,
                        status: "name_updated",
                        timestamp: new Date().toISOString()
                    });
                    mqttClient.publish(responseTopic, responseMessage);
                } catch (err) {
                    console.error('[DEVICE-REGISTER] Database error updating device name:', err);
                    const responseTopic = `/${userUuid}/devices/register-response`;
                    const responseMessage = JSON.stringify({
                        name: deviceName,
                        macAddress: deviceMacAddress,
                        status: "error",
                        error: err.message,
                        timestamp: new Date().toISOString()
                    });
                    mqttClient.publish(responseTopic, responseMessage);
                }
            } else {
                // Both user and name match - do nothing
                console.log(`[DEVICE-REGISTER] Device ${deviceName} (${deviceMacAddress}) already exists for user ${user.username} with same name - no changes needed`);
                
                // Send response back to device
                const responseTopic = `/${userUuid}/devices/register-response`;
                const responseMessage = JSON.stringify({
                    name: deviceName,
                    macAddress: deviceMacAddress,
                    status: "unchanged",
                    timestamp: new Date().toISOString()
                });
                mqttClient.publish(responseTopic, responseMessage);
            }
            return;
        }

        // Create new device
        const newDevice = { macAddress: deviceMacAddress, name: deviceName };

        // Save to database
        pool.query(
            'INSERT INTO devices (mac_address, user_uuid, name) VALUES ($1, $2, $3)',
            [deviceMacAddress, userUuid, deviceName]
        )
        .then(() => {
            // Add to in-memory user
            user.devices.push(newDevice);
            console.log(`[DEVICE-REGISTER] Created new device: ${deviceName} (${deviceMacAddress}) for user ${user.username}`);

            // Send response back to device
            const responseTopic = `/${userUuid}/devices/register-response`;
            const responseMessage = JSON.stringify({
                name: deviceName,
                macAddress: deviceMacAddress,
                status: "created",
                timestamp: new Date().toISOString()
            });
            mqttClient.publish(responseTopic, responseMessage);

            // Broadcast device creation to frontend via Socket.IO
            io.to(userUuid).emit("device-registered", {
                macAddress: deviceMacAddress,
                deviceName: deviceName,
                timestamp: new Date().toISOString()
            });
        })
        .catch((err) => {
            console.error('[DEVICE-REGISTER] Database error:', err);
            const responseTopic = `/${userUuid}/devices/register-response`;
            const responseMessage = JSON.stringify({
                name: deviceName,
                macAddress: deviceMacAddress,
                status: "error",
                error: err.message,
                timestamp: new Date().toISOString()
            });
            mqttClient.publish(responseTopic, responseMessage);
        });

        return;
    }

    if (parts.length >= 5 && parts[2] === "devices") {
        const userUuid = parts[1];
        const deviceMacAddress = parts[3];
        const messageType = parts[4];

        const user = users.get(userUuid);
        if (!user) return;

        const device = user.devices.find((d) => d.macAddress === deviceMacAddress);
        const deviceName = device ? device.name : "Unknown";

        // Handle telemetry messages
        if (messageType === "telemetry") {
            // Store telemetry in database
            storeTelemetry(userUuid, deviceMacAddress, deviceName, msg)
                .then((result) => {
                    console.log(`[TELEMETRY] Stored ${result.recordCount} reading(s) for ${deviceName}`);

                    // Broadcast telemetry to frontend via Socket.IO
                    io.to(userUuid).emit("telemetry", {
                        macAddress: deviceMacAddress,
                        deviceName,
                        message: msg,
                        timestamp: new Date().toISOString()
                    });

                    // Send acknowledgment command to device
                    if (result.messageId) {
                        const ackTopic = `/${userUuid}/devices/${deviceMacAddress}/commands`;
                        const ackMessage = JSON.stringify({
                            type: "ack",
                            messageId: result.messageId,
                            status: "success",
                            recordCount: result.recordCount,
                            timestamp: new Date().toISOString()
                        });
                        mqttClient.publish(ackTopic, ackMessage);
                        console.log(`[ACK] Sent acknowledgment for message ${result.messageId}`);
                    }
                })
                .catch((err) => {
                    console.error("[DB] Failed to store telemetry:", err);

                    // Send failure acknowledgment
                    try {
                        const data = JSON.parse(msg);
                        if (data.messageId) {
                            const ackTopic = `/${userUuid}/devices/${deviceMacAddress}/commands`;
                            const ackMessage = JSON.stringify({
                                type: "ack",
                                messageId: data.messageId,
                                status: "error",
                                error: err.message,
                                timestamp: new Date().toISOString()
                            });
                            mqttClient.publish(ackTopic, ackMessage);
                        }
                    } catch (e) {
                        // Ignore parsing errors in error handler
                    }
                });
        }

        // Handle alarm messages
        if (messageType === "alarms") {
            // Parse alarm message (expecting JSON with severity and message)
            let alarmData;
            try {
                alarmData = JSON.parse(msg);
            } catch (e) {
                alarmData = { severity: "info", message: msg };
            }

            const alarm = {
                userUuid,
                macAddress: deviceMacAddress,
                deviceName,
                severity: alarmData.severity || "info",
                message: alarmData.message || msg,
                timestamp: new Date().toISOString(),
            };

            // Broadcast alarm to frontend via Socket.IO
            io.to(userUuid).emit("alarm", alarm);

            // Store alarm in database
            storeAlarm(alarm).catch((err) => console.error("[DB] Failed to store alarm:", err));
        }

        // Handle image messages
        if (messageType === "images") {
            handleImageMessage(userUuid, deviceMacAddress, deviceName, msg)
                .then((result) => {
                    console.log(`[IMAGE] Stored image from ${deviceName}: ${result.imageId}`);

                    // Broadcast image notification to frontend
                    io.to(userUuid).emit("image", {
                        macAddress: deviceMacAddress,
                        deviceName,
                        imageId: result.imageId,
                        metadata: result.metadata,
                        timestamp: new Date().toISOString()
                    });

                    // Send acknowledgment
                    if (result.messageId) {
                        const ackTopic = `/${userUuid}/devices/${deviceId}/commands`;
                        const ackMessage = JSON.stringify({
                            type: "ack",
                            messageId: result.messageId,
                            imageId: result.imageId,
                            status: "success",
                            timestamp: new Date().toISOString()
                        });
                        mqttClient.publish(ackTopic, ackMessage);
                    }
                })
                .catch((err) => console.error("[IMAGE] Failed to store image:", err));
        }
    }
});

// Store telemetry in database
// Expected format: {"sensor": "temperature", "value": 25.5, "unit": "°C", "isBatch": false, "messageId": "msg-123"}
// Batch format: {"sensor": "temperature", "value": [[timestamp, value], ...], "unit": "°C", "isBatch": true, "messageId": "msg-123"}
async function storeTelemetry(userUuid, deviceMacAddress, deviceName, message) {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        console.error('[TELEMETRY] Invalid JSON format:', message);
        throw new Error('Telemetry must be valid JSON');
    }

    // Validate required fields
    if (!data.sensor || data.value === undefined) {
        console.error('[TELEMETRY] Missing required fields (sensor, value):', data);
        throw new Error('Missing required fields: sensor and value');
    }

    const sensorName = data.sensor;
    const unit = data.unit || null;
    const isBatch = data.isBatch || false;
    const messageId = data.messageId || null;

    try {
        if (isBatch && Array.isArray(data.value)) {
            // Batch telemetry: value is array of [timestamp, value] tuples
            for (const entry of data.value) {
                if (!Array.isArray(entry) || entry.length < 2) continue;

                const [timestamp, value] = entry;
                const parsedValue = typeof value === 'number' ? value : parseFloat(value);
                const tsDate = new Date(timestamp);

                await pool.query(
                    `INSERT INTO telemetry (user_uuid, device_mac_address, device_name, sensor_name, message, value, unit, timestamp, message_id) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [userUuid, deviceMacAddress, deviceName, sensorName, JSON.stringify(entry), parsedValue, unit, tsDate, messageId]
                );
            }
        } else {
            // Single telemetry reading
            const parsedValue = typeof data.value === 'number' ? data.value : parseFloat(data.value);

            await pool.query(
                `INSERT INTO telemetry (user_uuid, device_mac_address, device_name, sensor_name, message, value, unit, timestamp, message_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
                [userUuid, deviceMacAddress, deviceName, sensorName, JSON.stringify(data), parsedValue, unit, messageId]
            );
        }

        return { success: true, messageId, recordCount: isBatch ? data.value.length : 1 };
    } catch (err) {
        console.error('[TELEMETRY] Database error:', err);
        throw err;
    }
}

// Store alarm in database
async function storeAlarm(alarm) {
    await pool.query(
        `INSERT INTO alarms (user_uuid, device_mac_address, device_name, severity, message, timestamp) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [alarm.userUuid, alarm.macAddress, alarm.deviceName, alarm.severity, alarm.message]
    );
}

// Handle image messages
// Expected format: {"imageId": "img-123", "messageId": "msg-456", "imageData": "base64...", "metadata": {...}}
const IMAGES_DIR = process.env.IMAGES_DIR || '/app/images';

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    console.log(`[IMAGES] Created images directory: ${IMAGES_DIR}`);
}

async function handleImageMessage(userUuid, deviceMacAddress, deviceName, message) {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        console.error('[IMAGE] Invalid JSON format:', message);
        throw new Error('Image message must be valid JSON');
    }

    if (!data.imageId || !data.imageData) {
        throw new Error('Missing required fields: imageId and imageData');
    }

    const imageId = data.imageId;
    const messageId = data.messageId || null;
    const imageDataBase64 = data.imageData; // Base64 encoded image
    const metadata = data.metadata || {};

    try {
        // Generate unique filename
        const timestamp = Date.now();
        const extension = metadata.format || 'png';
        const filename = `${userUuid}_${deviceMacAddress}_${imageId}_${timestamp}.${extension}`;
        const filepath = path.join(IMAGES_DIR, filename);

        // Decode base64 and save to file
        const imageBuffer = Buffer.from(imageDataBase64, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        const fileSize = imageBuffer.length;
        console.log(`[IMAGE] Saved image to file: ${filename} (${fileSize} bytes)`);

        // Store only metadata and file path in database
        await pool.query(
            `INSERT INTO images (user_uuid, device_mac_address, device_name, image_id, file_path, file_size, metadata, timestamp, message_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
            [userUuid, deviceMacAddress, deviceName, imageId, filename, fileSize, JSON.stringify(metadata), messageId]
        );

        return { success: true, imageId, messageId, metadata, filename, fileSize };
    } catch (err) {
        console.error('[IMAGE] Error saving image:', err);
        throw err;
    }
}

// --- REST endpoints ---
app.get("/", (_, res) => res.send("Backend with managed MQTT + WebSockets running"));

app.post("/create-user", (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username required" });

    const uuid = uuidv4();
    const user = { username, uuid, devices: [] };
    users.set(uuid, user);

    res.json({ username, uuid });
});

// Register endpoint: create user, add to mosquitto passwd and ACL
app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });

    // ensure username uniqueness
    const existing = Array.from(users.values()).find((u) => u.username === username);
    if (existing) return res.status(400).json({ error: "username already exists" });

    const uuid = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);

    try {
        // Save to database
        await pool.query(
            'INSERT INTO users (uuid, username, password_hash) VALUES ($1, $2, $3)',
            [uuid, username, passwordHash]
        );

        // Add to in-memory map
        const user = { username, uuid, passwordHash, devices: [] };
        users.set(uuid, user);
    } catch (err) {
        console.error('[DB] Failed to create user:', err);
        return res.status(500).json({ error: 'Database error', details: String(err) });
    }

    // Add to mosquitto passwd using mosquitto_passwd (installed in backend image)
    const passwdPath = process.env.MOSQUITTO_PASSWD || "/mosquitto/config/passwd";
    const aclPath = process.env.MOSQUITTO_ACL || "/mosquitto/config/acl";

    exec(`mosquitto_passwd -b ${passwdPath} ${uuid} ${escapeShellArg(password)}`, (err, stdout, stderr) => {
        if (err) {
            console.error("mosquitto_passwd error:", err, stderr);
            // still return success for backend user creation, but notify client
            return res.status(500).json({ error: "failed to add user to mosquitto passwd", details: String(err) });
        }

        try {
            // Append ACL entry for this user if not present
            let acl = "";
            try { acl = fs.readFileSync(aclPath, "utf8"); } catch (e) { acl = ""; }
            const userMarker = `user ${uuid}`;
            if (!acl.includes(userMarker)) {
                const entry = `\n# user created by backend: ${username}\nuser ${uuid}\ntopic readwrite /${uuid}/#\n`;
                fs.appendFileSync(aclPath, entry);
            }

            // Try to reload broker so passwd/acl changes take effect
            reloadBroker((reloadErr) => {
                if (reloadErr) {
                    console.warn("User added but broker reload failed:", reloadErr);
                    return res.json({ username, uuid, warning: "broker reload failed, you may need to restart mosquitto" });
                }
                return res.json({ username, uuid });
            });
        } catch (e) {
            console.error("Failed to update ACL:", e);
            return res.status(500).json({ error: "failed to update ACL", details: String(e) });
        }
    });
});

function escapeShellArg(s) {
    return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}

// Attempt to reload mosquitto by sending SIGHUP to the mosquitto container via Docker socket.
function reloadBroker(callback) {
    const cmd = `curl --unix-socket /var/run/docker.sock -s -X POST http://localhost/containers/mosquitto/kill?signal=HUP`;
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error("reloadBroker: error sending HUP to mosquitto container:", err, stderr);
            return callback(err, { stdout, stderr });
        }
        console.log("reloadBroker: sent HUP to mosquitto container", stdout);
        return callback(null, { stdout, stderr });
    });
}

// Manual reload endpoint
app.post("/reload-broker", (req, res) => {
    reloadBroker((err, out) => {
        if (err) return res.status(500).json({ error: "failed to reload broker", details: String(err) });
        return res.json({ status: "ok", out });
    });
});

// Login endpoint: verify username/password
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });

    const found = Array.from(users.values()).find((u) => u.username === username);
    if (!found) return res.status(401).json({ error: "invalid credentials" });

    const ok = bcrypt.compareSync(password, found.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    // return uuid; the client will use the username = uuid and the password it provided to connect to MQTT
    return res.json({ username: found.username, uuid: found.uuid });
});

app.get("/devices/:uuid", (req, res) => {
    const user = users.get(req.params.uuid);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.devices);
});

app.post("/add-device", async (req, res) => {
    const { userUuid, deviceName, macAddress } = req.body;
    if (!deviceName || !macAddress) return res.status(400).json({ error: "Device name and MAC address required" });

    const user = users.get(userUuid);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Convert MAC address format (replace : with _)
    const deviceMacAddress = macAddress.replace(/:/g, '_');
    
    const device = { macAddress: deviceMacAddress, name: deviceName };

    try {
        // Save to database
        await pool.query(
            'INSERT INTO devices (mac_address, user_uuid, name) VALUES ($1, $2, $3)',
            [deviceMacAddress, userUuid, deviceName]
        );

        // Add to in-memory user
        user.devices.push(device);

        res.json(device);
    } catch (err) {
        console.error('[DB] Failed to create device:', err);
        return res.status(500).json({ error: 'Database error', details: String(err) });
    }
});

app.post("/publish", (req, res) => {
    const { userUuid, macAddress, message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const user = users.get(userUuid);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (macAddress) {
        mqttClient.publish(`/${userUuid}/devices/${macAddress}/commands`, message);
    } else {
        user.devices.forEach((d) => {
            mqttClient.publish(`/${userUuid}/devices/${d.macAddress}/commands`, message);
        });
    }

    res.json({ status: "ok" });
});

// Get telemetry data for a device
app.get("/telemetry/:userUuid/:macAddress", async (req, res) => {
    const { userUuid, macAddress } = req.params;
    const limit = parseInt(req.query.limit || "100");
    const hours = parseInt(req.query.hours || "24");
    const sensorName = req.query.sensor;

    // Validate hours is a number to prevent SQL injection
    if (isNaN(hours) || hours < 0 || hours > 8760) {
        return res.status(400).json({ error: "Invalid hours parameter" });
    }
    if (isNaN(limit) || limit < 1 || limit > 10000) {
        return res.status(400).json({ error: "Invalid limit parameter" });
    }

    try {
        let query = `SELECT id, device_mac_address, device_name, sensor_name, message, value, unit, timestamp 
             FROM telemetry 
             WHERE user_uuid = $1 AND device_mac_address = $2 AND timestamp > NOW() - make_interval(hours => $3)`;
        const params = [userUuid, macAddress, hours];

        if (sensorName) {
            query += ` AND sensor_name = $4`;
            params.push(sensorName);
            query += ` ORDER BY timestamp DESC LIMIT $5`;
            params.push(limit);
        } else {
            query += ` ORDER BY timestamp DESC LIMIT $4`;
            params.push(limit);
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("[DB] Error fetching telemetry:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get list of sensors for a device
app.get("/sensors/:userUuid/:macAddress", async (req, res) => {
    const { userUuid, macAddress } = req.params;

    try {
        const result = await pool.query(
            `SELECT DISTINCT sensor_name, 
             COUNT(*) as reading_count,
             MAX(timestamp) as last_reading
             FROM telemetry 
             WHERE user_uuid = $1 AND device_mac_address = $2 AND sensor_name IS NOT NULL
             GROUP BY sensor_name
             ORDER BY sensor_name`,
            [userUuid, macAddress]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("[DB] Error fetching sensors:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get all telemetry for a user
app.get("/telemetry/:userUuid", async (req, res) => {
    const { userUuid } = req.params;
    const limit = parseInt(req.query.limit || "100");
    const hours = parseInt(req.query.hours || "24");

    // Validate hours and limit to prevent SQL injection
    if (isNaN(hours) || hours < 0 || hours > 8760) {
        return res.status(400).json({ error: "Invalid hours parameter" });
    }
    if (isNaN(limit) || limit < 1 || limit > 10000) {
        return res.status(400).json({ error: "Invalid limit parameter" });
    }

    try {
        const result = await pool.query(
            `SELECT id, device_mac_address, device_name, message, value, unit, timestamp 
             FROM telemetry 
             WHERE user_uuid = $1 AND timestamp > NOW() - make_interval(hours => $2)
             ORDER BY timestamp DESC 
             LIMIT $3`,
            [userUuid, hours, limit]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("[DB] Error fetching telemetry:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get alarms for a user
app.get("/alarms/:userUuid", async (req, res) => {
    const { userUuid } = req.params;
    const limit = parseInt(req.query.limit || "50");
    const acknowledged = req.query.acknowledged;

    try {
        let query = `SELECT id, device_mac_address, device_name, severity, message, acknowledged, acknowledged_at, timestamp 
                     FROM alarms 
                     WHERE user_uuid = $1`;
        const params = [userUuid];

        if (acknowledged !== undefined) {
            query += ` AND acknowledged = $2`;
            params.push(acknowledged === "true");
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("[DB] Error fetching alarms:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Acknowledge an alarm
app.post("/alarms/:alarmId/acknowledge", async (req, res) => {
    const { alarmId } = req.params;

    try {
        await pool.query(
            `UPDATE alarms SET acknowledged = true, acknowledged_at = NOW() WHERE id = $1`,
            [alarmId]
        );
        res.json({ status: "ok" });
    } catch (err) {
        console.error("[DB] Error acknowledging alarm:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Get images for a device
// Get list of images (metadata only)
app.get("/images/:userUuid/:macAddress", async (req, res) => {
    const { userUuid, macAddress } = req.params;
    const limit = parseInt(req.query.limit || "20");

    try {
        const result = await pool.query(
            `SELECT id, image_id, device_name, file_path, file_size, metadata, timestamp, message_id
             FROM images 
             WHERE user_uuid = $1 AND device_mac_address = $2
             ORDER BY timestamp DESC 
             LIMIT $3`,
            [userUuid, macAddress, limit]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("[DB] Error fetching images:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Serve actual image file
app.get("/images/:userUuid/:macAddress/:imageId/file", async (req, res) => {
    const { userUuid, macAddress, imageId } = req.params;

    try {
        const result = await pool.query(
            `SELECT file_path, metadata FROM images 
             WHERE user_uuid = $1 AND device_mac_address = $2 AND image_id = $3
             ORDER BY timestamp DESC
             LIMIT 1`,
            [userUuid, macAddress, imageId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Image not found" });
        }

        const { file_path, metadata } = result.rows[0];

        if (!file_path) {
            return res.status(404).json({ error: "Image file path not available (legacy image)" });
        }

        const filepath = path.join(IMAGES_DIR, file_path);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: "Image file not found on disk" });
        }

        // Set content type based on metadata
        const contentType = metadata?.format ? `image/${metadata.format}` : 'image/png';
        res.setHeader('Content-Type', contentType);
        res.sendFile(filepath);
    } catch (err) {
        console.error("[API] Error serving image:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get a specific image
app.get("/images/:userUuid/:macAddress/:imageId", async (req, res) => {
    const { userUuid, macAddress, imageId } = req.params;

    try {
        const result = await pool.query(
            `SELECT image_id, device_name, image_data, metadata, timestamp
             FROM images 
             WHERE user_uuid = $1 AND device_mac_address = $2 AND image_id = $3`,
            [userUuid, macAddress, imageId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Image not found" });
        }

        const image = result.rows[0];
        res.json({
            imageId: image.image_id,
            deviceName: image.device_name,
            data: image.image_data,
            metadata: image.metadata,
            timestamp: image.timestamp
        });
    } catch (err) {
        console.error("[DB] Error fetching image:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// PUT endpoint for uploading images (alternative to MQTT)
// Expected body: { "imageId": "img-123", "imageData": "base64...", "metadata": {...} }
app.put("/images/:userUuid/:macAddress", async (req, res) => {
    const { userUuid, macAddress } = req.params;
    const { imageId, imageData, metadata } = req.body;

    // Validate user exists
    const user = users.get(userUuid);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    // Validate device exists for user
    const device = user.devices.find((d) => d.macAddress === macAddress);
    if (!device) {
        return res.status(404).json({ error: "Device not found" });
    }

    // Validate required fields
    if (!imageId || !imageData) {
        return res.status(400).json({ error: "Missing required fields: imageId and imageData" });
    }

    try {
        // Generate unique filename
        const timestamp = Date.now();
        const extension = metadata?.format || 'png';
        const filename = `${userUuid}_${macAddress}_${imageId}_${timestamp}.${extension}`;
        const filepath = path.join(IMAGES_DIR, filename);

        // Decode base64 and save to file
        const imageBuffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        const fileSize = imageBuffer.length;
        console.log(`[IMAGE] Saved image via PUT: ${filename} (${fileSize} bytes)`);

        // Store metadata and file path in database
        await pool.query(
            `INSERT INTO images (user_uuid, device_mac_address, device_name, image_id, file_path, file_size, metadata, timestamp, message_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
            [userUuid, macAddress, device.name, imageId, filename, fileSize, JSON.stringify(metadata || {}), null]
        );

        // Broadcast image notification to frontend via Socket.IO
        io.to(userUuid).emit("image", {
            macAddress,
            deviceName: device.name,
            imageId,
            metadata: metadata || {},
            timestamp: new Date().toISOString()
        });

        res.json({
            status: "ok",
            imageId,
            filename,
            fileSize,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("[IMAGE] Error saving image via PUT:", err);
        res.status(500).json({ error: "Failed to save image", details: String(err) });
    }
});

// --- Socket.IO connections ---
io.on("connection", (socket) => {
    console.log("Socket.IO client connected");

    socket.on("join", (uuid) => {
        console.log(`Socket client joined room: ${uuid}`);
        socket.join(uuid); // subscribe this socket to user's room
    });

    socket.on("disconnect", () => {
        console.log("Socket.IO client disconnected");
    });
});

const PORT = process.env.PORT || 3001;

// Initialize users from database before starting server
(async () => {
    const usersArray = await loadUsersFromDB();
    users = new Map(usersArray.map((u) => [u.uuid, u]));
    httpServer.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
})();
