const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PocketBase-style REST collection endpoint
const collections = {
  posts: [
    { id: '1', title: 'Welcome to PocketBase on Android', created: new Date().toISOString() },
    { id: '2', title: 'Running SQLite Database Locally in Termux', created: new Date().toISOString() }
  ]
};

app.get('/api/collections/:name/records', (req, res) => {
  const col = collections[req.params.name] || [];
  res.json({ items: col, totalItems: col.length });
});

app.post('/api/collections/:name/records', (req, res) => {
  if (!collections[req.params.name]) collections[req.params.name] = [];
  const record = { id: String(Date.now()), ...req.body, created: new Date().toISOString() };
  collections[req.params.name].push(record);
  res.status(201).json(record);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PocketBase Starter] Running on http://127.0.0.1:${PORT}`);
});
