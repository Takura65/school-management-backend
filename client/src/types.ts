export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT'

export interface User {
  id: number
  name: string
  email: string
  role: Role
}

export interface Student {
  student_id: number
  user_id: number
  name: string
  email: string
  roll_no: string
  dob: string
  parent_name?: string | null
  parent_email?: string | null
  parent_contact?: string | null
  contact_number?: string | null
  class_name?: string | null
  section?: string | null
}

export interface Teacher {
  teacher_id: number
  user_id: number
  name: string
  email: string
  qualification?: string | null
  experience_years: number
  contact_number?: string | null
}

export interface ClassRoom {
  id: number
  class_name: string
  section: string
  student_count: number
  subjects: Array<{ id: number; name: string }>
}

export interface Subject {
  id: number
  subject_name: string
  teacher_id?: number | null
  teacher_name?: string | null
}

export interface AttendanceRecord {
  id?: number
  student_id: number
  student_name: string
  roll_no: string
  attendance_date: string
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
}

export interface Examination {
  id: number
  title: string
  exam_date: string
  max_marks: number
  class_name?: string | null
  section?: string | null
  subject_name?: string | null
}

export interface ExamResult {
  id: number
  examination_id: number
  student_id: number
  marks_obtained: number
  max_marks: number
  percentage: number
  grade: string
  remarks?: string | null
  title: string
  exam_date: string
  roll_no: string
  student_name: string
  subject_name?: string | null
}

export interface Fee {
  id: number
  student_id: number
  student_name: string
  roll_no: string
  fee_type: string
  amount: number
  due_date?: string | null
  status: 'PENDING' | 'PAID' | 'OVERDUE'
  receipt_number?: string | null
}

export interface DashboardData {
  totals: { students: number; teachers: number; classes: number }
  attendancePercentage: number
  upcomingExaminations: Examination[]
  fees: { collected: number; outstanding: number }
}

export interface TimetableSlot {
  id: number
  class_id: number
  class_name: string
  section: string
  subject_id: number
  subject_name: string
  teacher_id?: number | null
  teacher_name?: string | null
  weekday: number
  starts_at: string
  ends_at: string
  room?: string | null
}

export interface Announcement {
  id: number
  title: string
  body: string
  category: 'GENERAL' | 'ACADEMIC' | 'EVENT' | 'URGENT'
  class_id?: number | null
  created_at: string
  author?: string | null
  read_at?: string | null
}