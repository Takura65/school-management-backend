// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app = express();
const allowedOrigins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()) : false;
const authRoutes = require('./controllers/middleware/routes/authRoutes');
const studentRoutes = require('./controllers/middleware/routes/studentRoutes');
const schoolRoutes = require('./controllers/middleware/routes/schoolRoutes');

// Security Middleware
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api', schoolRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'School Management API is running.' });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`School Management API running on port ${PORT}`);
  });
}

module.exports = app;