// src/pages/admin/AdminExamList.js
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, TableContainer, Table, TableHead, TableRow, TableCell,
    TableBody, IconButton, Chip, Tooltip, TextField, InputAdornment, Dialog, DialogTitle,
    DialogContent, DialogContentText, DialogActions, CircularProgress, Alert,
    Stack, useTheme,
    // No Divider needed for this style
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add'; // Use AddIcon for the button
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api';

// Helper function (remains the same)
const formatDisplayDateTime = (isoString) => {
    // ... (implementation unchanged)
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString();
    } catch (e) {
        return 'Invalid Date';
    }
};

// Status Chip function - Updated Styling
const getStatusChip = (status) => {
    let chipStyles = {
        bgcolor: 'default',
        color: 'text.primary',
        fontWeight: 400, // Bolder text
        borderRadius: '16px', // Pill shape
        height: '26px', // Adjust height if needed
        minWidth: '85px',
        textTransform: 'capitalize', // Ensure consistent casing display
    };

    switch (status?.toLowerCase()) {
        case 'published':
            chipStyles.bgcolor = '#2e7d32'; // Green (matching MUI Success dark)
            chipStyles.color = '#fff';
            break;
        case 'draft':
            chipStyles.bgcolor = '#ed6c02'; // Orange (matching MUI Warning dark)
            chipStyles.color = '#fff';
            break;
        case 'archived':
            chipStyles.bgcolor = '#d32f2f'; // Red (matching MUI Error dark)
            chipStyles.color = '#fff';
            break;
        default:
            chipStyles.bgcolor = 'grey.300';
            chipStyles.color = 'text.secondary';
            break;
    }

    return <Chip label={status || 'Unknown'} sx={chipStyles} size="small" />;
};


