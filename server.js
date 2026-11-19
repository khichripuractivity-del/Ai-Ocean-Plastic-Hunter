require("dotenv").config();
const express = require("express");
const http = require("http");
const mqtt = require("mqtt");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const DEMO_MODE = String(process.env.DEMO_MODE || "true").toLowerCase() === "true";

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const machines = {
  machine1: { id: "machine1", name: "Machine 01", online: false, status: "OFFLINE", mode: "MANUAL", battery: null, collectedKg: 0, updatedAt: null },
  machine2: { id: "machine2", name: "Machine 02", online: false, status: "OFFLINE", mode: "MANUAL", battery: null, collectedKg: 0, updatedAt: null }
};
let detection = { plasticCount: 0, lastLabel: "No detections yet", confidence: null, updatedAt: null };
let mqttClient = null;
let mqttConnected = false;

function broadcast() {
  io.emit("snapshot", { machines, detection, mqttConnected, demoMode: DEMO_MODE });
}

function safeMachine(id) {
  return Object.prototype.hasOwnProperty.call(machines, id) ? id : null;
}

function publish(topic, payload) {
  if (!mqttClient || !mqttConnected) {
    return { ok: false, error: "MQTT broker is not connected. Check MQTT_URL and broker status." };
  }
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error("MQTT publish error:", err.message);
  });
  return { ok: true };
}

if (!DEMO_MODE) {
  const options = {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 3000,
    connectTimeout: 10000
  };
  mqttClient = mqtt.connect(process.env.MQTT_URL || "mqtt://127.0.0.1:1883", options);

  mqttClient.on("connect", () => {
    mqttConnected = true;
    console.log("Connected to MQTT broker");
    mqttClient.subscribe([
      "ocean/machine1/status",
      "ocean/machine2/status",
      "ocean/camera/detection",
      "ocean/system/alerts"
    ], { qos: 1 });
    broadcast();
  });
  mqttClient.on("reconnect", () => { mqttConnected = false; broadcast(); });
  mqttClient.on("close", () => { mqttConnected = false; broadcast(); });
  mqttClient.on("error", (err) => console.error("MQTT error:", err.message));

  mqttClient.on("message", (topic, buffer) => {
    let data;
    try { data = JSON.parse(buffer.toString()); }
    catch { console.warn("Ignoring invalid JSON on", topic); return; }

    if (topic === "ocean/machine1/status" || topic === "ocean/machine2/status") {
      const id = topic.includes("machine1") ? "machine1" : "machine2";
      const old = machines[id];
      machines[id] = {
        ...old,
        online: true,
        status: String(data.status || old.status).toUpperCase(),
        mode: String(data.mode || old.mode).toUpperCase(),
        battery: Number.isFinite(Number(data.battery)) ? Number(data.battery) : old.battery,
        collectedKg: Number.isFinite(Number(data.collectedKg)) ? Number(data.collectedKg) : old.collectedKg,
        updatedAt: new Date().toISOString()
      };
    } else if (topic === "ocean/camera/detection") {
      detection = {
        plasticCount: Number(data.plasticCount ?? detection.plasticCount),
        lastLabel: String(data.label || "Plastic detected"),
        confidence: data.confidence == null ? null : Number(data.confidence),
        updatedAt: new Date().toISOString()
      };
    } else if (topic === "ocean/system/alerts") {
      io.emit("alert", { message: String(data.message || "System alert"), severity: String(data.severity || "warning") });
    }
    broadcast();
  });
}

app.get("/api/state", (_req, res) => {
  res.json({ machines, detection, mqttConnected, demoMode: DEMO_MODE });
});

app.post("/api/command", (req, res) => {
  const { machine, command, mode } = req.body || {};
  const id = safeMachine(machine);
  const allowedCommands = ["START", "STOP", "FORWARD", "BACKWARD", "LEFT", "RIGHT", "COLLECT"];
  if (!id || !allowedCommands.includes(String(command).toUpperCase())) {
    return res.status(400).json({ ok: false, error: "Invalid machine or command." });
  }
  const payload = { machine: id, command: String(command).toUpperCase(), mode: mode === "AUTO" ? "AUTO" : "MANUAL", timestamp: new Date().toISOString() };
  if (DEMO_MODE) {
    machines[id].online = true;
    machines[id].status = payload.command === "STOP" ? "STOPPED" : payload.command === "START" ? "RUNNING" : machines[id].status;
    machines[id].mode = payload.mode;
    machines[id].updatedAt = new Date().toISOString();
    broadcast();
    return res.json({ ok: true, demo: true, message: "Demo command accepted. No physical machine was moved." });
  }
  const result = publish(`ocean/${id}/command`, payload);
  if (!result.ok) return res.status(503).json(result);
  res.json({ ok: true, message: "Command sent to MQTT broker. Waiting for machine status confirmation." });
});

app.post("/api/emergency-stop", (_req, res) => {
  if (DEMO_MODE) {
    for (const id of Object.keys(machines)) {
      machines[id].status = "STOPPED";
      machines[id].updatedAt = new Date().toISOString();
    }
    broadcast();
    return res.json({ ok: true, demo: true, message: "Demo emergency-stop command sent." });
  }
  if (!mqttConnected) return res.status(503).json({ ok: false, error: "MQTT is disconnected. Use the physical emergency-stop switch." });
  for (const id of Object.keys(machines)) {
    publish(`ocean/${id}/command`, { machine: id, command: "STOP", mode: "MANUAL", emergency: true, timestamp: new Date().toISOString() });
  }
  res.json({ ok: true, message: "Emergency stop commands published. Also use the physical motor power cut-off." });
});

app.post("/api/camera-url", (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (url && !/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/.test(url)) {
    return res.status(400).json({ ok: false, error: "Enter a valid http:// or https:// camera URL." });
  }
  io.emit("camera-url", url);
  res.json({ ok: true, url });
});

io.on("connection", (socket) => {
  socket.emit("snapshot", { machines, detection, mqttConnected, demoMode: DEMO_MODE });
});

if (DEMO_MODE) {
  // Clearly labelled simulated telemetry so the interface can be tested before hardware is ready.
  setInterval(() => {
    for (const [i, id] of ["machine1", "machine2"].entries()) {
      if (machines[id].status !== "OFFLINE") {
        machines[id].online = true;
        machines[id].battery = Math.max(10, Math.min(100, (machines[id].battery ?? (91 - i * 7)) - (machines[id].status === "RUNNING" ? 0.1 : 0)));
        if (machines[id].status === "RUNNING") machines[id].collectedKg = +(machines[id].collectedKg + 0.01).toFixed(2);
      }
    }
    broadcast();
  }, 5000);
}

server.listen(PORT, () => {
  console.log(`Ocean Plastic Hunter dashboard: http://localhost:${PORT}`);
  console.log(`Mode: ${DEMO_MODE ? "DEMO (simulated)" : "LIVE MQTT"}`);
});
