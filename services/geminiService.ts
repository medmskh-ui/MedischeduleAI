
import { GoogleGenAI, Type } from "@google/genai";
import { Doctor, ScheduleConfig, DailySchedule } from '../types';
import { getDaysInMonth, format } from 'date-fns';

const createPrompt = (doctors: Doctor[], config: ScheduleConfig) => {
  const daysInMonth = getDaysInMonth(new Date(config.year, config.month));
  const monthName = format(new Date(config.year, config.month), 'MMMM yyyy');

  // Filter ONLY active doctors for the AI
  const activeDoctors = doctors.filter(d => d.active);

  return `
    I need to generate a medical roster for ${monthName}.
    
    Doctors available (Active only):
    ${JSON.stringify(activeDoctors.map(d => ({ id: d.id, name: d.name, unavailableDates: d.unavailableDates })))}

    Configuration:
    - Year: ${config.year}
    - Month (0-indexed): ${config.month}
    - Custom Holidays (array of {date, name}): ${JSON.stringify(config.customHolidays)}
    - Total Days: ${daysInMonth}

    Global Rules:
    1. Shifts are: Morning (8:31-16:30), Afternoon (16:31-00:30), Night (00:31-08:30).
    2. Wards: ICU and General (Ordinary).
    3. Weekdays (Mon-Fri): ONLY Afternoon and Night shifts exist. NO Morning shift.
    4. Weekends (Sat-Sun) and Custom Holidays: ALL 3 shifts (Morning, Afternoon, Night) exist.

    CRITICAL ASSIGNMENT LOGIC (Follow STRICTLY in order):

    Rule 0: STRICT UNAVAILABILITY (HIGHEST PRIORITY)
    - Check the 'unavailableDates' list for EVERY doctor.
    - If a doctor is unavailable on Date X, they MUST NOT be assigned to ANY shift (Morning, Afternoon, or Night) on Date X.
    - This applies to BOTH ICU and General wards.
    - DO NOT schedule a doctor on a day they are unavailable.

    Rule 1: DAILY CONTINUITY (Afternoon + Night)
    - On EVERY day (Weekday or Holiday), the doctor assigned to the **Afternoon** shift MUST be the same doctor assigned to the **Night** shift on the SAME ward.
    - ICU Afternoon == ICU Night
    - General Afternoon == General Night
    - Exception: Do not violate Rule 0.

    Rule 2: HOLIDAY CROSS-WARD PATTERN A (General Morning -> ICU Afternoon/Night)
    - IF it is a Weekend or Holiday:
    - The doctor assigned to **General Ward Morning** MUST be the same doctor assigned to **ICU Afternoon** and **ICU Night**.
    - Chain: [General Morning] -> [ICU Afternoon] -> [ICU Night] = Same Doctor.

    Rule 3: HOLIDAY CROSS-WARD PATTERN B (ICU Morning -> General Afternoon/Night)
    - IF it is a Weekend or Holiday:
    - The doctor assigned to **ICU Morning** MUST be the same doctor assigned to **General Ward Afternoon** and **General Ward Night**.
    - Chain: [ICU Morning] -> [General Afternoon] -> [General Night] = Same Doctor.

    Rule 4: SIMULTANEOUS SHIFT CONFLICT
    - A doctor CANNOT be assigned to both wards at the same time.
    - ICU Afternoon != General Afternoon
    - ICU Night != General Night
    - ICU Morning != General Morning (on holidays)

    Rule 5: MORNING WARD CONFLICT (Holiday)
    - The doctor on General Morning CANNOT be the same as the doctor on ICU Morning.

    Output JSON format:
    Array of objects, one for each day of the month.
    {
      "date": "YYYY-MM-DD",
      "isHoliday": boolean,
      "shifts": {
        "morning": { "icu": "doctor_id" | null, "general": "doctor_id" | null }, // null if weekday
        "afternoon": { "icu": "doctor_id", "general": "doctor_id" },
        "night": { "icu": "doctor_id", "general": "doctor_id" }
      }
    }
  `;
};

export const generateScheduleWithGemini = async (
  doctors: Doctor[],
  config: ScheduleConfig
): Promise<DailySchedule[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: createPrompt(doctors, config),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            isHoliday: { type: Type.BOOLEAN },
            shifts: {
              type: Type.OBJECT,
              properties: {
                morning: {
                  type: Type.OBJECT,
                  properties: {
                    icu: { type: Type.STRING, nullable: true },
                    general: { type: Type.STRING, nullable: true }
                  },
                  nullable: true
                },
                afternoon: {
                  type: Type.OBJECT,
                  properties: {
                    icu: { type: Type.STRING },
                    general: { type: Type.STRING }
                  }
                },
                night: {
                  type: Type.OBJECT,
                  properties: {
                    icu: { type: Type.STRING },
                    general: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  return JSON.parse(response.text);
};
