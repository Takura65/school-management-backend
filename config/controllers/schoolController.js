const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const fail = (res, error, message) => {
  console.error(message, error);
  if (error.code === '23505') {
    return res.status(409).json({ message: 'A record with these unique values already exists.' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ message: 'A referenced record does not exist.' });
  }
  if (error.code === '23514' || error.code === '22P02') {
    return res.status(400).json({ message: 'One or more supplied values are invalid.' });
  }
  return res.status(500).json({ message: 'Server error while processing request.' });
};

const isPositiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

exports.listClasses = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.id, c.class_name, c.section,
        COUNT(DISTINCT s.id)::int AS student_count,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', sub.id, 'name', sub.subject_name))
          FILTER (WHERE sub.id IS NOT NULL), '[]') AS subjects
      FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      LEFT JOIN class_subjects cs ON cs.class_id = c.id
      LEFT JOIN subjects sub ON sub.id = cs.subject_id
      GROUP BY c.id
      ORDER BY c.class_name, c.section
    `);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List classes error:');
  }
};

exports.createClass = async (req, res) => {
  const { className, section } = req.body;
  if (!className || !section) return res.status(400).json({ message: 'className and section are required.' });
  try {
    const result = await db.query(
      'INSERT INTO classes (class_name, section) VALUES ($1, $2) RETURNING id, class_name, section',
      [String(className).trim(), String(section).trim().toUpperCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create class error:');
  }
};

exports.listTeachers = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.id AS teacher_id, u.id AS user_id, u.name, u.email,
        t.qualification, t.experience_years, t.contact_number
      FROM teachers t JOIN users u ON u.id = t.user_id
      ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List teachers error:');
  }
};

exports.createTeacher = async (req, res) => {
  const { userId, qualification, experienceYears = 0, contactNumber } = req.body;
  if (!isPositiveId(userId)) return res.status(400).json({ message: 'A valid userId is required.' });
  if (!Number.isInteger(Number(experienceYears)) || Number(experienceYears) < 0) {
    return res.status(400).json({ message: 'experienceYears must be a non-negative integer.' });
  }
  try {
    const result = await db.query(`
      INSERT INTO teachers (user_id, qualification, experience_years, contact_number)
      SELECT id, $2, $3, $4 FROM users WHERE id = $1 AND role = 'TEACHER'
      RETURNING *
    `, [userId, qualification || null, experienceYears, contactNumber || null]);
    if (!result.rowCount) return res.status(400).json({ message: 'A valid TEACHER userId is required.' });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create teacher error:');
  }
};

exports.listSubjects = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT sub.id, sub.subject_name, t.id AS teacher_id, u.name AS teacher_name
      FROM subjects sub
      LEFT JOIN teachers t ON t.id = sub.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY sub.subject_name
    `);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List subjects error:');
  }
};

