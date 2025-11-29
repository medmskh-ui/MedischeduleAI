
import { Doctor, DailySchedule, ScheduleConfig, User } from '../types';

/**
 * Data Service Layer (API Version)
 * เชื่อมต่อกับ Backend Server (server.js) ผ่าน HTTP API
 */

const API_BASE = '/api';

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorText = await response.text();
    // Try to parse JSON error if possible
    try {
        const jsonError = JSON.parse(errorText);
        throw new Error(jsonError.error || `API Error: ${response.status}`);
    } catch (e) {
        throw new Error(errorText || `API Error: ${response.status}`);
    }
  }
  return response.json();
};

export const dataService = {
  
  // --- AUTHENTICATION ---
  login: async (username: string, password: string): Promise<User> => {
    try {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        return handleResponse(res);
    } catch (error) {
        console.error("Login API failed, checking local storage fallback...", error);
        // FALLBACK FOR DEVELOPMENT WITHOUT SERVER
        // NOTE: This assumes admin/password default if server is down.
        // In production, you would handle this error properly.
        if (username === 'admin' && password === 'password') {
             return { username: 'admin', role: 'admin', name: 'Admin Fallback' };
        }
        if (username === 'user' && password === 'password') {
             return { username: 'user', role: 'user', name: 'User Fallback' };
        }
        throw error;
    }
  },

  register: async (username: string, password: string, name: string): Promise<{success: boolean, message: string}> => {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name })
    });
    return handleResponse(res);
  },

  // --- DOCTORS ---
  getDoctors: async (): Promise<Doctor[]> => {
    try {
        const res = await fetch(`${API_BASE}/doctors`);
        return await handleResponse(res);
    } catch (e) {
        console.warn("API unavailable, using localStorage for Doctors");
        const local = localStorage.getItem('doctors');
        return local ? JSON.parse(local) : [];
    }
  },

  saveDoctors: async (doctors: Doctor[]) => {
    try {
        await fetch(`${API_BASE}/doctors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doctors)
        });
    } catch (e) {
        console.warn("API unavailable, saving to localStorage");
        localStorage.setItem('doctors', JSON.stringify(doctors));
    }
  },

  // --- SCHEDULE ---
  getSchedule: async (): Promise<DailySchedule[]> => {
    try {
        const res = await fetch(`${API_BASE}/schedules`);
        return await handleResponse(res);
    } catch (e) {
        console.warn("API unavailable, using localStorage for Schedule");
        const local = localStorage.getItem('schedule');
        return local ? JSON.parse(local) : [];
    }
  },

  saveSchedule: async (schedule: DailySchedule[]) => {
    try {
        await fetch(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
        });
    } catch (e) {
         console.warn("API unavailable, saving to localStorage");
         localStorage.setItem('schedule', JSON.stringify(schedule));
    }
  },

  // --- CONFIG ---
  getConfig: async (): Promise<ScheduleConfig | null> => {
    try {
        const res = await fetch(`${API_BASE}/config`);
        return await handleResponse(res);
    } catch (e) {
        console.warn("API unavailable, using localStorage for Config");
        const local = localStorage.getItem('config');
        return local ? JSON.parse(local) : null;
    }
  },

  saveConfig: async (config: ScheduleConfig) => {
    try {
        await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
        });
    } catch (e) {
        console.warn("API unavailable, saving to localStorage");
        localStorage.setItem('config', JSON.stringify(config));
    }
  }
};
