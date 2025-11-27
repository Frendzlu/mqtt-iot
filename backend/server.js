import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import bcrypt from "bcryptjs";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }, // allow all origins for dev
});

// --- Persistent storage for users ---
const USERS_FILE = process.env.USERS_FILE || "/mosquitto/data/users.json";

function ensureUsersFile() {
    try {
        const dir = path.dirname(USERS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    } catch (err) {
        console.error("Could not ensure users file:", err);
    }
}

function loadUsers() {
    ensureUsersFile();
    try {
        const data = fs.readFileSync(USERS_FILE, "utf8");
        return JSON.parse(data || "[]");
    } catch (err) {
        console.error("Failed to load users file:", err);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Failed to save users file:", err);
    }
}

// in-memory map for quick access (loaded at start)
const users = new Map(loadUsers().map((u) => [u.uuid, u]));

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

mqttClient.on("message", (topic, message) => {
    const msg = message.toString();
    console.log(`[MQTT] ${topic}: ${msg}`);

    // Broadcast telemetry to frontend via Socket.IO
    users.forEach((user, uuid) => {
        if (topic.startsWith(`/${uuid}/devices/`) && topic.endsWith("/telemetry")) {
            io.to(uuid).emit("telemetry", msg);
        }
    });
});

// --- REST endpoints ---
app.get("/", (_, res) => res.send("Backend with managed MQTT + WebSockets running"));

app.post("/create-user", (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username required" });

    const uuid = uuidv4();
    const user = { username, uuid, devices: [] };
    users.set(uuid, user);

    // persist newly created user so devices (and user) survive restarts
    saveUsers(Array.from(users.values()));

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
    const user = { username, uuid, passwordHash, devices: [] };
    users.set(uuid, user);
    saveUsers(Array.from(users.values()));

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

app.post("/add-device", (req, res) => {
    const { userUuid, deviceName } = req.body;
    if (!deviceName) return res.status(400).json({ error: "Device name required" });

    const user = users.get(userUuid);
    if (!user) return res.status(404).json({ error: "User not found" });

    const device = { id: uuidv4(), name: deviceName };
    user.devices.push(device);
    // persist devices to users file so devices survive restarts
    saveUsers(Array.from(users.values()));

    res.json(device);
});

app.post("/publish", (req, res) => {
    const { userUuid, deviceId, message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const user = users.get(userUuid);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (deviceId) {
        mqttClient.publish(`/${userUuid}/devices/${deviceId}/commands`, message);
    } else {
        user.devices.forEach((d) => {
            mqttClient.publish(`/${userUuid}/devices/${d.id}/commands`, message);
        });
    }

    res.json({ status: "ok" });
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
httpServer.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