exports.createSubject = async (req, res) => {
  const { subjectName, teacherId } = req.body;
  if (!subjectName || !String(subjectName).trim()) return res.status(400).json({ message: 'subjectName is required.' });
  if (teacherId != null && !isPositiveId(teacherId)) return res.status(400).json({ message: 'teacherId must be a positive integer.' });
  try {
    const result = await db.query(
      'INSERT INTO subjects (subject_name, teacher_id) VALUES ($1, $2) RETURNING *',
      [String(subjectName).trim(), teacherId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create subject error:');
  }
};

exports.assignSubject = async (req, res) => {
  const { classId, subjectId, teacherId } = req.body;
  if (!isPositiveId(classId) || !isPositiveId(subjectId)) {
    return res.status(400).json({ message: 'Valid classId and subjectId are required.' });
  }
  if (teacherId != null && !isPositiveId(teacherId)) return res.status(400).json({ message: 'teacherId must be a positive integer.' });
  try {
    const result = await db.query(`
      INSERT INTO class_subjects (class_id, subject_id, teacher_id) VALUES ($1, $2, $3)
      ON CONFLICT (class_id, subject_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
      RETURNING *
    `, [classId, subjectId, teacherId || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Assign subject error:');
  }
};

exports.recordAttendance = async (req, res) => {
  const records = Array.isArray(req.body.records) ? req.body.records : [req.body];
  if (!records.length || records.length > 500) return res.status(400).json({ message: 'Provide between 1 and 500 attendance records.' });
  const statuses = new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
  for (const record of records) {
    if (!isPositiveId(record.studentId) || !statuses.has(String(record.status || '').toUpperCase())) {
      return res.status(400).json({ message: 'Each record needs a valid studentId and PRESENT, ABSENT, LATE, or EXCUSED status.' });
    }
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const record of records) {
      const result = await client.query(`
        INSERT INTO attendance (student_id, attendance_date, status, marked_by, notes)
        VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5)
        ON CONFLICT (student_id, attendance_date) DO UPDATE
          SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, notes = EXCLUDED.notes
        RETURNING *
      `, [record.studentId, record.date || null, String(record.status).toUpperCase(), req.user.id, record.notes || null]);
      saved.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ records: saved });
  } catch (error) {
    await client.query('ROLLBACK');
    fail(res, error, 'Record attendance error:');
  } finally {
    client.release();
  }
};

exports.getAttendance = async (req, res) => {
  const { studentId, from, to } = req.query;
  if (studentId && !isPositiveId(studentId)) return res.status(400).json({ message: 'studentId must be a positive integer.' });
  try {
    const result = await db.query(`
      SELECT a.*, u.name AS student_name, s.roll_no
      FROM attendance a JOIN students s ON s.id = a.student_id
      JOIN users u ON u.id = s.user_id
      WHERE ($1::int IS NULL OR a.student_id = $1)
        AND ($2::date IS NULL OR a.attendance_date >= $2)
        AND ($3::date IS NULL OR a.attendance_date <= $3)
        AND ($4::int IS NULL OR s.user_id = $4)
      ORDER BY a.attendance_date DESC, u.name
      LIMIT 1000
    `, [studentId || null, from || null, to || null, req.user.role === 'STUDENT' ? req.user.id : null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'Get attendance error:');
  }
};

exports.attendanceSummary = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.id AS student_id, u.name, s.roll_no,
        COUNT(a.id)::int AS recorded_days,
        COUNT(a.id) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::int AS attended_days,
        CASE WHEN COUNT(a.id) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.status IN ('PRESENT', 'LATE')) / COUNT(a.id), 1)
        END AS attendance_percentage
      FROM students s JOIN users u ON u.id = s.user_id
      LEFT JOIN attendance a ON a.student_id = s.id
      WHERE ($1::int IS NULL OR s.user_id = $1)
      GROUP BY s.id, u.name
      ORDER BY u.name
    `, [req.user.role === 'STUDENT' ? req.user.id : null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'Attendance summary error:');
  }
};

exports.listExaminations = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e.*, c.class_name, c.section, sub.subject_name
      FROM examinations e LEFT JOIN classes c ON c.id = e.class_id
      LEFT JOIN subjects sub ON sub.id = e.subject_id
      WHERE ($1::int IS NULL OR e.class_id IS NULL OR e.class_id IN (
        SELECT s.class_id FROM students s WHERE s.user_id = $1
      ))
      ORDER BY e.exam_date DESC
    `, [req.user.role === 'STUDENT' ? req.user.id : null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List examinations error:');
  }
};

