// src/pages/student/StudentDashboard.js
import React, { useState, useEffect } from 'react'; // Added useState, useEffect
import { Grid, Card, CardContent, Typography, Box, List, ListItem, ListItemText, Divider, Paper, Chip, CircularProgress, Alert } from '@mui/material'; // Added CircularProgress, Alert
import EventIcon from '@mui/icons-material/Event';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AnnouncementIcon from '@mui/icons-material/Announcement';
// Removed: import { studentUpcomingExams, studentRecentResults } from '../../data'; // Remove static data import
import apiClient from '../../api'; // Import API client

// InfoCard component remains the same
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

function StudentDashboard() {
    const [dashboardData, setDashboardData] = useState({ upcomingExams: [], recentResults: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiClient.get('/student/dashboard');
                // Ensure response structure matches { upcomingExams: [], recentResults: [] }
                setDashboardData({
                    upcomingExams: response.data?.upcomingExams || [],
                    recentResults: response.data?.recentResults || []
                });
            } catch (err) {
                console.error("Fetch dashboard data error:", err);
                 if (err.response && err.response.status === 401) {
                     setError("Session expired. Please login again.");
                 } else {
                     setError(err.message || 'Failed to fetch dashboard data.');
                 }
                 setDashboardData({ upcomingExams: [], recentResults: [] }); // Reset data on error
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []); // Empty dependency array means run once on mount

    return (
        <Box>
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Student Dashboard
            </Typography>

            {/* Loading and Error States */}
            {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {!isLoading && !error && (
                <Grid container spacing={3}>
                    {/* Left Column */}
                    <Grid item xs={12} md={7}>
                        {/* Upcoming Exams */}
                        <InfoCard title="Upcoming Exams" icon={<EventIcon color="primary" />}>
                            {dashboardData.upcomingExams.length > 0 ? (
                                <List dense>
                                    {dashboardData.upcomingExams.map((exam, index) => (
                                        <React.Fragment key={exam.id}>
                                            <ListItem>
                                                <ListItemText
                                                    primary={exam.name}
                                                    secondary={`${exam.subject} - ${exam.date} at ${exam.time} (${exam.duration || 'N/A'} min)`}
                                                />
                                            </ListItem>
                                            {index < dashboardData.upcomingExams.length - 1 && <Divider component="li" />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>No upcoming exams scheduled.</Typography>
                            )}
                        </InfoCard>

                        {/* Recent Results */}
                        <InfoCard title="Recent Results" icon={<CheckCircleOutlineIcon color="success" />}>
                            {dashboardData.recentResults.length > 0 ? (
                                <List dense>
                                    {dashboardData.recentResults.map((result, index) => (
                                        <React.Fragment key={result.id}>
                                            <ListItem
                                                secondaryAction={
                                                    result.grade !== 'N/A' ? // Only show chip if grade exists
                                                    <Chip label={result.grade} color="primary" size="small" variant="outlined"/> : null
                                                }
                                            >
                                                <ListItemText
                                                    primary={result.name}
                                                    secondary={`${result.subject} - Taken: ${result.dateTaken || 'N/A'} | Score: ${result.score || 'N/A'}`}
                                                />
                                            </ListItem>
                                            {index < dashboardData.recentResults.length - 1 && <Divider component="li" />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>No recent results available.</Typography>
                            )}
                        </InfoCard>
                    </Grid>

                    {/* Right Column */}
                    <Grid item xs={12} md={5}>
                        {/* Announcements/Notifications - Still Static */}
                        <InfoCard title="Announcements" icon={<AnnouncementIcon color="warning" />}>
                            <Typography variant="body2" color="text.secondary" sx={{ml: 2}}>
                                - Remember to check the updated syllabus for Calculus I.
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ml: 2, mt: 1}}>
                                - System maintenance scheduled for Sunday 2 AM - 3 AM.
                            </Typography>
                        </InfoCard>

                        {/* Maybe Progress Overview - Still Placeholder */}
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