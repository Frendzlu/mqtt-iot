#!/usr/bin/env python3
"""
ESP Device Simulator - MQTT IoT Device
Simulates an ESP32 device that:
- Self-registers with the backend
- Sends telemetry data (temperature, movement, pressure) in batches
- Listens for commands and responds to them
- Sends images when movement is detected and device is armed
"""

import paho.mqtt.client as mqtt
import requests
import json
import time
import random
import base64
from datetime import datetime
import uuid
from io import BytesIO

# ============================================================================
# GLOBAL CONFIGURATION - EDIT THESE VALUES
# ============================================================================

# Device identity
DEVICE_MAC_ADDRESS = "AA:BB:CC:DD:EE:FF"  # Unique MAC address for this device
DEVICE_NAME = "ESP32-Simulator-01"

# User credentials (must exist in backend)
USER_UUID = "889a51ee-fb28-4bbf-b08b-5d60442061d7"

# MQTT Broker settings
MQTT_BROKER = "localhost"  # or your broker IP
MQTT_PORT = 1883
MQTT_USERNAME = USER_UUID  # Set if broker requires auth
MQTT_PASSWORD = "pass"

# Backend HTTP settings
BACKEND_URL = "http://localhost:3001"  # Backend REST API

# Telemetry settings
MEASUREMENT_INTERVAL = 5  # minutes between taking measurements
SEND_INTERVAL = 15  # minutes between sending batched measurements
BATCH_SIZE = 5  # number of readings per batch
SEND_SINGULAR_READINGS = True  # Also send some singular readings
SINGULAR_READING_COUNT = 2  # Number of singular readings per cycle

# Sensor simulation ranges
TEMP_MIN = 18.0
TEMP_MAX = 30.0
PRESSURE_MIN = 990.0
PRESSURE_MAX = 1020.0
MOVEMENT_PROBABILITY = 0.15  # 15% chance of movement detection

# Device state
device_armed = False  # Whether device should send images on movement
measurement_buffer = []  # Buffer to store measurements before sending

# ============================================================================
# MQTT TOPICS
# ============================================================================

def get_topic_register():
    """Topic for device self-registration"""
    return f"/{USER_UUID}/devices"

def get_topic_telemetry():
    """Topic for sending telemetry"""
    mac_normalized = DEVICE_MAC_ADDRESS.replace(":", "_")
    return f"/{USER_UUID}/devices/{mac_normalized}/telemetry"

def get_topic_alarms():
    """Topic for sending alarms"""
    mac_normalized = DEVICE_MAC_ADDRESS.replace(":", "_")
    return f"/{USER_UUID}/devices/{mac_normalized}/alarms"



def get_topic_commands():
    """Topic for receiving commands"""
    mac_normalized = DEVICE_MAC_ADDRESS.replace(":", "_")
    return f"/{USER_UUID}/devices/{mac_normalized}/commands"

def get_topic_register_response():
    """Topic for registration response"""
    return f"/{USER_UUID}/devices/register-response"

# ============================================================================
# SENSOR SIMULATION
# ============================================================================

def generate_temperature_reading():
    """Generate simulated temperature reading in Celsius"""
    return round(random.uniform(TEMP_MIN, TEMP_MAX), 2)

def generate_pressure_reading():
    """Generate simulated pressure reading in hPa"""
    return round(random.uniform(PRESSURE_MIN, PRESSURE_MAX), 1)

def generate_movement_reading():
    """Generate simulated movement detection (0 or 1)"""
    return 1 if random.random() < MOVEMENT_PROBABILITY else 0

def generate_dummy_image():
    """Generate a simple dummy image as base64"""
    # Create a minimal 10x10 PNG image (red square)
    # This is a hardcoded minimal PNG - in real ESP32, you'd capture from camera
    png_data = base64.b64encode(
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\n\x00\x00\x00\n'
        b'\x08\x02\x00\x00\x00\x02P\xd5\xe3\x00\x00\x00\x19IDAT\x18\x95c\xf8'
        b'\xcf\xc0\x00\x02F\x86\xa1\x18\xb0\x02\x00\x00\xff\xff\x03\x00\x08'
        b'\xfc\x02\x00\x0c\x8b\x8b\xa4\x00\x00\x00\x00IEND\xaeB`\x82'
    ).decode('utf-8')
    return png_data

