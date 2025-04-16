// src/pages/student/StudentProfile.js
import React, { useState, useEffect } from 'react';
import apiClient from '../../api';
import { useAuth } from '../../App';
import {
    Box,
    Typography,
    Avatar,
    IconButton,
    CircularProgress,
    Alert,
    Paper,
    useTheme,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Snackbar
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PersonIcon from '@mui/icons-material/Person';
import AbcIcon from '@mui/icons-material/Abc';
import LockIcon from '@mui/icons-material/Lock';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

function StudentProfile() {
    const { token } = useAuth();
    const [profileData, setProfileData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const theme = useTheme();

    // --- State for Modals and Updates ---
    const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateStatus, setUpdateStatus] = useState({ open: false, message: '', severity: 'info' });

    // --- Fetch Profile Data ---
    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            setError(null);
            // Keep previous data while loading new? Optional.
            // setProfileData(null);

            if (!token) {
                setError("Authentication token not found.");
                setIsLoading(false);
                return;
            }

            try {
                const response = await apiClient.get('/student/profile', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                setProfileData(response.data);
                setNewUsername(response.data.username || ''); // Pre-fill username modal input
            } catch (err) {
                console.error("Failed to fetch profile:", err);
                const errorMessage = err.response?.data?.message ||
                                   err.message ||
                                   "An error occurred while fetching profile data.";
                setError(errorMessage);
                 // Clear profile data on error?
                 setProfileData(null);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [token]);

    // --- Helper Function for Role Display ---
    const getDisplayRole = (role) => {
        if (role === 'student') {
            return 'Mahasiswa';
        }
        // Add other roles if needed
        return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'N/A';
    };

    // --- Modal Open/Close Handlers ---
    const handleOpenUsernameModal = () => {
        if (profileData) {
            setNewUsername(profileData.username);
        }
        setIsUsernameModalOpen(true);
    };

    const handleCloseUsernameModal = () => {
        setIsUsernameModalOpen(false);
    };

    const handleOpenPasswordModal = () => {
        setNewPassword('');
        setConfirmPassword('');
        setIsPasswordModalOpen(true);
    };

    const handleClosePasswordModal = () => {
        setIsPasswordModalOpen(false);
    };

    // --- Snackbar Close Handler ---
    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setUpdateStatus({ ...updateStatus, open: false });
    };


    // --- API Call Handlers ---

    // Handle Username Update
    const handleUpdateUsername = async () => {
        if (!newUsername || newUsername.trim().length < 3) {
            setUpdateStatus({ open: true, message: 'Username must be at least 3 characters long.', severity: 'warning' });
            return;
        }
        if (newUsername.trim() === profileData.username) {
            setUpdateStatus({ open: true, message: 'Username is the same. No changes made.', severity: 'info' });
            handleCloseUsernameModal();
            return;
        }

        setIsUpdating(true);
        setUpdateStatus({ open: false, message: '', severity: 'info' });

        try {
            const response = await apiClient.post('/student/profile/edit',
                { username: newUsername.trim() },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setProfileData(prevData => ({ ...prevData, username: response.data.user.username }));
            setUpdateStatus({ open: true, message: response.data.message || 'Username updated successfully!', severity: 'success' });
            handleCloseUsernameModal();

        } catch (err) {
            console.error("Failed to update username:", err);
            const errorMessage = err.response?.data?.message || "Failed to update username.";
            let detailedError = errorMessage;
            if (err.response?.data?.errors?.username) {
                 detailedError = `Username Error: ${err.response.data.errors.username}`;
            }
             setUpdateStatus({ open: true, message: detailedError, severity: 'error' });
        } finally {
            setIsUpdating(false);
        }
    };

    // Handle Password Update
    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            setUpdateStatus({ open: true, message: 'Password must be at least 6 characters long.', severity: 'warning' });
            return;
        }
        if (newPassword !== confirmPassword) {
             setUpdateStatus({ open: true, message: 'Passwords do not match.', severity: 'warning' });
            return;
        }

        setIsUpdating(true);
        setUpdateStatus({ open: false, message: '', severity: 'info' });

        try {
            const response = await apiClient.post('/student/profile/edit',
                { password: newPassword },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setUpdateStatus({ open: true, message: response.data.message || 'Password updated successfully!', severity: 'success' });
            handleClosePasswordModal();

        } catch (err) {
            console.error("Failed to update password:", err);
            const errorMessage = err.response?.data?.message || "Failed to update password.";
             let detailedError = errorMessage;
             if (err.response?.data?.errors?.password) {
                  detailedError = `Password Error: ${err.response.data.errors.password}`;
             }
            setUpdateStatus({ open: true, message: detailedError, severity: 'error' });
        } finally {
            setIsUpdating(false);
        }
    };


    // --- Render Logic ---
    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
                Account
            </Typography>

            {/* --- Loading State --- */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                    <CircularProgress />
                </Box>
            )}

            {/* --- Error State --- */}
            {error && !isLoading && (
                <Alert severity="error" sx={{ mt: 2 }}>Error: {error}</Alert>
            )}

            {/* --- >>> THIS IS THE TOP PROFILE DISPLAY SECTION <<< --- */}
            {profileData && !isLoading && !error && (
                <Paper elevation={0} sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: 'center',
                    bgcolor: 'grey.100', // Keep light grey background
                    borderRadius: 2,
                    mb: 4 // Add margin-bottom
                }}>
                    {/* Avatar Section */}
                    <Box sx={{ position: 'relative', mr: { sm: 3 }, mb: { xs: 2, sm: 0 } }}>
                         {/* Using initial as placeholder if no avatarUrl */}
                        <Avatar sx={{ width: { xs: 80, sm: 100, md: 120 }, height: { xs: 80, sm: 100, md: 120 }, background: `linear-gradient(45deg, #7b4dff 30%, #3da9fc 90%)`, color: '#fff', fontSize: '3rem' }}>
                            {profileData.username ? profileData.username.charAt(0).toUpperCase() : <PersonIcon fontSize="inherit"/>}
                        </Avatar>
                        {/* Placeholder for avatar upload */}
                        <IconButton size="small" sx={{ position: 'absolute', bottom: 5, right: 5, bgcolor: 'rgba(0, 0, 0, 0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.8)' } }} aria-label="upload picture" component="span" >
                            <PhotoCameraIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    {/* Text Section */}
                    <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                            {profileData.username || 'Loading...'}
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            {getDisplayRole(profileData.role) || 'Loading...'}
                        </Typography>
                    </Box>
                </Paper>
            )}
            {/* --- >>> END OF TOP PROFILE DISPLAY SECTION <<< --- */}


            {/* --- Personal Information Section --- */}
            {profileData && !isLoading && !error && (
                <Paper elevation={0} sx={{
                    p: { xs: 2, md: 3 },
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    border: `1px solid ${theme.palette.divider}`
                }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 'medium' }}>
                        Personal Information
                    </Typography>
                     <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Manage your account details.
                    </Typography>

                    <List disablePadding>
                        {/* --- Name Item --- */}
                        <ListItem disablePadding secondaryAction={ <ChevronRightIcon sx={{ color: 'action.active' }} /> } >
                            <ListItemButton onClick={handleOpenUsernameModal} sx={{ py: 1.5 }}>
                                <ListItemIcon sx={{ minWidth: 40 }}> <AbcIcon /> </ListItemIcon>
                                <ListItemText
                                    primary="Name"
                                    secondary={`Current: ${profileData.username}`}
                                />
                            </ListItemButton>
                        </ListItem>
                        <Divider component="li" />
                        {/* --- Password Item --- */}
                        <ListItem disablePadding secondaryAction={ <ChevronRightIcon sx={{ color: 'action.active' }} /> } >
                             <ListItemButton onClick={handleOpenPasswordModal} sx={{ py: 1.5 }}>
                                <ListItemIcon sx={{ minWidth: 40 }}> <LockIcon /> </ListItemIcon>
                                <ListItemText
                                    primary="Password"
                                    secondary="Change your password"
                                />
                            </ListItemButton>
                        </ListItem>
                    </List>
                </Paper>
            )}

            {/* --- MODALS --- */}

            {/* Edit Username Modal */}
            <Dialog open={isUsernameModalOpen} onClose={handleCloseUsernameModal} maxWidth="xs" fullWidth>
                {/* ... (DialogTitle, DialogContent with TextField, DialogActions with Buttons as before) ... */}
                 <DialogTitle>Edit Username</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="username"
                        label="New Username"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        disabled={isUpdating}
                        error={newUsername.length > 0 && newUsername.trim().length < 3}
                        helperText={newUsername.length > 0 && newUsername.trim().length < 3 ? "Minimum 3 characters" : ""}
                    />
                </DialogContent>
                <DialogActions sx={{ p: '16px 24px' }}>
                    <Button onClick={handleCloseUsernameModal} disabled={isUpdating} color="secondary">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdateUsername}
                        variant="contained"
                        disabled={isUpdating || !newUsername || newUsername.trim().length < 3 || newUsername.trim() === profileData?.username}
                        startIcon={isUpdating ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isUpdating ? 'Saving...' : 'Save Username'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Password Modal */}
            <Dialog open={isPasswordModalOpen} onClose={handleClosePasswordModal} maxWidth="xs" fullWidth>
                {/* ... (DialogTitle, DialogContent with TextFields, DialogActions with Buttons as before) ... */}
                 <DialogTitle>Change Password</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="new-password"
                        label="New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isUpdating}
                         error={newPassword.length > 0 && newPassword.length < 6}
                         helperText={newPassword.length > 0 && newPassword.length < 6 ? "Minimum 6 characters" : ""}
                    />
                    <TextField
                        margin="dense"
                        id="confirm-password"
                        label="Confirm New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isUpdating}
                        error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                        helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? "Passwords do not match" : ""}
                    />
                </DialogContent>
                <DialogActions sx={{ p: '16px 24px' }}>
                     <Button onClick={handleClosePasswordModal} disabled={isUpdating} color="secondary">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleUpdatePassword}
                        variant="contained"
                        disabled={isUpdating || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                        startIcon={isUpdating ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isUpdating ? 'Saving...' : 'Save Password'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* --- Snackbar for Feedback --- */}
            <Snackbar
                open={updateStatus.open}
                autoHideDuration={6000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={updateStatus.severity} sx={{ width: '100%' }}>
                    {updateStatus.message}
                </Alert>
            </Snackbar>

        </Box>
    );
}

export default StudentProfile;