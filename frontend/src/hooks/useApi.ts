import { useState } from 'react';
import type { Device, Alarm } from '../types';

export const useBackendUrl = () => {
    const [backendUrl, setBackendUrl] = useState(() => {
        return localStorage.getItem("backendUrl") || "http://localhost:3001";
    });

    const handleBackendUrlChange = (url: string) => {
        setBackendUrl(url);
        localStorage.setItem("backendUrl", url);
    };

    const isValidUrl = (url: string) => {
        try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
        } catch {
            return false;
        }
    };

    return { backendUrl, handleBackendUrlChange, isValidUrl };
};

export const useApi = (backendUrl: string) => {
    const fetchDevices = async (userUuid: string): Promise<Device[]> => {
        try {
            const res = await fetch(`${backendUrl}/devices/${userUuid}`);
            if (!res.ok) {
                console.error("Failed to fetch devices:", res.statusText);
                return [];
            }
            const data = await res.json();
            console.log(`[DEVICES] Fetched ${data.length} device(s):`, data);
            return data;
        } catch (err) {
            console.error("Error fetching devices:", err);
            return [];
        }
    };

    const fetchAlarms = async (userUuid: string): Promise<Alarm[]> => {
        try {
            const res = await fetch(`${backendUrl}/alarms/${userUuid}?limit=50`);
            if (!res.ok) {
                console.error("Failed to fetch alarms:", res.statusText);
                return [];
            }
            const data = await res.json();
            return data;
        } catch (err) {
            console.error("Error fetching alarms:", err);
            return [];
        }
    };

    const acknowledgeAlarm = async (alarmId: number): Promise<boolean> => {
        try {
            if (!alarmId || alarmId === undefined || typeof alarmId !== 'number') {
                console.error("Invalid alarmId passed to acknowledgeAlarm:", alarmId);
                return false;
            }
            const res = await fetch(`${backendUrl}/alarms/${alarmId}/acknowledge`, {
                method: "POST",
            });
            return res.ok;
        } catch (err) {
            console.error("Error acknowledging alarm:", err);
            return false;
        }
    };

    const register = async (username: string, password: string) => {
        if (!username || !password) throw new Error("username and password required");
        
        try {
            const res = await fetch(`${backendUrl}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Register failed");
            }
            return await res.json();
        } catch (error) {
            throw new Error("Failed to connect to backend. Please check the URL and try again.");
        }
    };

    const login = async (username: string, password: string) => {
        if (!username || !password) throw new Error("username and password required");
        
        try {
            const res = await fetch(`${backendUrl}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Login failed");
            }
            return await res.json();
        } catch (error) {
            throw new Error("Failed to connect to backend. Please check the URL and try again.");
        }
    };

    const deleteImage = async (userUuid: string, macAddress: string, imageId: string): Promise<boolean> => {
        try {
            const res = await fetch(`${backendUrl}/images/${userUuid}/${macAddress}/${imageId}`, {
                method: "DELETE",
            });
            return res.ok;
        } catch (err) {
            console.error("Error deleting image:", err);
            return false;
        }
    };

    return {
        fetchDevices,
        fetchAlarms,
        acknowledgeAlarm,
        register,
        login,
        deleteImage
    };
};