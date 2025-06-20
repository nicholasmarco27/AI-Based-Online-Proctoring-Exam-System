// src/App.js
import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Import Layouts
import AdminLayout from './layouts/AdminLayout';
import StudentLayout from './layouts/StudentLayout';

// Import Page Components
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminExamList from './pages/admin/AdminExamList';
import ExamForm from './pages/admin/ExamForm';
import ExamResultAdm from './pages/admin/ExamResultAdm';
import UserManagement from './pages/admin/UserManagement'; // This is for User Groups / Classes
import UserListPage from './pages/admin/UserListPage';   // <-- IMPORT THE NEW USER LIST PAGE

import StudentDashboard from './pages/student/StudentDashboard';
import StudentAvailableExams from './pages/student/StudentAvailableExams';
import ExamTakingInterface from './pages/student/ExamTakingInterface';
import ExamSubmittedPage from './pages/student/ExamSubmittedPage';
import StudentProfile from './pages/student/StudentProfile';

// Optional: Placeholder for a generic loading component
// import LoadingSpinner from './components/LoadingSpinner';
// Optional: Placeholder for a 404 component
// import NotFoundPage from './components/NotFoundPage';

// Import utility for decoding JWT
import { jwtDecode } from 'jwt-decode'; // Use named import

// --- Authentication Context ---
// 1. Create Auth Context
const AuthContext = createContext(null);

// 2. Custom hook to use auth context easily
export const useAuth = () => {
    return useContext(AuthContext);
};
// --- End Authentication Context ---


