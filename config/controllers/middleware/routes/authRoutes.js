// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login, me, signupStudent, updateMe, changePassword } = require('../../authController');
const { authenticateToken, authorizeRoles } = require('../auth');

// Public route for login
router.post('/login', login);
router.post('/signup', signupStudent);
router.get('/me', authenticateToken, me);
router.patch('/me', authenticateToken, updateMe);
router.patch('/me/password', authenticateToken, changePassword);

// Admin-only route to register new accounts
router.post('/register', authenticateToken, authorizeRoles('ADMIN'), register);

module.exports = router;