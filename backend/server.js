import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }, // allow all origins for dev
});

// --- In-memory storage ---
const users = new Map();

// --- MQTT client ---
const mqttClient = mqtt.connect("mqtt://mosquitto:1883", {
    clientId: "backend-manager",
    username: "backend-manager",
    password: "supersecret",
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

    res.json({ username, uuid });
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
