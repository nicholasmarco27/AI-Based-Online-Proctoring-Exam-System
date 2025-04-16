// src/pages/admin/AdminDashboard.js
import React, { useState, useEffect } from 'react'; // Import useState and useEffect
import { Grid, Card, CardContent, Typography, Button, Box, Paper, Avatar, CircularProgress, Alert } from '@mui/material'; // Import CircularProgress and Alert
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api'; // Import your API client

// StatCard component remains the same
function StatCard({ title, value, icon, color }) {
    return (
        <Card elevation={2}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                     <Avatar sx={{ bgcolor: color, mr: 2 }}>
                        {icon}
                     </Avatar>
                    <Typography variant="h5" component="div">
                        {/* Display value or loading indicator */}
                        {value === 'N/A' || value === undefined || value === null ? '...' : value}
                    </Typography>
                </Box>
                <Typography color="text.secondary" sx={{ml: 7}}>
                    {title}
                </Typography>
            </CardContent>
        </Card>
    );
}

function AdminDashboard() {
    const navigate = useNavigate();

    // --- State for Stats, Loading, and Errors ---
    const [stats, setStats] = useState({
        totalExams: 'N/A',
        activeExams: 'N/A',
        totalStudents: 'N/A',
        recentSubmissions: 'N/A'
    });
    const [isLoading, setIsLoading] = useState(true); // Start loading initially
    const [error, setError] = useState(null);

    // --- Fetch Data on Component Mount ---
    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Call the new backend endpoint
                const response = await apiClient.get('/admin/dashboard/stats');
                setStats(response.data); // Update state with fetched data
            } catch (err) {
                console.error("Error fetching dashboard stats:", err);
                setError(err.response?.data?.message || err.message || 'Failed to load dashboard data.');
                // Keep placeholder N/A values on error, or set them to 'Error'
                setStats({
                    totalExams: 'Error',
                    activeExams: 'Error',
                    totalStudents: 'Error',
                    recentSubmissions: 'Error'
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []); // Empty dependency array means this runs once on mount

    return (
        <Box>
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Admin Dashboard
            </Typography>

            {/* Optional: Show Loading or Error for the whole stats section */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                    <CircularProgress />
                </Box>
            )}
            {error && !isLoading && (
                <Alert severity="error" sx={{ mb: 4 }}>
                    {error}
                </Alert>
            )}

            {/* Stat Cards Row - Using Fetched or Placeholder Data */}
            {!isLoading && ( // Render cards only when not loading (or show N/A if error)
                 <Grid container spacing={3} mb={4}>
                    <Grid item xs={12} sm={6} md={3}>
                        <StatCard title="Total Exams" value={stats.totalExams} icon={<AssessmentIcon />} color="primary.main" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                         <StatCard title="Active Exams" value={stats.activeExams} icon={<HourglassTopIcon />} color="warning.main" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                         <StatCard title="Total Students" value={stats.totalStudents} icon={<GroupIcon />} color="success.main" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                         {/* Updated title slightly for clarity */}
                         <StatCard title="Submissions (Last 24h)" value={stats.recentSubmissions} icon={<AssessmentIcon />} color="secondary.main" />
                    </Grid>
                </Grid>
            )}


            {/* Quick Actions (No changes needed here) */}
            <Paper elevation={1} sx={{ p: 2, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddCircleOutlineIcon />}
                    sx={{ mr: 2 }}
                    onClick={() => navigate('/admin/exams')}
                >
                    Manage Exams
                </Button>
                 {/* Add more buttons as needed */}
            </Paper>

            {/* Placeholder for other sections (No changes needed here) */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper elevation={1} sx={{ p: 2, height: '300px' }}>
                        <Typography variant="h6" gutterBottom>Exam Activity Overview</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80%', color: 'text.secondary' }}>
                            (Chart Placeholder)
                        </Box>
                    </Paper>
                </Grid>
                 <Grid item xs={12} md={6}>
                     <Paper elevation={1} sx={{ p: 2, height: '300px' }}>
                        <Typography variant="h6" gutterBottom>Recent Notifications</Typography>
                         <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80%', color: 'text.secondary' }}>
                            (Notification List Placeholder)
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

export default AdminDashboard;