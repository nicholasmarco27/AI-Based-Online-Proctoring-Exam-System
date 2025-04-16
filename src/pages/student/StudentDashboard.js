// src/pages/student/StudentDashboard.js
import React, { useState, useEffect } from 'react';
import {
    Grid, Card, CardContent, Typography, Box, List, ListItem, ListItemText,
    Divider, Paper, Chip, CircularProgress, Alert, Button // Added Button if needed later
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import apiClient from '../../api'; // Import your API client

// Helper Component: InfoCard
function InfoCard({ title, icon, children }) {
    return (
         <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {icon}
                <Typography variant="h6" sx={{ ml: 1 }}>{title}</Typography>
            </Box>
            {children}
        </Paper>
    );
}

// Main Component: StudentDashboard
function StudentDashboard() {
    // --- State Variables ---
    // Initialize state correctly within the component function
    const [dashboardData, setDashboardData] = useState({ upcomingExams: [], recentResults: [] });
    const [isLoading, setIsLoading] = useState(true); // Start loading initially
    const [error, setError] = useState(null);
    const navigate = useNavigate(); // Initialize navigate

    // --- Fetch Data Effect ---
    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true); // Set loading true at the start of fetch
            setError(null);     // Clear previous errors
            try {
                // Make API call to the backend endpoint
                const response = await apiClient.get('/student/dashboard');

                // Validate and set data, ensuring arrays exist even if backend sends null/undefined
                setDashboardData({
                    upcomingExams: response.data?.upcomingExams || [],
                    recentResults: response.data?.recentResults || []
                });

            } catch (err) {
                console.error("Fetch dashboard data error:", err);
                 // Handle specific errors like unauthorized or general errors
                 if (err.response && err.response.status === 401) {
                     setError("Your session may have expired. Please log in again.");
                     // Optionally redirect to login: navigate('/login');
                 } else {
                     setError(err.response?.data?.message || err.message || 'Failed to fetch dashboard data.');
                 }
                 // Reset data on error to avoid showing stale data
                 setDashboardData({ upcomingExams: [], recentResults: [] });
            } finally {
                // Always set loading to false after fetch attempt (success or failure)
                setIsLoading(false);
            }
        };

        fetchDashboardData(); // Call the fetch function
    }, []); // Empty dependency array: run this effect only once when the component mounts

    // --- Render Logic ---
    return (
        <Box>
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Student Dashboard
            </Typography>

            {/* 1. Loading State */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 5 }}>
                    <CircularProgress />
                    <Typography sx={{ ml: 2 }}>Loading dashboard...</Typography>
                </Box>
            )}

            {/* 2. Error State */}
            {!isLoading && error && ( // Show error only if not loading
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {/* 3. Success State (Data Loaded) */}
            {!isLoading && !error && (
                <Grid container spacing={3}>
                    {/* Left Column: Exams and Results */}
                    <Grid item xs={12} md={7}>
                        {/* Upcoming Exams Section */}
                        <InfoCard title="Upcoming Exams" icon={<EventIcon color="primary" />}>
                            {dashboardData.upcomingExams.length > 0 ? (
                                <List dense>
                                    {dashboardData.upcomingExams.map((exam, index) => (
                                        <React.Fragment key={exam.id}>
                                            <ListItem
                                                secondaryAction={
                                                    // Optional: Add a button to start the exam
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        onClick={() => navigate(`/student/exam/${exam.id}/take`)}
                                                    >
                                                        Start Exam
                                                    </Button>
                                                }
                                            >
                                                <ListItemText
                                                    primary={exam.name}
                                                    secondary={`${exam.subject} (${exam.duration || 'N/A'} min) - Attempts left: ${exam.attempts_left}/${exam.total_attempts}`}
                                                />
                                            </ListItem>
                                            {index < dashboardData.upcomingExams.length - 1 && <Divider component="li" variant="middle" />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ ml: 2, fontStyle: 'italic' }}>
                                    No upcoming exams you can take right now.
                                </Typography>
                            )}
                        </InfoCard>

                        {/* Recent Results Section */}
                        <InfoCard title="Recent Results" icon={<CheckCircleOutlineIcon color="success" />}>
                            {dashboardData.recentResults.length > 0 ? (
                                <List dense>
                                    {dashboardData.recentResults.map((result, index) => (
                                        <React.Fragment key={result.submission_id}>
                                            <ListItem
                                                secondaryAction={
                                                    result.grade !== 'N/A' ?
                                                    <Chip label={result.grade} color="primary" size="small" variant="outlined"/> : null
                                                }
                                            >
                                                <ListItemText
                                                    primary={result.name}
                                                    secondary={`${result.subject} - Taken: ${result.dateTaken || 'N/A'} | Score: ${result.score || 'N/A'} (${result.correct_answers}/${result.total_questions})`}
                                                />
                                                 {/* Optional: Add button to review results */}
                                                 {/* <Button size="small" variant="text">Review</Button> */}
                                            </ListItem>
                                            {index < dashboardData.recentResults.length - 1 && <Divider component="li" variant="middle" />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ ml: 2, fontStyle: 'italic' }}>
                                    No recent results available.
                                </Typography>
                            )}
                        </InfoCard>
                    </Grid>

                    {/* Right Column: Announcements & Placeholders */}
                    <Grid item xs={12} md={5}>
                        {/* Announcements/Notifications (Still Static Example) */}
                        <InfoCard title="Announcements" icon={<AnnouncementIcon color="warning" />}>
                            <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>
                                - Remember to check the updated syllabus for Calculus I.
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ml: 2, mt: 1}}>
                                - System maintenance scheduled for Sunday 2 AM - 3 AM.
                            </Typography>
                            {/* Add more static or dynamic announcements here */}
                        </InfoCard>

                        {/* Progress Overview (Placeholder) */}
                        <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                            <Typography variant="h6" gutterBottom>My Progress</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '150px', color: 'text.secondary' }}>
                                (Progress Chart/Stats Placeholder)
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
             )}
        </Box>
    );
}

export default StudentDashboard;