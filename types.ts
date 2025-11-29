
export interface Doctor {
  id: string;
  name: string;
  phone: string;
  unavailableDates: string[]; // ISO dates YYYY-MM-DD
  active: boolean;
  color: string;
}

export type ShiftPeriod = 'morning' | 'afternoon' | 'night';
export type WardType = 'ICU' | 'General';

// Morning: 8:31-16:30 (Only Weekends/Holidays)
// Afternoon: 16:31-00:30 (Everyday)
// Night: 00:31-08:30 (Everyday)

export interface Holiday {
  date: string;
  name: string;
}

export interface DailySchedule {
  date: string; // ISO string
  isHoliday: boolean;
  holidayName?: string;
  shifts: {
    morning?: {
      icu: string | null; // Doctor ID
      general: string | null;
    };
    afternoon: {
      icu: string | null;
      general: string | null;
    };
    night: {
      icu: string | null;
      general: string | null;
    };
  };
}

export interface ScheduleConfig {
  year: number;
  month: number; // 0-11
  customHolidays: Holiday[]; // Array of Holiday objects
}

export type UserRole = 'admin' | 'user' | 'viewer';

export interface User {
  username: string;
  role: UserRole;
  name?: string;
}
