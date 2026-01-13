#!/bin/sh
set -e

# Ensure config dir exists
mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log

# Paths
PASSWD_FILE=${MOSQUITTO_PASSWD:-/mosquitto/config/passwd}
ACL_FILE=${MOSQUITTO_ACL:-/mosquitto/config/acl}

# Ensure files exist
if [ ! -f "$PASSWD_FILE" ]; then
  touch "$PASSWD_FILE"
fi
if [ ! -f "$ACL_FILE" ]; then
  touch "$ACL_FILE"
fi

# Ensure the configured management user exists in passwd
if [ -n "$MOSQ_USER" ] && [ -n "$MOSQ_PASS" ]; then
  # mosquitto_passwd -b will add or update the user
  if command -v mosquitto_passwd >/dev/null 2>&1; then
    mosquitto_passwd -b "$PASSWD_FILE" "$MOSQ_USER" "$MOSQ_PASS" || true
  else
    echo "mosquitto_passwd not found; skipping user creation"
  fi

  # Ensure ACL contains an entry for this user that allows full access
  # We'll add a minimal block if no 'user <MOSQ_USER>' exists
  if ! grep -q "^user[[:space:]]\+$MOSQ_USER\b" "$ACL_FILE" 2>/dev/null; then
    cat >> "$ACL_FILE" <<EOF
# Automatically added for user $MOSQ_USER
user $MOSQ_USER
topic readwrite #
EOF
  fi
fi

# Set correct permissions so mosquitto can read the files
# Set ownership to mosquitto user and use restrictive permissions
if id mosquitto >/dev/null 2>&1; then
  chown mosquitto:mosquitto "$PASSWD_FILE" || true
  chown mosquitto:mosquitto "$ACL_FILE" || true
  chown -R mosquitto:mosquitto /mosquitto/log || true
fi
# Use restrictive perms recommended by mosquitto (0700) to avoid future rejections
chmod 0700 "$PASSWD_FILE" || true
chmod 0700 "$ACL_FILE" || true

# Exec mosquitto as the container's main process
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf -v
