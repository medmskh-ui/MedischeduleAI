
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

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

// --- INITIALIZATION ---
// Create 'app_settings' table for storing year/month config if it doesn't exist
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

// --- ROUTES ---

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
    // Note: 'password_hash' column name is kept to avoid DB schema changes, but it stores plain text now.
    if (password === user.password_hash) {
      res.json({ username: user.username, role: user.role });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 1.1 Register (Plain Text Password)
app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Store password directly as plain text
    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
      [username, password, role]
    );

    res.json({ success: true, message: 'User created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user (Username might exist)' });
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
    
    // Upsert Strategy
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

    // Optional: Handle deletion if doctor is removed from UI?
    // For now, we only sync updates/adds. Deletion usually requires explicit endpoint or a different sync strategy.
    
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
    // For simplicity: Delete all and re-insert (as the list is usually small)
    // In production, diffing is better.
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

// --- SERVER STARTUP ---

// If running directly (e.g. 'node server.js'), start the server.
// If imported (e.g. by Vercel), do nothing here (the exported app will be used).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
  });
}

// Export app for Vercel Serverless Functions
export default app;
