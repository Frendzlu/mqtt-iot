FROM eclipse-mosquitto:2.0

RUN mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
# The entrypoint will create `passwd` and `acl` if missing. Do not copy host files here.

EXPOSE 1883 9001

# Copy entrypoint that ensures passwd/acl and user exist
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
