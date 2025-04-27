// src/pages/admin/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Grid, Card, CardContent, Typography, Button, Box, Paper, Avatar,
    CircularProgress, Alert, List, ListItem, ListItemText, Divider, Tooltip, IconButton
} from '@mui/material';
// Import Icons
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AssessmentIcon from '@mui/icons-material/Assessment'; // Total Exams, Submissions
import GroupIcon from '@mui/icons-material/Group';           // Total Students
import HourglassTopIcon from '@mui/icons-material/HourglassTop'; // Active Exams
import NotificationsIcon from '@mui/icons-material/Notifications'; // Section Title
import EventNoteIcon from '@mui/icons-material/EventNote';       // Exam Submitted Notif
import CancelIcon from '@mui/icons-material/Cancel';           // Exam Cancelled Notif
import BarChartIcon from '@mui/icons-material/BarChart';         // Chart Section Title
import PersonAddIcon from '@mui/icons-material/PersonAdd';     // Manage Users Button
import GroupsIcon from '@mui/icons-material/Groups';           // Manage Groups Button
import { format } from 'date-fns'; // For formatting notification dates

import apiClient from '../../api'; // Pastikan path import benar

/**
 * Formats a date object or string into a more readable format.
 * Example: "Apr 27, 2025, 8:50 PM"
 * @param {Date|string|number} dateInput - The date to format.
 * @returns {string} - Formatted date string or 'N/A' if input is invalid.
 */
const formatSimpleDateTime = (dateInput) => {
  try {
    if (!dateInput) return 'N/A';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) throw new Error("Invalid Date");
    return format(date, "PPp"); // Format: Apr 27, 2025, 8:50:00 PM (Adjust format string as needed)
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date';
  }
};


// --- Reusable StatCard Component ---
function StatCard({ title, value, icon, color }) {
    return (
        <Card elevation={3} sx={{ height: '100%' }}> {/* Ensure consistent height */}
            <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                     <Avatar sx={{ bgcolor: color || 'primary.main', mr: 2, width: 48, height: 48 }}>
                        {/* Render icon with larger size */}
                        {React.cloneElement(icon, { sx: { fontSize: 28 }})}
                     </Avatar>
                    <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                        {/* Display value or loading dots */}
                        {value === 'N/A' || value === undefined || value === null ? '...' : value}
                    </Typography>
                </Box>
                <Typography color="text.secondary" sx={{ textAlign: 'right' /* Align title to right maybe? */ }}>
                    {title}
                </Typography>
            </CardContent>
        </Card>
    );
}

