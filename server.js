
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
  ssl: { rejectUnauthorized: false }, // Required for Neon
  options: '-c search_path=medischedule' // Set schema to medischedule
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

  // Generate a unique ID to prevent caching
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Optimized Prompt: Concise instructions to save tokens and processing time
  return `
    ReqID: ${requestId}
    Role: Medical Scheduler.
    Task: Roster for ${monthName} (${daysInMonth} days).
    
    Resources:
    - Docs: ${JSON.stringify(activeDoctors.map(d => ({ id: d.id, n: d.name, un: d.unavailableDates })))}
    - Holidays: ${JSON.stringify(config.customHolidays.map(h => h.date))} (Includes Sat/Sun).

    Rules (Strict):
    1. UNAVAILABLE: If doc lists date in 'un', DO NOT assign.
    2. CONTINUITY: Afternoon doc = Night doc (Same Ward).
    3. WARD SEPARATION: Gen doc != ICU doc (Same Shift).
    4. HOLIDAY PATTERN (Sat/Sun/Custom):
       - Doc A: Gen Morning -> ICU Afternoon -> ICU Night.
       - Doc B: ICU Morning -> Gen Afternoon -> Gen Night.
       - Doc A != Doc B.
    5. WEEKDAY PATTERN:
       - Morning: null.
       - Doc A: Gen Afternoon -> Gen Night.
       - Doc B: ICU Afternoon -> ICU Night.
    6. FAIRNESS: Spread shifts. Avoid consecutive days.

    Output JSON Array ONLY:
    [{"date":"YYYY-MM-DD","isHoliday":bool,"shifts":{"morning":{"icu":"id"|null,"general":"id"|null},"afternoon":{"icu":"id","general":"id"},"night":{"icu":"id","general":"id"}}}]
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
  
  // Strategy: Try 1.5 Flash (Fastest) -> Fallback to 2.5 Flash
  const tryGenerate = async (modelName) => {
    console.log(`[${new Date().toISOString()}] Calling ${modelName}...`);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // No schema validation for max speed
      }
    });
    return JSON.parse(response.text);
  };

  try {
    let generatedSchedule;
    try {
        // Attempt 1: Gemini 1.5 Flash (Fastest for Vercel Free Tier)
        generatedSchedule = await tryGenerate('gemini-1.5-flash');
    } catch (e) {
        console.warn("Gemini 1.5 Flash failed, falling back to 2.5 Flash...", e.message);
        // Attempt 2: Gemini 2.5 Flash
        generatedSchedule = await tryGenerate('gemini-2.5-flash');
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`[${new Date().toISOString()}] Finished in ${duration}s`);

    res.json(generatedSchedule);

  } catch (error) {
    console.error("AI Generation Error:", error);
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
  
  // If empty payload, nothing to save, return success
  if (schedule.length === 0) return res.json({ success: true });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Clean & Rebuild Strategy
    // Determine the date range of the incoming schedule to clear old data
    const dates = schedule.map(s => new Date(s.date).toISOString().split('T')[0]);
    // Find min and max date in the payload (assuming payload covers a month or specific range)
    // Basic sorting to find range
    dates.sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // DELETE existing records in this range to ensure no stale data remains
    await client.query(
      'DELETE FROM daily_schedules WHERE date >= $1 AND date <= $2',
      [startDate, endDate]
    );

    // 2. Insert New Data
    for (const day of schedule) {
      // Extract YYYY-MM-DD
      const dateStr = new Date(day.date).toISOString().split('T')[0];
      
      await client.query(`
        INSERT INTO daily_schedules (date, is_holiday, holiday_name, shifts)
        VALUES ($1, $2, $3, $4)
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
    // Ensure Schema Exists
    await pool.query('CREATE SCHEMA IF NOT EXISTS medischedule');

    // Ensure Tables Exist (Only app_settings required for minimal init, others via SQL script ideally)
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
