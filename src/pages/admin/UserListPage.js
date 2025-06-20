import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api';
import {
    Box, Button, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, CircularProgress, Alert, TextField, Tooltip, List, ListItem, ListItemText,
    InputAdornment, useTheme, TablePagination
} from '@mui/material';
import {
    Search as SearchIcon,
    CloudUpload as CloudUploadIcon,
    InfoOutlined as InfoOutlinedIcon,
} from '@mui/icons-material';

function UserListPage() {
    const [users, setUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [error, setError] = useState('');
    // const [successMessage, setSuccessMessage] = useState(''); // For general success, if needed later

    // For CSV User Import
    const userImportFileInputRef = useRef(null);
    const [isImportingUsers, setIsImportingUsers] = useState(false);
    const [userImportResult, setUserImportResult] = useState(null); // { status, message, details }

    const [searchTerm, setSearchTerm] = useState('');
    const theme = useTheme();

    // Pagination state
    const [page, setPage] = useState(0); // API is 1-based, MUI TablePagination is 0-based
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [totalUsers, setTotalUsers] = useState(0);


    const fetchUsers = useCallback(async (currentPage = 1, currentRowsPerPage = 15) => {
        setIsLoadingUsers(true);
        setError('');
        // setUserImportResult(null); // Clear previous import results when fetching
        try {
            // Pass search term if you want backend filtering, otherwise filter client-side
            const response = await apiClient.get(`/admin/users?page=${currentPage}&per_page=${currentRowsPerPage}`);
            setUsers(response.data.users || []);
            setTotalUsers(response.data.total || 0);
            setPage(response.data.current_page - 1); // Adjust for 0-based MUI pagination
            // setRowsPerPage(currentRowsPerPage); // Already set by handleChangeRowsPerPage
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch users.');
            setUsers([]);
            setTotalUsers(0);
        } finally {
            setIsLoadingUsers(false);
        }
    }, []); // Removed searchTerm from dependencies if filtering client-side mostly

    useEffect(() => {
        fetchUsers(page + 1, rowsPerPage);
    }, [fetchUsers, page, rowsPerPage]);


    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
        // Implement client-side filtering or re-fetch if backend supports search
    };

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- CSV User Import Handlers ---
    const handleImportUsersClick = () => {
        setUserImportResult(null); // Clear previous results
        setError('');
        userImportFileInputRef.current?.click();
    };

    const handleUserImportFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
                setUserImportResult({
                    status: 'error',
                    message: 'Invalid file type. Please upload a .csv file.',
                    details: []
                });
                if (userImportFileInputRef.current) userImportFileInputRef.current.value = '';
                return;
            }
            processUserImportFile(file);
        }
        if (userImportFileInputRef.current) userImportFileInputRef.current.value = '';
    };

    const processUserImportFile = (file) => {
        setIsImportingUsers(true);
        setUserImportResult(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                let lines = text.split(/\r\n|\n|\r/);
                let usernames = [];
                if (lines.length > 0) { // Basic header detection (similar to UserManagement)
                    const firstLineTrimmed = lines[0].trim();
                    const commonHeaders = ["username", "user name", "student id", "email", "user", "id", "student"];
                    const firstLineLower = firstLineTrimmed.toLowerCase();
                    let isHeader = commonHeaders.some(h => firstLineLower.includes(h)) || firstLineTrimmed.includes(' ') || firstLineTrimmed.includes(',') || !firstLineTrimmed;
                    if (isHeader && firstLineTrimmed.split(/\s|,/).length === 1 && !firstLineLower.match(/[@.]/)) {
                        if (!commonHeaders.some(h => firstLineLower === h) && !firstLineTrimmed.match(/[^a-zA-Z0-9_.\-@]/)) isHeader = false;
                    }
                    if (isHeader) lines = lines.slice(1);
                }
                usernames = lines.map(line => line.trim()).filter(line => line);

                if (usernames.length === 0) {
                    setUserImportResult({ status: 'error', message: 'CSV is empty or contains no valid usernames.', details: [] });
                    setIsImportingUsers(false);
                    return;
                }

                const response = await apiClient.post('/admin/users/import_csv', { usernames });
                setUserImportResult({
                    status: (response.data.failed_imports && response.data.failed_imports.length > 0) || response.data.added_count === 0 ? 'warning' : 'success',
                    message: response.data.message,
                    details: response.data.failed_imports || [],
                    added_count: response.data.added_count
                });
                if (response.data.added_count > 0) {
                    fetchUsers(1, rowsPerPage); // Refresh user list from page 1
                    setPage(0); // Reset pagination to first page
                }
            } catch (err) {
                setUserImportResult({
                    status: 'error',
                    message: err.response?.data?.message || err.message || 'Failed to import users from CSV.',
                    details: err.response?.data?.failed_imports || [],
                });
            } finally {
                setIsImportingUsers(false);
            }
        };
        reader.onerror = () => {
            setUserImportResult({ status: 'error', message: 'Failed to read the CSV file.', details: [] });
            setIsImportingUsers(false);
        };
        reader.readAsText(file);
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0); // Reset to first page when rows per page changes
    };


    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>User Management</Typography>

            {/* CSV Import Result Display */}
            {userImportResult && (
                <Alert
                    severity={userImportResult.status || 'info'}
                    onClose={() => setUserImportResult(null)}
                    sx={{ mb: 2, whiteSpace: 'pre-wrap' }}
                >
                    <Typography fontWeight="bold">{userImportResult.message}</Typography>
                    {userImportResult.added_count > 0 && <Typography variant="body2">Successfully created: {userImportResult.added_count} user(s).</Typography>}
                    {userImportResult.details && userImportResult.details.length > 0 && (
                        <Box mt={1}>
                            <Typography variant="body2" fontWeight="medium">Details for failed entries:</Typography>
                            <List dense sx={{ maxHeight: 150, overflow: 'auto', '& .MuiListItemText-root': { my: 0 } }}>
                                {userImportResult.details.map((item, index) => (
                                    <ListItem key={index} sx={{ pl: 0, py: 0.2 }}>
                                        <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={`${item.username}: ${item.reason}`} />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </Alert>
            )}
             {error && !userImportResult && ( // Show general fetch error if no import result
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>
            )}


            {/* Toolbar: Search and Import Button */}
            <Paper elevation={0} sx={{ p: theme.spacing(1.5), mb: theme.spacing(3), display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, border: `1px solid ${theme.palette.divider}`, borderRadius: theme.shape.borderRadius }}>
                <TextField
                    variant="outlined" size="small" placeholder="Search username..." value={searchTerm} onChange={handleSearchChange}
                    InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>), sx: { borderRadius: '10px', bgcolor: theme.palette.background.paper, } }}
                    sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 200 }, mr: { sm: 2 } }} aria-label="Search users"
                />
                <Box>
                    <input type="file" ref={userImportFileInputRef} onChange={handleUserImportFileChange} style={{ display: 'none' }} accept=".csv" />
                    <Tooltip title={<span>Import new STUDENT users from CSV.<br/>CSV: one username per line (optional header).<br/>Password will be same as username.</span>}>
                        <Button
                            variant="outlined"
                            startIcon={isImportingUsers ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                            onClick={handleImportUsersClick}
                            disabled={isImportingUsers || isLoadingUsers}
                            size="medium"
                            sx={{ borderRadius: '10px', textTransform: 'none' }}
                        >
                            Import Users
                            <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.7 }} />
                        </Button>
                    </Tooltip>
                </Box>
            </Paper>

            {/* Users Table */}
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="student users table">
                    <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
                            <TableCell>ID</TableCell>
                            <TableCell>Username</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Date Created</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoadingUsers ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
                        ) : filteredUsers.length === 0 && !error && !userImportResult ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                {searchTerm ? `No users found matching "${searchTerm}".` : 'No student users found.'}
                            </TableCell></TableRow>
                        ) : (
                            filteredUsers.map((user) => (
                                <TableRow hover key={user.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    <TableCell>{user.id}</TableCell>
                                    <TableCell component="th" scope="row">{user.username}</TableCell>
                                    <TableCell><Typography variant="caption" sx={{bgcolor: theme.palette.info.light, color: theme.palette.info.dark, borderRadius: '4px', padding: '2px 6px', fontWeight:'medium'}}>{user.role}</Typography></TableCell>
                                    <TableCell>{user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}</TableCell>
                                </TableRow>
                            ))
                        )}
                        {/* Show error only if not loading and no users due to error */}
                        {error && !isLoadingUsers && users.length === 0 && !userImportResult && (
                             <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'error.main' }}>
                                {error}
                             </TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 15, 25, 50]}
                    component="div"
                    count={totalUsers}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </TableContainer>
        </Box>
    );
}

export default UserListPage;