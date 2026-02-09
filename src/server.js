const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'helloapp',
  user: process.env.DB_USER || 'hello',
  password: process.env.DB_PASSWORD || 'hello'
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/hello', async (_req, res) => {
  try {
    const result = await pool.query('SELECT message FROM greetings ORDER BY id DESC LIMIT 1');
    const message = result.rows[0]?.message || 'Hello World from Postgres!';
    res.json({ message });
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ message: 'Could not load greeting from database.' });
  }
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Hello app listening on port ${port}`);
});
