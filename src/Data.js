// src/data.js

export const adminStats = {
    totalExams: 58,
    activeExams: 5,
    totalStudents: 250,
    recentSubmissions: 15,
  };
  
  export const adminExams = [
    { id: 1, name: 'Midterm - Calculus I', subject: 'Mathematics', duration: 60, status: 'Published', startDate: '2024-08-15', students: 45 },
    { id: 2, name: 'Introduction to Programming Quiz', subject: 'Computer Science', duration: 30, status: 'Draft', startDate: null, students: 0 },
    { id: 3, name: 'World History: Ancient Civilizations', subject: 'History', duration: 90, status: 'Published', startDate: '2024-08-10', students: 38 },
    { id: 4, name: 'Chemistry Lab Safety', subject: 'Science', duration: 20, status: 'Archived', startDate: '2024-05-20', students: 50 },
    { id: 5, name: 'Advanced English Grammar', subject: 'Language Arts', duration: 45, status: 'Published', startDate: '2024-08-12', students: 33 },
  ];
  
  export const studentUpcomingExams = [
      { id: 1, name: 'Midterm - Calculus I', subject: 'Mathematics', date: '2024-08-15', time: '10:00 AM', duration: 60},
      { id: 3, name: 'World History: Ancient Civilizations', subject: 'History', date: '2024-08-10', time: '02:00 PM', duration: 90},
  ];
  
  export const studentRecentResults = [
      { id: 6, name: 'Basic Algebra Quiz', subject: 'Mathematics', dateTaken: '2024-07-28', score: '85%', grade: 'B'},
      { id: 7, name: 'Literary Devices Test', subject: 'Language Arts', dateTaken: '2024-07-25', score: '92%', grade: 'A-'},
  ];
  
  export const studentAvailableExams = [
    { id: 1, name: 'Midterm - Calculus I', subject: 'Mathematics', duration: 60, availableFrom: '2024-08-15 09:00', availableTo: '2024-08-15 17:00', attemptsTaken: 0, attemptsAllowed: 1, status: 'Upcoming' }, // Status drives button state
    { id: 3, name: 'World History: Ancient Civilizations', subject: 'History', duration: 90, availableFrom: '2024-08-10 09:00', availableTo: '2024-08-11 23:59', attemptsTaken: 0, attemptsAllowed: 1, status: 'Available' },
    { id: 8, name: 'Physics Quick Check', subject: 'Science', duration: 15, availableFrom: '2024-08-01 00:00', availableTo: '2024-08-30 23:59', attemptsTaken: 1, attemptsAllowed: 2, status: 'Available' },
    { id: 9, name: 'Final Project Idea Submission', subject: 'Computer Science', duration: null, availableFrom: '2024-08-05 00:00', availableTo: '2024-08-20 23:59', attemptsTaken: 1, attemptsAllowed: 1, status: 'Completed' },
  ];
  
  // Add more static data as needed (users, questions etc.)