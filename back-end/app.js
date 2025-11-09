const express = require('express');
const fs = require('fs');
const path = require('path');

// Charger les variables d'environnement depuis un fichier .env (si présent)
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;



//----------------------------------------Coté BD-------------------------------------//

// Connexion à MySQL (pool + promise API)
const mysql = require('mysql2');

// Utiliser les variables d'environnement si disponibles, sinon valeurs par défaut
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'todo_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const db = pool.promise();

db.getConnection()
  .then((conn) => {
    conn.release();
    console.log(`Connected to MySQL (${process.env.DB_HOST || '127.0.0.1'})`);
  })
  .catch((err) => {
    console.error('ERROR MySQL:', err);
  });


// Middleware pour parser le JSON
app.use(express.json());

// Security, logging and CORS
try {
  const cors = require('cors');
  const helmet = require('helmet');
  const morgan = require('morgan');
  app.use(cors());
  app.use(helmet());
  app.use(morgan('dev'));
} catch (e) {
  console.warn('Optional middleware not installed (cors/helmet/morgan). Install them for better security/logging.');
}

// Get all todos (MySQL)
// GET /api/todos
app.get('/api/todos', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT id, title, priority, description, due_date AS date,
        DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at,
        TIME_FORMAT(created_time, '%H:%i:%s') AS created_time
       FROM todos ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});


// Create a new todo
// POST /api/todos
let body, validationResult;
try {
  const ev = require('express-validator');
  body = ev.body;
  validationResult = ev.validationResult;
} catch (e) {
  // fallback: no-op validators if package not installed
  body = () => ({ isString: () => ({ notEmpty: () => (req, res, next) => next() }), isIn: () => (req, res, next) => next() });
  validationResult = () => ({ isEmpty: () => true, array: () => [] });
  console.warn('express-validator not installed; request bodies will not be validated.');
}

app.post('/api/todos', [ body('title').isString().notEmpty(), body('priority').isIn(['urgent','medium','low']) ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty && !errors.isEmpty()) return res.status(400).json({ errors: errors.array ? errors.array() : errors });
      const { title, priority, description, date } = req.body || {};
      // insert due_date as date (if provided)
      const [result] = await db.query(
        'INSERT INTO todos (title, description, priority, due_date) VALUES (?, ?, ?, ?)',
        [title, description || null, priority, date || null]
      );
      const [rows] = await db.query(
        `SELECT id, title, priority, description, due_date AS date,
          DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at,
          TIME_FORMAT(created_time, '%H:%i:%s') AS created_time
         FROM todos WHERE id = ?`,
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// Update a todo
app.put('/api/todos/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, priority, description, date } = req.body || {};
    if (!title || !priority) return res.status(400).json({ error: 'title and priority are required' });
    const [result] = await db.query(
      'UPDATE todos SET title = ?, priority = ?, description = ?, due_date = ? WHERE id = ?',
      [title, priority, description || null, date || null, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Todo not found' });
    const [rows] = await db.query(
      `SELECT id, title, priority, description, due_date AS date,
        DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at,
        TIME_FORMAT(created_time, '%H:%i:%s') AS created_time
       FROM todos WHERE id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a todo
app.delete('/api/todos/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM todos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Todo not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Bulk delete (expects { ids: [1,2,3] })
app.post('/api/todos/bulk-delete', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM todos WHERE id IN (${placeholders})`;
  (async () => {
    try {
      const [result] = await db.query(sql, ids);
      res.json({ deleted: result.affectedRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to bulk delete' });
    }
  })();
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal Server Error' });
});





//-------------------------------Coté Serveur-------------------------------------------//

// Serve the built React app (Vite) if it exists
const distPath = path.join(__dirname, '..', 'front-end', 'to-do', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // For SPA client-side routing, return index.html for any unknown route
   // For SPA client-side routing, return index.html for any unknown route.
  // Use a RegExp to match all routes except those starting with /api so
  // path-to-regexp doesn't treat '*' as a malformed parameter name.
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log(`Serving front-end from ${distPath}`);
} else {
  console.log('Front-end dist not found. Build the front-end with `npm run build` in front-end/to-do`');
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
