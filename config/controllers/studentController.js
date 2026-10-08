// controllers/studentController.js
const bcrypt = require('bcryptjs');
const db = require('../db');

exports.enrollStudent = async (req, res) => {
  const { name, email, password, rollNo, classId, dob, parentName, parentEmail, parentContact, contactNumber } = req.body;
  if (!name || !email || !password || !rollNo || !dob) {
    return res.status(400).json({ message: 'Name, email, password, rollNo, and dob are required.' });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'STUDENT') RETURNING id, name, email, role
    `, [String(name).trim(), String(email).trim().toLowerCase(), await bcrypt.hash(password, 10)]);
    const student = await client.query(`
      INSERT INTO students (user_id, roll_no, class_id, dob, parent_name, parent_email, parent_contact, contact_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [user.rows[0].id, String(rollNo).trim(), classId || null, dob, parentName || null,
      parentEmail ? String(parentEmail).trim().toLowerCase() : null, parentContact || null, contactNumber || null]);
    await client.query('COMMIT');
    res.status(201).json({ user: user.rows[0], student: student.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Enroll student error:', error);
    if (error.code === '23505') return res.status(409).json({ message: 'Email or roll number is already in use.' });
    if (error.code === '23503') return res.status(400).json({ message: 'The selected class does not exist.' });
    if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
      return res.status(400).json({ message: 'One or more supplied values are invalid.' });
    }
    res.status(500).json({ message: 'Server error while enrolling student.' });
  } finally {
    client.release();
  }
};

// Create a new Student Profile
exports.createStudent = async (req, res) => {
  const { userId, rollNo, classId, dob, parentContact, contactNumber } = req.body;

  try {
    // Check if user exists and is a STUDENT
    const userRes = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0 || userRes.rows[0].role !== 'STUDENT') {
      return res.status(400).json({ message: 'Valid student user ID required.' });
    }

    const newStudent = await db.query(
      `INSERT INTO students (user_id, roll_no, class_id, dob, parent_contact, contact_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, rollNo, classId, dob, parentContact, contactNumber]
    );

    res.status(201).json({
      message: 'Student profile created successfully',
      student: newStudent.rows[0]
    });
  } catch (error) {
    console.error('Create Student Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Roll number or student profile already exists.' });
    }
    res.status(500).json({ message: 'Server error while creating student profile.' });
  }
};

// Get All Students with Class & User info
exports.getAllStudents = async (req, res) => {
  try {
    const query = `
      SELECT 
        s.id AS student_id,
        u.id AS user_id,
        u.name,
        u.email,
        s.roll_no,
        s.dob,
        s.parent_contact,
        s.contact_number,
        c.class_name,
        c.section
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.class_id = c.id
      ORDER BY s.id DESC
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Get Students Error:', error);
    res.status(500).json({ message: 'Server error while fetching students.' });
  }
};

// Get Single Student by ID
exports.getStudentById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT 
        s.id AS student_id,
        u.name,
        u.email,
        s.roll_no,
        s.dob,
        s.parent_contact,
        s.contact_number,
        c.class_name,
        c.section
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = $1 AND ($2::int IS NULL OR s.user_id = $2)
    `;
    const result = await db.query(query, [id, req.user.role === 'STUDENT' ? req.user.id : null]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get Student Error:', error);
    res.status(500).json({ message: 'Server error while fetching student.' });
  }
};

exports.updateStudent = async (req, res) => {
  const studentFields = {
    rollNo: 'roll_no', classId: 'class_id', dob: 'dob', parentName: 'parent_name',
    parentEmail: 'parent_email', parentContact: 'parent_contact', contactNumber: 'contact_number'
  };
  const userFields = { name: 'name', email: 'email' };
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const student = await client.query('SELECT user_id FROM students WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!student.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found.' });
    }

    for (const [field, column] of Object.entries(userFields)) {
      if (req.body[field] !== undefined) {
        await client.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [
          field === 'email' ? String(req.body[field]).trim().toLowerCase() : String(req.body[field]).trim(), student.rows[0].user_id
        ]);
      }
    }

    const updates = Object.entries(studentFields).filter(([field]) => req.body[field] !== undefined);
    if (!updates.length && !Object.keys(userFields).some((field) => req.body[field] !== undefined)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Provide at least one field to update.' });
    }
    if (updates.length) {
      const values = updates.map(([field]) => req.body[field] === '' ? null : req.body[field]);
      const assignments = updates.map(([, column], index) => `${column} = $${index + 1}`);
      values.push(req.params.id);
      await client.query(`UPDATE students SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
    }

    const result = await client.query(`
      SELECT s.id AS student_id, u.id AS user_id, u.name, u.email, s.roll_no, s.dob,
        s.parent_name, s.parent_email, s.parent_contact, s.contact_number, c.class_name, c.section
      FROM students s JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = $1
    `, [req.params.id]);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update student error:', error);
    if (error.code === '23505') return res.status(409).json({ message: 'Email or roll number is already in use.' });
    if (error.code === '23503') return res.status(400).json({ message: 'The selected class does not exist.' });
    if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
      return res.status(400).json({ message: 'One or more supplied values are invalid.' });
    }
    res.status(500).json({ message: 'Server error while updating student.' });
  } finally {
    client.release();
  }
};

exports.deleteStudent = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM users WHERE id = (SELECT user_id FROM students WHERE id = $1) RETURNING id', [req.params.id]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found.' });
    }
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error while deleting student.' });
  } finally {
    client.release();
  }
};

exports.getMyStudent = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.id AS student_id, u.id AS user_id, u.name, u.email, s.roll_no, s.dob,
        s.parent_name, s.parent_email, s.parent_contact, s.contact_number,
        c.class_name, c.section
      FROM students s JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.user_id = $1
    `, [req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Student profile not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get current student error:', error);
    res.status(500).json({ message: 'Server error while fetching student profile.' });
  }
};