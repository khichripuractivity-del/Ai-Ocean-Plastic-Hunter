# AI Ocean Plastic Hunter — VS Code project

A starter web dashboard for **two ESP32-controlled machines** and an **ESP32-CAM**.

## What works immediately
- Responsive dashboard with two machine panels.
- Start, stop, direction and collect command buttons.
- Emergency-stop command for both machines.
- Camera stream URL field.
- Plastic detection and telemetry display.
- Demo mode, so you can test the website before hardware is connected.

**Demo mode uses simulated data. It does not move real machines.** Live hardware mode requires a running MQTT broker and matching ESP32 firmware.

## 1. Install software
1. Install Node.js LTS from https://nodejs.org/
2. Install Visual Studio Code.
3. Extract this project ZIP.
4. Open the extracted `ai_ocean_plastic_hunter` folder in VS Code.
5. In VS Code, open Terminal > New Terminal.

## 2. Run the website in demo mode
Run these commands in the VS Code terminal:

```bash
npm install
```

Copy `.env.example` to a new file named `.env`. Keep:

```env
DEMO_MODE=true
```

Then run:

```bash
npm start
```

Open **http://localhost:3000** in your browser.

Try the machine buttons. In demo mode, the dashboard will clearly label commands as simulated; no physical machine is controlled.

## 3. Connect real ESP32 hardware (local network)
1. Install Mosquitto MQTT broker on a computer on the same Wi-Fi network.
2. Configure Mosquitto to listen on port 1883 on your local network. Set authentication and firewall rules; do not expose an unauthenticated broker to the public internet.
3. Find that computer's local IP address.
4. Copy `.env.example` to `.env` and set:

```env
DEMO_MODE=false
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
```

For this Node server, `127.0.0.1` is the broker running on the same computer. In each ESP32 sketch, set `MQTT_HOST` to the computer's LAN IP address, e.g. `192.168.1.10`.
5. Run `npm start` again.
6. Open the sketch in `firmware/machine_esp32/machine_esp32.ino` in Arduino IDE. Install `PubSubClient`.
7. Set Wi-Fi details and broker IP. Upload once with `MACHINE_ID "machine1"` to the first ESP32. Change it to `"machine2"` and upload to the second ESP32.
8. Confirm both devices publish status and receive commands.

The sample firmware is a starting point, not a finished safety-certified robot controller. Adapt motor pins, driver logic, battery measurement, collection motor and sensors to your exact circuit. Test with wheels lifted and motor power disconnected first.

## 4. Connect ESP32-CAM
Follow `firmware/esp32_cam/README.txt`. Find the camera stream URL, test it in a browser, then paste it into the dashboard's camera URL field.

## 5. AI plastic detection integration
The dashboard listens for JSON messages on MQTT topic:

`ocean/camera/detection`

Example message:

```json
{
  "plasticCount": 4,
  "label": "plastic bottle",
  "confidence": 0.94
}
```

A separate Python/OpenCV/YOLO program must read images from the ESP32-CAM, run the trained object-detection model, and publish these results to MQTT. This project ZIP does not include a trained plastic-detection model.

## MQTT topics
- `ocean/machine1/command` — website to machine 1
- `ocean/machine1/status` — machine 1 telemetry to website
- `ocean/machine2/command` — website to machine 2
- `ocean/machine2/status` — machine 2 telemetry to website
- `ocean/camera/detection` — AI detection results to website
- `ocean/system/alerts` — alerts to website

## Safety and limitations
- Keep a physical emergency-stop switch that cuts motor power. A website STOP button is not a safety-rated emergency stop.
- Start testing with motors disconnected or wheels lifted.
- Use suitable motor drivers and separate motor power supplies. Join grounds as required by the circuit.
- Never feed 5V into an ESP32 GPIO; its GPIO logic is 3.3V.
- Protect the MQTT broker with authentication and network restrictions.
- Do not operate a real machine in water until the enclosure, insulation, battery, wiring and buoyancy have been properly tested.
- Battery percentage code in the sample firmware is only a placeholder; calibrate it with a proper voltage divider and battery measurement circuit.
