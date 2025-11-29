
import { Doctor, DailySchedule, ScheduleConfig } from '../types';

// STORAGE KEYS
const STORAGE_KEYS = {
  DOCTORS: 'medischedule_doctors',
  SCHEDULE: 'medischedule_schedule',
  CONFIG: 'medischedule_config'
};

/**
 * Data Service Layer
 * ------------------
 * ปัจจุบัน: ใช้ LocalStorage เพื่อบันทึกข้อมูลใน Browser (ให้ใช้งานได้ทันทีโดยไม่ต้องมี Server)
 * อนาคต (To Connect Neon): เปลี่ยนโค้ดในฟังก์ชันเหล่านี้ให้ใช้ fetch() ไปยัง API Server ของคุณ
 * 
 * ตัวอย่างการเชื่อมต่อ API:
 * const response = await fetch('https://your-api.com/doctors');
 * return await response.json();
 */
export const dataService = {
  
  // --- DOCTORS ---
  getDoctors: async (): Promise<Doctor[]> => {
    // TODO for Neon: return fetch('/api/doctors').then(res => res.json());
    const data = localStorage.getItem(STORAGE_KEYS.DOCTORS);
    return data ? JSON.parse(data) : [];
  },

  saveDoctors: async (doctors: Doctor[]) => {
    // TODO for Neon: fetch('/api/doctors', { method: 'POST', body: JSON.stringify(doctors) });
    localStorage.setItem(STORAGE_KEYS.DOCTORS, JSON.stringify(doctors));
  },

  // --- SCHEDULE ---
  getSchedule: async (): Promise<DailySchedule[]> => {
    // TODO for Neon: return fetch('/api/schedules').then(res => res.json());
    const data = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
    return data ? JSON.parse(data) : [];
  },

  saveSchedule: async (schedule: DailySchedule[]) => {
    // TODO for Neon: fetch('/api/schedules', { method: 'POST', body: JSON.stringify(schedule) });
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
  },

  // --- CONFIG (Holidays/Month settings) ---
  getConfig: async (): Promise<ScheduleConfig | null> => {
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return data ? JSON.parse(data) : null;
  },

  saveConfig: async (config: ScheduleConfig) => {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  }
};
