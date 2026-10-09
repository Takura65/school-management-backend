const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { randomUUID } = require('crypto');

// ============================================
// CREATE JWT TOKEN
// ============================================
const createToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// ============================================
// NORMALIZE EMAIL
// ============================================
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// ============================================
// STUDENT SIGNUP
// POST /api/auth/signup
// ============================================
exports.signupStudent = async (req, res) => {
  console.log('Student signup route reached.');

  const {
    name,
    email,
    password,
    dob,
    parentName,
    parentContact,
  } = req.body || {};

  // Validate input before connecting to the database.
  if (
    !name ||
    !email ||
    !password ||
    !dob ||
    !String(name).trim() ||
    !String(email).trim()
  ) {
    return res.status(400).json({
      message: 'Name, email, password, and date of birth are required.',
    });
  }

  if (String(password).length < 12) {
    return res.status(400).json({
      message: 'Password must contain at least 12 characters.',
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Student signup failed: JWT_SECRET is not configured.');

    return res.status(500).json({
      message: 'Authentication is not configured.',
    });
  }

  let client;

  try {
    // Connect inside the try block so connection errors are logged.
    client = await db.pool.connect();

    await client.query('BEGIN');

    const normalizedEmail = normalizeEmail(email);

    // Create the user account.
    const userResult = await client.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'STUDENT')
        RETURNING id, name, email, role
      `,
      [
        String(name).trim(),
        normalizedEmail,
        await bcrypt.hash(String(password), 12),
      ]
    );

    const user = userResult.rows[0];

    // Create the student record linked to the user.
    const studentResult = await client.query(
      `
        INSERT INTO students (
          user_id,
          roll_no,
          dob,
          parent_name,
          parent_contact
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, roll_no, dob
      `,
      [
        user.id,
        `STU-${randomUUID().slice(0, 8).toUpperCase()}`,
        dob,
        parentName ? String(parentName).trim() : null,
        parentContact ? String(parentContact).trim() : null,
      ]
    );

    await client.query('COMMIT');

    const token = createToken(user);

    return res.status(201).json({
      message: 'Student account created.',
      token,
      user,
      student: studentResult.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Signup rollback failed:', rollbackError.message);
      }
    }

    // Log diagnostic information in Render without logging passwords.
    console.error('Student signup error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      column: error.column,
      constraint: error.constraint,
    });

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'An account with this email or student number already exists.',
      });
    }

    if (
      error.code === '22007' ||
      error.code === '22008' ||
      error.code === '23514' ||
      error.code === '22P02'
    ) {
      return res.status(400).json({
        message: 'Some information is invalid. Check the date of birth and try again.',
      });
    }

    return res.status(500).json({
      message: 'Server error while creating student account.',
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================
// LOGIN
// POST /api/auth/login
// ============================================
exports.login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required.',
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error('Login failed: JWT_SECRET is not configured.');

    return res.status(500).json({
      message: 'Authentication is not configured.',
    });
  }

  try {
    const result = await db.query(
      `
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [normalizeEmail(email)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      String(password),
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid email or password.',
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return res.status(200).json({
      message: 'Login successful.',
      token: createToken(safeUser),
      user: safeUser,
    });
  } catch (error) {
    console.error('Login error:', {
      message: error.message,
      code: error.code,
    });

    return res.status(500).json({
      message: 'Server error while logging in.',
    });
  }
};

// ============================================
// GET CURRENT USER
// GET /api/auth/me
// ============================================
exports.me = async (req, res) => {
  try {
    const result = await db.query(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Get current user error:', {
      message: error.message,
      code: error.code,
    });

    return res.status(500).json({
      message: 'Server error while retrieving user.',
    });
  }
};

// ============================================
// ADMIN REGISTER USER
// POST /api/auth/register
// Requires ADMIN role
// ============================================
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({
      message: 'Name, email, password, and role are required.',
    });
  }

  const allowedRoles = ['ADMIN', 'TEACHER', 'STUDENT'];

  const normalizedRole = String(role).trim().toUpperCase();

  if (!allowedRoles.includes(normalizedRole)) {
    return res.status(400).json({
      message: 'Invalid role.',
    });
  }

  if (String(password).length < 12) {
    return res.status(400).json({
      message: 'Password must contain at least 12 characters.',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      message: 'Authentication is not configured.',
    });
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), 12);

    const result = await db.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, role
      `,
      [
        String(name).trim(),
        normalizeEmail(email),
        passwordHash,
        normalizedRole,
      ]
    );

    return res.status(201).json({
      message: 'User registered successfully.',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Admin registration error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      });
    }

    return res.status(500).json({
      message: 'Server error while registering user.',
    });
  }
};

// ============================================
// UPDATE CURRENT USER PROFILE
// PATCH /api/auth/me
// ============================================
exports.updateMe = async (req, res) => {
  const { name, email } = req.body || {};

  if (!name && !email) {
    return res.status(400).json({
      message: 'Provide a name or email to update.',
    });
  }

  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({
      message: 'Name cannot be empty.',
    });
  }

  if (email !== undefined && !String(email).trim()) {
    return res.status(400).json({
      message: 'Email cannot be empty.',
    });
  }

  try {
    const result = await db.query(
      `
        UPDATE users
        SET
          name = COALESCE($1, name),
          email = COALESCE($2, email)
        WHERE id = $3
        RETURNING id, name, email, role
      `,
      [
        name !== undefined ? String(name).trim() : null,
        email !== undefined ? normalizeEmail(email) : null,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update profile error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'That email address is already in use.',
      });
    }

    return res.status(500).json({
      message: 'Server error while updating profile.',
    });
  }
};

// ============================================
// CHANGE PASSWORD
// PATCH /api/auth/me/password
// ============================================
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: 'Current password and new password are required.',
    });
  }

  if (String(newPassword).length < 12) {
    return res.status(400).json({
      message: 'New password must contain at least 12 characters.',
    });
  }

  try {
    const result = await db.query(
      `
        SELECT id, password_hash
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      String(currentPassword),
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Current password is incorrect.',
      });
    }

    const newPasswordHash = await bcrypt.hash(String(newPassword), 12);

    await db.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [newPasswordHash, req.user.id]
    );

    return res.status(200).json({
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('Change password error:', {
      message: error.message,
      code: error.code,
    });

    return res.status(500).json({
      message: 'Server error while changing password.',
    });
  }
};