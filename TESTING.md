# Testing Checklist

Use this checklist to verify all features are working correctly.

## 🚀 Initial Setup

- [ ] Run `docker compose up --build`
- [ ] Wait for all services to start (check logs)
- [ ] Verify PostgreSQL is ready (healthcheck passed)
- [ ] Verify Mosquitto is running (ports 1883, 9001)
- [ ] Verify backend is running (port 3001)
- [ ] Verify frontend is accessible (http://localhost:5173)

## 👤 User Management

- [ ] Open frontend in browser
- [ ] Register a new user
  - [ ] Enter username
  - [ ] Enter password
  - [ ] Click Register
  - [ ] Verify UUID is displayed
- [ ] Refresh page and login
  - [ ] Enter username
  - [ ] Enter password
  - [ ] Click Login
  - [ ] Verify UUID matches previous
- [ ] Check MQTT credentials are shown in sidebar

## 📱 Device Management

- [ ] Add first device
  - [ ] Enter device name (e.g., "Test Sensor")
  - [ ] Click "+ Add"
  - [ ] Verify device appears in list
  - [ ] Verify device is auto-selected
- [ ] Add second device
  - [ ] Enter different name
  - [ ] Click "+ Add"
  - [ ] Verify both devices in list
- [ ] Switch between devices
  - [ ] Click first device
  - [ ] Verify dashboard updates
  - [ ] Click second device
  - [ ] Verify dashboard shows correct device

## 📊 Telemetry Testing

### Using Test Simulator

- [ ] Open terminal
- [ ] Run `./test-device.sh`
- [ ] Enter UUID, password, and device ID
- [ ] Select Mode 1 (Temperature sensor)
- [ ] Verify telemetry appears in dashboard:
  - [ ] Latest Reading updates
  - [ ] Chart populates with data points
  - [ ] Statistics calculate (avg, min, max)
  - [ ] Recent Messages list updates

### Manual Testing

- [ ] Switch simulator to Mode 2 (Manual)
- [ ] Enter various values:
  - [ ] "25.5°C" - verify unit extraction
  - [ ] "42" - verify plain number
  - [ ] "temperature:23.8" - verify parsing
  - [ ] "test message" - verify non-numeric
- [ ] Check all values appear in dashboard

### Time Range Testing

- [ ] Wait for data to accumulate
- [ ] Change time range selector:
  - [ ] Select "Last Hour"
  - [ ] Verify chart updates
  - [ ] Select "Last 24 Hours"
  - [ ] Verify more data shows
  - [ ] Select "Last Week"
  - [ ] Verify all historical data shows

## 🔔 Alarm Testing

### Using Test Simulator

- [ ] In simulator (Mode 2), type:
  - [ ] `alarm:critical:Temperature too high!`
  - [ ] Verify alarm appears in header badge
  - [ ] Verify count increases
  - [ ] `alarm:warning:Battery low`
  - [ ] Verify badge updates
  - [ ] `alarm:info:Status update`
  - [ ] Verify badge updates

### Alarm Panel Testing

- [ ] Click "🔔 Alarms" button in header
- [ ] Verify alarms panel opens
- [ ] Check summary statistics:
  - [ ] Total alarms
  - [ ] Unacknowledged count (should be 3)
  - [ ] Acknowledged count (should be 0)
- [ ] Verify alarm colors:
  - [ ] Critical alarm has red border
  - [ ] Warning alarm has orange border
  - [ ] Info alarm has blue border
- [ ] Acknowledge critical alarm:
  - [ ] Click "✓ Acknowledge"
  - [ ] Verify moves to "Acknowledged" section
  - [ ] Verify unacknowledged count decreases
- [ ] Acknowledge remaining alarms
- [ ] Verify all alarms in acknowledged section
- [ ] Close alarms panel
- [ ] Verify badge shows 0 alarms

### Real-time Alarm Testing

- [ ] Keep alarms panel open
- [ ] In simulator, send new alarm
- [ ] Verify alarm appears immediately
- [ ] Verify badge animates/pulses
- [ ] Verify timestamp is recent

## 💬 Command Testing

### Quick Commands

- [ ] In device dashboard, click quick commands:
  - [ ] Click "STATUS"
  - [ ] Verify appears in simulator terminal
  - [ ] Click "RESET"
  - [ ] Verify appears in simulator terminal
  - [ ] Click "LED ON"
  - [ ] Verify JSON appears in terminal
  - [ ] Click "LED OFF"
  - [ ] Verify JSON appears in terminal

### Custom Commands

- [ ] Type custom command: "TEST:12345"
- [ ] Click "Send Command"
- [ ] Verify appears in simulator terminal
- [ ] Test Ctrl+Enter shortcut:
  - [ ] Type "SHORTCUT_TEST"
  - [ ] Press Ctrl+Enter
  - [ ] Verify sent without clicking button

## 📈 Chart Testing

- [ ] Generate continuous data (simulator Mode 1)
- [ ] Verify chart updates automatically
- [ ] Hover over chart points:
  - [ ] Verify tooltip appears
  - [ ] Verify shows value and unit
  - [ ] Verify shows timestamp
- [ ] Check chart scales:
  - [ ] Y-axis adjusts to data range
  - [ ] X-axis shows timestamps
  - [ ] Grid lines visible

## 🔄 Real-time Updates

- [ ] Keep dashboard open
- [ ] Send telemetry from simulator
- [ ] Verify updates appear within 5 seconds
- [ ] Check multiple updates in sequence:
  - [ ] Latest reading updates
  - [ ] Chart adds new points
  - [ ] Statistics recalculate
  - [ ] Message list scrolls

## 🎨 UI/UX Testing

### Responsive Design

- [ ] Resize browser window
- [ ] Verify layout adapts at ~768px
- [ ] Test mobile viewport:
  - [ ] Sidebar becomes full-width
  - [ ] Cards stack vertically
  - [ ] Touch interactions work

### Visual Elements

- [ ] Check hover states on buttons
- [ ] Check focus states on inputs
- [ ] Check loading states when sending commands
- [ ] Check disabled states
- [ ] Check color scheme consistency

### Navigation

- [ ] Switch between devices smoothly
- [ ] Open/close alarms panel multiple times
- [ ] Verify no UI glitches or flickers

## 🔍 Data Persistence

### Backend Restart

- [ ] Send telemetry and alarms
- [ ] Restart backend: `docker restart backend`
- [ ] Verify data still visible after restart
- [ ] Send new data, verify it works

### Database Persistence

- [ ] Stop all services: `docker compose down`
- [ ] Start services: `docker compose up`
- [ ] Login with existing credentials
- [ ] Verify:
  - [ ] User still exists
  - [ ] Devices still listed
  - [ ] Historical telemetry available
  - [ ] Alarms still present

## 📊 Performance Testing

### Stress Test

- [ ] Run simulator in Mode 3 (Stress test)
- [ ] Let it run for 1 minute
- [ ] Monitor:
  - [ ] Dashboard remains responsive
  - [ ] Chart renders smoothly
  - [ ] No memory leaks in browser
  - [ ] Backend logs show no errors
- [ ] Check database:
  - [ ] `docker exec -it postgres psql -U mqtt_user -d mqtt_db`
  - [ ] `SELECT COUNT(*) FROM telemetry;`
  - [ ] Verify records are being stored

### Multiple Devices

- [ ] Add 5+ devices
- [ ] Send telemetry to multiple devices simultaneously
- [ ] Switch between device dashboards
- [ ] Verify each shows correct data
- [ ] Check overall telemetry endpoint works

## 🔒 Security Testing

### Authentication

- [ ] Try to login with wrong password
  - [ ] Verify error message
  - [ ] Verify no access granted
- [ ] Try to register duplicate username
  - [ ] Verify error message

### MQTT Authorization

- [ ] Try to connect with wrong password:
  ```bash
  mosquitto_pub -h localhost -u <uuid> -P "wrong" -t "test" -m "test"
  ```
  - [ ] Verify connection refused
- [ ] Try to publish to another user's topic:
  ```bash
  mosquitto_pub -h localhost -u <uuid1> -P <pass1> \
    -t "/<uuid2>/devices/test/telemetry" -m "hack"
  ```
  - [ ] Verify denied by ACL

## 🐛 Error Handling

### Network Errors

- [ ] Disconnect from internet
- [ ] Verify graceful error messages
- [ ] Reconnect
- [ ] Verify auto-reconnection works

### Invalid Data

- [ ] Send empty commands
  - [ ] Verify disabled/validation
- [ ] Send invalid JSON to alarm topic
  - [ ] Verify backend handles gracefully
  - [ ] Check backend logs for errors

### Edge Cases

- [ ] Send very long messages (>1000 chars)
- [ ] Send special characters (emoji, unicode)
- [ ] Send rapid-fire commands
- [ ] Create device with empty name
  - [ ] Should be prevented

## 📝 Documentation Testing

- [ ] Follow README instructions step-by-step
  - [ ] Verify all commands work
  - [ ] Verify examples are accurate
- [ ] Follow QUICKSTART.md
  - [ ] Complete all 10 steps
  - [ ] Verify guide is clear
- [ ] Check code examples:
  - [ ] Python example syntax
  - [ ] Arduino example syntax
  - [ ] MQTT topic formats

## ✅ Final Verification

- [ ] All features work as expected
- [ ] No console errors in browser
- [ ] No errors in backend logs
- [ ] Database contains expected data
- [ ] Performance is acceptable
- [ ] UI is polished and professional
- [ ] Documentation is clear and complete

## 🎯 Test Report Template

```
Date: __________
Tester: __________

✅ Passed: ___ / 100
❌ Failed: ___
⚠️  Issues: ___

Critical Issues:
-

Minor Issues:
-

Performance Notes:
-

Recommendations:
-
```

## 🔧 Troubleshooting Tests

If any test fails, try:

1. **Check Logs**
   ```bash
   docker logs backend
   docker logs mosquitto
   docker logs postgres
   ```

2. **Restart Services**
   ```bash
   docker compose restart
   ```

3. **Clean Rebuild**
   ```bash
   docker compose down -v
   docker compose up --build
   ```

4. **Check Network**
   ```bash
   docker network inspect mqtt_default
   ```

5. **Database Debug**
   ```bash
   docker exec -it postgres psql -U mqtt_user -d mqtt_db
   \dt  # list tables
   \d telemetry  # describe table
   SELECT COUNT(*) FROM telemetry;
   SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT 5;
   ```
