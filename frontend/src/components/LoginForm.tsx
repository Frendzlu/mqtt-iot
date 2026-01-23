import { useState } from 'react';
import { useBackendUrl, useApi } from '../hooks/useApi';

type Props = {
    onLoginSuccess: (data: { uuid: string; username: string; password: string }) => void;
};

export default function LoginForm({ onLoginSuccess }: Props) {
    const { backendUrl, handleBackendUrlChange, isValidUrl } = useBackendUrl();
    const api = useApi(backendUrl);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (action: 'login' | 'register') => {
        if (!isValidUrl(backendUrl)) {
            alert("Please enter a valid backend URL (http:// or https://)");
            return;
        }

        setLoading(true);
        try {
            const data = action === 'login' 
                ? await api.login(username, password)
                : await api.register(username, password);
            
            onLoginSuccess({ uuid: data.uuid, username, password });
        } catch (error) {
            alert(error instanceof Error ? error.message : "An error occurred");
        }
        setLoading(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSubmit('login');
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>🔌 MQTT IoT Dashboard</h1>
                <p className="subtitle">Manage your IoT devices and monitor telemetry in real-time</p>

                <div className="form-group">
                    <label htmlFor="backend-url">Backend URL</label>
                    <input
                        id="backend-url"
                        placeholder="http://localhost:3001"
                        value={backendUrl}
                        onChange={(e) => handleBackendUrlChange(e.target.value)}
                        className={`input ${!isValidUrl(backendUrl) && backendUrl.trim() !== '' ? 'invalid' : ''}`}
                    />
                    {!isValidUrl(backendUrl) && backendUrl.trim() !== '' && (
                        <small style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                            Please enter a valid URL starting with http:// or https://
                        </small>
                    )}
                </div>

                <div className="form-group">
                    <input
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="input"
                        onKeyPress={handleKeyPress}
                    />
                </div>

                <div className="form-group">
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input"
                        onKeyPress={handleKeyPress}
                    />
                </div>

                <div className="button-group">
                    <button 
                        onClick={() => handleSubmit('login')} 
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>
                    <button 
                        onClick={() => handleSubmit('register')} 
                        className="btn btn-secondary"
                        disabled={loading}
                    >
                        {loading ? "Registering..." : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}