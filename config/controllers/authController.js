// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { randomUUID } = require('crypto');

const createToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

exports.signupStudent = async (req, res) => {
  const { name, email, password, dob, parentName, parentContact } = req.body;
  if (!name || !email || !password || !dob) {
    return res.status(400).json({ message: 'Name, email, password, and date of birth are required.' });
  }
  if (String(password).length < 12) {
    return res.status(400).json({ message: 'Password must contain at least 12 characters.' });
  }
  if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Authentication is not configured.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'STUDENT')
      RETURNING id, name, email, role
    `, [String(name).trim(), normalizedEmail, await bcrypt.hash(password, 12)]);
    const student = await client.query(`
      INSERT INTO students (user_id, roll_no, dob, parent_name, parent_contact)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, roll_no, dob
    `, [user.rows[0].id, `STU-${randomUUID().slice(0, 8).toUpperCase()}`, dob, parentName || null, parentContact || null]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Student account created.', token: createToken(user.rows[0]), user: user.rows[0], student: student.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
    if (error.code === '22007' || error.code === '23514') return res.status(400).json({ message: 'Enter a valid date of birth.' });
    console.error('Student signup error:', error);
    res.status(500).json({ message: 'Server error while creating student account.' });
  } finally {
    client.release();
  }
};

exports.me = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error while fetching account.' });
  }
};

// Register User
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required.' });
    }
    if (String(password).length < 12) {
      return res.status(400).json({ message: 'Password must contain at least 12 characters.' });
    }

    // Validate role
    const validRoles = ['ADMIN', 'TEACHER', 'STUDENT'];
    if (!validRoles.includes(String(role).toUpperCase())) {
      return res.status(400).json({ message: 'Invalid role provided.' });
    }

    // Check if user exists
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'User with this email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into DB
    const newUser = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [String(name).trim(), normalizedEmail, hashedPassword, String(role).toUpperCase()]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration Error:', error);
    if (error.code === '23505') return res.status(409).json({ message: 'User with this email already exists.' });
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Authentication is not configured.' });
    }

    // Find user by email
    const result = await db.query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Sign JWT Token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

exports.updateMe = async (req, res) => {
  const { name, email } = req.body;
  if (!name && !email) return res.status(400).json({ message: 'Provide a name or email to update.' });
  try {
    const result = await db.query(`
      UPDATE users SET
        name = COALESCE(NULLIF($1, ''), name),
        email = COALESCE(NULLIF($2, ''), email)
      WHERE id = $3
      RETURNING id, name, email, role
    `, [name ? String(name).trim() : null, email ? String(email).trim().toLowerCase() : null, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'That email address is already in use.' });
    console.error('Update account error:', error);
    res.status(500).json({ message: 'Server error while updating account.' });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required.' });
  if (String(newPassword).length < 12) return res.status(400).json({ message: 'New password must contain at least 12 characters.' });
  try {
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    if (!(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error while changing password.' });
  }
};