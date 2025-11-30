
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import { getDaysInMonth, format } from 'date-fns';

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon
  // Removed forced search_path to ensure compatibility with existing data in 'public' schema
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Allow larger payloads for schedule

// --- ROUTES ---

// AI Generation Route (Server-Side Fallback/Optional)
// Note: Main generation is now client-side to avoid timeouts, but this endpoint is kept for reference.
app.post('/api/generate-schedule', async (req, res) => {
  const { doctors, config } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server configuration error: Missing API Key" });
  }

  // ... (Simplified server-side logic if needed, but client-side is primary now)
  res.status(501).json({ error: "Please use client-side generation." });
});

// Test Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 1. Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Check if users table exists first to avoid confusing error
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานไม่ถูกต้อง หรือไม่มีในระบบ' });
    }
    const user = result.rows[0];
    
    // Direct comparison (Plain text)
    if (password === user.password_hash) {
      res.json({ username: user.username, role: user.role, name: user.name });
    } else {
      res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// 1.1 Register
app.post('/api/register', async (req, res) => {
  const { username, password, name } = req.body;
  
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    await pool.query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1, $2, $3, $4)',
      [username, password, 'viewer', name]
    );

    res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ' });
  } catch (err) {
    console.error("Register Error:", err);
    if (err.code === '23505') {
        return res.status(409).json({ error: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
    }
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

// 2. Doctors
app.get('/api/doctors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctors ORDER BY name ASC');
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
    console.error("Get Doctors Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/doctors', async (req, res) => {
  const doctors = req.body;
  if (!Array.isArray(doctors)) return res.status(400).json({ error: 'Expected array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = doctors.map(d => d.id);
    
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM doctors WHERE NOT (id = ANY($1::uuid[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM doctors');
    }
    
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
    console.error("Save Doctors Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 3. Schedule
app.get('/api/schedules', async (req, res) => {
  try {
    // FORCE Date to string using to_char to avoid timezone shifts and object type issues
    const result = await pool.query("SELECT to_char(date, 'YYYY-MM-DD') as date_str, is_holiday, holiday_name, shifts FROM daily_schedules ORDER BY date ASC");
    
    const schedule = result.rows.map(s => ({
      date: s.date_str, // Use the string directly from DB
      isHoliday: s.is_holiday,
      holidayName: s.holiday_name,
      shifts: s.shifts
    }));
    res.json(schedule);
  } catch (err) {
    console.error("Get Schedule Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  const schedule = req.body;
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'Expected array' });
  if (schedule.length === 0) return res.json({ success: true });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const dates = schedule.map(s => new Date(s.date).toISOString().split('T')[0]);
    dates.sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    await client.query('DELETE FROM daily_schedules WHERE date >= $1 AND date <= $2', [startDate, endDate]);

    for (const day of schedule) {
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
    console.error("Save Schedule Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 4. Config
app.get('/api/config', async (req, res) => {
  try {
    const settingsResult = await pool.query("SELECT value FROM app_settings WHERE key = 'main_config'");
    const mainConfig = settingsResult.rows.length > 0 ? settingsResult.rows[0].value : { year: new Date().getFullYear(), month: new Date().getMonth() };

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
    console.error("Get Config Error:", err);
    res.json({ year: new Date().getFullYear(), month: new Date().getMonth(), customHolidays: [] });
  }
});

app.post('/api/config', async (req, res) => {
  const { year, month, customHolidays } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO app_settings (key, value)
      VALUES ('main_config', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [JSON.stringify({ year, month })]);

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
    console.error("Save Config Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- INITIALIZATION ---
const initDb = async () => {
  try {
    console.log("Initializing Database tables...");
    
    // Create Tables if not exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(50) PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL,
        name VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS doctors (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(50),
        active BOOLEAN DEFAULT TRUE,
        color VARCHAR(20),
        unavailable_dates JSONB
      );

      CREATE TABLE IF NOT EXISTS daily_schedules (
        date DATE PRIMARY KEY,
        is_holiday BOOLEAN DEFAULT FALSE,
        holiday_name VARCHAR(100),
        shifts JSONB
      );

      CREATE TABLE IF NOT EXISTS holidays (
        date DATE PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default admin if users table is empty
    const userCheck = await pool.query('SELECT 1 FROM users LIMIT 1');
    if (userCheck.rowCount === 0) {
      console.log("Seeding default admin user...");
      await pool.query(`
        INSERT INTO users (username, password_hash, role, name)
        VALUES ('admin', 'password', 'admin', 'Administrator')
      `);
    }

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize DB:", err);
  }
};

initDb();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
  });
}

export default app;
