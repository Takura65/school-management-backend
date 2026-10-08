// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const { createStudent, enrollStudent, getAllStudents, getMyStudent, getStudentById, updateStudent, deleteStudent } = require('../../studentController');
const { authenticateToken, authorizeRoles } = require('../auth');

// Admin and Teachers can fetch all students
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), getAllStudents);
router.get('/me', authenticateToken, authorizeRoles('STUDENT'), getMyStudent);

// Fetch specific student details (Admin, Teacher, or Student)
router.get('/:id', authenticateToken, authorizeRoles('ADMIN', 'TEACHER', 'STUDENT'), getStudentById);

// Admin-only route to create student profiles
router.post('/', authenticateToken, authorizeRoles('ADMIN'), createStudent);
router.post('/enroll', authenticateToken, authorizeRoles('ADMIN'), enrollStudent);
router.patch('/:id', authenticateToken, authorizeRoles('ADMIN'), updateStudent);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), deleteStudent);

module.exports = router;