exports.createExamination = async (req, res) => {
  const { title, classId, subjectId, examDate, maxMarks } = req.body;
  if (!title || !examDate || !Number.isFinite(Number(maxMarks)) || Number(maxMarks) <= 0) {
    return res.status(400).json({ message: 'title, examDate, and positive maxMarks are required.' });
  }
  if (classId != null && !isPositiveId(classId)) return res.status(400).json({ message: 'classId must be a positive integer.' });
  if (subjectId != null && !isPositiveId(subjectId)) return res.status(400).json({ message: 'subjectId must be a positive integer.' });
  try {
    const result = await db.query(`
      INSERT INTO examinations (title, class_id, subject_id, exam_date, max_marks, created_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [String(title).trim(), classId || null, subjectId || null, examDate, maxMarks, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create examination error:');
  }
};

exports.recordResult = async (req, res) => {
  const { studentId, marksObtained, remarks } = req.body;
  if (!isPositiveId(studentId) || !Number.isFinite(Number(marksObtained)) || Number(marksObtained) < 0) {
    return res.status(400).json({ message: 'Valid studentId and non-negative marksObtained are required.' });
  }
  try {
    const result = await db.query(`
      INSERT INTO exam_results (examination_id, student_id, marks_obtained, remarks)
      SELECT e.id, s.id, $3, $4 FROM examinations e CROSS JOIN students s
      WHERE e.id = $1 AND s.id = $2 AND $3 <= e.max_marks
      ON CONFLICT (examination_id, student_id) DO UPDATE
        SET marks_obtained = EXCLUDED.marks_obtained, remarks = EXCLUDED.remarks, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [req.params.id, studentId, marksObtained, remarks || null]);
    if (!result.rowCount) return res.status(400).json({ message: 'Examination or student not found, or marks exceed maximum.' });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Record result error:');
  }
};

exports.getResults = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id, r.marks_obtained, e.max_marks,
        ROUND(100.0 * r.marks_obtained / e.max_marks, 2) AS percentage,
        CASE WHEN r.marks_obtained / e.max_marks >= 0.9 THEN 'A'
          WHEN r.marks_obtained / e.max_marks >= 0.8 THEN 'B'
          WHEN r.marks_obtained / e.max_marks >= 0.7 THEN 'C'
          WHEN r.marks_obtained / e.max_marks >= 0.6 THEN 'D' ELSE 'F' END AS grade,
        r.remarks, e.id AS examination_id, e.title, e.exam_date,
        s.id AS student_id, s.roll_no, u.name AS student_name, sub.subject_name
      FROM exam_results r JOIN examinations e ON e.id = r.examination_id
      JOIN students s ON s.id = r.student_id JOIN users u ON u.id = s.user_id
      LEFT JOIN subjects sub ON sub.id = e.subject_id
      WHERE ($1::int IS NULL OR s.user_id = $1)
      ORDER BY e.exam_date DESC, u.name
    `, [req.user.role === 'STUDENT' ? req.user.id : null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'Get results error:');
  }
};

exports.listFees = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT f.*, s.roll_no, u.name AS student_name
      FROM fee_payments f JOIN students s ON s.id = f.student_id
      JOIN users u ON u.id = s.user_id
      WHERE ($1::int IS NULL OR s.user_id = $1)
      ORDER BY f.due_date NULLS LAST, f.created_at DESC
    `, [req.user.role === 'STUDENT' ? req.user.id : null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List fees error:');
  }
};

