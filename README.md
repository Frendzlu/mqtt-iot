Mosquitto:
- TCP: `1883` (`tcp://localhost:1883)
- WebSocket: `9001` (`ws://localhost:9001)

Backend:
- `POST localhost:3001/create-user`

Frontend:
- `localhost:5173`

Run using `docker compose up --build`.

Adding users: `mosquitto_passwd -b ./mosquitto/config/passwd device_pass pass` when in container