# ============================================================================
# MQTT CALLBACKS
# ============================================================================

def on_connect(client, userdata, flags, rc):
    """Callback when connected to MQTT broker"""
    if rc == 0:
        print(f"[MQTT] Connected to broker at {MQTT_BROKER}:{MQTT_PORT}")
        
        # Subscribe to commands topic
        commands_topic = get_topic_commands()
        client.subscribe(commands_topic)
        print(f"[MQTT] Subscribed to commands: {commands_topic}")
        
        # Subscribe to registration response
        reg_response_topic = get_topic_register_response()
        client.subscribe(reg_response_topic)
        print(f"[MQTT] Subscribed to registration response: {reg_response_topic}")
        
        # Perform self-registration
        register_device(client)
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def on_message(client, userdata, msg):
    """Callback when message received from broker"""
    topic = msg.topic
    payload = msg.payload.decode('utf-8')
    
    print(f"\n[MQTT] Received on {topic}:")
    print(f"       {payload}")
    
    # Handle registration response
    if topic == get_topic_register_response():
        try:
            response = json.loads(payload)
            status = response.get('status', 'unknown')
            print(f"[DEVICE] Registration {status}: {response.get('name', DEVICE_NAME)}")
        except json.JSONDecodeError:
            print(f"[DEVICE] Registration response (non-JSON): {payload}")
        return
    
    # Handle commands
    if topic == get_topic_commands():
        handle_command(client, payload)

def on_disconnect(client, userdata, rc):
    """Callback when disconnected from broker"""
    if rc != 0:
        print(f"[MQTT] Unexpected disconnection (code {rc})")

# ============================================================================
# DEVICE OPERATIONS
# ============================================================================

def register_device(client):
    """Self-register device with backend"""
    print(f"\n[DEVICE] Registering as {DEVICE_NAME} ({DEVICE_MAC_ADDRESS})")
    
    registration_data = {
        "name": DEVICE_NAME,
        "macAddress": DEVICE_MAC_ADDRESS
    }
    
    topic = get_topic_register()
    client.publish(topic, json.dumps(registration_data), qos=1)
    print(f"[DEVICE] Registration message sent to {topic}")