exports.createFee = async (req, res) => {
  const { studentId, feeType, amount, dueDate } = req.body;
  if (!isPositiveId(studentId) || !feeType || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: 'studentId, feeType, and positive amount are required.' });
  }
  try {
    const result = await db.query(`
      INSERT INTO fee_payments (student_id, fee_type, amount, due_date)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [studentId, String(feeType).trim(), amount, dueDate || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create fee error:');
  }
};

exports.payFee = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const fee = await client.query(`
      SELECT f.*, s.user_id FROM fee_payments f
      JOIN students s ON s.id = f.student_id WHERE f.id = $1 FOR UPDATE
    `, [req.params.id]);
    if (!fee.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Fee payment not found.' });
    }
    if (req.user.role === 'STUDENT' && Number(fee.rows[0].user_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Access denied: this fee belongs to another student.' });
    }
    if (fee.rows[0].status === 'PAID') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Fee has already been paid.', fee: fee.rows[0] });
    }
    const paid = await client.query(`
      UPDATE fee_payments SET status = 'PAID', paid_at = CURRENT_TIMESTAMP,
        receipt_number = COALESCE(receipt_number, $2)
      WHERE id = $1 RETURNING *
    `, [req.params.id, `RCPT-${randomUUID().replace(/-/g, '')}`]);
    await client.query('COMMIT');
    res.json({ message: 'Payment recorded.', fee: paid.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    fail(res, error, 'Pay fee error:');
  } finally {
    client.release();
  }
};

exports.dashboard = async (req, res) => {
  try {
    const [counts, attendance, exams, fees] = await Promise.all([
      db.query(`SELECT (SELECT COUNT(*) FROM students)::int AS students,
        (SELECT COUNT(*) FROM teachers)::int AS teachers,
        (SELECT COUNT(*) FROM classes)::int AS classes`),
      db.query(`SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) / COUNT(*), 1)
        END AS attendance_percentage FROM attendance WHERE attendance_date = CURRENT_DATE`),
      db.query(`SELECT e.id, e.title, e.exam_date, c.class_name, c.section
        FROM examinations e LEFT JOIN classes c ON c.id = e.class_id
        WHERE e.exam_date >= CURRENT_DATE ORDER BY e.exam_date LIMIT 5`),
      db.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) AS collected,
        COALESCE(SUM(amount) FILTER (WHERE status <> 'PAID'), 0) AS outstanding FROM fee_payments`)
    ]);
    res.json({
      totals: counts.rows[0],
      attendancePercentage: attendance.rows[0].attendance_percentage,
      upcomingExaminations: exams.rows,
      fees: fees.rows[0]
    });
  } catch (error) {
    fail(res, error, 'Dashboard error:');
  }
};

exports.enrollTeacher = async (req, res) => {
  const { name, email, password, qualification, experienceYears = 0, contactNumber } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, email, and password of at least 8 characters are required.' });
  }
  if (!Number.isInteger(Number(experienceYears)) || Number(experienceYears) < 0) {
    return res.status(400).json({ message: 'experienceYears must be a non-negative integer.' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'TEACHER') RETURNING id, name, email, role
    `, [String(name).trim(), String(email).trim().toLowerCase(), await bcrypt.hash(password, 10)]);
    const teacher = await client.query(`
      INSERT INTO teachers (user_id, qualification, experience_years, contact_number)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [user.rows[0].id, qualification || null, experienceYears, contactNumber || null]);
    await client.query('COMMIT');
    res.status(201).json({ user: user.rows[0], teacher: teacher.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    fail(res, error, 'Enroll teacher error:');
  } finally {
    client.release();
  }
};

exports.listTimetable = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ts.*, c.class_name, c.section, sub.subject_name, u.name AS teacher_name
      FROM timetable_slots ts
      JOIN classes c ON c.id = ts.class_id
      JOIN subjects sub ON sub.id = ts.subject_id
      LEFT JOIN teachers t ON t.id = ts.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE ($1 = 'ADMIN'
        OR ($1 = 'TEACHER' AND ts.teacher_id = (SELECT id FROM teachers WHERE user_id = $2))
        OR ($1 = 'STUDENT' AND ts.class_id = (SELECT class_id FROM students WHERE user_id = $2)))
        AND ($3::int IS NULL OR ts.class_id = $3)
      ORDER BY ts.weekday, ts.starts_at
    `, [req.user.role, req.user.id, req.query.classId || null]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List timetable error:');
  }
};

exports.createTimetableSlot = async (req, res) => {
  const { classId, subjectId, weekday, startsAt, endsAt, room, teacherId } = req.body;
  const day = Number(weekday);
  if (!isPositiveId(classId) || !isPositiveId(subjectId) || !Number.isInteger(day) || day < 1 || day > 7 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endsAt || '') || startsAt >= endsAt) {
    return res.status(400).json({ message: 'Provide a valid class, subject, weekday (1-7), and increasing 24-hour start/end times.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(381044)');
    const assignment = await client.query(`
      SELECT cs.teacher_id FROM class_subjects cs WHERE cs.class_id = $1 AND cs.subject_id = $2
    `, [classId, subjectId]);
    if (!assignment.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Assign this subject to the class before adding it to the timetable.' });
    }
    const assignedTeacher = teacherId ? Number(teacherId) : assignment.rows[0].teacher_id;
    if (req.user.role === 'TEACHER') {
      const currentTeacher = await client.query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
      if (!currentTeacher.rowCount || Number(assignment.rows[0].teacher_id) !== Number(currentTeacher.rows[0].id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Teachers may schedule only their assigned class subjects.' });
      }
    } else if (teacherId && !isPositiveId(teacherId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'teacherId must be a positive integer.' });
    }
    const collision = await client.query(`
      SELECT 1 FROM timetable_slots
      WHERE weekday = $1 AND (class_id = $2 OR ($3::int IS NOT NULL AND teacher_id = $3))
        AND starts_at < $5::time AND ends_at > $4::time
      LIMIT 1
    `, [day, classId, assignedTeacher || null, startsAt, endsAt]);
    if (collision.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This time overlaps another class or teacher timetable slot.' });
    }
    const result = await client.query(`
      INSERT INTO timetable_slots (class_id, subject_id, teacher_id, weekday, starts_at, ends_at, room)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [classId, subjectId, assignedTeacher || null, day, startsAt, endsAt, room || null]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    fail(res, error, 'Create timetable slot error:');
  } finally {
    client.release();
  }
};