// --- Main AdminDashboard Component ---
function AdminDashboard() {
    const navigate = useNavigate();

    // State for Stats
    const [stats, setStats] = useState({
        totalExams: 'N/A', activeExams: 'N/A',
        totalStudents: 'N/A', recentSubmissions: 'N/A',
        totalGroups: 'N/A' // Tambah state untuk total groups
    });
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState(null);

    // State for Notifications
    const [notifications, setNotifications] = useState([]);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(true);
    const [notificationError, setNotificationError] = useState(null);

    // Combined Loading State (optional, for overall skeleton/indicator)
    const isLoading = isStatsLoading || isNotificationsLoading;

    // Fetch Data on Component Mount
    useEffect(() => {
        let isMounted = true; // Flag to prevent state update on unmounted component

        const fetchDashboardData = async () => {
            // Reset states before fetch
            setIsStatsLoading(true);
            setIsNotificationsLoading(true);
            setStatsError(null);
            setNotificationError(null);

            // --- Fetch Stats ---
            try {
                console.log("AdminDashboard: Fetching stats...");
                const statsResponse = await apiClient.get('/admin/dashboard/stats');
                if (isMounted) {
                    // Update state, providing defaults if fields are missing
                    setStats({
                        totalExams: statsResponse.data?.totalExams ?? 'N/A',
                        activeExams: statsResponse.data?.activeExams ?? 'N/A',
                        totalStudents: statsResponse.data?.totalStudents ?? 'N/A',
                        recentSubmissions: statsResponse.data?.recentSubmissions ?? 'N/A',
                        totalGroups: statsResponse.data?.totalGroups ?? 'N/A', // Ambil total groups
                    });
                    console.log("AdminDashboard: Stats fetched:", statsResponse.data);
                }
            } catch (err) {
                 console.error("Error fetching dashboard stats:", err);
                 if (isMounted) {
                    setStatsError(err.response?.data?.message || err.message || 'Failed to load dashboard stats.');
                    setStats({ totalExams: 'Err', activeExams: 'Err', totalStudents: 'Err', recentSubmissions: 'Err', totalGroups: 'Err' });
                 }
            } finally {
                if (isMounted) setIsStatsLoading(false);
            }

            // --- Fetch Notifications ---
            try {
                console.log("AdminDashboard: Fetching notifications...");
                const notificationsResponse = await apiClient.get('/admin/dashboard/notifications?limit=10'); // Ambil 10 terbaru
                if (isMounted) {
                    if (Array.isArray(notificationsResponse.data)) {
                        setNotifications(notificationsResponse.data);
                        console.log("AdminDashboard: Notifications fetched:", notificationsResponse.data);
                    } else {
                        console.error("Received invalid format for notifications:", notificationsResponse.data);
                        setNotifications([]);
                        setNotificationError("Invalid notification data received.");
                    }
                }
            } catch (err) {
                 console.error("Error fetching notifications:", err);
                 if (isMounted) {
                    setNotificationError(err.response?.data?.message || err.message || 'Failed to load notifications.');
                    setNotifications([]);
                 }
            } finally {
                if (isMounted) setIsNotificationsLoading(false);
            }
        };

        fetchDashboardData();

        // Cleanup function
        return () => { isMounted = false; };
    }, []); // Empty dependency array means run once on mount


    // Helper to get icon based on notification type
    const getNotificationIcon = (type) => {
        switch (type) {
            case 'exam_submitted': return <EventNoteIcon fontSize="small" color="success" sx={{mt: 0.5, mr: 1}} />;
            case 'exam_cancelled_proctoring': return <CancelIcon fontSize="small" color="error" sx={{mt: 0.5, mr: 1}} />;
            // Add other cases here
            default: return <NotificationsIcon fontSize="small" color="action" sx={{mt: 0.5, mr: 1}} />;
        }
    };

    return (
        <Box sx={{ p: 3 }}> {/* Add padding to the main container */}
            <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'medium' }}>
                Admin Dashboard
            </Typography>

            {/* --- Stats Section --- */}
            {/* Display overall loading/error for stats if desired */}
            {isStatsLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 4, minHeight: 100 }}>
                    <CircularProgress /> <Typography sx={{ml: 2}}>Loading Stats...</Typography>
                </Box>
            )}
            {statsError && !isStatsLoading && (
                <Alert severity="error" sx={{ mb: 4 }}>{statsError}</Alert>
            )}

            {/* Stat Cards Grid (Render even if there was an error, showing 'Err') */}
            {!isStatsLoading && (
                 <Grid container spacing={3} mb={4}>
                    <Grid item xs={12} sm={6} md={4} lg={2.4}> {/* Adjust grid size for 5 items */}
                        <StatCard title="Total Exams" value={stats.totalExams} icon={<AssessmentIcon />} color="primary.main" />
                    </Grid>
                     <Grid item xs={12} sm={6} md={4} lg={2.4}>
                         <StatCard title="Active Exams" value={stats.activeExams} icon={<HourglassTopIcon />} color="warning.main" />
                    </Grid>
                     <Grid item xs={12} sm={6} md={4} lg={2.4}>
                         <StatCard title="Total Students" value={stats.totalStudents} icon={<GroupIcon />} color="info.main" />
                    </Grid>
                     <Grid item xs={12} sm={6} md={4} lg={2.4}>
                         {/* Tambahkan StatCard untuk Total Groups */}
                         <StatCard title="Total Groups" value={stats.totalGroups} icon={<GroupsIcon />} color="success.main" />
                     </Grid>
                     <Grid item xs={12} sm={6} md={4} lg={2.4}>
                         <StatCard title="Recent Submits (24h)" value={stats.recentSubmissions} icon={<AssessmentIcon />} color="secondary.main" />
                    </Grid>
                </Grid>
            )}

            {/* --- Quick Actions Section --- */}
            <Paper elevation={2} sx={{ p: 2, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}> {/* Use flexbox for button layout */}
                    <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => navigate('/admin/exams/new')}> Create New Exam </Button>
                    <Button variant="outlined" startIcon={<AssessmentIcon />} onClick={() => navigate('/admin/exams')}> Manage Exams </Button>
                    <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => navigate('/admin/usergroups')}> Manage Students </Button> {/* Asumsi user mgmt ada di usergroups */}
                    <Button variant="outlined" startIcon={<GroupsIcon />} onClick={() => navigate('/admin/usergroups')}> Manage Groups </Button>
                </Box>
            </Paper>

            {/* --- Other Sections (Notifications and Chart Placeholder) --- */}
            <Grid container spacing={3}>
                {/* Notifications Panel */}
                <Grid item xs={12} md={6}>
                     <Paper elevation={2} sx={{ p: 2, height: { xs: 400, md: 350 } /* Sesuaikan tinggi */, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                            <NotificationsIcon color="action" sx={{mr: 1}}/>
                            <Typography variant="h6">Recent Notifications</Typography>
                        </Box>
                        <Divider sx={{mb: 1}}/>
                        <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1 /* Padding kanan agar scrollbar tidak menempel */ }}>
                            {isNotificationsLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress size={30} />
                                </Box>
                            ) : notificationError ? (
                                <Alert severity="warning" sx={{m: 1, fontSize: '0.9rem'}}>{notificationError}</Alert> // Warning jika notif gagal load
                            ) : notifications.length > 0 ? (
                                <List dense disablePadding>
                                    {notifications.map((notif) => (
                                        <ListItem key={notif.id} divider sx={{ alignItems: 'flex-start', py: 0.8 }}>
                                            <Box sx={{ mr: 1.5, mt: 0.5 }}>{getNotificationIcon(notif.type)}</Box> {/* Tampilkan icon sesuai tipe */}
                                            <ListItemText
                                                primary={
                                                    <Typography variant="body2" sx={{lineHeight: 1.3}}>
                                                        {notif.message} {/* Tampilkan pesan yg sudah diformat backend */}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Typography variant="caption" color="text.secondary">
                                                        {formatSimpleDateTime(notif.timestamp)} {/* Format tanggal simpel */}
                                                    </Typography>
                                                }
                                                sx={{ my: 0 }}
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'text.secondary' }}>
                                    <Typography variant="body2">No recent notifications.</Typography>
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                {/* Chart Placeholder */}
                 <Grid item xs={12} md={6}>
                     <Paper elevation={2} sx={{ p: 2, height: { xs: 300, md: 350 } }}>
                        <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                             <BarChartIcon color="action" sx={{mr: 1}}/>
                            <Typography variant="h6">Exam Activity Overview</Typography>
                        </Box>
                         <Divider sx={{mb: 1}}/>
                         <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80%', color: 'text.secondary' }}>
                            <Typography variant="body2">(Chart Placeholder - To be implemented)</Typography>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

export default AdminDashboard;