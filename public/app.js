const socket = io();
const $ = (id) => document.getElementById(id);
let currentState = null;
let cameraStreamUrl = "";

function log(message) {
  const row = document.createElement("div");
  row.className = "log-entry";
  const dot = document.createElement("span"); dot.className = "log-dot";
  const msg = document.createElement("span"); msg.textContent = message;
  const time = document.createElement("time"); time.textContent = new Date().toLocaleTimeString();
  row.append(dot, msg, time);
  $("activityLog").prepend(row);
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}
function render(state) {
  currentState = state;
  $("connectionText").textContent = state.demoMode ? "Demo mode" : state.mqttConnected ? "MQTT connected" : "MQTT disconnected";
  $("connectionSub").textContent = state.demoMode ? "Simulated data — not hardware" : "Live broker connection";
  $("systemPill").textContent = state.demoMode ? "● DEMO" : state.mqttConnected ? "● LIVE" : "● OFFLINE";
  $("systemPill").style.color = state.demoMode ? "#e5b65b" : state.mqttConnected ? "#4bd6a0" : "#ff6d78";
  const all = Object.values(state.machines);
  $("connectedCount").textContent = `${all.filter(m => m.online).length}/2`;
  const collected = all.reduce((sum, m) => sum + (Number(m.collectedKg) || 0), 0);
  $("collectedKg").textContent = collected.toFixed(2);
  $("plasticCount").textContent = state.detection.plasticCount ?? 0;
  $("detectionNumber").textContent = state.detection.plasticCount ?? 0;
  $("lastLabel").textContent = state.detection.lastLabel || "No detections yet";
  $("confidence").textContent = state.detection.confidence == null ? "—" : `${(state.detection.confidence * 100).toFixed(1)}%`;
  for (const id of ["machine1", "machine2"]) {
    const m = state.machines[id];
    const n = id === "machine1" ? "machine1" : "machine2";
    $(n + "Status").textContent = m.status || (m.online ? "ONLINE" : "OFFLINE");
    $(n + "Status").className = "machine-status " + (m.online ? "online" : "offline");
    $(n + "Battery").textContent = m.battery == null ? "—" : `${m.battery}%`;
    $(n + "Collected").textContent = Number(m.collectedKg || 0).toFixed(2);
    $(n + "Mode").textContent = m.mode || "MANUAL";
    $(n + "Updated").textContent = m.updatedAt ? `Last update: ${new Date(m.updatedAt).toLocaleTimeString()}` : "Waiting for machine telemetry";
    $(n + "ModeSelect").value = m.mode === "AUTO" ? "AUTO" : "MANUAL";
  }
}
async function sendCommand(machine, command) {
  const mode = $(`${machine}ModeSelect`).value;
  try {
    const response = await fetch("/api/command", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ machine, command, mode }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Command failed");
    toast(result.message || "Command sent");
    log(`${machine} · ${command} ${result.demo ? "(demo only)" : ""}`);
  } catch (error) { toast(error.message); log(`Command error: ${error.message}`); }
}
document.querySelectorAll(".machine-card").forEach(card => {
  const machine = card.dataset.machine;
  card.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => sendCommand(machine, button.dataset.command)));
});
$("emergencyStop").addEventListener("click", async () => {
  if (!confirm("Send STOP command to BOTH machines? This is not a substitute for the physical emergency-stop switch.")) return;
  try {
    const r = await fetch("/api/emergency-stop", { method:"POST" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    toast(data.message); log("EMERGENCY STOP requested for both machines");
  } catch (e) { toast(e.message); }
});
$("cameraForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("cameraUrl").value.trim();
  if (!url) return toast("Enter your ESP32-CAM stream URL");
  try {
    const r = await fetch("/api/camera-url", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setCamera(data.url); toast("Camera URL saved in this dashboard session"); log("Camera stream URL updated");
  } catch (err) { toast(err.message); }
});
function setCamera(url) {
  cameraStreamUrl = url;
  const img = $("cameraImage");
  img.hidden = !url;
  $("cameraStatus").textContent = url ? "CONFIGURED" : "NOT SET";
  if (url) {
    $("cameraScreen").querySelector(".camera-placeholder").hidden = true;
    img.src = url;
    img.onerror = () => { $("cameraStatus").textContent = "STREAM ERROR"; toast("Camera stream could not load. Check URL, Wi-Fi and browser access."); };
    img.onload = () => { $("cameraStatus").textContent = "STREAMING"; };
  } else {
    $("cameraScreen").querySelector(".camera-placeholder").hidden = false;
    img.removeAttribute("src");
  }
}
$("clearLog").addEventListener("click", () => $("activityLog").replaceChildren());
socket.on("snapshot", render);
socket.on("alert", a => { toast(a.message); log(`ALERT: ${a.message}`); });
socket.on("camera-url", setCamera);
fetch("/api/state").then(r => r.json()).then(render).catch(() => toast("Could not load dashboard state"));
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString(); }, 1000);
$("clock").textContent = new Date().toLocaleTimeString();