def send_telemetry_batch(client):
    """Send a batch of telemetry readings"""
    global device_armed
    
    print(f"\n[TELEMETRY] Generating batch of {BATCH_SIZE} readings...")
    message_id = f"msg-{uuid.uuid4().hex[:8]}"
    topic = get_topic_telemetry()
    
    # Send some singular readings first if enabled
    if SEND_SINGULAR_READINGS:
        print(f"[TELEMETRY] Sending {SINGULAR_READING_COUNT} singular readings...")
        for i in range(SINGULAR_READING_COUNT):
            temp_value = generate_temperature_reading()
            singular_temp = {
                "sensor": "temperature",
                "value": temp_value,
                "unit": "°C",
                "isBatch": False,
                "messageId": message_id + f"-temp-single-{i}"
            }
            client.publish(topic, json.dumps(singular_temp), qos=1)
            print(f"[TELEMETRY]   Singular temperature: {temp_value}°C")
            time.sleep(0.2)
    
    # Generate temperature batch
    temp_readings = []
    for i in range(BATCH_SIZE):
        timestamp = datetime.now().isoformat()
        value = generate_temperature_reading()
        temp_readings.append([timestamp, value])
        time.sleep(0.1)  # Small delay between readings
    
    temp_message = {
        "sensor": "temperature",
        "value": temp_readings,
        "unit": "°C",
        "isBatch": True,
        "messageId": message_id + "-temp-batch"
    }
    
    client.publish(topic, json.dumps(temp_message), qos=1)
    print(f"[TELEMETRY] Sent temperature batch: {len(temp_readings)} readings")
    
    time.sleep(0.5)
    
    # Send singular pressure readings if enabled
    if SEND_SINGULAR_READINGS:
        for i in range(SINGULAR_READING_COUNT):
            pressure_value = generate_pressure_reading()
            singular_pressure = {
                "sensor": "pressure",
                "value": pressure_value,
                "unit": "hPa",
                "isBatch": False,
                "messageId": message_id + f"-pres-single-{i}"
            }
            client.publish(topic, json.dumps(singular_pressure), qos=1)
            print(f"[TELEMETRY]   Singular pressure: {pressure_value} hPa")
            time.sleep(0.2)
    
    # Generate pressure batch
    pressure_readings = []
    for i in range(BATCH_SIZE):
        timestamp = datetime.now().isoformat()
        value = generate_pressure_reading()
        pressure_readings.append([timestamp, value])
        time.sleep(0.1)
    
    pressure_message = {
        "sensor": "pressure",
        "value": pressure_readings,
        "unit": "hPa",
        "isBatch": True,
        "messageId": message_id + "-pres-batch"
    }
    
    client.publish(topic, json.dumps(pressure_message), qos=1)
    print(f"[TELEMETRY] Sent pressure batch: {len(pressure_readings)} readings")
    
    time.sleep(0.5)
    
    # Generate movement readings (single values, not batched)
    movement_detected = False
    for i in range(BATCH_SIZE):
        movement = generate_movement_reading()
        
        movement_message = {
            "sensor": "movement",
            "value": movement,
            "unit": None,
            "isBatch": False,
            "messageId": message_id + f"-mov-{i}"
        }
        
        client.publish(topic, json.dumps(movement_message), qos=1)
        
        if movement == 1:
            movement_detected = True
            print(f"[TELEMETRY] Movement detected!")
            
            # Send alarm if movement detected
            alarm_message = {
                "severity": "warning",
                "message": "Motion detected by PIR sensor"
            }
            alarm_topic = get_topic_alarms()
            client.publish(alarm_topic, json.dumps(alarm_message), qos=1)
            print(f"[ALARM] Sent movement alarm")
        
        time.sleep(0.1)
    
    print(f"[TELEMETRY] Sent movement readings: {BATCH_SIZE} readings")
    
    # Send image if armed and movement detected
    if device_armed and movement_detected:
        send_image(client)

