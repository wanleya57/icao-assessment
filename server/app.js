const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} Content-Type: ${req.headers['content-type']}`);
  next();
});

app.use((req, res, next) => {
  if (req.headers['content-type']?.includes('application/json')) {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch { req.body = {}; }
      next();
    });
  } else { next(); }
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/phrases', require('./routes/phrases'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/ai', require('./routes/ai'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