function App() {
  // --- Authentication State ---
  const [authState, setAuthState] = useState({
      token: localStorage.getItem('authToken') || null, // Get token from storage on load
      role: null,
      isAuthenticated: false,
      isLoading: true, // Start in loading state until token is verified
  });

  // --- Effect to Verify Token on Initial Load ---
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) {
          try {
              // Decode token to get role and expiration
              const decoded = jwtDecode(token);
              // Check if token is expired
              if (decoded.exp * 1000 > Date.now()) {
                  // Token is valid and not expired
                  setAuthState({
                      token: token,
                      role: decoded.role, // Get role from token payload
                      isAuthenticated: true,
                      isLoading: false, // Finished loading
                  });
              } else {
                  // Token expired
                  console.log("Auth token expired");
                  localStorage.removeItem('authToken'); // Clear expired token
                   setAuthState({ token: null, role: null, isAuthenticated: false, isLoading: false }); // Update state
              }
          } catch (error) {
              // Invalid token format
              console.error("Invalid token:", error);
              localStorage.removeItem('authToken'); // Clear invalid token
              setAuthState({ token: null, role: null, isAuthenticated: false, isLoading: false }); // Update state
          }
      } else {
          // No token found in storage
          setAuthState({ token: null, role: null, isAuthenticated: false, isLoading: false }); // Finished loading
      }
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Authentication Handler Functions ---
  const handleLogin = (token, role) => {
      localStorage.setItem('authToken', token); // Store token
      setAuthState({
          token: token,
          role: role,
          isAuthenticated: true,
          isLoading: false, // Ensure loading is false after login
      });
      // Navigation will happen automatically based on state change in Routes
  };

  const handleLogout = () => {
      localStorage.removeItem('authToken'); // Clear token
      setAuthState({
          token: null,
          role: null,
          isAuthenticated: false,
          isLoading: false, // Ensure loading is false after logout
      });
      // No need to navigate here, route checks will redirect to /login
  };
  // --- End Authentication Handler Functions ---


  // --- Protected Route Component ---
  // Wraps routes that require authentication and role checks
  const ProtectedRoute = ({ allowedRoles }) => {
      // Get current auth state from context
      const { isAuthenticated, role, isLoading } = useAuth();

      // Show loading indicator while checking auth status
      if (isLoading) {
          // Replace with a more visually appealing loading component if desired
          return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Authentication...</div>;
      }

      // If not authenticated, redirect to login page
      if (!isAuthenticated) {
          return <Navigate to="/login" state={{ from: window.location.pathname }} replace />; // Pass original location
      }

      // If route requires specific roles and user doesn't have one, redirect
      if (allowedRoles && !allowedRoles.includes(role)) {
          // Redirect to their appropriate dashboard (prevent access to wrong role's pages)
          console.warn(`User with role '${role}' tried to access route restricted to roles: ${allowedRoles}`);
          return <Navigate to={role === 'admin' ? '/admin' : '/student'} replace />;
      }

      // User is authenticated and has the correct role (or no specific role required)
      // Render the correct layout (which contains <Outlet /> for nested routes)
      // Pass the logout handler down to the layout
      return role === 'admin'
            ? <AdminLayout onLogout={handleLogout} />
            : <StudentLayout onLogout={handleLogout} />;
  };
  // --- End Protected Route Component ---


  // --- Global Loading State ---
  // Show a global loading indicator until the initial token check is complete
  if (authState.isLoading) {
    // Replace with a proper loading screen/spinner component for better UX
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Application...</div>;
  }


  // --- Render Application ---
  return (
    // 3. Provide the authentication state and functions to the rest of the app
    <AuthContext.Provider value={{ ...authState, login: handleLogin, logout: handleLogout }}>
      <Router>
        <Routes>
          {/* --- Public Routes (Accessible without login) --- */}
          <Route
            path="/login"
            // If already authenticated, redirect away from login page
            element={!authState.isAuthenticated ? <LoginPage /> : <Navigate to={authState.role === 'admin' ? '/admin' : '/student'} replace />}
          />
          <Route
              path="/signup"
              // If already authenticated, redirect away from signup page
              element={!authState.isAuthenticated ? <SignUpPage /> : <Navigate to={authState.role === 'admin' ? '/admin' : '/student'} replace />}
          />


          {/* --- Protected Admin Routes --- */}
          {/* All routes inside here require the user to be authenticated and have the 'admin' role */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']} />}>
              {/* Nested routes render inside AdminLayout's <Outlet /> */}
              <Route index element={<AdminDashboard />} /> {/* Default page for /admin */}
              <Route path="exams" element={<AdminExamList />} /> {/* Exam list page */}
              <Route path="exams/new" element={<ExamForm />} /> {/* Create new exam */}
              <Route path="exams/:examId/edit" element={<ExamForm />} /> {/* Edit existing exam */}
              <Route path="exams/:examId/results" element={<ExamResultAdm />} /> {/* View results for a specific exam */}
              <Route path="exams/:examId/results/:submissionId" element={<ExamResultAdm />} /> {/* View results for a specific submission */}
              <Route path="usergroups" element={<UserManagement />} /> {/* This is for managing Classes/Groups */}
              <Route path="users" element={<UserListPage />} /> {/* <-- ADDED ROUTE FOR USER LIST PAGE */}
              {/* Add other admin-specific routes here */}
              {/* Catch-all for any undefined paths under /admin */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>


          {/* --- Protected Student Routes --- */}
           {/* All routes inside here require the user to be authenticated and have the 'student' role */}
          <Route path="/student" element={<ProtectedRoute allowedRoles={['student']} />}>
              {/* Nested routes render inside StudentLayout's <Outlet /> */}
              <Route index element={<StudentDashboard />} /> {/* Default page for /student */}
              <Route path="exams" element={<StudentAvailableExams />} /> {/* List available exams */}
              <Route path="take-exam/:examId" element={<ExamTakingInterface />} />
              <Route path="exam/:examId/submitted" element={<ExamSubmittedPage />} />
              <Route path="profile" element={<StudentProfile />} />
              {/* Add other student-specific routes here */}
              {/* Catch-all for any undefined paths under /student */}
              <Route path="*" element={<Navigate to="/student" replace />} />
          </Route>


          {/* --- Default Redirect Logic (for the root path "/") --- */}
          <Route
            path="/"
            element={
              // If authenticated, redirect to the appropriate dashboard based on role
              authState.isAuthenticated ? (
                <Navigate to={authState.role === 'admin' ? '/admin' : '/student'} replace />
              ) : (
                // If not authenticated, redirect to the login page
                <Navigate to="/login" replace />
              )
            }
          />

           {/* Optional: A generic 404 Not Found page for completely unhandled top-level routes */}
           {/* This would typically render outside the AuthContext provider if it doesn't need auth state */}
           {/* <Route path="*" element={<NotFoundPage />} /> */}

        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;