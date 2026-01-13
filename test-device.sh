#!/bin/bash
# MQTT Device Simulator
# This script simulates an IoT device sending telemetry and alarms

echo "🔌 MQTT Device Simulator"
echo "========================"
echo ""

# Configuration
BROKER="localhost"
PORT="1883"

# Prompt for credentials
read -p "Enter your User UUID: " USER_UUID
read -sp "Enter your MQTT Password: " PASSWORD
echo ""
read -p "Enter Device ID: " DEVICE_ID

# Topics
TELEMETRY_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/telemetry"
ALARM_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/alarms"
COMMAND_TOPIC="/${USER_UUID}/devices/${DEVICE_ID}/commands"

echo ""
echo "📡 Connecting to MQTT broker..."
echo "Broker: ${BROKER}:${PORT}"
echo "User: ${USER_UUID}"
echo "Device: ${DEVICE_ID}"
echo ""
echo "Topics:"
echo "  - Telemetry: ${TELEMETRY_TOPIC}"
echo "  - Alarms: ${ALARM_TOPIC}"
echo "  - Commands: ${COMMAND_TOPIC}"
echo ""

# Check if mosquitto_pub is available
if ! command -v mosquitto_pub &> /dev/null; then
    echo "❌ Error: mosquitto_pub not found. Please install mosquitto-clients:"
    echo "   Ubuntu/Debian: sudo apt-get install mosquitto-clients"
    echo "   macOS: brew install mosquitto"
    exit 1
fi

# Subscribe to commands in background
echo "👂 Listening for commands..."
mosquitto_sub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $COMMAND_TOPIC &
SUB_PID=$!

# Function to send telemetry
send_telemetry() {
    local value=$1
    local message=$2
    echo "📊 Sending telemetry: $message"
    mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $TELEMETRY_TOPIC -m "$message"
}

# Function to send alarm
send_alarm() {
    local severity=$1
    local message=$2
    local json="{\"severity\":\"$severity\",\"message\":\"$message\"}"
    echo "🚨 Sending alarm [$severity]: $message"
    mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $ALARM_TOPIC -m "$json"
}

# Trap to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping device simulator..."
    kill $SUB_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "🚀 Device simulator started!"
echo "   Press Ctrl+C to stop"
echo ""
echo "Simulation modes:"
echo "  1) Temperature sensor (sends random temperature readings)"
echo "  2) Multi-sensor device (temperature, humidity, pressure)"
echo "  3) Manual mode (enter values manually)"
echo "  4) Stress test (rapid data generation)"
echo ""

read -p "Select mode (1-4): " MODE

case $MODE in
    1)
        echo "🌡️  Temperature sensor mode"
        echo "   Sending temperature readings every 2 seconds..."
        echo ""
        while true; do
            # Generate random temperature between 20-30°C
            TEMP=$(awk -v min=20 -v max=30 'BEGIN{srand(); print min+rand()*(max-min)}')
            TEMP_FORMATTED=$(printf "%.2f" $TEMP)
            send_telemetry $TEMP_FORMATTED "temperature:${TEMP_FORMATTED}°C"
            
            # Occasionally send alarms for extreme values
            if (( $(echo "$TEMP > 28" | bc -l) )); then
                send_alarm "warning" "High temperature detected: ${TEMP_FORMATTED}°C"
            elif (( $(echo "$TEMP < 21" | bc -l) )); then
                send_alarm "info" "Low temperature detected: ${TEMP_FORMATTED}°C"
            fi
            
            sleep 2
        done
        ;;
    
    2)
        echo "🌡️💧📊 Multi-sensor device mode"
        echo "   Sending temperature, humidity, and pressure every 3 seconds..."
        echo ""
        while true; do
            # Generate random sensor readings
            TEMP=$(awk -v min=20 -v max=30 'BEGIN{srand(); print min+rand()*(max-min)}')
            TEMP_FORMATTED=$(printf "%.2f" $TEMP)
            
            HUMIDITY=$(awk -v min=40 -v max=80 'BEGIN{srand(); print min+rand()*(max-min)}')
            HUMIDITY_FORMATTED=$(printf "%.1f" $HUMIDITY)
            
            PRESSURE=$(awk -v min=990 -v max=1030 'BEGIN{srand(); print min+rand()*(max-min)}')
            PRESSURE_FORMATTED=$(printf "%.2f" $PRESSURE)
            
            # Send as JSON with multiple sensors
            JSON="{\"temperature\":$TEMP_FORMATTED,\"humidity\":$HUMIDITY_FORMATTED,\"pressure\":$PRESSURE_FORMATTED}"
            echo "📊 Sending multi-sensor data: $JSON"
            mosquitto_pub -h $BROKER -p $PORT -u $USER_UUID -P $PASSWORD -t $TELEMETRY_TOPIC -m "$JSON"
            
            # Check for alarm conditions
            if (( $(echo "$TEMP > 28" | bc -l) )); then
                send_alarm "warning" "High temperature: ${TEMP_FORMATTED}°C"
            fi
            
            if (( $(echo "$HUMIDITY > 75" | bc -l) )); then
                send_alarm "info" "High humidity: ${HUMIDITY_FORMATTED}%"
            fi
            
            sleep 3
        done
        ;;
    
    3)
        echo "✏️  Manual mode"
        echo "   Enter telemetry values (or 'alarm:severity:message' for alarms)"
        echo "   Type 'quit' to exit"
        echo ""
        while true; do
            read -p "Value: " INPUT
            
            if [ "$INPUT" = "quit" ]; then
                break
            elif [[ $INPUT == alarm:* ]]; then
                IFS=':' read -ra PARTS <<< "$INPUT"
                SEVERITY="${PARTS[1]:-info}"
                MESSAGE="${PARTS[2]:-Test alarm}"
                send_alarm "$SEVERITY" "$MESSAGE"
            else
                send_telemetry "$INPUT" "$INPUT"
            fi
        done
        ;;
    
    4)
        echo "⚡ Stress test mode"
        echo "   Sending rapid data bursts..."
        echo ""
        COUNTER=0
        while true; do
            VALUE=$(awk -v min=0 -v max=100 'BEGIN{srand(); print min+rand()*(max-min)}')
            VALUE_FORMATTED=$(printf "%.2f" $VALUE)
            send_telemetry $VALUE_FORMATTED "value:${VALUE_FORMATTED}"
            
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
