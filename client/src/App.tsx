import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleDollarSign, ClipboardCheck, Download, GraduationCap, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Users, UserRound, X,
} from 'lucide-react'
import { api, clearToken, getToken, send, setToken } from './api'
import type { Announcement, AttendanceRecord, ClassRoom, DashboardData, ExamResult, Examination, Fee, Role, Student, Subject, Teacher, TimetableSlot, User } from './types'
import './App.css'

type View = 'overview' | 'students' | 'teachers' | 'classes' | 'timetable' | 'attendance' | 'exams' | 'results' | 'fees' | 'announcements' | 'settings'
type CreateKind = 'student' | 'teacher' | 'class' | 'subject' | 'assignment' | 'timetable' | 'announcement' | 'exam' | 'result' | 'fee'

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard; roles: Role[] }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'students', label: 'Students', icon: Users, roles: ['ADMIN', 'TEACHER'] },
  { id: 'teachers', label: 'Teachers', icon: UserRound, roles: ['ADMIN', 'TEACHER'] },
  { id: 'classes', label: 'Classes & subjects', icon: BookOpen, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'timetable', label: 'Timetable', icon: CalendarDays, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'exams', label: 'Examinations', icon: CalendarDays, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'results', label: 'Results', icon: Activity, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
  { id: 'fees', label: 'Fees', icon: CircleDollarSign, roles: ['ADMIN', 'STUDENT'] },
  { id: 'announcements', label: 'Announcements', icon: Bell, roles: ['ADMIN', 'TEACHER', 'STUDENT'] },
]

