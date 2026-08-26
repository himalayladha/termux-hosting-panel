const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', (req, res) => {
  res.json({
    name: 'SQLite Web GUI',
    status: 'online',
    version: '1.0.0',
    sqlite: 'active'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SQLite Web GUI] Running on port :${PORT}`);
});