exports.listAnnouncements = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.id, a.title, a.body, a.category, a.class_id, a.created_at,
        u.name AS author, ar.read_at
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $2
      WHERE $1 = 'ADMIN' OR a.class_id IS NULL
        OR ($1 = 'STUDENT' AND a.class_id = (SELECT class_id FROM students WHERE user_id = $2))
        OR ($1 = 'TEACHER' AND a.class_id IN (
          SELECT cs.class_id FROM class_subjects cs JOIN teachers t ON t.id = cs.teacher_id WHERE t.user_id = $2
        ))
      ORDER BY a.created_at DESC
      LIMIT 100
    `, [req.user.role, req.user.id]);
    res.json(result.rows);
  } catch (error) {
    fail(res, error, 'List announcements error:');
  }
};

exports.createAnnouncement = async (req, res) => {
  const { title, body, category = 'GENERAL', classId } = req.body;
  const categories = new Set(['GENERAL', 'ACADEMIC', 'EVENT', 'URGENT']);
  if (!title || !String(title).trim() || !body || !String(body).trim() || !categories.has(String(category).toUpperCase())) {
    return res.status(400).json({ message: 'A title, body, and valid announcement category are required.' });
  }
  if (classId != null && !isPositiveId(classId)) return res.status(400).json({ message: 'classId must be a positive integer.' });
  try {
    const result = await db.query(`
      INSERT INTO announcements (title, body, category, class_id, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [String(title).trim(), String(body).trim(), String(category).toUpperCase(), classId || null, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Create announcement error:');
  }
};

exports.markAnnouncementRead = async (req, res) => {
  try {
    const result = await db.query(`
      INSERT INTO announcement_reads (announcement_id, user_id)
      SELECT a.id, $2 FROM announcements a
      WHERE a.id = $1 AND (
        $3 = 'ADMIN' OR a.class_id IS NULL
        OR ($3 = 'STUDENT' AND a.class_id = (SELECT class_id FROM students WHERE user_id = $2))
        OR ($3 = 'TEACHER' AND a.class_id IN (
          SELECT cs.class_id FROM class_subjects cs JOIN teachers t ON t.id = cs.teacher_id WHERE t.user_id = $2
        ))
      )
      ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP
      RETURNING announcement_id, read_at
    `, [req.params.id, req.user.id, req.user.role]);
    if (!result.rowCount) return res.status(404).json({ message: 'Announcement not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    fail(res, error, 'Mark announcement read error:');
  }
};