function AdminExamList() {
    const navigate = useNavigate();
    const theme = useTheme();
    const [exams, setExams] = useState([]);
    const [filteredExams, setFilteredExams] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [examToDelete, setExamToDelete] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // --- Fetch Exams Effect (logic unchanged) ---
    useEffect(() => {
        const fetchExams = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiClient.get('/admin/exams');
                const fetchedExams = Array.isArray(response.data) ? response.data : [];
                setExams(fetchedExams);
                setFilteredExams(fetchedExams);
                setError(null);
            } catch (err) {
                console.error("AdminExamList: Fetch exams error:", err);
                 let errorMessage = err.message || 'Failed to fetch exams.';
                 if (err.response) {
                     errorMessage = `(${err.response.status}) ${err.response.data?.message || errorMessage}`;
                 }
                 setError(errorMessage);
                 setExams([]);
                 setFilteredExams([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchExams();
    }, []);

    // --- Filter Effect (logic unchanged) ---
     useEffect(() => {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        if (!lowerSearchTerm) {
            setFilteredExams(exams);
            return;
        }
        setFilteredExams(
            exams.filter(exam =>
                (exam.name && exam.name.toLowerCase().includes(lowerSearchTerm)) ||
                (exam.subject && exam.subject.toLowerCase().includes(lowerSearchTerm)) ||
                (exam.status && exam.status.toLowerCase().includes(lowerSearchTerm))
            )
        );
    }, [searchTerm, exams]);

    // --- Handlers (logic unchanged) ---
    const handleCreateExam = () => { navigate('/admin/exams/new'); };
    const handleEdit = (id) => { navigate(`/admin/exams/${id}/edit`); };
    const handleDeleteClick = (exam) => {
        setExamToDelete(exam);
        setDeleteError(null);
        setIsDeleting(false);
        setShowDeleteConfirm(true);
    };
     const handleConfirmDelete = async () => {
         if (!examToDelete || isDeleting) return;
         setDeleteError(null);
         setIsDeleting(true);
         try {
             await apiClient.delete(`/admin/exams/${examToDelete.id}`);
             setExams(prevExams => prevExams.filter(e => e.id !== examToDelete.id));
             setShowDeleteConfirm(false);
             setExamToDelete(null);
         } catch (err) {
             console.error("Delete error:", err);
             setDeleteError(err.response?.data?.message || err.message || "Failed to delete exam.");
         } finally {
             setIsDeleting(false);
         }
     };
    const handleViewResults = (examId) => { navigate(`/admin/exams/${examId}/results`); };
    const handleCloseDeleteDialog = () => { if (!isDeleting) { setShowDeleteConfirm(false); setDeleteError(null); } };

    // --- Render ---
    return (
        // Main container - remove internal padding if header/table have their own
        <Box sx={{ p: 0 }}> {/* Remove padding from outermost container if Paper provides it */}

            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: theme.spacing(4), fontWeight: 'bold' }}>
                    Exam Management
                </Typography>
            {/* Header Area (Search + Button) */}
            <Paper
                elevation={0} // Flat appearance for the header bar
                sx={{
                    p: theme.spacing(2),
                    mb: theme.spacing(3),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: `1px solid ${theme.palette.divider}`, // Optional: border like search
                    borderRadius: theme.shape.borderRadius, // Optional: consistent rounding
                    // Or keep Paper elevation={1} and remove border if preferred
                }}
            >
                <TextField
                    variant="outlined"
                    size="small"
                    placeholder="Search exams..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>),
                        sx: {
                            borderRadius: '10px', // Rounded corners for search
                            bgcolor: theme.palette.background.paper, // Ensure background for contrast if needed
                        }
                    }}
                    sx={{
                        flexGrow: 1,
                        mr: 2
                    }}
                    aria-label="Search exams"
                 />
                 <Button
                    variant="contained"
                    startIcon={<AddIcon />} // Changed Icon
                    onClick={handleCreateExam}
                    sx={{
                        borderRadius: '10px', // Matching rounded corners
                        flexShrink: 0,
                        fontWeight: 600, // Slightly bolder text
                        textTransform: 'none' // Prevent uppercase
                    }}
                 >
                     New Exam
                 </Button>
            </Paper>

            {/* Main Content Area (Table or Feedback) */}
            <Paper elevation={2} sx={{ borderRadius: 3, overflow: 'hidden' }}> {/* Table container */}
                 {/* Loading State */}
                 {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: theme.spacing(10) }}>
                        <CircularProgress />
                        <Typography sx={{ ml: 2 }} color="text.secondary">Loading Exams...</Typography>
                    </Box>
                 )}

                 {/* Error State */}
                 {error && !isLoading && (
                    <Box sx={{ p: 3 }}> {/* Add padding for Alert */}
                        <Alert severity="error">
                            <Typography variant="body1">Failed to load exams.</Typography>
                            <Typography variant="caption">{error}</Typography>
                        </Alert>
                    </Box>
                 )}

                 {/* Table - Render ONLY if NOT loading AND NO fetch error */}
                 {!isLoading && !error && (
                    <TableContainer>
                    {/* Using sx prop for borders like the image */}
                    <Table sx={{ minWidth: 700 }} aria-label="exam list table">
                        <TableHead>
                            {/* Apply background color to the TableRow within TableHead */}
                            <TableRow
                                sx={{
                                    '& th': {
                                        border: 0, // Remove default bottom border from theme
                                        backgroundColor: '#e3f2fd', // Light Pastel Blue
                                        color: theme.palette.getContrastText('#e3f2fd'), // Ensure text contrast
                                        fontWeight: 'bold',
                                        py: 2, // Keep padding
                                        px: 2,
                                    },
                                     // Add top border radius if TableContainer has rounded corners
                                     '& th:first-of-type': {
                                         borderTopLeftRadius: theme.shape.borderRadius > 0 ? theme.spacing(1) : 0, // Adjust radius as needed
                                     },
                                     '& th:last-of-type': {
                                         borderTopRightRadius: theme.shape.borderRadius > 0 ? theme.spacing(1) : 0, // Adjust radius as needed
                                     }
                                }}
                            >
                                <TableCell>Exam Name</TableCell> {/* Remove sx props here, handled by parent TableRow */}
                                <TableCell>Subject</TableCell>
                                <TableCell align="right" sx={{ width: '110px' }}>Duration</TableCell>
                                <TableCell align="center" sx={{ width: '120px' }}>Status</TableCell>
                                <TableCell align="right" sx={{ width: '100px' }}>Attempts</TableCell>
                                <TableCell align="center" sx={{ width: '120px' }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {filteredExams.length > 0 ? filteredExams.map((exam) => (
                                <TableRow
                                    key={exam.id}
                                    // hover // Optionally add back hover if desired
                                    sx={{
                                        '& td, & th': { // Apply border to all cells in the row
                                            borderBottom: `1px solid ${theme.palette.divider}`,
                                            py: 1.5, // Adjusted padding slightly for balance
                                            px: 2,   // Added missing comma here
                                        },
                                        '&:last-child td, &:last-child th': { // Remove border from last row
                                            borderBottom: 0,
                                        },
                                    }}
                                >
                                    <TableCell component="th" scope="row">{exam.name}</TableCell>
                                    <TableCell>{exam.subject || 'N/A'}</TableCell>
                                    <TableCell align="right">{exam.duration ? `${exam.duration} min` : 'N/A'}</TableCell>
                                    <TableCell align="center">{getStatusChip(exam.status)}</TableCell>
                                    <TableCell align="right">{exam.allowed_attempts ?? 'Unlimited'}</TableCell>
                                    <TableCell align="center">
                                        <Stack direction="row" spacing={0.5} justifyContent="center">
                                            <Tooltip title="Edit Exam">
                                                <IconButton size="small" onClick={() => handleEdit(exam.id)} aria-label="edit" color="primary">
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="View Results">
                                                <IconButton size="small" onClick={() => handleViewResults(exam.id)} aria-label="view results" color="info">
                                                    <VisibilityIcon fontSize="inherit" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete Exam">
                                                <IconButton size="small" color="error" onClick={() => handleDeleteClick(exam)} aria-label="delete" disabled={isDeleting && examToDelete?.id === exam.id}>
                                                    <DeleteIcon fontSize="inherit" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 5, borderBottom: 0 }}> {/* No border if empty */}
                                        <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" color="text.secondary">
                                            <InfoOutlinedIcon />
                                            <Typography>No exams found.</Typography>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                 )}
            </Paper> {/* End Table container Paper */}

            {/* Delete Confirmation Dialog (Styling remains largely unchanged, kept for completeness) */}
            <Dialog
                open={showDeleteConfirm}
                onClose={handleCloseDeleteDialog}
                aria-labelledby="delete-confirm-title"
                aria-describedby="delete-confirm-description"
            >
                 <DialogTitle id="delete-confirm-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon color="error" />
                    Confirm Deletion
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-confirm-description">
                        Are you sure you want to delete the exam "{examToDelete?.name}"? This action cannot be undone.
                    </DialogContentText>
                    {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
                    {isDeleting && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={24} /></Box>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box> // End main container Box
    );
}

export default AdminExamList;