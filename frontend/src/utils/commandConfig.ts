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
        label: 'Make a photo',
        description: 'Take a photo with the device camera',
        template: '{"command":"photo"}',
        color: 'primary'
    },
    {
        id: 'temp',
        label: 'Make a temperature measurement',
        description: 'Take a temperature reading',
        template: '{"command":"temp"}',
        color: 'primary'
    },
    {
        id: 'set_frequency',
        label: 'Set frequency',
        description: 'Set telemetry frequency in minutes',
        template: '{"freq":{{minutes}}}',
        parameters: [
            {
                name: 'minutes',
                type: 'number',
                label: 'Frequency (minutes)',
                placeholder: 'Enter frequency in minutes',
                defaultValue: 15,
                required: true
            }
        ],
        color: 'primary'
    }
];