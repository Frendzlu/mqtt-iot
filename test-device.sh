#!/bin/bash
# MQTT Device Simulator
# This script simulates an IoT device sending telemetry and alarms

echo "MQTT Device Simulator"
echo "========================"
echo ""

# Configuration
BROKER="localhost"
PORT="1883"

# Prompt for credentials
read -p "Enter your User UUID: " USER_UUID
read -sp "Enter your MQTT Password: " PASSWORD
echo ""
read -p "Enter Device MAC Address (e.g. 00:11:22:33:44:55): " DEVICE_MAC
# Convert MAC address format (replace : with _)
DEVICE_ID=${DEVICE_MAC//://_}

# Topics
TELEMETRY_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/telemetry"
ALARM_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/alarms"
COMMAND_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/commands"
IMAGE_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/images"

echo ""
echo "Connecting to MQTT broker..."
echo "Broker: ${BROKER}:${PORT}"
echo "User: ${USER_UUID}"
echo "Device MAC: ${DEVICE_MAC}"
echo "Device ID: ${DEVICE_ID}"
echo ""
echo "Topics:"
echo "  - Telemetry: ${TELEMETRY_TOPIC}"
echo "  - Alarms: ${ALARM_TOPIC}"
echo "  - Commands: ${COMMAND_TOPIC}"
echo "  - Images: ${IMAGE_TOPIC}"
echo ""

# Check if mosquitto_pub is available
if ! command -v mosquitto_pub &> /dev/null; then
    echo "Error: mosquitto_pub not found. Please install mosquitto-clients:"
    echo "   Ubuntu/Debian: sudo apt-get install mosquitto-clients"
    echo "   macOS: brew install mosquitto"
    exit 1
fi

# Register device with backend
echo "Registering device with backend..."
REGISTER_TOPIC="/${USER_UUID}/devices"
REGISTER_MSG="{\"name\":\"Simulated Device - ${DEVICE_MAC}\",\"macAddress\":\"${DEVICE_MAC}\"}"
mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $REGISTER_TOPIC -m "$REGISTER_MSG"
echo "Device registration sent to topic: $REGISTER_TOPIC"
sleep 2

# Subscribe to commands in background
echo "Listening for commands and acknowledgments..."
mosquitto_sub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $COMMAND_TOPIC &
SUB_PID=$!

# Function to send telemetry (JSON format)
send_telemetry() {
    local sensor=$1
    local value=$2
    local unit=$3
    local msgId=$(date +%s%N)
    local json="{\"sensor\":\"$sensor\",\"value\":$value,\"unit\":\"$unit\",\"isBatch\":false,\"messageId\":\"msg-$msgId\"}"
    echo "[TELEMETRY] $sensor: $value $unit (messageId: msg-$msgId)"
    mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $TELEMETRY_TOPIC -m "$json"
}

# Function to send alarm
send_alarm() {
    local severity=$1
    local message=$2
    local json="{\"severity\":\"$severity\",\"message\":\"$message\"}"
    echo "[ALARM] [$severity]: $message"
    mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $ALARM_TOPIC -m "$json"
}

# Function to send image (1x1 red pixel PNG as demo)
send_image() {
    local imageId="img-$(date +%s)"
    local msgId="msg-img-$(date +%s)"
    # 1x1 red pixel PNG in base64
    local base64Data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    local json="{\"imageId\":\"$imageId\",\"messageId\":\"$msgId\",\"data\":\"$base64Data\",\"metadata\":{\"contentType\":\"image/png\",\"width\":1,\"height\":1,\"camera\":\"TestCamera\"}}"
    echo "[IMAGE] Sending test image (imageId: $imageId)"
    mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $IMAGE_TOPIC -m "$json"
}

# Trap to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping device simulator..."
    kill $SUB_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "Device simulator started!"
echo "Press Ctrl+C to stop"
echo ""
echo "Simulation modes:"
echo "  1) Temperature sensor (sends random temperature readings)"
echo "  2) Multi-sensor device (temperature, humidity, pressure)"
echo "  3) Batch telemetry (sends multiple readings with timestamps)"
echo "  4) Image capture (sends test images)"
echo "  5) Manual mode (enter values manually)"
echo "  6) Stress test (rapid data generation)"
echo ""

read -p "Select mode (1-6): " MODE

case $MODE in
    1)
        echo "[MODE 1] Temperature sensor"
        echo "Sending temperature readings every 2 seconds..."
        echo ""
        while true; do
            # Generate random temperature between 20-30C
            TEMP=$(awk -v min=20 -v max=30 'BEGIN{srand(); print min+rand()*(max-min)}')
            TEMP_FORMATTED=$(printf "%.2f" $TEMP)
            send_telemetry "temperature" "$TEMP_FORMATTED" "C"
            
            # Occasionally send alarms for extreme values
            if (( $(echo "$TEMP > 28" | bc -l) )); then
                send_alarm "warning" "High temperature detected: ${TEMP_FORMATTED}C"
            elif (( $(echo "$TEMP < 21" | bc -l) )); then
                send_alarm "info" "Low temperature detected: ${TEMP_FORMATTED}C"
            fi
            
            sleep 2
        done
        ;;
    
    2)
        echo "[MODE 2] Multi-sensor device"
        echo "Sending temperature, humidity, and pressure every 3 seconds..."
        echo ""
        while true; do
            # Generate random sensor readings
            TEMP=$(awk -v min=20 -v max=30 'BEGIN{srand(); print min+rand()*(max-min)}')
            TEMP_FORMATTED=$(printf "%.2f" $TEMP)
            
            HUMIDITY=$(awk -v min=40 -v max=80 'BEGIN{srand(); print min+rand()*(max-min)}')
            HUMIDITY_FORMATTED=$(printf "%.1f" $HUMIDITY)
            
            PRESSURE=$(awk -v min=990 -v max=1030 'BEGIN{srand(); print min+rand()*(max-min)}')
            PRESSURE_FORMATTED=$(printf "%.2f" $PRESSURE)
            
            # Send each sensor separately with proper JSON format
            send_telemetry "temperature" "$TEMP_FORMATTED" "C"
            send_telemetry "humidity" "$HUMIDITY_FORMATTED" "%"
            send_telemetry "pressure" "$PRESSURE_FORMATTED" "hPa"
            
            # Check for alarm conditions
            if (( $(echo "$TEMP > 28" | bc -l) )); then
                send_alarm "warning" "High temperature: ${TEMP_FORMATTED}C"
            fi
            
            if (( $(echo "$HUMIDITY > 75" | bc -l) )); then
                send_alarm "info" "High humidity: ${HUMIDITY_FORMATTED}%"
            fi
            
            sleep 3
        done
        ;;
    
    3)
        echo "[MODE 3] Batch telemetry"
        echo "Sending batch temperature readings every 5 seconds..."
        echo ""
        while true; do
            # Generate 5 temperature readings with timestamps
            MSGID="batch-$(date +%s)"
            NOW=$(date +%s)000
            VALUES="["
            for i in {0..4}; do
                TEMP=$(awk -v min=20 -v max=30 'BEGIN{srand(); print min+rand()*(max-min)}')
                TEMP_FORMATTED=$(printf "%.2f" $TEMP)
                TS=$((NOW + i*60000))  # 1 minute apart
                if [ $i -gt 0 ]; then VALUES="$VALUES,"; fi
                VALUES="$VALUES[$TS,$TEMP_FORMATTED]"
            done
            VALUES="$VALUES]"
            
            JSON="{\"sensor\":\"temperature\",\"value\":$VALUES,\"unit\":\"C\",\"isBatch\":true,\"messageId\":\"$MSGID\"}"
            echo "[BATCH] Sending 5 temperature readings (messageId: $MSGID)"
            mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $TELEMETRY_TOPIC -m "$JSON"
            
            sleep 5
        done
        ;;
    
    4)
        echo "[MODE 4] Image capture"
        echo "Sending test images every 10 seconds..."
        echo ""
        while true; do
            send_image
            sleep 10
        done
        ;;
    
    5)
        echo "[MODE 5] Manual mode"
        echo "Commands:"
        echo "  telemetry:<sensor>:<value>:<unit> - Send telemetry"
        echo "  alarm:<severity>:<message>         - Send alarm"
        echo "  image                              - Send test image"
        echo "  quit                               - Exit"
        echo ""
        while true; do
            read -p "> " INPUT
            
            if [ "$INPUT" = "quit" ]; then
                break
            elif [[ $INPUT == telemetry:* ]]; then
                IFS=':' read -ra PARTS <<< "$INPUT"
                SENSOR="${PARTS[1]:-sensor}"
                VALUE="${PARTS[2]:-0}"
                UNIT="${PARTS[3]:-unit}"
                send_telemetry "$SENSOR" "$VALUE" "$UNIT"
            elif [[ $INPUT == alarm:* ]]; then
                IFS=':' read -ra PARTS <<< "$INPUT"
                SEVERITY="${PARTS[1]:-info}"
                MESSAGE="${PARTS[2]:-Test alarm}"
                send_alarm "$SEVERITY" "$MESSAGE"
            elif [ "$INPUT" = "image" ]; then
                send_image
            else
                echo "Unknown command. Try: telemetry:temperature:25.5:C"
            fi
        done
        ;;
    
    6)
        echo "[MODE 6] Stress test"
        echo "Sending rapid data bursts..."
        echo ""
        COUNTER=0
        while true; do
            VALUE=$(awk -v min=0 -v max=100 'BEGIN{srand(); print min+rand()*(max-min)}')
            VALUE_FORMATTED=$(printf "%.2f" $VALUE)
            send_telemetry "sensor" "$VALUE_FORMATTED" "unit"
            
            COUNTER=$((COUNTER + 1))
            
            # Send alarm every 50 messages
            if [ $((COUNTER % 50)) -eq 0 ]; then
                if [ $((COUNTER % 100)) -eq 0 ]; then
                    send_alarm "critical" "Critical threshold reached at count $COUNTER"
                else
                    send_alarm "warning" "Warning threshold reached at count $COUNTER"
                fi
            fi
            
            sleep 0.1
        done
        ;;
    
    *)
        echo "Invalid mode selected"
        cleanup
        ;;
esac

cleanup
