import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api'; // Adjust path as needed
import {
    Box,
    Button,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    CircularProgress,
    Alert,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
    Tooltip,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    InputAdornment,
    useTheme, // Import useTheme
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    GroupAdd as GroupAddIcon,
    PersonRemove as PersonRemoveIcon,
    Search as SearchIcon,
} from '@mui/icons-material';

function UserManagement() {
    const [groups, setGroups] = useState([]);
    const [availableStudents, setAvailableStudents] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null); // For viewing/editing details
    const [groupToEdit, setGroupToEdit] = useState(null); // For edit modal prefill
    const [groupToDelete, setGroupToDelete] = useState(null); // For delete confirmation
    const [studentToRemove, setStudentToRemove] = useState(null); // For student removal confirmation

    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);

    // State for forms
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');
    const [studentToAdd, setStudentToAdd] = useState(''); // Holds the ID of the student to add

    // State for Search
    const [searchTerm, setSearchTerm] = useState('');
    const theme = useTheme(); // Get theme object

    // --- Data Fetching ---

    const fetchGroups = useCallback(async () => {
        setIsLoadingGroups(true);
        setError('');
        try {
            const response = await apiClient.get('/admin/usergroups');
            setGroups(response.data || []);
        } catch (err) {
            setError(err.message || 'Failed to fetch user groups.');
            setGroups([]); // Clear groups on error
        } finally {
            setIsLoadingGroups(false);
        }
    }, []);

    const fetchAvailableStudents = useCallback(async () => {
        // No loading indicator for this one, usually quick
        // setError(''); // Clear previous errors potentially unrelated - Let other errors persist
        try {
            const response = await apiClient.get('/admin/students');
            setAvailableStudents(response.data || []);
        } catch (err) {
            // Avoid overwriting a more important error (like group loading failure)
            if (!error) {
                setError(err.message || 'Failed to fetch available students.');
            }
            setAvailableStudents([]);
        }
    }, [error]); // Add error dependency

    const fetchGroupDetails = useCallback(async (groupId) => {
        if (!groupId) return;
        setIsLoadingDetails(true);
        setError(''); // Clear specific errors related to details modal
        setSuccessMessage(''); // Clear previous success
        try {
            const response = await apiClient.get(`/admin/usergroups/${groupId}`);
            setSelectedGroup(response.data);
            setShowDetailsModal(true); // Open details modal upon successful fetch
        } catch (err) {
            setError(err.message || 'Failed to fetch group details.');
            setSelectedGroup(null); // Clear selection on error
            setShowDetailsModal(false);
        } finally {
            setIsLoadingDetails(false);
        }
    }, []);

    useEffect(() => {
        fetchGroups();
        fetchAvailableStudents(); // Fetch students initially
    }, [fetchGroups, fetchAvailableStudents]);

    // --- Utility Functions ---
    const clearMessages = () => {
         setError('');
         setSuccessMessage('');
    };

    const handleOpenCreateModal = () => {
        clearMessages();
        setNewGroupName('');
        setNewGroupDesc('');
        setShowCreateModal(true);
    };

    const handleCloseCreateModal = () => {
        setShowCreateModal(false);
        setError(''); // Clear errors when closing modal
    }

    const handleOpenEditModal = (group) => {
        clearMessages();
        setGroupToEdit(group);
        setNewGroupName(group.name);
        setNewGroupDesc(group.description || '');
        setShowEditModal(true);
    };
    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setGroupToEdit(null); // Clear editing state
        setNewGroupName('');
        setNewGroupDesc('');
        setError(''); // Clear errors when closing modal
    }

    const handleOpenDetailsModal = (group) => {
        clearMessages();
        fetchGroupDetails(group.id); // Fetch latest details when opening
    };
    const handleCloseDetailsModal = () => {
        setShowDetailsModal(false);
        setSelectedGroup(null); // Clear selected group
        // Don't clear general error/success here, might be needed
    };

    const handleOpenAddStudentModal = () => {
        if (!selectedGroup) return;
        // Don't clear general messages here, keep success/error from details modal visible
        setError(''); // Clear only error specific to this modal action
        setStudentToAdd(''); // Reset selection
        setShowAddStudentModal(true);
    };
    const handleCloseAddStudentModal = () => {
        setShowAddStudentModal(false);
        setError(''); // Clear error specific to this modal
    }


    const openDeleteConfirm = (group) => {
        clearMessages();
        setGroupToDelete(group);
    };
    const closeDeleteConfirm = () => {
        setGroupToDelete(null);
        setError(''); // Clear error when closing confirm dialog
    }

    const openRemoveStudentConfirm = (student) => {
         // Don't clear general messages here
        setError(''); // Clear only error specific to this modal action
        setStudentToRemove(student);
    };
    const closeRemoveStudentConfirm = () => {
        setStudentToRemove(null);
         setError(''); // Clear error specific to this modal
    }


    // --- API Actions ---

    // *** MODIFIED handleCreateGroup ***
    const handleCreateGroup = async (event) => {
        event.preventDefault();
        if (!newGroupName.trim()) {
            setError('Group name cannot be empty.');
            return;
        }
        setIsSubmitting(true);
        setError(''); // Clear previous errors specific to this modal
        setSuccessMessage(''); // Clear global success message
        try {
            // Capture the response
            const response = await apiClient.post('/admin/usergroups', {
                name: newGroupName.trim(),
                description: newGroupDesc.trim(),
            });

            const newGroupData = response.data; // The newly created group object

            // Update state directly
            setGroups(prevGroups => [...prevGroups, newGroupData]);

            setSuccessMessage(`Group '${newGroupData.name}' created successfully.`); // Use name from response
            handleCloseCreateModal();
            // fetchGroups(); // No longer strictly necessary

        } catch (err) {
            // Display error within the modal
            setError(err.message || 'Failed to create group.');
        } finally {
            setIsSubmitting(false);
        }
    };
    // *** END MODIFICATION ***

    const handleUpdateGroup = async (event) => {
        event.preventDefault();
        if (!groupToEdit || !newGroupName.trim()) {
            setError('Group name cannot be empty.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        setSuccessMessage('');
        try {
             // Capture response to get potentially updated data (though not strictly needed here)
            const response = await apiClient.put(`/admin/usergroups/${groupToEdit.id}`, {
                name: newGroupName.trim(),
                description: newGroupDesc.trim(),
            });
            const updatedGroupData = response.data; // Backend sends back updated group

            setSuccessMessage(`Group '${updatedGroupData.name}' updated successfully.`);
            handleCloseEditModal();

             // Update the groups list state with the data returned from backend
             setGroups(currentGroups =>
                currentGroups.map(grp =>
                    grp.id === updatedGroupData.id ? updatedGroupData : grp
                )
            );

            // If details modal was open for this group, refresh its data too
            if (selectedGroup && selectedGroup.id === groupToEdit.id) {
                 // Update details modal directly instead of refetching
                 setSelectedGroup(updatedGroupData);
                // fetchGroupDetails(groupToEdit.id); // Less efficient
            }
        } catch (err) {
             // Display error within the modal
            setError(err.message || 'Failed to update group.');
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleDeleteGroup = async () => {
        if (!groupToDelete) return;
        setIsSubmitting(true);
        setError(''); // Clear previous errors before attempting delete
        setSuccessMessage('');
        try {
            await apiClient.delete(`/admin/usergroups/${groupToDelete.id}`);
            const deletedGroupName = groupToDelete.name; // Store name before clearing
            const deletedGroupId = groupToDelete.id; // Store ID before clearing

            setSuccessMessage(`Group '${deletedGroupName}' deleted successfully.`);
            closeDeleteConfirm(); // Close confirmation FIRST

            // Update groups list by filtering out the deleted one
            setGroups(currentGroups =>
                currentGroups.filter(grp => grp.id !== deletedGroupId)
            );

             // If the deleted group was selected, close the details modal
            if (selectedGroup && selectedGroup.id === deletedGroupId) {
                handleCloseDetailsModal();
            }
             // fetchGroups(); // Not needed with direct state update
        } catch (err) {
            // Display error within the confirmation dialog
            setError(err.message || 'Failed to delete group.');
            // Keep the dialog open on error so the user sees the message
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleAddStudent = async (event) => {
        event.preventDefault();
        if (!selectedGroup || !studentToAdd) {
             // Show error in the add student modal
             setError('Please select a student to add.');
             return;
        }
        setIsSubmitting(true);
        setError(''); // Clear error specific to this modal
        setSuccessMessage(''); // Clear potential success message from details modal
        try {
            const response = await apiClient.post(`/admin/usergroups/${selectedGroup.id}/students`, {
                student_id: studentToAdd,
            });
            const updatedGroupData = response.data.group; // Get the updated group from response

            // Show success message in the details modal (will be visible when this modal closes)
            setSuccessMessage(response.data.message || 'Student added successfully.');
            setSelectedGroup(updatedGroupData); // Update selected group for the details modal

            // Update the main groups list state
            setGroups(currentGroups =>
                currentGroups.map(grp =>
                    grp.id === updatedGroupData.id ? updatedGroupData : grp
                )
            );

            handleCloseAddStudentModal(); // Close this modal on success
        } catch (err) {
            // Display error within the Add Student modal
            setError(err.message || 'Failed to add student to group.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveStudent = async () => {
        if (!selectedGroup || !studentToRemove) return;
        setIsSubmitting(true);
        setError(''); // Clear previous errors before attempting remove
        setSuccessMessage(''); // Clear success message from details modal
        try {
            const response = await apiClient.delete(`/admin/usergroups/${selectedGroup.id}/students/${studentToRemove.id}`);
            const updatedGroupData = response.data.group; // Get updated group from response

            // Show success message in the details modal
            setSuccessMessage(response.data.message || 'Student removed successfully.');
            setSelectedGroup(updatedGroupData); // Update details modal state

            // Update the main groups list state
            setGroups(currentGroups =>
                currentGroups.map(grp =>
                    grp.id === updatedGroupData.id ? updatedGroupData : grp
                )
            );

            closeRemoveStudentConfirm(); // Close confirmation dialog
        } catch (err) {
            // Display error within the confirmation dialog
            setError(err.message || 'Failed to remove student from group.');
             // Keep the dialog open on error so the user sees the message
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Filtering Logic ---

    // Filter groups based on search term (case-insensitive)
    const displayedGroups = groups.filter(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter students available to add
    const studentsAvailableToAdd = availableStudents.filter(student =>
        !selectedGroup?.students?.some(member => member.id === student.id)
    );


    // --- Render ---
    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>
                User Group Management
            </Typography>

             {/* --- Global Error/Success Messages (outside modals) --- */}
             {/* Show global success message if not overridden by details modal */}
             {successMessage && !showDetailsModal && (
                <Alert severity="success" onClose={() => setSuccessMessage('')} sx={{ mb: 2 }}>{successMessage}</Alert>
            )}
            {/* Show global error only if no modal is open to show its specific error */}
            {error && !showCreateModal && !showEditModal && !showDetailsModal && !showAddStudentModal && !groupToDelete && !studentToRemove && (
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>
            )}


            {/* --- Toolbar: Search and Create Button --- */}
            <Paper
                elevation={0}
                sx={{
                    p: theme.spacing(2),
                    mb: theme.spacing(3),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: theme.shape.borderRadius,
                }}
            >
                 <TextField
                    variant="outlined"
                    size="small"
                    placeholder="Search group..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>),
                        sx: {
                            borderRadius: '10px',
                            bgcolor: theme.palette.background.paper, // Or 'transparent' if Paper has bg
                        }
                    }}
                    sx={{
                        flexGrow: 1,
                        mr: 2,
                        '& .MuiOutlinedInput-root': { // Target inner input styles
                            '& fieldset': {
                                // borderColor: 'transparent', // Option: hide border if Paper provides container
                            },
                            '&:hover fieldset': {
                                // borderColor: theme.palette.action.active, // Optional hover effect
                            },
                            '&.Mui-focused fieldset': {
                                // borderColor: theme.palette.primary.main, // Optional focus effect
                            },
                          },
                    }}
                    aria-label="Search group"
                 />
                 <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreateModal} // Correct handler
                    sx={{
                        borderRadius: '10px',
                        flexShrink: 0,
                        fontWeight: 600,
                        textTransform: 'none'
                    }}
                 >
                    New Group
                 </Button>
            </Paper>

            {/* --- Groups Table --- */}
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="user groups table">
                    <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
                            <TableCell>Group Name</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell align="right">Members</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoadingGroups ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        // Use displayedGroups here and check searchTerm for message
                        ) : displayedGroups.length === 0 && !error ? (
                             <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {searchTerm
                                        ? `No groups found matching "${searchTerm}".`
                                        : 'No user groups found. Create one to get started.'}
                                </TableCell>
                            </TableRow>
                        // Use displayedGroups here
                        ): (
                            displayedGroups.map((group) => (
                                <TableRow
                                    hover // Add hover effect
                                    key={group.id}
                                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                >
                                    <TableCell component="th" scope="row">
                                        {group.name}
                                    </TableCell>
                                    <TableCell>{group.description || '-'}</TableCell>
                                    <TableCell align="right">{group.student_count ?? 'N/A'}</TableCell>
                                    <TableCell align="center">
                                         <Tooltip title="View Details & Members">
                                            <IconButton onClick={() => handleOpenDetailsModal(group)} color="primary" size="small">
                                                <VisibilityIcon fontSize="small"/>
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Edit Group">
                                            <IconButton onClick={() => handleOpenEditModal(group)} color="secondary" size="small">
                                                <EditIcon fontSize="small"/>
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete Group">
                                            <IconButton onClick={() => openDeleteConfirm(group)} color="error" size="small">
                                                <DeleteIcon fontSize="small"/>
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                         {/* Display global table loading error */}
                         {error && !isLoadingGroups && groups.length === 0 && ( // Only show if group list is empty due to error
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'error.main' }}>
                                   {`Error loading groups: ${error}`}
                                </TableCell>
                            </TableRow>
                         )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* --- Modals remain structurally the same, ensure error states are handled within them --- */}

            {/* --- Create Group Modal --- */}
            <Dialog open={showCreateModal} onClose={handleCloseCreateModal} >
                <DialogTitle>Create New User Group</DialogTitle>
                <Box component="form" onSubmit={handleCreateGroup}>
                    <DialogContent>
                        <TextField autoFocus margin="dense" id="new-group-name" label="Group Name" type="text" fullWidth variant="outlined" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required sx={{ mb: 2 }} error={!!error && error.includes('name')} helperText={error && error.includes('name') ? error : ''} />
                        <TextField margin="dense" id="new-group-desc" label="Description (Optional)" type="text" fullWidth multiline rows={3} variant="outlined" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
                         {/* Show general error message inside modal if not field specific */}
                         {error && !error.includes('name') && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={handleCloseCreateModal} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={isSubmitting}> {isSubmitting ? <CircularProgress size={24} /> : 'Create'} </Button>
                    </DialogActions>
                </Box>
            </Dialog>

             {/* --- Edit Group Modal --- */}
            <Dialog open={showEditModal} onClose={handleCloseEditModal}>
                <DialogTitle>Edit Group: {groupToEdit?.name}</DialogTitle>
                 <Box component="form" onSubmit={handleUpdateGroup}>
                    <DialogContent>
                        <TextField autoFocus margin="dense" id="edit-group-name" label="Group Name" type="text" fullWidth variant="outlined" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required sx={{ mb: 2 }} error={!!error && error.includes('name')} helperText={error && error.includes('name') ? error : ''}/>
                        <TextField margin="dense" id="edit-group-desc" label="Description (Optional)" type="text" fullWidth multiline rows={3} variant="outlined" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
                         {/* Show general error message inside modal */}
                         {error && !error.includes('name') && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={handleCloseEditModal} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={isSubmitting}> {isSubmitting ? <CircularProgress size={24} /> : 'Save Changes'} </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* --- View Details & Members Modal --- */}
            <Dialog open={showDetailsModal} onClose={handleCloseDetailsModal} fullWidth maxWidth="sm">
                 <DialogTitle>Group Details: {selectedGroup?.name}</DialogTitle>
                <DialogContent>
                     {isLoadingDetails ? ( <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /></Box>
                    ) : selectedGroup ? ( <Box>
                            <Typography variant="body1" gutterBottom> <strong>Description:</strong> {selectedGroup.description || <em>No description provided.</em>} </Typography>
                            <Typography variant="body1" gutterBottom> <strong>Created:</strong> {selectedGroup.created_at ? new Date(selectedGroup.created_at).toLocaleString() : 'N/A'} </Typography>
                            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}> Members ({selectedGroup.students?.length || 0}) </Typography>

                            {/* --- Error/Success Messages specific to actions within this Modal --- */}
                            {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
                            {successMessage && <Alert severity="success" onClose={() => setSuccessMessage('')} sx={{ mb: 2 }}>{successMessage}</Alert>}

                            <Button variant="outlined" size="small" startIcon={<GroupAddIcon />} onClick={handleOpenAddStudentModal} sx={{ mb: 1 }} disabled={isSubmitting || studentsAvailableToAdd.length === 0} > Add Student </Button>

                            {selectedGroup.students && selectedGroup.students.length > 0 ? ( <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}> <List dense> {selectedGroup.students.map((student) => ( <ListItem key={student.id} divider> <ListItemText primary={student.username} secondary={`ID: ${student.id}`} /> <ListItemSecondaryAction> <Tooltip title="Remove Student"> <IconButton edge="end" aria-label="remove" color="error" size="small" onClick={() => openRemoveStudentConfirm(student)} disabled={isSubmitting} > <PersonRemoveIcon fontSize='small'/> </IconButton> </Tooltip> </ListItemSecondaryAction> </ListItem> ))} </List> </Paper>
                            ) : ( <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}> No students currently in this group. </Typography> )}
                        </Box>
                    ) : ( // Error message if selectedGroup failed to load initially
                         <Typography color="error">{error || 'Could not load group details.'}</Typography>
                    )}
                </DialogContent>
                 <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleCloseDetailsModal} disabled={isLoadingDetails || isSubmitting}>Close</Button>
                </DialogActions>
            </Dialog>

             {/* --- Add Student Modal --- */}
             <Dialog open={showAddStudentModal} onClose={handleCloseAddStudentModal}>
                 <DialogTitle>Add Student to Group: {selectedGroup?.name}</DialogTitle>
                 <Box component="form" onSubmit={handleAddStudent}>
                    <DialogContent sx={{minWidth: 300}}>
                        <FormControl fullWidth margin="dense" required error={!!error}>
                            <InputLabel id="select-student-label">Select Student</InputLabel>
                            <Select labelId="select-student-label" id="select-student" value={studentToAdd} label="Select Student" onChange={(e) => setStudentToAdd(e.target.value)} disabled={studentsAvailableToAdd.length === 0 || isSubmitting} >
                                <MenuItem value="" disabled> <em>-- Select a student --</em> </MenuItem>
                                {studentsAvailableToAdd.length > 0 ? ( studentsAvailableToAdd.map((student) => ( <MenuItem key={student.id} value={student.id}> {student.username} (ID: {student.id}) </MenuItem> ))
                                ) : ( <MenuItem value="" disabled> <em>All available students are in this group.</em> </MenuItem> )}
                            </Select>
                             {/* Show error message inside modal */}
                             {error && <DialogContentText color="error" sx={{mt: 1}}>{error}</DialogContentText>}
                        </FormControl>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                         <Button onClick={handleCloseAddStudentModal} disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={isSubmitting || !studentToAdd || studentsAvailableToAdd.length === 0} > {isSubmitting ? <CircularProgress size={24} /> : 'Add Student'} </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* --- Delete Group Confirmation Dialog --- */}
            <Dialog open={Boolean(groupToDelete)} onClose={closeDeleteConfirm} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description" >
                <DialogTitle id="alert-dialog-title"> Confirm Deletion </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description"> Are you sure you want to delete the group "{groupToDelete?.name}"? This action cannot be undone. Students will be removed from the group but their accounts will remain. </DialogContentText>
                    {/* Show error message inside dialog */}
                    {error && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={closeDeleteConfirm} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleDeleteGroup} color="error" autoFocus disabled={isSubmitting}> {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Delete'} </Button>
                </DialogActions>
            </Dialog>

             {/* --- Remove Student Confirmation Dialog --- */}
             <Dialog open={Boolean(studentToRemove)} onClose={closeRemoveStudentConfirm} >
                <DialogTitle>Confirm Removal</DialogTitle>
                <DialogContent>
                    <DialogContentText> Are you sure you want to remove student "{studentToRemove?.username}" from the group "{selectedGroup?.name}"? </DialogContentText>
                    {/* Show error message inside dialog */}
                    {error && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
                 </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={closeRemoveStudentConfirm} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleRemoveStudent} color="error" autoFocus disabled={isSubmitting}> {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Remove'} </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
}

export default UserManagement;