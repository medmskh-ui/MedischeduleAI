
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

  // Minified Prompt Strategy to reduce token generation time
  const prompt = `
    Role: Medical Scheduler.
    Task: Create a roster for ${monthName} (${daysInMonth} days).
    
    Resources:
    - Doctors: ${JSON.stringify(activeDoctors.map(d => ({ id: d.id, n: d.name, un: d.unavailableDates })))}
    - Holidays: ${JSON.stringify(config.customHolidays.map(h => ({d: h.date, n: h.name})))} (Includes Weekends).

    Rules:
    1. If doc has date in 'un', DO NOT assign.
    2. Continuity: Afternoon doc = Night doc (Same Ward).
    3. Separation: Gen doc != ICU doc (Same Shift).
    4. Pattern (Holiday/Weekend):
       - Doc A: Gen Morn -> ICU Aft -> ICU Night.
       - Doc B: ICU Morn -> Gen Aft -> Gen Night.
    5. Pattern (Weekday):
       - Morn: null (Closed).
       - Doc A: Gen Aft -> Gen Night.
       - Doc B: ICU Aft -> ICU Night.
    6. Fairness: Spread shifts evenly.

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
