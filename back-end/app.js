const express = require('express');
const fs = require('fs');
const path = require('path');
// SQLite (synchronous) for simple local DB storage
const Database = require('better-sqlite3');

const app = express();
const port = 3000;

// Basic JSON parsing
app.use(express.json());

// Simple CORS middleware for development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Initialize SQLite DB
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'data.db');
const db = new Database(dbPath);
db.prepare(
  `CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    priority TEXT NOT NULL
  )`
).run();

// Test endpoint for frontend/backend connection
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', time: new Date().toISOString() });
});

// --- Todos API (CRUD) backed by SQLite ---

// Get all todos
app.get('/api/todos', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, title, priority FROM todos ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// Create a new todo
app.post('/api/todos', (req, res) => {
  const { title, priority } = req.body || {};
  if (!title || !priority) {
    return res.status(400).json({ error: 'title and priority are required' });
  }
  try {
    const stmt = db.prepare('INSERT INTO todos (title, priority) VALUES (?, ?)');
    const info = stmt.run(title, priority);
    const todo = db.prepare('SELECT id, title, priority FROM todos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// Import todos in bulk from client
app.post('/api/todos/import', (req, res) => {
  const items = Array.isArray(req.body.todos) ? req.body.todos : [];
  if (items.length === 0) return res.status(400).json({ error: 'todos required' });
  try {
    const insert = db.prepare('INSERT INTO todos (title, priority) VALUES (?, ?)');
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        const title = typeof r.title === 'string' ? r.title : '';
        const priority = typeof r.priority === 'string' ? r.priority : 'medium';
        if (title) insert.run(title, priority);
      }
    });
    insertMany(items);
    res.json({ inserted: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import' });
  }
});

// Delete a todo by id
app.delete('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Bulk delete (accepts { ids: number[] })
app.post('/api/todos/bulk-delete', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'ids required' });
  try {
    const stmt = db.prepare(`DELETE FROM todos WHERE id IN (${ids.map(() => '?').join(',')})`);
    const info = stmt.run(...ids);
    res.json({ deleted: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete' });
  }
});

// Serve the built React app (Vite) if it exists
const distPath = path.join(__dirname, '..', 'front-end', 'to-do', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // For SPA client-side routing, return index.html for any unknown route
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log(`Serving front-end from ${distPath}`);
} else {
  console.log('Front-end dist not found. Build the front-end with `npm run build` in front-end/to-do`');
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
