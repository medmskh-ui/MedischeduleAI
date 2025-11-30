
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool, types } = pg;

// FIX: Force Postgres to return DATE types as simple strings (YYYY-MM-DD)
// This prevents timezone shifts when converting to JS Date objects.
types.setTypeParser(1082, (str) => str);

const app = express();
const PORT = process.env.PORT || 3001;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- INITIALIZATION ---
const initDb = async () => {
  try {
    const client = await pool.connect();
    try {
      // 1. Users Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'user',
          name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Doctors Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS doctors (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          phone VARCHAR(50),
          unavailable_dates JSONB DEFAULT '[]',
          active BOOLEAN DEFAULT TRUE,
          color VARCHAR(20)
        );
      `);

      // 3. Daily Schedules Table
      // Changed to use DATE as primary key to support UPSERT
      await client.query(`
        CREATE TABLE IF NOT EXISTS daily_schedules (
          date DATE PRIMARY KEY,
          is_holiday BOOLEAN DEFAULT FALSE,
          holiday_name VARCHAR(100),
          morning_icu VARCHAR(50),
          morning_general VARCHAR(50),
          afternoon_icu VARCHAR(50),
          afternoon_general VARCHAR(50),
          night_icu VARCHAR(50),
          night_general VARCHAR(50)
        );
      `);

      // 4. App Settings Table (Single Row)
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          year INTEGER,
          month INTEGER,
          custom_holidays JSONB DEFAULT '[]'
        );
      `);

      // Seed Default Admin if no users exist
      const userCountRes = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCountRes.rows[0].count) === 0) {
        const hashedPassword = await bcrypt.hash('password', 10);
        await client.query(`
          INSERT INTO users (username, password_hash, role, name)
          VALUES ($1, $2, $3, $4)
        `, ['admin', hashedPassword, 'admin', 'System Admin']);
        console.log('Default admin created (admin/password)');
      }

      // Ensure default settings exist
      await client.query(`
        INSERT INTO app_settings (id, year, month, custom_holidays)
        VALUES (1, EXTRACT(YEAR FROM CURRENT_DATE), EXTRACT(MONTH FROM CURRENT_DATE) - 1, '[]')
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('Database initialized successfully');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

// Initialize DB on startup
initDb();

// --- ROUTES ---

// 1. Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    res.json({
      username: user.username,
      role: user.role,
      name: user.name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, password, name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1, $2, $3, $4)',
      [username, hashedPassword, 'user', name]
    );
    res.json({ success: true, message: 'Registered successfully' });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 2. Doctors
app.get('/api/doctors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctors ORDER BY name ASC');
    const doctors = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      unavailableDates: row.unavailable_dates || [],
      active: row.active,
      color: row.color
    }));
    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

app.post('/api/doctors', async (req, res) => {
  const doctors = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Simplistic sync: Delete all and re-insert is risky for concurrency, 
    // but OK for low-traffic admin tasks. 
    // Ideally we should use UPSERTs here too, but let's stick to simple logic for doctors list
    // as it changes rarely compared to schedules.
    await client.query('DELETE FROM doctors');
    
    for (const d of doctors) {
      await client.query(`
        INSERT INTO doctors (id, name, phone, unavailable_dates, active, color)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [d.id, d.name, d.phone, JSON.stringify(d.unavailableDates), d.active, d.color]);
    }
    
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save doctors' });
  } finally {
    client.release();
  }
});

// 3. Schedules (THE CRITICAL PART)
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_schedules');
    const schedule = result.rows.map(row => ({
      date: row.date, // Already string YYYY-MM-DD due to setTypeParser
      isHoliday: row.is_holiday,
      holidayName: row.holiday_name,
      shifts: {
        morning: (row.morning_icu || row.morning_general) ? {
          icu: row.morning_icu,
          general: row.morning_general
        } : undefined,
        afternoon: {
          icu: row.afternoon_icu,
          general: row.afternoon_general
        },
        night: {
          icu: row.night_icu,
          general: row.night_general
        }
      }
    }));
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

app.post('/api/schedules', async (req, res) => {
  const schedule = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // USING UPSERT (INSERT ON CONFLICT UPDATE)
    // This prevents "Data Loss" when multiple saves happen quickly.
    // We iterate through the payload and update each day individually.
    
    for (const day of schedule) {
      const m = day.shifts.morning || { icu: null, general: null };
      const a = day.shifts.afternoon;
      const n = day.shifts.night;

      await client.query(`
        INSERT INTO daily_schedules (
          date, is_holiday, holiday_name, 
          morning_icu, morning_general, 
          afternoon_icu, afternoon_general, 
          night_icu, night_general
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (date) DO UPDATE SET
          is_holiday = EXCLUDED.is_holiday,
          holiday_name = EXCLUDED.holiday_name,
          morning_icu = EXCLUDED.morning_icu,
          morning_general = EXCLUDED.morning_general,
          afternoon_icu = EXCLUDED.afternoon_icu,
          afternoon_general = EXCLUDED.afternoon_general,
          night_icu = EXCLUDED.night_icu,
          night_general = EXCLUDED.night_general
      `, [
        day.date, day.isHoliday, day.holidayName,
        m.icu, m.general,
        a.icu, a.general,
        n.icu, n.general
      ]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Save Error:", err);
    res.status(500).json({ error: 'Failed to save schedule' });
  } finally {
    client.release();
  }
});

// 4. Config
app.get('/api/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM app_settings WHERE id = 1');
    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.json({
        year: row.year,
        month: row.month,
        customHolidays: row.custom_holidays || []
      });
    } else {
      res.json(null);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.post('/api/config', async (req, res) => {
  const { year, month, customHolidays } = req.body;
  try {
    await pool.query(`
      INSERT INTO app_settings (id, year, month, custom_holidays)
      VALUES (1, $1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        year = EXCLUDED.year,
        month = EXCLUDED.month,
        custom_holidays = EXCLUDED.custom_holidays
    `, [year, month, JSON.stringify(customHolidays)]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
