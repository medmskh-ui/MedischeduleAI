
import { Doctor, DailySchedule, ScheduleConfig, User } from '../types';

/**
 * Data Service Layer (API Version)
 * เชื่อมต่อกับ Backend Server (server.js) ผ่าน HTTP API
 */

const API_BASE = '/api';

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `API Error: ${response.status}`);
  }
  return response.json();
};

export const dataService = {
  
  // --- AUTHENTICATION ---
  login: async (username: string, password: string): Promise<User> => {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return handleResponse(res);
  },

  // --- DOCTORS ---
  getDoctors: async (): Promise<Doctor[]> => {
    const res = await fetch(`${API_BASE}/doctors`);
    return handleResponse(res);
  },

  saveDoctors: async (doctors: Doctor[]) => {
    // Note: In a real app, you might want to patch individual records.
    // For simplicity, we send the full list to be synchronized.
    await fetch(`${API_BASE}/doctors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doctors)
    });
  },

  // --- SCHEDULE ---
  getSchedule: async (): Promise<DailySchedule[]> => {
    const res = await fetch(`${API_BASE}/schedules`);
    return handleResponse(res);
  },

  saveSchedule: async (schedule: DailySchedule[]) => {
    await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule)
    });
  },

  // --- CONFIG ---
  getConfig: async (): Promise<ScheduleConfig | null> => {
    const res = await fetch(`${API_BASE}/config`);
    return handleResponse(res);
  },

  saveConfig: async (config: ScheduleConfig) => {
    await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
  }
};
