
import { Doctor, ScheduleConfig, DailySchedule } from '../types';
import { GoogleGenAI } from "@google/genai";
import { getDaysInMonth, format } from 'date-fns';

// Helper to validate and parse Minified JSON from AI to DailySchedule
const mapMinifiedToSchedule = (minifiedData: any[]): DailySchedule[] => {
  return minifiedData.map(item => ({
    date: item.d,
    isHoliday: item.h,
    holidayName: item.hn,
    shifts: {
      morning: item.s.m ? { icu: item.s.m.i || null, general: item.s.m.g || null } : undefined,
      afternoon: { icu: item.s.a?.i || null, general: item.s.a?.g || null },
      night: { icu: item.s.n?.i || null, general: item.s.n?.g || null }
    }
  }));
};

export const generateScheduleWithGemini = async (
  doctors: Doctor[],
  config: ScheduleConfig
): Promise<DailySchedule[]> => {
  // Use Client-Side Generation to avoid Vercel Serverless Function Timeout (10s limit on Hobby tier)
  
  if (!process.env.API_KEY) {
    throw new Error("ไม่พบ API Key กรุณาตั้งค่า VITE_API_KEY ใน Environment Variables");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
  const monthName = format(new Date(config.year, config.month), 'MMMM yyyy');
  const activeDoctors = doctors.filter(d => d.active);

  // Updated Prompt based on User Requirements
  const prompt = `
    Role: Medical Scheduler.
    Task: Create a roster for ${monthName} (${daysInMonth} days).
    
    Resources:
    - Doctors: ${JSON.stringify(activeDoctors.map(d => ({ id: d.id, n: d.name, un: d.unavailableDates })))}
    - Holidays: ${JSON.stringify(config.customHolidays.map(h => ({d: h.date, n: h.name})))} (Includes Weekends).

    STRICT RULES (Must follow):
    1. Unavailable: If a doctor has a date in their 'un' list, they CANNOT work any shift on that date (Morning, Afternoon, or Night).
    2. Continuity: For ANY day (Weekday or Holiday), the Afternoon and Night shift on a specific ward must be the same doctor.
       - General Ward: Afternoon Doc = Night Doc.
       - ICU Ward: Afternoon Doc = Night Doc.
    3. Separation: On any given shift, General Ward Doc != ICU Ward Doc.
    4. Weekday Structure (Non-Holiday):
       - Morning: Closed (null).
       - Afternoon/Night: Assign 2 different doctors (one for Gen, one for ICU).
    5. Holiday/Weekend Structure:
       - Morning: Open. Requires 2 doctors.
       - PATTERN A (Doctor 1): Morning General -> Afternoon ICU -> Night ICU.
       - PATTERN B (Doctor 2): Morning ICU -> Afternoon General -> Night General.
       - Doctor 1 != Doctor 2.

    OPTIMIZATION GOALS (Prioritize in order):
    1. Spacing: Ideally, leave at least 2 rest days between duty days for a doctor (e.g., Work, Rest, Rest, Work). If staffing is tight, 1 rest day is acceptable. Avoid consecutive working days.
    2. Holiday Distribution: Distribute Holiday/Weekend shifts evenly. Target: Each doctor gets at least 1 holiday shift if possible. Minimize doctors with 0 holiday shifts.
    3. Ward Balance: Over the month, try to balance each doctor's assignments so they do ~50% General Ward roles and ~50% ICU roles.

    Output: JSON Array of Objects with these short keys ONLY:
    {
      "d": "YYYY-MM-DD",
      "h": boolean (isHoliday),
      "hn": string (holidayName or null),
      "s": {
        "m": { "i": "id"|null, "g": "id"|null } (Morning, null if weekday),
        "a": { "i": "id", "g": "id" } (Afternoon),
        "n": { "i": "id", "g": "id" } (Night)
      }
    }
    Return ONLY valid JSON.
  `;

  try {
    // Use gemini-2.5-flash for speed and latest features
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data received from AI");

    const minifiedData = JSON.parse(jsonText);
    
    // Validate that we got an array
    if (!Array.isArray(minifiedData)) {
      throw new Error("AI response format error: Expected Array");
    }

    return mapMinifiedToSchedule(minifiedData);

  } catch (error: any) {
    console.error("AI Generation Error:", error);
    throw new Error(error.message || "Failed to generate schedule");
  }
};