def send_image(client):
    """Send an image to the backend via HTTP POST"""
    print(f"\n[IMAGE] Capturing and sending image...")
    
    image_id = f"img-{uuid.uuid4().hex[:12]}"
    message_id = f"msg-{uuid.uuid4().hex[:8]}"
    mac_normalized = DEVICE_MAC_ADDRESS.replace(":", "_")
    
    # Generate dummy image
    image_data = generate_dummy_image()
    
    image_payload = {
        "imageId": image_id,
        "messageId": message_id,
        "imageData": image_data,
        "metadata": {
            "format": "png",
            "width": 10,
            "height": 10,
            "trigger": "movement_detection",
            "timestamp": datetime.now().isoformat()
        }
    }
    
    try:
        # Send via HTTP PUT to backend
        url = f"{BACKEND_URL}/images/{USER_UUID}/{mac_normalized}"
        payload = {
            "imageId": image_id,
            "imageData": image_data,
            "metadata": image_payload["metadata"]
        }
        
        response = requests.put(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            print(f"[IMAGE] ✓ Sent image {image_id} via HTTP ({len(image_data)} bytes)")
            result = response.json()
            print(f"[IMAGE]   Backend response: {result.get('status', 'ok')}")
        else:
            print(f"[IMAGE] ✗ Failed to send image: HTTP {response.status_code}")
            print(f"[IMAGE]   Response: {response.text}")
    
    except requests.exceptions.ConnectionError:
        print(f"[IMAGE] ✗ Cannot connect to backend at {BACKEND_URL}")
        print(f"[IMAGE]   Falling back to MQTT (if available)...")
        # Fallback to MQTT if HTTP fails
        try:
            fallback_topic = f"/{USER_UUID}/devices/{mac_normalized}/images"
            image_message = {
                "imageId": image_id,
                "messageId": message_id,
                "imageData": image_data,
                "metadata": image_payload["metadata"]
            }
            client.publish(fallback_topic, json.dumps(image_message), qos=1)
            print(f"[IMAGE] ✓ Sent via MQTT fallback")
        except Exception as e:
            print(f"[IMAGE] ✗ MQTT fallback also failed: {e}")
    
    except requests.exceptions.Timeout:
        print(f"[IMAGE] ✗ Request timed out after 10 seconds")
    
    except Exception as e:
        print(f"[IMAGE] ✗ Error sending image: {e}")

def handle_command(client, payload):
    """Handle incoming commands from backend"""
    global device_armed, MEASUREMENT_INTERVAL, SEND_INTERVAL
    
    print(f"\n[COMMAND] Received: {payload}")
    
    try:
        # Try to parse as JSON
        command = json.loads(payload)
        
        # Handle acknowledgment messages
        if command.get("type") == "ack":
            print(f"[ACK] Backend acknowledged message {command.get('messageId')}")
            print(f"\t\tStatus: {command.get('status')}, Records: {command.get('recordCount', 'N/A')}")
            return
        
        # Get command type
        cmd_type = command.get("command")
        
        # Handle photo command
        if cmd_type == "photo":
            print(f"[COMMAND] PHOTO - Taking photo...")
            send_image(client)
            print(f"\t\t✓ Photo captured and sent")
            return
        
        # Handle temperature measurement command
        if cmd_type == "temp":
            print(f"[COMMAND] TEMP - Taking temperature measurement...")
            temp_value = generate_temperature_reading()
            message_id = f"m-cmd-{uuid.uuid4().hex[:6]}"
            
            temp_message = {
                "sensor": "temperature",
                "value": temp_value,
                "unit": "C",
                "isBatch": False,
                "messageId": message_id
            }
            
            topic = get_topic_telemetry()
            client.publish(topic, json.dumps(temp_message), qos=1)
            print(f"\t\tTemperature: {temp_value}°C (sent)")
            return
        
        # Handle arm command
        if cmd_type == "arm":
            device_armed = True
            print(f"[COMMAND] ARM - Device is now ARMED")
            print(f"\t\tWill send images on motion detection")
            return
        
        # Handle disarm command
        if cmd_type == "disarm":
            device_armed = False
            print(f"[COMMAND] DISARM - Device is now DISARMED")
            print(f"\t\tWill NOT send images on motion detection")
            return
        
        # Handle measurement interval change
        if cmd_type == "set_measurement_interval":
            minutes = command.get("minutes", MEASUREMENT_INTERVAL)
            MEASUREMENT_INTERVAL = float(minutes)
            print(f"[COMMAND] SET MEASUREMENT INTERVAL -> {MEASUREMENT_INTERVAL} minutes")
            print(f"\t\tDevice will take measurements every {MEASUREMENT_INTERVAL} minutes")
            return
        
        # Handle send interval change
        if cmd_type == "set_send_interval":
            minutes = command.get("minutes", SEND_INTERVAL)
            SEND_INTERVAL = float(minutes)
            print(f"[COMMAND] SET SEND INTERVAL -> {SEND_INTERVAL} minutes")
            print(f"\t\tDevice will send batched data every {SEND_INTERVAL} minutes")
            return
        
        # Handle LED control (legacy)
        if "led" in command:
            led_state = command["led"]
            print(f"[COMMAND] LED Control -> {led_state}")
            if led_state == "on":
                print(f"\t\tLED turned ON")
            elif led_state == "off":
                print(f"\t\tLED turned OFF")
            elif led_state == "blink":
                print(f"\t\tLED is BLINKING")
            return
        
        # Handle interval change (legacy)
        if "interval" in command:
            interval = command["interval"]
            print(f"[COMMAND] Set telemetry interval -> {interval} seconds")
            SEND_INTERVAL = interval / 60.0  # Convert to minutes
            print(f"\t\tUpdated send interval to {SEND_INTERVAL} minutes")
            return
        
        # Handle threshold setting (legacy)
        if "threshold" in command:
            threshold_data = command["threshold"]
            print(f"[COMMAND] Set threshold -> Sensor: {threshold_data.get('sensor')}, Value: {threshold_data.get('value')}")
            return
        
        # Handle custom commands (as strings)
        if isinstance(command, dict):
            print(f"[COMMAND] Custom JSON command: {command}")
    
    except json.JSONDecodeError:
        # Handle plain text commands
        command_text = payload.upper()
        
        if command_text == "STATUS":
            print(f"[COMMAND] STATUS request")
            print(f"\t\tDevice: {DEVICE_NAME}")
            print(f"\t\tMAC: {DEVICE_MAC_ADDRESS}")
            print(f"\t\tArmed: {device_armed}")
            print(f"\t\tMeasurement Interval: {MEASUREMENT_INTERVAL} min")
            print(f"\t\tSend Interval: {SEND_INTERVAL} min")
        
        elif command_text == "RESET":
            print(f"[COMMAND] RESET request")
            print(f"\t\tDevice would reset now (simulation)")
        
        elif "ARM" in command_text:
            device_armed = True
            print(f"[COMMAND] ARM - Device is now ARMED (will send images on movement)")
        
        elif "DISARM" in command_text:
            device_armed = False
            print(f"[COMMAND] DISARM - Device is now DISARMED")
        
        else:
            print(f"[COMMAND] Unknown command: {payload}")

# ============================================================================
# MAIN PROGRAM
# ============================================================================

def main():
    """Main program loop"""
    print("=" * 70)
    print("ESP32 Device Simulator")
    print("=" * 70)
    print(f"Device: {DEVICE_NAME}")
    print(f"MAC: {DEVICE_MAC_ADDRESS}")
    print(f"User UUID: {USER_UUID}")
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"Measurement Interval: {MEASUREMENT_INTERVAL} min")
    print(f"Send Interval: {SEND_INTERVAL} min")
    print(f"Batch Size: {BATCH_SIZE} readings")
    print("=" * 70)
    
    # Validate configuration
    if USER_UUID == "your-user-uuid-here":
        print("\nERROR: Please set USER_UUID in the script configuration!")
        print("\tYou can get this from the backend or login response.")
        return
    
    # Create MQTT client
    client = mqtt.Client(client_id=f"esp32-{DEVICE_MAC_ADDRESS.replace(':', '')}")
    
    if MQTT_USERNAME and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    
    # Connect to broker
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        print(f"\nFailed to connect to MQTT broker: {e}")
        print(f"\tMake sure the broker is running at {MQTT_BROKER}:{MQTT_PORT}")
        return
    
    # Start network loop in background thread
    client.loop_start()
    
    # Give time for connection and registration
    print("\n[DEVICE] Waiting for connection and registration...")
    time.sleep(3)
    
    # Main telemetry loop
    print(f"\n[DEVICE] Starting telemetry loop")
    print(f"\t\tMeasurements every {MEASUREMENT_INTERVAL} min")
    print(f"\t\tSending batches every {SEND_INTERVAL} min")
    print("\t\tPress Ctrl+C to stop\n")
    
    try:
        last_measurement = 0
        last_send = 0
        
        while True:
            current_time = time.time()
            
            # Take measurements at measurement interval (store in buffer)
            if current_time - last_measurement >= MEASUREMENT_INTERVAL * 60:
                print(f"\n[MEASUREMENT] Taking readings at {datetime.now().strftime('%H:%M:%S')}")
                # In a real device, these would be stored in buffer
                # For simulator, we'll generate them when sending
                last_measurement = current_time
            
            # Send telemetry batch at send interval
            if current_time - last_send >= SEND_INTERVAL * 60:
                send_telemetry_batch(client)
                last_send = current_time
            
            # Sleep briefly to prevent busy loop
            time.sleep(1)
    
    except KeyboardInterrupt:
        print("\n\n[DEVICE] Stopping simulator...")
    
    finally:
        client.loop_stop()
        client.disconnect()
        print("[DEVICE] Disconnected from broker")
        print("=" * 70)

if __name__ == "__main__":
    main()
