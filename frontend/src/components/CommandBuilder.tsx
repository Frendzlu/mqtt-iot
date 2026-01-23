import { useState } from 'react';
import type { CommandConfig, CommandParameter } from '../utils/commandConfig';
import { COMMAND_CONFIGS } from '../utils/commandConfig';

type Props = {
    onSendCommand: (command: string) => void;
    loading: boolean;
};

export default function CommandBuilder({ onSendCommand, loading }: Props) {
    const [selectedCommandId, setSelectedCommandId] = useState<string>('');
    const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customCommand, setCustomCommand] = useState('');

    const selectedCommand = COMMAND_CONFIGS.find(cmd => cmd.id === selectedCommandId);

    const handleParameterChange = (paramName: string, value: any) => {
        setParameterValues(prev => ({
            ...prev,
            [paramName]: value
        }));
    };

    const buildCommand = (command: CommandConfig): string => {
        let result = command.template;
        
        if (command.parameters) {
            command.parameters.forEach(param => {
                const value = parameterValues[param.name] ?? param.defaultValue ?? '';
                const placeholder = `{{${param.name}}}`;
                result = result.replace(new RegExp(placeholder, 'g'), String(value));
            });
        }
        
        return result;
    };

    const handleQuickCommand = (command: CommandConfig) => {
        if (command.parameters && command.parameters.length > 0) {
            // Set up parameters with defaults
            const defaults: Record<string, any> = {};
            command.parameters.forEach(param => {
                if (param.defaultValue !== undefined) {
                    defaults[param.name] = param.defaultValue;
                }
            });
            setParameterValues(defaults);
            setSelectedCommandId(command.id);
        } else {
            // Send command immediately
            onSendCommand(buildCommand(command));
        }
    };

    const handleSendParameterizedCommand = () => {
        if (selectedCommand) {
            const command = buildCommand(selectedCommand);
            onSendCommand(command);
            // Clear selection after sending
            setSelectedCommandId('');
            setParameterValues({});
        }
    };

    const renderParameterInput = (param: CommandParameter) => {
        const value = parameterValues[param.name] ?? param.defaultValue ?? '';

        switch (param.type) {
            case 'select':
                return (
                    <select
                        value={value}
                        onChange={(e) => handleParameterChange(param.name, e.target.value)}
                        className="input-sm"
                    >
                        <option value="">Select {param.label}</option>
                        {param.options?.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                );
            case 'number':
                return (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleParameterChange(param.name, Number(e.target.value))}
                        placeholder={param.placeholder}
                        className="input-sm"
                    />
                );
            case 'boolean':
                return (
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => handleParameterChange(param.name, e.target.checked)}
                    />
                );
            default: // text
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleParameterChange(param.name, e.target.value)}
                        placeholder={param.placeholder}
                        className="input-sm"
                    />
                );
        }
    };

    return (
        <div className="command-builder">
            <h3>Send Command</h3>
            
            {/* Quick Commands */}
            <div className="quick-commands">
                <div className="commands-grid">
                    {COMMAND_CONFIGS.map(command => (
                        <button
                            key={command.id}
                            onClick={() => handleQuickCommand(command)}
                            className={`btn-command ${command.color || 'secondary'}`}
                            title={command.description}
                        >
                            {command.label}
                            {command.parameters && command.parameters.length > 0 && (
                                <span className="param-indicator">⚙️</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Parameter Configuration */}
            {selectedCommand && (
                <div className="command-parameters">
                    <h4>Configure: {selectedCommand.label}</h4>
                    {selectedCommand.description && (
                        <p className="command-description">{selectedCommand.description}</p>
                    )}
                    
                    <div className="parameters-form">
                        {selectedCommand.parameters?.map(param => (
                            <div key={param.name} className="parameter-field">
                                <label>
                                    {param.label}
                                    {param.required && <span className="required">*</span>}
                                </label>
                                {renderParameterInput(param)}
                            </div>
                        ))}
                    </div>

                    <div className="parameter-actions">
                        <button
                            onClick={handleSendParameterizedCommand}
                            disabled={loading}
                            className="btn btn-primary"
                        >
                            {loading ? 'Sending...' : 'Send Command'}
                        </button>
                        <button
                            onClick={() => {
                                setSelectedCommandId('');
                                setParameterValues({});
                            }}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                    </div>

                    <div className="command-preview">
                        <strong>Preview:</strong>
                        <code>{buildCommand(selectedCommand)}</code>
                    </div>
                </div>
            )}

            {/* Custom Command Input */}
            <div className="custom-command">
                <button
                    onClick={() => setShowCustomInput(!showCustomInput)}
                    className="btn-toggle-custom"
                >
                    {showCustomInput ? 'Hide' : 'Show'} Custom Command
                </button>
                
                {showCustomInput && (
                    <div className="custom-input-area">
                        <textarea
                            placeholder="Enter custom command..."
                            value={customCommand}
                            onChange={(e) => setCustomCommand(e.target.value)}
                            rows={3}
                            className="command-input"
                            onKeyPress={(e) => {
                                if (e.key === "Enter" && e.ctrlKey) {
                                    onSendCommand(customCommand);
                                    setCustomCommand('');
                                }
                            }}
                        />
                        <button 
                            onClick={() => {
                                onSendCommand(customCommand);
                                setCustomCommand('');
                            }} 
                            disabled={loading || !customCommand.trim()} 
                            className="btn btn-primary"
                        >
                            {loading ? "Sending..." : "Send Custom Command"}
                        </button>
                        <p className="hint">Press Ctrl+Enter to send</p>
                    </div>
                )}
            </div>
        </div>
    );
}