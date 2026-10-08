const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const app = require('../config/server');
const db = require('../config/db');

const suffix = randomUUID();
const adminEmail = `test-admin-${suffix}@example.test`;
const teacherEmail = `test-teacher-${suffix}@example.test`;
const studentEmail = `test-student-${suffix}@example.test`;
const selfSignupEmail = `test-signup-${suffix}@example.test`;
const extraAdminEmail = `test-admin-extra-${suffix}@example.test`;
const emails = [adminEmail, teacherEmail, studentEmail, selfSignupEmail, extraAdminEmail];
const ids = {};
let server;
let baseUrl;

before(async () => {
  const fs = require('node:fs');
  await db.query(fs.readFileSync('config/schema.sql', 'utf8'));
  await db.query(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES ('Test Administrator', $1, $2, 'ADMIN')
  `, [adminEmail, await bcrypt.hash(`test-${suffix}-password`, 10)]);
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (ids.classId) await db.query('DELETE FROM classes WHERE id = $1', [ids.classId]);
  if (ids.subjectId) await db.query('DELETE FROM subjects WHERE id = $1', [ids.subjectId]);
  await db.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.pool.end();
});

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: response.status === 204 ? null : await response.json() };
}

test('role-based school workflows operate and clean up test data', async () => {
  let result = await request('/');
  assert.equal(result.response.status, 200);
  result = await request('/api/dashboard');
  assert.equal(result.response.status, 401);

  result = await request('/api/auth/login', {
    method: 'POST', body: { email: adminEmail, password: `test-${suffix}-password` },
  });
  assert.equal(result.response.status, 200);
  const adminToken = result.payload.token;

  result = await request('/api/auth/register', {
    method: 'POST', token: adminToken,
    body: { name: 'Weak Account', email: extraAdminEmail, password: 'short', role: 'ADMIN' },
  });
  assert.equal(result.response.status, 400);
  result = await request('/api/auth/register', {
    method: 'POST', token: adminToken,
    body: { name: 'Additional Administrator', email: extraAdminEmail, password: `extra-${suffix}-password`, role: 'ADMIN' },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.user.role, 'ADMIN');

  result = await request('/api/auth/signup', {
    method: 'POST', body: { name: 'Self Signup Student', email: selfSignupEmail, password: `signup-${suffix}-password`, dob: '2011-09-12', role: 'ADMIN' },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.user.role, 'STUDENT');
  const selfSignupToken = result.payload.token;
  result = await request('/api/students/me', { token: selfSignupToken });
  assert.equal(result.response.status, 200);
  assert.match(result.payload.roll_no, /^STU-/);
  result = await request('/api/auth/signup', {
    method: 'POST', body: { name: 'Short Password Student', email: `short-${suffix}@example.test`, password: 'too-short', dob: '2011-09-12' },
  });
  assert.equal(result.response.status, 400);

  result = await request('/api/auth/me', { method: 'PATCH', token: adminToken, body: { name: 'Updated Test Administrator' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.user.name, 'Updated Test Administrator');
  result = await request('/api/auth/me/password', { method: 'PATCH', token: adminToken, body: { currentPassword: `test-${suffix}-password`, newPassword: `changed-${suffix}-password` } });
  assert.equal(result.response.status, 200);
  result = await request('/api/auth/me/password', { method: 'PATCH', token: adminToken, body: { currentPassword: 'wrong-password', newPassword: `another-${suffix}-password` } });
  assert.equal(result.response.status, 401);

  result = await request('/api/classes', { method: 'POST', token: adminToken, body: { className: `T${suffix.slice(0, 6)}`, section: 'A' } });
  assert.equal(result.response.status, 201);
  ids.classId = result.payload.id;

  result = await request('/api/teachers/enroll', {
    method: 'POST', token: adminToken,
    body: { name: 'Test Teacher', email: teacherEmail, password: `test-${suffix}-password`, qualification: 'B.Ed', experienceYears: 4 },
  });
  assert.equal(result.response.status, 201);
  const teacherId = result.payload.teacher.id;
  result = await request('/api/subjects', { method: 'POST', token: adminToken, body: { subjectName: `Subject ${suffix}`, teacherId } });
  assert.equal(result.response.status, 201);
  ids.subjectId = result.payload.id;

  result = await request('/api/class-subjects', { method: 'POST', token: adminToken, body: { classId: ids.classId, subjectId: ids.subjectId, teacherId } });
  assert.equal(result.response.status, 201);
  result = await request('/api/timetable', { method: 'POST', token: adminToken, body: { classId: ids.classId, subjectId: ids.subjectId, weekday: 1, startsAt: '08:00', endsAt: '09:00', room: 'R-1' } });
  assert.equal(result.response.status, 201);
  result = await request('/api/timetable', { method: 'POST', token: adminToken, body: { classId: ids.classId, subjectId: ids.subjectId, weekday: 1, startsAt: '08:30', endsAt: '09:30' } });
  assert.equal(result.response.status, 409);

  result = await request('/api/students/enroll', {
    method: 'POST', token: adminToken,
    body: { name: 'Test Student', email: studentEmail, password: `test-${suffix}-password`, rollNo: `R${suffix.slice(0, 8)}`, classId: ids.classId, dob: '2010-05-10' },
  });
  assert.equal(result.response.status, 201);
  const studentId = result.payload.student.id;

  result = await request('/api/attendance', { method: 'POST', token: adminToken, body: { records: [{ studentId, status: 'PRESENT' }] } });
  assert.equal(result.response.status, 201);
  result = await request('/api/examinations', { method: 'POST', token: adminToken, body: { title: 'Test exam', classId: ids.classId, subjectId: ids.subjectId, examDate: '2030-01-15', maxMarks: 100 } });
  assert.equal(result.response.status, 201);
  const examinationId = result.payload.id;
  result = await request(`/api/examinations/${examinationId}/results`, { method: 'POST', token: adminToken, body: { studentId, marksObtained: 92 } });
  assert.equal(result.response.status, 201);
  result = await request('/api/results', { token: adminToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload[0].grade, 'A');
  assert.equal(Number(result.payload[0].percentage), 92);

  result = await request('/api/fees', { method: 'POST', token: adminToken, body: { studentId, feeType: 'Tuition', amount: 450 } });
  assert.equal(result.response.status, 201);
  result = await request(`/api/fees/${result.payload.id}/pay`, { method: 'PATCH', token: adminToken });
  assert.equal(result.response.status, 200);
  assert.match(result.payload.fee.receipt_number, /^RCPT-/);

  result = await request('/api/announcements', { method: 'POST', token: adminToken, body: { title: 'Test notice', body: 'Testing class notices', category: 'ACADEMIC', classId: ids.classId } });
  assert.equal(result.response.status, 201);
  const announcementId = result.payload.id;

  result = await request('/api/auth/login', { method: 'POST', body: { email: studentEmail, password: `test-${suffix}-password` } });
  assert.equal(result.response.status, 200);
  const studentToken = result.payload.token;
  result = await request('/api/students/me', { token: studentToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.student_id, studentId);
  result = await request('/api/timetable', { token: studentToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.length, 1);
  result = await request('/api/announcements', { token: studentToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload[0].id, announcementId);
  result = await request(`/api/announcements/${announcementId}/read`, { method: 'POST', token: studentToken });
  assert.equal(result.response.status, 200);
  result = await request('/api/classes', { method: 'POST', token: studentToken, body: { className: 'Nope', section: 'Z' } });
  assert.equal(result.response.status, 403);
});
