const express = require('express');
const controller = require('../../schoolController');
const { authenticateToken, authorizeRoles } = require('../auth');

const router = express.Router();
const staff = [authenticateToken, authorizeRoles('ADMIN', 'TEACHER')];
const admin = [authenticateToken, authorizeRoles('ADMIN')];

router.get('/dashboard', ...staff, controller.dashboard);

router.get('/classes', authenticateToken, controller.listClasses);
router.post('/classes', ...admin, controller.createClass);
router.get('/teachers', authenticateToken, controller.listTeachers);
router.post('/teachers', ...admin, controller.createTeacher);
router.post('/teachers/enroll', ...admin, controller.enrollTeacher);
router.get('/subjects', authenticateToken, controller.listSubjects);
router.post('/subjects', ...admin, controller.createSubject);
router.post('/class-subjects', ...admin, controller.assignSubject);
router.get('/timetable', authenticateToken, controller.listTimetable);
router.post('/timetable', ...staff, controller.createTimetableSlot);
router.get('/announcements', authenticateToken, controller.listAnnouncements);
router.post('/announcements', ...staff, controller.createAnnouncement);
router.post('/announcements/:id/read', authenticateToken, controller.markAnnouncementRead);

router.get('/attendance', authenticateToken, controller.getAttendance);
router.get('/attendance/summary', authenticateToken, controller.attendanceSummary);
router.post('/attendance', ...staff, controller.recordAttendance);

router.get('/examinations', authenticateToken, controller.listExaminations);
router.post('/examinations', ...staff, controller.createExamination);
router.get('/results', authenticateToken, controller.getResults);
router.post('/examinations/:id/results', ...staff, controller.recordResult);

router.get('/fees', authenticateToken, controller.listFees);
router.post('/fees', ...admin, controller.createFee);
router.patch('/fees/:id/pay', ...admin, controller.payFee);

module.exports = router;