const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD'
const currency = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(Number(value || 0))

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(Boolean(getToken()))
  const [view, setView] = useState<View>('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [modal, setModal] = useState<CreateKind | null>(null)
  const [activeExam, setActiveExam] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [exams, setExams] = useState<Examination[]>([])
  const [results, setResults] = useState<ExamResult[]>([])
  const [fees, setFees] = useState<Fee[]>([])
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [attendanceDraft, setAttendanceDraft] = useState<Record<number, AttendanceRecord['status']>>({})
  const [today] = useState(() => new Date())

  useEffect(() => {
    if (!getToken()) return
    api<{ user: User }>('/auth/me').then((result) => setUser(result.user)).catch(() => clearToken()).finally(() => setBooting(false))
  }, [])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        if (view === 'overview') {
          if (user.role === 'STUDENT') {
            const [profile, myAttendance, myResults, myFees, myExams] = await Promise.all([
              api<Student>('/students/me'), api<AttendanceRecord[]>('/attendance'), api<ExamResult[]>('/results'), api<Fee[]>('/fees'), api<Examination[]>('/examinations'),
            ])
            setStudents([profile]); setAttendance(myAttendance); setResults(myResults); setFees(myFees); setExams(myExams)
          } else {
            const [summary, studentRows, teacherRows, classRows] = await Promise.all([
              api<DashboardData>('/dashboard'), api<Student[]>('/students'), api<Teacher[]>('/teachers'), api<ClassRoom[]>('/classes'),
            ])
            setDashboard(summary); setStudents(studentRows); setTeachers(teacherRows); setClasses(classRows)
          }
        }
        if (view === 'students') setStudents(await api<Student[]>('/students'))
        if (view === 'teachers') setTeachers(await api<Teacher[]>('/teachers'))
        if (view === 'classes') {
          const [classRows, subjectRows] = await Promise.all([api<ClassRoom[]>('/classes'), api<Subject[]>('/subjects')])
          setClasses(classRows); setSubjects(subjectRows)
        }
        if (view === 'timetable') {
          const slots = await api<TimetableSlot[]>('/timetable')
          setTimetable(slots)
          if (user.role !== 'STUDENT') {
            const [classRows, subjectRows, teacherRows] = await Promise.all([
              api<ClassRoom[]>('/classes'), api<Subject[]>('/subjects'), api<Teacher[]>('/teachers'),
            ])
            setClasses(classRows); setSubjects(subjectRows); setTeachers(teacherRows)
          }
        }
        if (view === 'announcements') {
          const noticeRows = await api<Announcement[]>('/announcements')
          setAnnouncements(noticeRows)
          if (user.role !== 'STUDENT') setClasses(await api<ClassRoom[]>('/classes'))
        }
        if (view === 'attendance') {
          const [records, summaries] = await Promise.all([api<AttendanceRecord[]>('/attendance'), api<Array<{ student_id: number; attendance_percentage: number }>>('/attendance/summary')])
          setAttendance(records)
          if (user.role !== 'STUDENT') {
            const studentsList = await api<Student[]>('/students')
            setStudents(studentsList)
            setAttendanceDraft(Object.fromEntries(studentsList.map((student) => [student.student_id, records.find((row) => row.student_id === student.student_id && row.attendance_date.slice(0, 10) === new Date().toISOString().slice(0, 10))?.status || 'PRESENT'])))
          }
          void summaries
        }
        if (view === 'exams') {
          const examRows = await api<Examination[]>('/examinations')
          setExams(examRows)
          if (user.role !== 'STUDENT') {
            const [classRows, subjectRows, studentRows] = await Promise.all([
              api<ClassRoom[]>('/classes'), api<Subject[]>('/subjects'), api<Student[]>('/students'),
            ])
            setClasses(classRows); setSubjects(subjectRows); setStudents(studentRows)
          }
        }
        if (view === 'results') setResults(await api<ExamResult[]>('/results'))
        if (view === 'fees') {
          const feeRows = await api<Fee[]>('/fees')
          setFees(feeRows)
          if (user.role === 'ADMIN') setStudents(await api<Student[]>('/students'))
        }
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this section.') }
    }
    void load()
  }, [user, view, refreshKey])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const result = await send<{ token: string; user: User }>('/auth/login', 'POST', { email: data.get('email'), password: data.get('password') })
      setToken(result.token); setUser(result.user); setView('overview')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in.') }
    finally { setBusy(false) }
  }

  const logout = () => { clearToken(); setUser(null); setView('overview') }
  const navigate = (nextView: View) => { setError(''); setView(nextView) }

  const createRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!modal) return
    setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) || '').trim()
    try {
      if (modal === 'student') await send('/students/enroll', 'POST', { name: value('name'), email: value('email'), password: value('password'), rollNo: value('rollNo'), classId: value('classId') || null, dob: value('dob'), parentName: value('parentName'), parentContact: value('parentContact'), contactNumber: value('contactNumber') })
      if (modal === 'teacher') await send('/teachers/enroll', 'POST', { name: value('name'), email: value('email'), password: value('password'), qualification: value('qualification'), experienceYears: Number(value('experienceYears') || 0), contactNumber: value('contactNumber') })
      if (modal === 'class') await send('/classes', 'POST', { className: value('className'), section: value('section') })
      if (modal === 'subject') await send('/subjects', 'POST', { subjectName: value('subjectName'), teacherId: value('teacherId') || null })
      if (modal === 'assignment') await send('/class-subjects', 'POST', { classId: Number(value('classId')), subjectId: Number(value('subjectId')), teacherId: value('teacherId') || null })
      if (modal === 'timetable') await send('/timetable', 'POST', { classId: Number(value('classId')), subjectId: Number(value('subjectId')), teacherId: value('teacherId') || null, weekday: Number(value('weekday')), startsAt: value('startsAt'), endsAt: value('endsAt'), room: value('room') })
      if (modal === 'announcement') await send('/announcements', 'POST', { title: value('title'), body: value('body'), category: value('category'), classId: value('classId') || null })
      if (modal === 'exam') await send('/examinations', 'POST', { title: value('title'), classId: value('classId') || null, subjectId: value('subjectId') || null, examDate: value('examDate'), maxMarks: Number(value('maxMarks')) })
      if (modal === 'result' && activeExam) await send(`/examinations/${activeExam}/results`, 'POST', { studentId: Number(value('studentId')), marksObtained: Number(value('marksObtained')), remarks: value('remarks') })
      if (modal === 'fee') await send('/fees', 'POST', { studentId: Number(value('studentId')), feeType: value('feeType'), amount: Number(value('amount')), dueDate: value('dueDate') || null })
      setModal(null); setNotice('Record saved successfully.'); setRefreshKey((key) => key + 1)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this record.') }
    finally { setBusy(false) }
  }

  const saveAttendance = async () => {
    setBusy(true); setError('')
    try {
      await send('/attendance', 'POST', { records: students.map((student) => ({ studentId: student.student_id, status: attendanceDraft[student.student_id] || 'PRESENT' })) })
      setNotice("Today's attendance has been saved."); setRefreshKey((key) => key + 1)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Attendance could not be saved.') }
    finally { setBusy(false) }
  }

  const payFee = async (fee: Fee) => {
    try { await send(`/fees/${fee.id}/pay`, 'PATCH'); setNotice('Payment recorded and receipt generated.'); setRefreshKey((key) => key + 1) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Payment could not be recorded.') }
  }

  const markAnnouncementRead = async (announcement: Announcement) => {
    try {
      await send(`/announcements/${announcement.id}/read`, 'POST')
      setAnnouncements((items) => items.map((item) => item.id === announcement.id ? { ...item, read_at: new Date().toISOString() } : item))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Announcement could not be updated.') }
  }

  const deleteStudent = async (student: Student) => {
    if (!window.confirm(`Remove ${student.name}'s student profile? This cannot be undone.`)) return
    try { await send(`/students/${student.student_id}`, 'DELETE'); setNotice('Student profile removed.'); setRefreshKey((key) => key + 1) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Student could not be removed.') }
  }

  if (booting) return <div className="boot-screen"><span className="brand-mark"><GraduationCap size={22} /></span><span>Opening school workspace</span></div>
  const signup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const result = await send<{ token: string; user: User }>('/auth/signup', 'POST', {
        name: data.get('name'), email: data.get('email'), password: data.get('password'),
        dob: data.get('dob'), parentName: data.get('parentName'), parentContact: data.get('parentContact'),
      })
      setToken(result.token); setUser(result.user); setView('overview')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create account.') }
    finally { setBusy(false) }
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const result = await send<{ user: User }>('/auth/me', 'PATCH', { name: data.get('name'), email: data.get('email') })
      setUser(result.user); setNotice('Account details saved.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update account.') }
    finally { setBusy(false) }
  }

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      await send('/auth/me/password', 'PATCH', { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') })
      form.reset(); setNotice('Password changed successfully.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to change password.') }
    finally { setBusy(false) }
  }

  const createAdminAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      await send('/auth/register', 'POST', { name: data.get('adminName'), email: data.get('adminEmail'), password: data.get('adminPassword'), role: 'ADMIN' })
      form.reset()
      setNotice('Administrator account created.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create administrator account.') }
    finally { setBusy(false) }
  }

  if (!user) return <LoginScreen onLogin={login} onSignup={signup} error={error} busy={busy} />

  const filteredNav = navItems.filter((item) => item.roles.includes(user.role))
  const title = view === 'settings' ? 'Settings' : navItems.find((item) => item.id === view)?.label || 'Overview'
  return <div className="app-shell">
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><span className="brand-mark"><GraduationCap size={22} /></span><span>Northfield<span className="brand-sub">SCHOOL OFFICE</span></span></div>
      <div className="workspace-switch"><span className="workspace-icon">N</span><span><b>Northfield Academy</b><small>Main campus</small></span><ChevronDown size={15} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{filteredNav.map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-link ${view === item.id ? 'active' : ''}`} onClick={() => { navigate(item.id); setMobileNav(false) }}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span></button> })}</nav>
      <div className="sidebar-bottom"><div className="term-card"><span className="term-dot" /><span><small>ACADEMIC YEAR</small><b>2025 — 2026</b></span><ChevronDown size={14} /></div><button className={`nav-link quiet ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={18} /><span>Settings</span></button><div className="profile-row"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><span className="profile-name"><b>{user.name}</b><small>{user.role.toLowerCase()}</small></span><button className="icon-button" title="Sign out" onClick={logout}><LogOut size={16} /></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Northfield Academy</span><ChevronRight size={14} /><b>{title}</b></div><div className="top-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" title="Notifications"><Bell size={18} /><i /></button><span className="top-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(today)}</div><h1>{view === 'overview' ? `Good ${today.getHours() < 12 ? 'morning' : 'afternoon'}, ${user.name.split(' ')[0]}` : title}</h1><p>{pageDescription(view, user.role)}</p></div><div className="heading-actions">{view === 'students' && user.role === 'ADMIN' && <button className="primary-button" onClick={() => setModal('student')}><Plus size={17} /> Enroll student</button>}{view === 'teachers' && user.role === 'ADMIN' && <button className="primary-button" onClick={() => setModal('teacher')}><Plus size={17} /> Add teacher</button>}{view === 'classes' && user.role === 'ADMIN' && <><button className="secondary-button" onClick={() => setModal('subject')}><Plus size={16} /> Add subject</button><button className="secondary-button" onClick={() => setModal('assignment')}><Plus size={16} /> Assign subject</button><button className="primary-button" onClick={() => setModal('class')}><Plus size={17} /> Add class</button></>}{view === 'attendance' && user.role !== 'STUDENT' && <button className="primary-button" onClick={saveAttendance} disabled={busy}><Check size={17} /> Save attendance</button>}{view === 'exams' && user.role !== 'STUDENT' && <button className="primary-button" onClick={() => setModal('exam')}><Plus size={17} /> Schedule exam</button>}{view === 'fees' && user.role === 'ADMIN' && <button className="primary-button" onClick={() => setModal('fee')}><Plus size={17} /> Add fee</button>}</div></div>
        {notice && <div className="toast-success"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}{error && <div className="inline-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {view === 'overview' && <Overview user={user} dashboard={dashboard} students={students} exams={dashboard?.upcomingExaminations || exams} fees={fees} attendance={attendance} results={results} onNavigate={navigate} />}
        {view === 'students' && <StudentsTable students={students} search={search} onDelete={user.role === 'ADMIN' ? deleteStudent : undefined} />}
        {view === 'teachers' && <TeachersTable teachers={teachers} search={search} />}
        {view === 'classes' && <ClassesView classes={classes} subjects={subjects} />}
        {view === 'timetable' && <TimetableView slots={timetable} role={user.role} onCreate={() => setModal('timetable')} />}
        {view === 'announcements' && <AnnouncementsView announcements={announcements} role={user.role} onRead={markAnnouncementRead} onCreate={() => setModal('announcement')} />}
        {view === 'attendance' && <AttendanceView user={user} today={today} students={students} records={attendance} draft={attendanceDraft} setDraft={setAttendanceDraft} />}
        {view === 'exams' && <ExamsView exams={exams} role={user.role} onRecord={(exam) => { setActiveExam(exam.id); setModal('result') }} />}
        {view === 'results' && <ResultsView results={results} />}
        {view === 'fees' && <FeesView fees={fees} role={user.role} onPay={payFee} />}
        {view === 'settings' && <SettingsView user={user} busy={busy} onSaveProfile={saveProfile} onChangePassword={updatePassword} onCreateAdmin={createAdminAccount} />}
        <footer className="page-footer"><span>Northfield Academy · School office</span><span>Academic year 2025–2026</span></footer>
      </div>
    </main>
    {modal && <RecordModal kind={modal} busy={busy} students={students} classes={classes} teachers={teachers} subjects={subjects} onClose={() => { setModal(null); setError('') }} onSubmit={createRecord} />}
  </div>
}

function pageDescription(view: View, role: Role) {
  const descriptions: Record<View, string> = {
    overview: role === 'STUDENT' ? 'A clear view of your school week and progress.' : 'A quick read on what is happening across campus.',
    students: 'Student records, enrollment details, and class placement.', teachers: 'Faculty directory and teaching experience.',
    classes: 'Class groups and the subjects taught across each section.', timetable: 'Weekly teaching schedule by class, subject, and room.', attendance: 'Daily attendance records and student participation.',
    exams: 'Upcoming assessments and scheduled examinations.', results: 'Exam scores, percentages, and grade summaries.', fees: 'Payment status and outstanding school fees.', announcements: 'School notices and class updates.', settings: 'Manage your account details and sign-in security.',
  }
  return descriptions[view]
}

function SettingsView({ user, busy, onSaveProfile, onChangePassword, onCreateAdmin }: { user: User; busy: boolean; onSaveProfile: (event: FormEvent<HTMLFormElement>) => void; onChangePassword: (event: FormEvent<HTMLFormElement>) => void; onCreateAdmin: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="settings-layout"><section className="panel settings-panel"><div className="settings-section-heading"><span className="settings-icon"><UserRound size={18} /></span><div><h2>Profile details</h2><p>Update the name and email associated with your account.</p></div></div><form className="settings-form" onSubmit={onSaveProfile}><label className="field-label">Full name<input name="name" defaultValue={user.name} required /></label><label className="field-label">Email address<input type="email" name="email" defaultValue={user.email} required /></label><label className="field-label">Account role<input value={user.role[0] + user.role.slice(1).toLowerCase()} readOnly /></label><div className="settings-submit"><button className="primary-button" disabled={busy}>Save profile</button></div></form></section><section className="panel settings-panel"><div className="settings-section-heading"><span className="settings-icon security-icon"><ShieldCheck size={18} /></span><div><h2>Password & security</h2><p>Choose a new password of at least 12 characters.</p></div></div><form className="settings-form" onSubmit={onChangePassword}><label className="field-label">Current password<input type="password" name="currentPassword" autoComplete="current-password" required /></label><label className="field-label">New password<input type="password" name="newPassword" autoComplete="new-password" minLength={12} required /></label><div className="settings-submit"><button className="primary-button" disabled={busy}>Change password</button></div></form></section>{user.role === 'ADMIN' && <section className="panel settings-panel"><div className="settings-section-heading"><span className="settings-icon"><ShieldCheck size={18} /></span><div><h2>Administrator accounts</h2><p>Create additional admin access. Teacher profiles are managed in Teachers.</p></div></div><form className="settings-form" onSubmit={onCreateAdmin}><label className="field-label">Full name<input name="adminName" autoComplete="name" required /></label><label className="field-label">Email address<input type="email" name="adminEmail" autoComplete="email" required /></label><label className="field-label">Temporary password<input type="password" name="adminPassword" minLength={12} autoComplete="new-password" required /></label><div className="settings-submit"><button className="primary-button" disabled={busy}>Create administrator</button></div></form></section>}<div className="settings-security-note"><ShieldCheck size={16} /><span>Teacher and administrator access is restricted to accounts provisioned by the school.</span></div></div>
}

function LoginScreen({ onLogin, onSignup, error, busy }: { onLogin: (event: FormEvent<HTMLFormElement>) => void; onSignup: (event: FormEvent<HTMLFormElement>) => void; error: string; busy: boolean }) {
  const [creatingAccount, setCreatingAccount] = useState(false)
  return <main className={`login-layout ${creatingAccount ? 'signup-layout' : ''}`}>
    <section className="login-art">
      <div className="art-top"><span className="brand-mark"><GraduationCap size={22} /></span><span>NORTHFIELD ACADEMY</span></div>
      <div className="art-content">
        <span className="overline">THE SCHOOL OFFICE</span>
        <h1>{creatingAccount ? <>A bright start<br /><i>begins here.</i></> : <>Every detail,<br /><i>in its right place.</i></>}</h1>
        <p>{creatingAccount ? 'Join your school community and keep your learning, progress, and school life connected.' : 'One considered workspace for the people and moments that keep a school moving.'}</p>
        <div className="art-stats"><span><b>01</b><small>PEOPLE</small></span><span><b>02</b><small>PROGRESS</small></span><span><b>03</b><small>POSSIBILITY</small></span></div>
      </div>
      <div className="art-footer">A considered place to learn, teach, and grow.</div>
    </section>
    <section className="login-panel">
      <div className="login-box">
        <div className="mobile-brand"><span className="brand-mark"><GraduationCap size={22} /></span>NORTHFIELD ACADEMY</div>
        <span className="eyebrow">{creatingAccount ? 'JOIN NORTHFIELD' : 'WELCOME BACK'}</span>
        <h2>{creatingAccount ? 'Sign up' : <>Sign in to your<br />school workspace.</>}</h2>
        <p className="login-copy">{creatingAccount ? 'Create a student account to join your school.' : 'Use your school account to continue.'}{' '}
          <button className="inline-link" type="button" onClick={() => setCreatingAccount(!creatingAccount)}>{creatingAccount ? 'Already registered? Sign in' : 'New here? Create account'}</button>
        </p>
        <form onSubmit={creatingAccount ? onSignup : onLogin} className={`login-form ${creatingAccount ? 'signup-form' : ''}`}>
          {creatingAccount && <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" required /></label>}
          <label>Email address<input type="email" name="email" autoComplete={creatingAccount ? 'email' : 'username'} placeholder="you@northfield.edu" required /></label>
          <label>Password<input type="password" name="password" autoComplete={creatingAccount ? 'new-password' : 'current-password'} minLength={creatingAccount ? 12 : undefined} placeholder={creatingAccount ? 'At least 12 characters' : 'Enter your password'} required /></label>
          {creatingAccount && <label>Date of birth<input type="date" name="dob" autoComplete="bday" required /></label>}
          {creatingAccount && <details className="guardian-details"><summary>Parent or guardian details <span>Optional</span></summary><div className="guardian-fields"><label>Full name<input name="parentName" autoComplete="off" placeholder="Parent or guardian" /></label><label>Contact number<input name="parentContact" type="tel" autoComplete="tel" placeholder="Phone number" /></label></div></details>}
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button login-submit" disabled={busy}>{busy ? 'Please wait…' : creatingAccount ? 'Create student account' : 'Sign in'}<ChevronRight size={17} /></button>
        </form>
        <div className="login-foot"><ShieldCheck size={15} /> Secure access for Northfield staff and students</div>
      </div>
    </section>
  </main>
}

function Overview({ user, dashboard, students, exams, fees, attendance, results, onNavigate }: { user: User; dashboard: DashboardData | null; students: Student[]; exams: Examination[]; fees: Fee[]; attendance: AttendanceRecord[]; results: ExamResult[]; onNavigate: (view: View) => void }) {
  const isStudent = user.role === 'STUDENT'
  const attended = attendance.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length
  const percentage = attendance.length ? Math.round(attended / attendance.length * 100) : 0
  const rows = students.slice(0, 5)
  return <><section className="stat-grid">
    <StatCard label={isStudent ? 'My attendance' : 'Enrolled students'} value={isStudent ? `${percentage}%` : dashboard?.totals.students ?? '—'} detail={isStudent ? 'For recorded days' : 'Across all class groups'} icon={Users} tone="mint" trend={!isStudent ? '+8.2%' : undefined} />
    <StatCard label={isStudent ? 'Teaching staff' : 'Teaching staff'} value={isStudent ? (students[0]?.class_name ? `${students[0].class_name}${students[0].section ? ` · ${students[0].section}` : ''}` : '—') : dashboard?.totals.teachers ?? '—'} detail={isStudent ? (students[0]?.section ? `Section ${students[0].section}` : 'Current class assignment') : 'Faculty profiles'} icon={UserRound} tone="blue" trend={!isStudent ? '+2 this term' : undefined} />
    <StatCard label={isStudent ? 'Exam results' : 'Today present'} value={isStudent ? results.length : `${dashboard?.attendancePercentage ?? 0}%`} detail={isStudent ? 'Assessments recorded' : 'Campus attendance'} icon={ClipboardCheck} tone="orange" trend={!isStudent ? 'Across all classes' : undefined} />
    <StatCard label={isStudent ? 'Fee balance' : 'Fees collected'} value={currency(isStudent ? fees.filter((fee) => fee.status !== 'PAID').reduce((sum, fee) => sum + Number(fee.amount), 0) : dashboard?.fees.collected ?? 0)} detail={isStudent ? 'Outstanding balance' : `${currency(dashboard?.fees.outstanding ?? 0)} outstanding`} icon={CircleDollarSign} tone="rose" trend={!isStudent ? 'Current academic year' : undefined} />
  </section><div className="dashboard-grid"><section className="panel attendance-panel"><div className="panel-head"><div><span className="eyebrow">CAMPUS PULSE</span><h2>{isStudent ? 'My attendance' : 'Attendance overview'}</h2></div><button className="text-action" onClick={() => onNavigate('attendance')}>View details <ChevronRight size={15} /></button></div><AttendanceChart percentage={isStudent ? percentage : Number(dashboard?.attendancePercentage || 0)} /><div className="chart-legend"><span><i className="legend-dot present-dot" />Present <b>{isStudent ? attended : dashboard?.attendancePercentage ?? 0}{isStudent ? '' : '%'}</b></span><span><i className="legend-dot absent-dot" />Needs attention <b>{isStudent ? attendance.length - attended : `${100 - Number(dashboard?.attendancePercentage || 0)}%`}</b></span></div></section><section className="panel exams-panel"><div className="panel-head"><div><span className="eyebrow">COMING UP</span><h2>Next examinations</h2></div><button className="icon-button small" title="View examinations" onClick={() => onNavigate('exams')}><ArrowUpRight size={16} /></button></div>{exams.length ? <div className="upcoming-list">{exams.slice(0, 4).map((exam) => { const date = examCalendarDate(exam.exam_date); return <div className="upcoming-item" key={exam.id}><div className="date-tile"><b>{date.day}</b><small>{date.month}</small></div><div className="upcoming-copy"><b>{exam.title}</b><small>{[exam.subject_name, exam.class_name && `Class ${exam.class_name}${exam.section ? `-${exam.section}` : ''}`].filter(Boolean).join(' · ') || 'School examination'}</small></div><ChevronRight size={15} /></div> })}
        </div> : <EmptyState title="No exams scheduled" text="Upcoming examinations will appear here." />}</section></div><section className="panel roster-panel"><div className="panel-head"><div><span className="eyebrow">{isStudent ? 'YOUR RECORD' : 'RECENTLY ENROLLED'}</span><h2>{isStudent ? 'Student profile' : 'Student roster'}</h2></div>{!isStudent && <button className="text-action" onClick={() => onNavigate('students')}>Full directory <ChevronRight size={15} /></button>}</div><StudentsTable students={rows} search="" compact /></section></>
}

function StatCard({ label, value, detail, icon: Icon, tone, trend }: { label: string; value: string | number; detail: string; icon: typeof Users; tone: string; trend?: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><div className="stat-value">{value}</div><div className="stat-bottom"><span>{detail}</span>{trend && <span className="stat-trend">{trend}</span>}</div></article>
}

function AttendanceChart({ percentage }: { percentage: number }) {
  const safe = Math.max(0, Math.min(100, percentage))
  return <div className="attendance-chart"><div className="chart-center"><b>{Math.round(safe)}%</b><small>ATTENDANCE</small></div><div className="chart-ring" style={{ background: `conic-gradient(var(--green) ${safe * 3.6}deg, #e9eeeb ${safe * 3.6}deg)` }} /></div>
}

function StudentsTable({ students, search, onDelete, compact = false }: { students: Student[]; search: string; onDelete?: (student: Student) => void; compact?: boolean }) {
  const rows = students.filter((student) => `${student.name} ${student.email} ${student.roll_no} ${student.class_name || ''}`.toLowerCase().includes(search.toLowerCase()))
  return <div className={`table-wrap ${compact ? 'compact-table' : ''}`}><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>CLASS</th><th>CONTACT</th>{!compact && <th>DATE OF BIRTH</th>}{onDelete && <th />}</tr></thead><tbody>{rows.map((student) => <tr key={student.student_id}><td><div className="person-cell"><span className="table-avatar">{student.name.slice(0, 1)}</span><span><b>{student.name}</b><small>{student.email}</small></span></div></td><td className="mono-cell">{student.roll_no}</td><td>{student.class_name ? `${student.class_name}${student.section ? ` · ${student.section}` : ''}` : <span className="muted">Unassigned</span>}</td><td>{student.contact_number || '—'}</td>{!compact && <td>{formatDate(student.dob)}</td>}{onDelete && <td><button className="row-action danger-text" onClick={() => onDelete(student)}>Remove</button></td>}</tr>)}</tbody></table>{!rows.length && <EmptyState title="No student records" text="Try another search or enroll a student." />}</div>
}

function TeachersTable({ teachers, search }: { teachers: Teacher[]; search: string }) {
  const rows = teachers.filter((teacher) => `${teacher.name} ${teacher.email} ${teacher.qualification || ''}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>TEACHER</th><th>QUALIFICATION</th><th>EXPERIENCE</th><th>CONTACT</th></tr></thead><tbody>{rows.map((teacher) => <tr key={teacher.teacher_id}><td><div className="person-cell"><span className="table-avatar teacher-avatar">{teacher.name.slice(0, 1)}</span><span><b>{teacher.name}</b><small>{teacher.email}</small></span></div></td><td>{teacher.qualification || '—'}</td><td>{teacher.experience_years} years</td><td>{teacher.contact_number || '—'}</td></tr>)}</tbody></table>{!rows.length && <EmptyState title="No teacher profiles" text="Faculty records will appear here." />}</div></div>
}

function ClassesView({ classes, subjects }: { classes: ClassRoom[]; subjects: Subject[] }) {
  return <div className="class-layout"><section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CLASS GROUPS</span><h2>Sections</h2></div><span className="count-label">{classes.length} total</span></div><div className="table-wrap"><table><thead><tr><th>CLASS</th><th>STUDENTS</th><th>SUBJECTS</th></tr></thead><tbody>{classes.map((room) => <tr key={room.id}><td><div className="class-name"><span className="class-symbol"><BookOpen size={17} /></span><b>Class {room.class_name} · {room.section}</b></div></td><td>{room.student_count}</td><td>{room.subjects?.length || 0}</td></tr>)}</tbody></table>{!classes.length && <EmptyState title="No classes yet" text="Create a class group to organize students." />}</div></section><section className="panel subject-panel"><div className="panel-head"><div><span className="eyebrow">CURRICULUM</span><h2>Subjects</h2></div><span className="count-label">{subjects.length} total</span></div>{subjects.length ? <div className="subject-list">{subjects.map((subject) => <div className="subject-row" key={subject.id}><span className="subject-mark"><BookOpen size={15} /></span><span><b>{subject.subject_name}</b><small>{subject.teacher_name || 'Teacher not assigned'}</small></span><ChevronRight size={15} /></div>)}</div> : <EmptyState title="No subjects listed" text="Add subjects to build your curriculum." />}</section></div>
}

function AttendanceView({ user, today, students, records, draft, setDraft }: { user: User; today: Date; students: Student[]; records: AttendanceRecord[]; draft: Record<number, AttendanceRecord['status']>; setDraft: (value: Record<number, AttendanceRecord['status']>) => void }) {
  if (user.role === 'STUDENT') return <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>DATE</th><th>STATUS</th></tr></thead><tbody>{records.map((record, index) => <tr key={`${record.student_id}-${record.attendance_date}-${index}`}><td>{formatDate(record.attendance_date)}</td><td><StatusBadge status={record.status} /></td></tr>)}</tbody></table>{!records.length && <EmptyState title="No attendance history" text="Attendance records will appear here." />}</div></div>
  return <div className="panel attendance-list-panel"><div className="attendance-list-head"><div><span className="eyebrow">TODAY · {formatDate(today.toISOString())}</span><h2>Mark the register</h2><p>Choose a status for each student, then save today's register.</p></div><span className="count-label">{students.length} students</span></div><div className="attendance-editor">{students.map((student) => <div className="attendance-edit-row" key={student.student_id}><div className="person-cell"><span className="table-avatar">{student.name.slice(0, 1)}</span><span><b>{student.name}</b><small>{student.roll_no} · {student.class_name || 'Unassigned'}{student.section ? `-${student.section}` : ''}</small></span></div><select aria-label={`Attendance for ${student.name}`} value={draft[student.student_id] || 'PRESENT'} onChange={(event) => setDraft({ ...draft, [student.student_id]: event.target.value as AttendanceRecord['status'] })}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="EXCUSED">Excused</option></select></div>)}</div>{!students.length && <EmptyState title="No students to mark" text="Enroll students before taking attendance." />}</div>
}

function ExamsView({ exams, role, onRecord }: { exams: Examination[]; role: Role; onRecord: (exam: Examination) => void }) {
  return <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>EXAMINATION</th><th>SUBJECT</th><th>CLASS</th><th>DATE</th><th>MAX MARKS</th>{role !== 'STUDENT' && <th />}</tr></thead><tbody>{exams.map((exam) => <tr key={exam.id}><td><b>{exam.title}</b></td><td>{exam.subject_name || '—'}</td><td>{exam.class_name ? `${exam.class_name}${exam.section ? ` · ${exam.section}` : ''}` : 'All classes'}</td><td>{formatDate(exam.exam_date)}</td><td>{exam.max_marks}</td>{role !== 'STUDENT' && <td><button className="row-action" onClick={() => onRecord(exam)}>Record marks</button></td>}</tr>)}</tbody></table>{!exams.length && <EmptyState title="No examinations scheduled" text="Schedule an exam to get started." />}</div></div>
}

function ResultsView({ results }: { results: ExamResult[] }) {
  const download = () => {
    const columns = ['Student', 'Roll number', 'Examination', 'Subject', 'Marks obtained', 'Maximum marks', 'Percentage', 'Grade', 'Remarks']
    const rows = results.map((result) => [result.student_name, result.roll_no, result.title, result.subject_name || '', result.marks_obtained, result.max_marks, result.percentage, result.grade, result.remarks || ''])
    const csv = [columns, ...rows].map((row) => row.map((value) => {
      const safe = String(value).replace(/^[\s]*([=+\-@])/, "'$1")
      return `"${safe.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'school-results.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return <div className="panel table-panel"><div className="workflow-panel-head"><div><span className="eyebrow">ACADEMIC PERFORMANCE</span><h2>Exam results</h2></div><button className="secondary-button" onClick={download} disabled={!results.length}><Download size={15} /> Download CSV</button></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>EXAMINATION</th><th>SUBJECT</th><th>SCORE</th><th>PERCENTAGE</th><th>GRADE</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td><div className="person-cell"><span className="table-avatar">{result.student_name.slice(0, 1)}</span><span><b>{result.student_name}</b><small>{result.roll_no}</small></span></div></td><td>{result.title}</td><td>{result.subject_name || '—'}</td><td>{result.marks_obtained} / {result.max_marks}</td><td>{result.percentage}%</td><td><span className={`grade grade-${result.grade.toLowerCase()}`}>{result.grade}</span></td></tr>)}</tbody></table>{!results.length && <EmptyState title="No results recorded" text="Recorded examination results will appear here." />}</div></div>
}

function FeesView({ fees, role, onPay }: { fees: Fee[]; role: Role; onPay: (fee: Fee) => void }) {
  const total = fees.reduce((sum, fee) => sum + Number(fee.amount), 0)
  const paid = fees.filter((fee) => fee.status === 'PAID').reduce((sum, fee) => sum + Number(fee.amount), 0)
  return <><div className="fee-summary"><div><span>TOTAL BILLED</span><b>{currency(total)}</b></div><div><span>PAID</span><b className="paid-amount">{currency(paid)}</b></div><div><span>OUTSTANDING</span><b className="outstanding-amount">{currency(total - paid)}</b></div></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr>{role === 'ADMIN' && <th>STUDENT</th>}<th>FEE</th><th>AMOUNT</th><th>DUE DATE</th><th>STATUS</th>{role === 'ADMIN' && <th>RECEIPT / ACTION</th>}</tr></thead><tbody>{fees.map((fee) => <tr key={fee.id}>{role === 'ADMIN' && <td><div className="person-cell"><span className="table-avatar">{fee.student_name.slice(0, 1)}</span><span><b>{fee.student_name}</b><small>{fee.roll_no}</small></span></div></td>}<td>{fee.fee_type}</td><td className="money-cell">{currency(fee.amount)}</td><td>{formatDate(fee.due_date)}</td><td><StatusBadge status={fee.status} /></td>{role === 'ADMIN' && <td>{fee.status !== 'PAID' ? <button className="row-action" onClick={() => onPay(fee)}>Record payment</button> : <span className="receipt">{fee.receipt_number || 'Paid'}</span>}</td>}</tr>)}</tbody></table>{!fees.length && <EmptyState title="No fee records" text="Fee entries will appear here when added." />}</div></div></>
}

function RecordModal({ kind, busy, students, classes, teachers, subjects, onClose, onSubmit }: { kind: CreateKind; busy: boolean; students: Student[]; classes: ClassRoom[]; teachers: Teacher[]; subjects: Subject[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const labels: Record<CreateKind, string> = { student: 'Enroll student', teacher: 'Add teacher', class: 'Create class', subject: 'Add subject', assignment: 'Assign a subject', timetable: 'Add timetable slot', announcement: 'Publish announcement', exam: 'Schedule examination', result: 'Record examination result', fee: 'Add fee record' }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">SCHOOL RECORDS</span><h2 id="modal-title">{labels[kind]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div><form onSubmit={onSubmit} className="record-form">
    {kind === 'student' && <><Field label="Student name" name="name" required /><Field label="School email" name="email" type="email" required /><Field label="Temporary password" name="password" type="password" minLength={8} required /><Field label="Roll number" name="rollNo" required /><Field label="Date of birth" name="dob" type="date" required /><SelectField label="Class group" name="classId" options={classes.map((room) => [room.id, `${room.class_name} · ${room.section}`])} /><Field label="Parent / guardian" name="parentName" /><Field label="Parent contact" name="parentContact" type="tel" /><Field label="Student contact" name="contactNumber" type="tel" /></>}
    {kind === 'teacher' && <><Field label="Teacher name" name="name" required /><Field label="School email" name="email" type="email" required /><Field label="Temporary password" name="password" type="password" minLength={8} required /><Field label="Qualification" name="qualification" /><Field label="Years of experience" name="experienceYears" type="number" min="0" defaultValue="0" /><Field label="Contact number" name="contactNumber" type="tel" /></>}
    {kind === 'class' && <><Field label="Class name" name="className" placeholder="e.g. 10" required /><Field label="Section" name="section" placeholder="e.g. A" required /></>}
    {kind === 'subject' && <><Field label="Subject name" name="subjectName" required /><SelectField label="Lead teacher" name="teacherId" options={teachers.map((teacher) => [teacher.teacher_id, teacher.name])} /></>}
    {kind === 'assignment' && <><SelectField label="Class group" name="classId" options={classes.map((room) => [room.id, `${room.class_name} · ${room.section}`])} required /><SelectField label="Subject" name="subjectId" options={subjects.map((subject) => [subject.id, subject.subject_name])} required /><SelectField label="Assigned teacher" name="teacherId" options={teachers.map((teacher) => [teacher.teacher_id, teacher.name])} /></>}
    {kind === 'timetable' && <><SelectField label="Class group" name="classId" options={classes.map((room) => [room.id, `${room.class_name} · ${room.section}`])} required /><SelectField label="Subject" name="subjectId" options={subjects.map((subject) => [subject.id, subject.subject_name])} required /><SelectField label="Teacher" name="teacherId" options={teachers.map((teacher) => [teacher.teacher_id, teacher.name])} /><SelectField label="Weekday" name="weekday" options={[[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']]} required /><Field label="Starts at" name="startsAt" type="time" required /><Field label="Ends at" name="endsAt" type="time" required /><Field label="Room" name="room" /></>}
    {kind === 'announcement' && <><Field label="Title" name="title" required /><SelectField label="Category" name="category" options={[["GENERAL", "General"], ["ACADEMIC", "Academic"], ["EVENT", "Event"], ["URGENT", "Urgent"]]} required /><SelectField label="Target class (optional)" name="classId" options={classes.map((room) => [room.id, `${room.class_name} · ${room.section}`])} /><label className="field-label field-wide">Message<textarea name="body" rows={5} required /></label></>}
    {kind === 'exam' && <><Field label="Examination title" name="title" required /><SelectField label="Class group" name="classId" options={classes.map((room) => [room.id, `${room.class_name} · ${room.section}`])} /><SelectField label="Subject" name="subjectId" options={subjects.map((subject) => [subject.id, subject.subject_name])} /><Field label="Examination date" name="examDate" type="date" required /><Field label="Maximum marks" name="maxMarks" type="number" min="1" step="0.01" required /></>}
    {kind === 'result' && <><SelectField label="Student" name="studentId" options={students.map((student) => [student.student_id, `${student.name} · ${student.roll_no}`])} required /><Field label="Marks obtained" name="marksObtained" type="number" min="0" step="0.01" required /><Field label="Teacher remarks" name="remarks" /></>}
    {kind === 'fee' && <><SelectField label="Student" name="studentId" options={students.map((student) => [student.student_id, `${student.name} · ${student.roll_no}`])} required /><Field label="Fee type" name="feeType" placeholder="Tuition, transport…" required /><Field label="Amount" name="amount" type="number" min="0.01" step="0.01" required /><Field label="Due date" name="dueDate" type="date" /></>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save record'}<ChevronRight size={16} /></button></div></form></section></div>
}

function Field({ label, name, type = 'text', required = false, placeholder, min, minLength, step, defaultValue }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; min?: string; minLength?: number; step?: string; defaultValue?: string }) {
  return <label className="field-label">{label}<input name={name} type={type} required={required} placeholder={placeholder} min={min} minLength={minLength} step={step} defaultValue={defaultValue} /></label>
}

function SelectField({ label, name, options, required = false }: { label: string; name: string; options: Array<[string | number, string]>; required?: boolean }) {
  return <label className="field-label">{label}<select name={name} required={required}><option value="">Select…</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}><i />{status.charAt(0) + status.slice(1).toLowerCase()}</span>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><BookOpen size={19} /></span><b>{title}</b><p>{text}</p></div>
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function examCalendarDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return { day: date.getDate(), month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase() }
}

function TimetableView({ slots, role, onCreate }: { slots: TimetableSlot[]; role: Role; onCreate: () => void }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return <div className="panel table-panel"><div className="panel-head workflow-panel-head"><div><span className="eyebrow">WEEKLY SCHEDULE</span><h2>Teaching periods</h2></div>{role !== 'STUDENT' && <button className="primary-button" onClick={onCreate}><Plus size={16} /> Add period</button>}</div><div className="table-wrap"><table><thead><tr><th>DAY</th><th>TIME</th><th>CLASS</th><th>SUBJECT</th><th>TEACHER</th><th>ROOM</th></tr></thead><tbody>{slots.map((slot) => <tr key={slot.id}><td><b>{days[slot.weekday - 1]}</b></td><td className="mono-cell">{slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)}</td><td>{slot.class_name} · {slot.section}</td><td>{slot.subject_name}</td><td>{slot.teacher_name || '—'}</td><td>{slot.room || '—'}</td></tr>)}</tbody></table>{!slots.length && <EmptyState title="No timetable published" text="Assigned subject periods will appear here." />}</div></div>
}

function AnnouncementsView({ announcements, role, onRead, onCreate }: { announcements: Announcement[]; role: Role; onRead: (announcement: Announcement) => void; onCreate: () => void }) {
  return <div className="announcement-list">{role !== 'STUDENT' && <div className="workflow-panel-head"><div><span className="eyebrow">SCHOOL BULLETIN</span><h2>Latest notices</h2></div><button className="primary-button" onClick={onCreate}><Plus size={16} /> Publish notice</button></div>}{announcements.map((announcement) => <article className={`announcement-item ${announcement.read_at ? 'is-read' : 'is-unread'}`} key={announcement.id}><div className="announcement-marker"><Bell size={17} /></div><div className="announcement-copy"><div className="announcement-meta"><span className={`announcement-category category-${announcement.category.toLowerCase()}`}>{announcement.category}</span><span>{formatDate(announcement.created_at)}</span>{announcement.author && <span>By {announcement.author}</span>}</div><h2>{announcement.title}</h2><p>{announcement.body}</p>{announcement.class_id && <small className="target-label">Class announcement</small>}</div><button className="row-action" disabled={Boolean(announcement.read_at)} onClick={() => onRead(announcement)}>{announcement.read_at ? 'Read' : 'Mark read'}</button></article>)}{!announcements.length && <div className="panel"><EmptyState title="No announcements yet" text="School-wide and class notices will appear here." /></div>}</div>
}

export default App
