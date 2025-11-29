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
    Role: You are an expert medical roster scheduler.
    Task: Generate a monthly schedule for ${monthName} (${daysInMonth} days).

    Resources:
    - Doctors (Active): ${JSON.stringify(activeDoctors.map(d => ({ id: d.id, name: d.name, unavailableDates: d.unavailableDates })))}
    - Config: Year ${config.year}, Month Index ${config.month}.
    - Custom Holidays: ${JSON.stringify(config.customHolidays.map(h => h.date))}.
    - Weekend Definition: Saturday and Sunday.

    Definitions:
    - "Holiday" includes both Weekends (Sat/Sun) AND Custom Holidays provided above.
    - Shifts: Morning (M), Afternoon (A), Night (N).
    - Wards: ICU, General.

    STRICT RULES (Must be followed in order of priority):

    1. UNAVAILABILITY (Highest Priority):
       - If a doctor has a date listed in 'unavailableDates', they CANNOT be assigned to ANY shift (M, A, or N) on that specific date.
       - Do not simply skip the day; find another available doctor.

    2. DAILY CONTINUITY (Afternoon & Night Pairing):
       - On EVERY day (Weekday or Holiday):
       - The doctor assigned to [General Afternoon] MUST be the same as [General Night].
       - The doctor assigned to [ICU Afternoon] MUST be the same as [ICU Night].
       - Logic: One doctor covers the long shift from 16:30 to 08:30 next day.

    3. WARD SEPARATION:
       - On EVERY day, the doctor on [General Afternoon/Night] MUST NOT be the same as the doctor on [ICU Afternoon/Night].

    4. HOLIDAY & WEEKEND PATTERN (The "Cross-Over" Rule):
       - On any "Holiday" (Sat, Sun, or Custom Holiday), you MUST assign exactly 2 doctors to cover all slots using this specific pattern:
       - Doctor A (Role 1): Works [General Morning] AND THEN moves to [ICU Afternoon + ICU Night].
       - Doctor B (Role 2): Works [ICU Morning] AND THEN moves to [General Afternoon + General Night].
       - Constraint: Doctor A MUST NOT be Doctor B.

    5. WEEKDAY PATTERN:
       - No Morning shifts exist on Weekdays. Set Morning slots to null.
       - Assign Doctor A to [General Afternoon + General Night].
       - Assign Doctor B to [ICU Afternoon + ICU Night].

    6. RESTING (Fairness):
       - Try to space out shifts. Ideally, if a doctor works today, they should rest for at least 2 days before the next shift.
       - AVOID assigning a doctor on consecutive days unless availability is critically low.

    7. FAIRNESS (Distribution):
       - Distribute "Holiday" shifts as equally as possible among all doctors.

    Output Format (JSON Array):
    [
      {
        "date": "YYYY-MM-DD",
        "isHoliday": boolean,
        "shifts": {
          "morning": { "icu": "uuid" | null, "general": "uuid" | null },
          "afternoon": { "icu": "uuid", "general": "uuid" },
          "night": { "icu": "uuid", "general": "uuid" }
        }
      },
      ...
    ]
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

  console.log(`[${new Date().toISOString()}] Start generating schedule...`);
  const startTime = Date.now();

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = createPrompt(doctors, config);
  
  const responseSchema = {
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
  };

  const generateWithModel = async (modelName) => {
    console.log(`[${new Date().toISOString()}] Attempting generation with model: ${modelName}`);
    return await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });
  };

  try {
    let response;
    
    // 1. Try Primary Model (Pro) - Best for complex logic
    try {
      response = await generateWithModel('gemini-3-pro-preview');
    } catch (primaryError) {
      console.warn(`[${new Date().toISOString()}] Primary model (Pro) failed: ${primaryError.message}`);
      console.warn("Switching to fallback model (Flash)...");
      
      // 2. Fallback to Secondary Model (Flash) - Faster, might be less strict on complex rules
      response = await generateWithModel('gemini-2.5-flash');
    }

    const generatedSchedule = JSON.parse(response.text);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`[${new Date().toISOString()}] Finished generating schedule in ${duration}s`);

    res.json(generatedSchedule);

  } catch (error) {
    console.error("Gemini AI Final Error:", error);
    res.status(500).json({ error: "Failed to generate schedule (All models failed): " + error.message });
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