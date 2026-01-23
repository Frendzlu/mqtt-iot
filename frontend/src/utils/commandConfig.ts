export type CommandParameter = {
    name: string;
    type: 'text' | 'number' | 'select' | 'boolean';
    label: string;
    placeholder?: string;
    options?: string[]; // For select type
    defaultValue?: string | number | boolean;
    required?: boolean;
};

export type CommandConfig = {
    id: string;
    label: string;
    description?: string;
    template: string; // Template string with placeholders like {{param1}}
    parameters?: CommandParameter[];
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
};

export const COMMAND_CONFIGS: CommandConfig[] = [
    {
        id: 'status',
        label: 'STATUS',
        description: 'Get device status',
        template: 'STATUS',
        color: 'primary'
    },
    {
        id: 'reset',
        label: 'RESET',
        description: 'Reset device',
        template: 'RESET',
        color: 'warning'
    },
    {
        id: 'led_control',
        label: 'LED Control',
        description: 'Control LED state',
        template: '{"led":"{{state}}"}',
        parameters: [
            {
                name: 'state',
                type: 'select',
                label: 'LED State',
                options: ['on', 'off', 'blink'],
                defaultValue: 'on',
                required: true
            }
        ],
        color: 'secondary'
    },
    {
        id: 'set_interval',
        label: 'Set Interval',
        description: 'Set telemetry sending interval',
        template: '{"interval":{{seconds}}}',
        parameters: [
            {
                name: 'seconds',
                type: 'number',
                label: 'Interval (seconds)',
                placeholder: 'Enter interval in seconds',
                defaultValue: 30,
                required: true
            }
        ]
    },
    {
        id: 'set_threshold',
        label: 'Set Threshold',
        description: 'Set sensor threshold value',
        template: '{"threshold":{"sensor":"{{sensor}}","value":{{value}}}}',
        parameters: [
            {
                name: 'sensor',
                type: 'text',
                label: 'Sensor Name',
                placeholder: 'temperature, humidity, etc.',
                required: true
            },
            {
                name: 'value',
                type: 'number',
                label: 'Threshold Value',
                placeholder: 'Enter threshold value',
                required: true
            }
        ]
    },
    {
        id: 'custom_message',
        label: 'Custom Message',
        description: 'Send a custom message',
        template: '{{message}}',
        parameters: [
            {
                name: 'message',
                type: 'text',
                label: 'Message',
                placeholder: 'Enter custom message',
                required: true
            }
        ],
        color: 'primary'
    }
];