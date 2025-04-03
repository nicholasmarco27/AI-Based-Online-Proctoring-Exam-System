// src/pages/admin/AdminDashboard.js
import React from 'react'; // No need for useState/useEffect if not fetching stats
import { Grid, Card, CardContent, Typography, Button, Box, Paper, Avatar } from '@mui/material'; // Ensure Avatar is imported
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { useNavigate } from 'react-router-dom';
// Removed: import { adminStats } from '../../data'; // Remove static data import

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
                        {value}
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

    // Placeholder Stats - replace with fetched data if endpoint exists
    const placeholderStats = {
        totalExams: 'N/A', // Or 0
        activeExams: 'N/A', // Or 0
        totalStudents: 'N/A', // Or 0
        recentSubmissions: 'N/A' // Or 0
    };


    return (
        <Box>
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Admin Dashboard
            </Typography>

            {/* Stat Cards Row - Using Placeholder Data */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Total Exams" value={placeholderStats.totalExams} icon={<AssessmentIcon />} color="primary.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                     <StatCard title="Active Exams" value={placeholderStats.activeExams} icon={<HourglassTopIcon />} color="warning.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                     <StatCard title="Total Students" value={placeholderStats.totalStudents} icon={<GroupIcon />} color="success.main" />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                     <StatCard title="Recent Submissions (24h)" value={placeholderStats.recentSubmissions} icon={<AssessmentIcon />} color="secondary.main" />
                </Grid>
            </Grid>

            {/* Quick Actions */}
            <Paper elevation={1} sx={{ p: 2, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddCircleOutlineIcon />}
                    sx={{ mr: 2 }}
                    onClick={() => navigate('/admin/exams')} // Navigate to exam list
                >
                    Manage Exams
                </Button>
                 {/* Add more buttons as needed */}
            </Paper>

            {/* Placeholder for other sections */}
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