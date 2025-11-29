
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import { getDaysInMonth, format } from 'date-fns';

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Neon
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Allow larger payloads for schedule

// --- AI LOGIC (Server-Side) ---
const createPrompt = (doctors, config) => {
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

// --- ROUTES ---

// AI Generation Route
app.post('/api/generate-schedule', async (req, res) => {
  const { doctors, config } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing on server");
    return res.status(500).json({ error: "Server configuration error: Missing API Key" });
  }

  if (!doctors || !config) {
    return res.status(400).json({ error: "Missing doctors or config data" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Using gemini-3-pro-preview as requested for higher quality
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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

    const generatedSchedule = JSON.parse(response.text);
    res.json(generatedSchedule);

  } catch (error) {
    console.error("Gemini AI Error:", error);
    res.status(500).json({ error: "Failed to generate schedule: " + error.message });
  }
});

// Test Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 1. Login (Plain Text Password)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    
    // Direct comparison (Plain text)
    if (password === user.password_hash) {
      res.json({ username: user.username, role: user.role, name: user.name });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 1.1 Register (Plain Text Password, Force Viewer Role)
app.post('/api/register', async (req, res) => {
  const { username, password, name } = req.body;
  
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (Username, Password, ชื่อ-นามสกุล)' });
  }

  try {
    // Force role = 'viewer' for new registrations
    await pool.query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1, $2, $3, $4)',
      [username, password, 'viewer', name]
    );

    res.json({ success: true, message: 'User created successfully' });
  } catch (err) {
    console.error(err);
    // Check for duplicate username error (Postgres code 23505)
    if (err.code === '23505') {
        return res.status(409).json({ error: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// 2. Doctors
app.get('/api/doctors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctors ORDER BY name ASC');
    // Map snake_case (DB) to camelCase (Frontend)
    const doctors = result.rows.map(d => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      active: d.active,
      color: d.color,
      unavailableDates: d.unavailable_dates || []
    }));
    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/doctors', async (req, res) => {
  const doctors = req.body; // Expects array of doctors
  if (!Array.isArray(doctors)) return res.status(400).json({ error: 'Expected array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Sync Deletion: Remove doctors not present in the payload
    const incomingIds = doctors.map(d => d.id);
    
    if (incomingIds.length > 0) {
      // Delete those NOT in the incoming list (assuming ID is UUID)
      await client.query(
        'DELETE FROM doctors WHERE NOT (id = ANY($1::uuid[]))',
        [incomingIds]
      );
    } else {
      // If payload is empty, delete everyone
      await client.query('DELETE FROM doctors');
    }
    
    // 2. Upsert Strategy (Update existing or Insert new)
    for (const doc of doctors) {
      await client.query(`
        INSERT INTO doctors (id, name, phone, active, color, unavailable_dates)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          active = EXCLUDED.active,
          color = EXCLUDED.color,
          unavailable_dates = EXCLUDED.unavailable_dates;
      `, [doc.id, doc.name, doc.phone, doc.active, doc.color, JSON.stringify(doc.unavailableDates)]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 3. Schedule
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_schedules ORDER BY date ASC');
    const schedule = result.rows.map(s => ({
      date: s.date, // Date string YYYY-MM-DD
      isHoliday: s.is_holiday,
      holidayName: s.holiday_name,
      shifts: s.shifts
    }));
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  const schedule = req.body;
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'Expected array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const day of schedule) {
      // Extract YYYY-MM-DD
      const dateStr = new Date(day.date).toISOString().split('T')[0];
      
      await client.query(`
        INSERT INTO daily_schedules (date, is_holiday, holiday_name, shifts)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date) DO UPDATE SET
          is_holiday = EXCLUDED.is_holiday,
          holiday_name = EXCLUDED.holiday_name,
          shifts = EXCLUDED.shifts;
      `, [dateStr, day.isHoliday, day.holidayName, JSON.stringify(day.shifts)]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 4. Config (Year/Month/Holidays)
app.get('/api/config', async (req, res) => {
  try {
    // 1. Get Settings (Year/Month)
    const settingsResult = await pool.query("SELECT value FROM app_settings WHERE key = 'main_config'");
    const mainConfig = settingsResult.rows.length > 0 ? settingsResult.rows[0].value : { year: new Date().getFullYear(), month: new Date().getMonth() };

    // 2. Get Custom Holidays
    const holidaysResult = await pool.query("SELECT * FROM holidays ORDER BY date ASC");
    const customHolidays = holidaysResult.rows.map(h => ({
      date: new Date(h.date).toISOString().split('T')[0],
      name: h.name
    }));

    res.json({
      year: mainConfig.year,
      month: mainConfig.month,
      customHolidays
    });
  } catch (err) {
    console.error(err);
    // Return default if DB fails/empty
    res.json({ year: new Date().getFullYear(), month: new Date().getMonth(), customHolidays: [] });
  }
});

app.post('/api/config', async (req, res) => {
  const { year, month, customHolidays } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Save Year/Month
    await client.query(`
      INSERT INTO app_settings (key, value)
      VALUES ('main_config', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [JSON.stringify({ year, month })]);

    // 2. Sync Holidays
    await client.query('DELETE FROM holidays');
    
    if (customHolidays && customHolidays.length > 0) {
      for (const h of customHolidays) {
         await client.query('INSERT INTO holidays (date, name) VALUES ($1, $2)', [h.date, h.name]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- INITIALIZATION ---
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized check complete.");
  } catch (err) {
    console.error("Failed to initialize DB:", err);
  }
};
initDb();

// --- SERVER STARTUP ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
  });
}

export default app;
