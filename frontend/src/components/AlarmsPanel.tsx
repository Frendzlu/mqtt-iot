type Alarm = {
    id: number;
    device_id: string;
    device_name: string;
    severity: string;
    message: string;
    acknowledged: boolean;
    acknowledged_at: string | null;
    timestamp: string;
};

type Props = {
    alarms: Alarm[];
    onAcknowledge: (alarmId: number) => void;
    onClose: () => void;
};

export default function AlarmsPanel({ alarms, onAcknowledge, onClose }: Props) {
    const getSeverityClass = (severity: string) => {
        switch (severity.toLowerCase()) {
            case "critical":
                return "severity-critical";
            case "warning":
                return "severity-warning";
            default:
                return "severity-info";
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity.toLowerCase()) {
            case "critical":
                return "🔴";
            case "warning":
                return "⚠️";
            default:
                return "ℹ️";
        }
    };

    const unacknowledgedAlarms = alarms.filter((a) => !a.acknowledged);
    const acknowledgedAlarms = alarms.filter((a) => a.acknowledged);

    return (
        <div className="alarms-panel">
            <div className="panel-header">
                <h2>🔔 Alarms & Alerts</h2>
                <button onClick={onClose} className="btn-close">
                    ✕
                </button>
            </div>

            <div className="alarms-summary">
                <div className="summary-item">
                    <span className="summary-label">Total Alarms:</span>
                    <span className="summary-value">{alarms.length}</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Unacknowledged:</span>
                    <span className="summary-value highlight">{unacknowledgedAlarms.length}</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Acknowledged:</span>
                    <span className="summary-value">{acknowledgedAlarms.length}</span>
                </div>
            </div>

            {unacknowledgedAlarms.length > 0 && (
                <div className="alarms-section">
                    <h3>⚡ Unacknowledged Alarms</h3>
                    <div className="alarms-list">
                        {unacknowledgedAlarms.map((alarm) => (
                            <div key={alarm.id} className={`alarm-item ${getSeverityClass(alarm.severity)}`}>
                                <div className="alarm-header">
                                    <span className="alarm-icon">{getSeverityIcon(alarm.severity)}</span>
                                    <span className="alarm-device">{alarm.device_name || alarm.device_id}</span>
                                    <span className={`alarm-severity ${getSeverityClass(alarm.severity)}`}>
                                        {alarm.severity.toUpperCase()}
                                    </span>
                                </div>
                                <div className="alarm-message">{alarm.message}</div>
                                <div className="alarm-footer">
                                    <span className="alarm-time">
                                        {new Date(alarm.timestamp).toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => onAcknowledge(alarm.id)}
                                        className="btn btn-sm btn-ack"
                                    >
                                        ✓ Acknowledge
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {acknowledgedAlarms.length > 0 && (
                <div className="alarms-section">
                    <h3>✓ Acknowledged Alarms</h3>
                    <div className="alarms-list">
                        {acknowledgedAlarms.map((alarm) => (
                            <div key={alarm.id} className={`alarm-item acknowledged ${getSeverityClass(alarm.severity)}`}>
                                <div className="alarm-header">
                                    <span className="alarm-icon">{getSeverityIcon(alarm.severity)}</span>
                                    <span className="alarm-device">{alarm.device_name || alarm.device_id}</span>
                                    <span className={`alarm-severity ${getSeverityClass(alarm.severity)}`}>
                                        {alarm.severity.toUpperCase()}
                                    </span>
                                </div>
                                <div className="alarm-message">{alarm.message}</div>
                                <div className="alarm-footer">
                                    <span className="alarm-time">
                                        {new Date(alarm.timestamp).toLocaleString()}
                                    </span>
                                    <span className="ack-time">
                                        Acknowledged: {new Date(alarm.acknowledged_at!).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {alarms.length === 0 && (
                <div className="empty-state">
                    <p>No alarms yet. Your devices are running smoothly! 🎉</p>
                </div>
            )}
        </div>
    );
}
