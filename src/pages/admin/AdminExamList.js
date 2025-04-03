// src/pages/admin/AdminExamList.js
import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Chip, Tooltip, TextField, InputAdornment, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, CircularProgress, Alert } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api';

// Helper to format ISO date string for display (or show 'N/A')
const formatDisplayDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString(); // Use user's locale settings
    } catch (e) {
        return 'Invalid Date';
    }
};

// Define getStatusChip properly
const getStatusChip = (status) => {
    let color = 'default';
    if (status === 'Published') color = 'success';
    if (status === 'Draft') color = 'warning';
    if (status === 'Archived') color = 'secondary';
    return <Chip label={status} color={color} size="small" sx={{ fontWeight: 500 }} />;
};

function AdminExamList() {
    const navigate = useNavigate();
    const [exams, setExams] = useState([]);
    const [filteredExams, setFilteredExams] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // Start loading
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [examToDelete, setExamToDelete] = useState(null);
    const [deleteError, setDeleteError] = useState(null);

    // --- Fetch Exams Effect ---
    useEffect(() => {
        // --- Replace the commented-out line with this actual function ---
        const fetchExams = async () => {
            console.log("AdminExamList: useEffect running, attempting to fetch exams..."); // DEBUGGING
            setIsLoading(true); // Make sure loading is true at the start
            setError(null);
            try {
                const response = await apiClient.get('/admin/exams'); // API Call
                console.log("AdminExamList: API Response Received:", response.data); // DEBUGGING
                setExams(response.data || []);
                setFilteredExams(response.data || []);
                setError(null);
            } catch (err) {
                console.error("AdminExamList: Fetch exams error:", err);
                let errorMessage = err.message || 'Failed to fetch exams.';
                 if (err.response) {
                     errorMessage = `(${err.response.status}) ${err.response.data?.message || errorMessage}`;
                     if (err.response.status === 401 || err.response.status === 403) {
                         errorMessage += " Please check login/permissions.";
                     }
                 }
                 setError(errorMessage);
                 setExams([]);
                 setFilteredExams([]);
            } finally {
                // --- CRITICAL: Set loading to false ---
                console.log("AdminExamList: Fetch attempt finished, setting isLoading=false"); // DEBUGGING
                setIsLoading(false);
            }
        };
        // --- End of function definition ---

        fetchExams(); // Call the function

    }, []); // Empty array means run once on mount

    // --- Filter Effect ---
     useEffect(() => {
        // --- Replace the commented-out line with this actual filtering logic ---
        const lowerSearchTerm = searchTerm.toLowerCase();
        setFilteredExams(
            exams.filter(exam =>
                (exam.name && exam.name.toLowerCase().includes(lowerSearchTerm)) ||
                (exam.subject && exam.subject.toLowerCase().includes(lowerSearchTerm)) ||
                (exam.status && exam.status.toLowerCase().includes(lowerSearchTerm)) // Optionally filter by status too
            )
        );
        // --- End of filtering logic ---
    }, [searchTerm, exams]); // Re-run when search term or original exams list changes

    // --- Handlers (handleCreateExam, handleEdit, etc.) ---
    // These were already mostly correct in your file
    const handleCreateExam = () => { navigate('/admin/exams/new'); };
    const handleEdit = (id) => { navigate(`/admin/exams/${id}/edit`); };
    const handleDeleteClick = (exam) => { /* ... same as before ... */ setExamToDelete(exam); setDeleteError(null); setShowDeleteConfirm(true); };
    const handleConfirmDelete = async () => { /* ... same as before ... */
         if (!examToDelete) return;
         setDeleteError(null);
         try {
             await apiClient.delete(`/admin/exams/${examToDelete.id}`);
             setExams(prevExams => prevExams.filter(e => e.id !== examToDelete.id));
             setShowDeleteConfirm(false);
             setExamToDelete(null);
         } catch (err) {
             console.error("Delete error:", err);
             setDeleteError(err.response?.data?.message || err.message || "Failed to delete exam.");
         }
     };
    const handleViewResults = (id) => { console.log("View results (NI):", id); };

    // --- Render ---
    return (
        <Paper sx={{ p: 3, borderRadius: 2 }} elevation={2}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                 <Typography variant="h4">Exams Management</Typography>
                 <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={handleCreateExam} sx={{ borderRadius: 2 }}>Create New Exam</Button>
            </Box>
            {/* Search Bar */}
             <Box display="flex" alignItems="center" mb={3}>
                 <TextField
                     variant="outlined" size="small" placeholder="Search Exams (Name, Subject, Status)..." value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)} // Connect onChange
                     InputProps={{
                         startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>),
                         sx: { borderRadius: 2, backgroundColor: 'background.paper' }
                     }}
                     sx={{ flexGrow: 1, mr: 2 }}
                 />
            </Box>

            {/* Loading State */}
            {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>}

            {/* Error State */}
            {error && !isLoading && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Table - Render ONLY if NOT loading AND NO fetch error */}
            {!isLoading && !error && (
                <TableContainer>
                    <Table sx={{ minWidth: 900 }} aria-label="exam table">
                        <TableHead sx={{ backgroundColor: 'action.hover' }}>
                             <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>Exam Name</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Subject</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Duration (min)</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                {/* --- Add New Columns --- */}
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Attempts</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                             </TableRow>
                        </TableHead>
                        <TableBody>
                        {filteredExams.length > 0 ? filteredExams.map((exam) => (
                                <TableRow key={exam.id} sx={{ '&:hover': { backgroundColor: 'action.selected' } }}>
                                    <TableCell component="th" scope="row">{exam.name}</TableCell>
                                    <TableCell>{exam.subject}</TableCell>
                                    <TableCell align="right">{exam.duration ? `${exam.duration} min` : 'N/A'}</TableCell>
                                    <TableCell>{getStatusChip(exam.status)}</TableCell>
                                    {/* --- Display New Data --- */}
                                    <TableCell align="right">{exam.allowed_attempts}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Edit Exam"><IconButton size="small" onClick={() => handleEdit(exam.id)} aria-label="edit" color="primary"><EditIcon fontSize="small" /></IconButton></Tooltip>
                                        <Tooltip title="View Results (NI)"><IconButton size="small" onClick={() => handleViewResults(exam.id)} aria-label="view results" color="info" sx={{ ml: 0.5 }}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                                        <Tooltip title="Delete Exam"><IconButton size="small" color="error" onClick={() => handleDeleteClick(exam)} aria-label="delete" sx={{ ml: 0.5 }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">No exams found.</TableCell> {/* Updated colSpan */}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

             {/* Delete Confirmation Dialog */}
             <Dialog open={showDeleteConfirm} onClose={() => { if (!deleteError) setShowDeleteConfirm(false); }}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure you want to delete the exam "{examToDelete?.name}"? This action cannot be undone.</DialogContentText>
                    {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} color="primary">Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default AdminExamList;