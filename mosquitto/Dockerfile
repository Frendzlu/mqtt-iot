FROM eclipse-mosquitto:2.0

RUN mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY passwd /mosquitto/config/passwd
COPY acl /mosquitto/config/acl

RUN chmod 0700 /mosquitto/config/passwd \
    && chown root:root /mosquitto/config/passwd \
    && chmod 0644 /mosquitto/config/acl \
    && chown root:root /mosquitto/config/acl

EXPOSE 1883 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf", "-v"]
