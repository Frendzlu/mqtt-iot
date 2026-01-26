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
        id: 'photo',
        label: 'Take Photo',
        description: 'Take a photo with the device camera',
        template: '{"command":"photo"}',
        color: 'primary'
    },
    {
        id: 'temp',
        label: 'Measure Temperature',
        description: 'Take an immediate temperature reading',
        template: '{"command":"temp"}',
        color: 'primary'
    },
    {
        id: 'arm',
        label: 'Arm Device',
        description: 'Arm the device to send images on motion detection',
        template: '{"command":"arm"}',
        color: 'success'
    },
    {
        id: 'disarm',
        label: 'Disarm Device',
        description: 'Disarm the device to stop sending images',
        template: '{"command":"disarm"}',
        color: 'warning'
    },
    {
        id: 'set_measurement_interval',
        label: 'Set Measurement Interval',
        description: 'Set how often the device takes measurements (in minutes)',
        template: '{"command":"set_measurement_interval","minutes":{{minutes}}}',
        parameters: [
            {
                name: 'minutes',
                type: 'number',
                label: 'Interval (minutes)',
                placeholder: 'Enter interval in minutes',
                defaultValue: 5,
                required: true
            }
        ],
        color: 'primary'
    },
    {
        id: 'set_send_interval',
        label: 'Set Send Interval',
        description: 'Set how often the device sends batched measurements (in minutes)',
        template: '{"command":"set_send_interval","minutes":{{minutes}}}',
        parameters: [
            {
                name: 'minutes',
                type: 'number',
                label: 'Send Interval (minutes)',
                placeholder: 'Enter send interval in minutes',
                defaultValue: 15,
                required: true
            }
        ],
        color: 'primary'
    }
];