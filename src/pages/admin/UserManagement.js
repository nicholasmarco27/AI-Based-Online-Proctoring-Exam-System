import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api'; // Adjust path as needed
import Papa from 'papaparse'; // For CSV parsing
import * as XLSX from 'xlsx'; // For XLSX parsing and generation
import {
    Box,Button,Typography,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Paper,IconButton,CircularProgress,Alert,
    Dialog,DialogActions,DialogContent,DialogContentText,DialogTitle,TextField,Tooltip,List,ListItem,
    ListItemText,ListItemSecondaryAction,Select,MenuItem,FormControl,InputLabel,InputAdornment,
    useTheme, // Import useTheme
    Menu, // For template dropdown
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    GroupAdd as GroupAddIcon,
    PersonRemove as PersonRemoveIcon,
    Search as SearchIcon,
    UploadFile as UploadFileIcon, // For "Import New Classes" button
    InfoOutlined as InfoOutlinedIcon, // For tooltip on import
    CloudUpload as CloudUploadIcon, // For "Import Students to THIS Class"
} from '@mui/icons-material';

function UserManagement() {
    const [groups, setGroups] = useState([]);
    const [availableStudents, setAvailableStudents] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [groupToEdit, setGroupToEdit] = useState(null);
    const [groupToDelete, setGroupToDelete] = useState(null);
    const [studentToRemove, setStudentToRemove] = useState(null);

    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false); // For single actions
    const [isImporting, setIsImporting] = useState(false); // For bulk CLASS (structure) import
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);

    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');
    const [studentToAdd, setStudentToAdd] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const theme = useTheme();

    // For Template download menu (for "Import New Classes")
    const [templateMenuAnchorEl, setTemplateMenuAnchorEl] = useState(null);
    const classImportFileInputRef = useRef(null); // For "Import New Classes"
    const [importError, setImportError] = useState(null); // For "Import New Classes"
    const [importSuccess, setImportSuccess] = useState(null); // For "Import New Classes"

    // --- State for CSV Import of Students to a SPECIFIC Group ---
    const studentImportFileInputRef = useRef(null); // For "Import Students to THIS Class"
    const [isImportingStudentsToGroup, setIsImportingStudentsToGroup] = useState(false);
    const [studentImportGroupResult, setStudentImportGroupResult] = useState(null);


    // --- Data Fetching ---
    const fetchGroups = useCallback(async () => {
        setIsLoadingGroups(true);
        // Don't clear error here if it's from an import action
        if (!importError && !studentImportGroupResult?.message && !error.includes('Failed to fetch')) {
            setError('');
        }
        try {
            const response = await apiClient.get('/admin/usergroups');
            setGroups(response.data || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch user groups.');
            setGroups([]);
        } finally {
            setIsLoadingGroups(false);
        }
    }, [importError, studentImportGroupResult, error]); // Added dependencies

    const fetchAvailableStudents = useCallback(async () => {
        try {
            const response = await apiClient.get('/admin/students');
            setAvailableStudents(response.data || []);
        } catch (err) {
            // Avoid overwriting more critical/specific errors
            if (!error && !importError && !studentImportGroupResult?.message) {
                setError(err.response?.data?.message || err.message || 'Failed to fetch available students.');
            }
            setAvailableStudents([]);
        }
    }, [error, importError, studentImportGroupResult]);

    const fetchGroupDetails = useCallback(async (groupId) => {
        if (!groupId) return;
        setIsLoadingDetails(true);
        setError(''); // Clear general error for modal
        setSuccessMessage(''); // Clear general success for modal
        setStudentImportGroupResult(null); // Clear specific import results when opening details
        try {
            const response = await apiClient.get(`/admin/usergroups/${groupId}`);
            setSelectedGroup(response.data);
            setShowDetailsModal(true);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch group details.');
            setSelectedGroup(null);
            setShowDetailsModal(false);
        } finally {
            setIsLoadingDetails(false);
        }
    }, []);

    useEffect(() => {
        fetchGroups();
        fetchAvailableStudents();
    }, [fetchGroups, fetchAvailableStudents]);

    // --- Utility Functions ---
    const clearMessages = (clearAll = true) => {
         if (clearAll) {
            setError('');
            setSuccessMessage('');
            setImportError(null);
            setImportSuccess(null);
            setStudentImportGroupResult(null);
         } else {
            // Clear only messages not related to ongoing imports
            if (!isImporting) { setImportError(null); setImportSuccess(null); }
            if (!isImportingStudentsToGroup) { setStudentImportGroupResult(null); }
            if (!isSubmitting) { setError(''); setSuccessMessage('');}
         }
    };

    const handleOpenCreateModal = () => {
        clearMessages();
        setNewGroupName('');
        setNewGroupDesc('');
        setShowCreateModal(true);
    };
    const handleCloseCreateModal = () => { setShowCreateModal(false); setError('');}
    const handleOpenEditModal = (group) => {
        clearMessages();
        setGroupToEdit(group);
        setNewGroupName(group.name);
        setNewGroupDesc(group.description || '');
        setShowEditModal(true);
    };
    const handleCloseEditModal = () => {setShowEditModal(false); setGroupToEdit(null); setNewGroupName(''); setNewGroupDesc(''); setError('');}
    const handleOpenDetailsModal = (group) => { clearMessages(false); fetchGroupDetails(group.id); }; // Don't clear import messages
    const handleCloseDetailsModal = () => { setShowDetailsModal(false); setSelectedGroup(null); /* Don't clear studentImportGroupResult here, let user see it */};
    const handleOpenAddStudentModal = () => {
        if (!selectedGroup) return;
        setError(''); 
        // setStudentImportGroupResult(null); // Keep this visible if user just imported
        setStudentToAdd('');
        setShowAddStudentModal(true);
    };
    const handleCloseAddStudentModal = () => {setShowAddStudentModal(false); setError('');}
    const openDeleteConfirm = (group) => { clearMessages(false); setGroupToDelete(group);};
    const closeDeleteConfirm = () => {setGroupToDelete(null); setError('');}
    const openRemoveStudentConfirm = (student) => { setError(''); /* Keep studentImportGroupResult */ setStudentToRemove(student);};
    const closeRemoveStudentConfirm = () => {setStudentToRemove(null); setError('');}

    // --- Template Download Handlers (for "Import New Classes") ---
    const handleTemplateMenuOpen = (event) => {
        setTemplateMenuAnchorEl(event.currentTarget);
    };
    const handleTemplateMenuClose = () => {
        setTemplateMenuAnchorEl(null);
    };
    const handleDownloadClassTemplate = (format) => {
        const headers = ['Class name', 'Username'];
        const filename = `class_students_template`;
        if (format === 'csv') {
            const csvContent = headers.join(",") + "\n" + "Example Class A,studentuser1\nExample Class A,studentuser2\nExample Class B,studentuser3";
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `${filename}.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
            const worksheetData = [headers, ["Example Class A", "studentuser1"], ["Example Class A", "studentuser2"], ["Example Class B", "studentuser3"]];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1"); XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
        handleTemplateMenuClose();
    };

    // --- "Import New Classes" Handlers ---
    const handleImportClassClick = () => {
        clearMessages(); // Clear all for this global action
        classImportFileInputRef.current?.click();
    };

    const processClassImportData = async (parsedData) => {
        setIsImporting(true);
        setImportError(null);
        setImportSuccess(null);
        // Clear other messages too
        setError(''); setSuccessMessage(''); setStudentImportGroupResult(null);


        let classesCreatedCount = 0;
        let studentsAddedCount = 0;
        let rowErrors = [];
        let processedClassNames = new Map();

        const getOrCreateClass = async (className, localGroups) => {
            if (processedClassNames.has(className.toLowerCase())) return processedClassNames.get(className.toLowerCase());
            let group = localGroups.find(g => g.name.toLowerCase() === className.toLowerCase());
            if (group) { processedClassNames.set(className.toLowerCase(), group.id); return group.id; }
            try {
                const response = await apiClient.post('/admin/usergroups', { name: className, description: '' });
                const newGroup = response.data;
                classesCreatedCount++;
                setGroups(prev => [...prev, newGroup]);
                processedClassNames.set(className.toLowerCase(), newGroup.id);
                return newGroup.id;
            } catch (err) { throw new Error(`Failed to create class "${className}": ${err.response?.data?.message || err.message}`); }
        };
        const findStudentId = (username, localAvailableStudents) => localAvailableStudents.find(s => s.username.toLowerCase() === username.toLowerCase())?.id || null;

        for (let i = 0; i < parsedData.length; i++) {
            const row = parsedData[i];
            const rowNum = i + 2;
            const className = row['Class name']?.trim();
            const username = row['Username']?.trim();

            if (!className || !username) { rowErrors.push(`Row ${rowNum}: Missing "Class name" or "Username".`); continue; }
            try {
                const studentId = findStudentId(username, availableStudents);
                if (!studentId) { rowErrors.push(`Row ${rowNum}: Student "${username}" not found.`); continue; }
                let currentGroups = []; setGroups(g => { currentGroups = g; return g; });
                const classId = await getOrCreateClass(className, currentGroups);
                try {
                    const addStudentResponse = await apiClient.post(`/admin/usergroups/${classId}/students`, { student_id: studentId });
                    const updatedGroupData = addStudentResponse.data.group;
                    setGroups(prevGroups => prevGroups.map(g => g.id === classId ? updatedGroupData : g));
                    if (selectedGroup && selectedGroup.id === classId) setSelectedGroup(updatedGroupData);
                    studentsAddedCount++;
                } catch (addErr) {
                    const errMsg = addErr.response?.data?.message || addErr.message;
                    if (errMsg.toLowerCase().includes('already in group') || errMsg.toLowerCase().includes('already a member')) { // More robust check
                        rowErrors.push(`Row ${rowNum}: Student "${username}" already in class "${className}".`);
                    } else { rowErrors.push(`Row ${rowNum}: Add "${username}" to "${className}": ${errMsg}.`); }
                }
            } catch (classErr) { rowErrors.push(`Row ${rowNum}: Class "${className}": ${classErr.message}.`); }
        }

        let summaryMessage = "";
        if (classesCreatedCount > 0) summaryMessage += `${classesCreatedCount} new class(es) created. `;
        if (studentsAddedCount > 0) summaryMessage += `${studentsAddedCount} student(s) assigned. `;
        if (summaryMessage) setImportSuccess(summaryMessage.trim());
        if (rowErrors.length > 0) {
            const errorMsg = `Import completed with ${rowErrors.length} issue(s).\n${rowErrors.slice(0, 10).join('\n')}${rowErrors.length > 10 ? '\n...and more.' :''}`;
            setImportError(errorMsg); if (!summaryMessage) setImportSuccess(null);
        } else if (!summaryMessage && parsedData.length > 0) setImportError("No changes made. Data might be invalid or already up-to-date.");
        else if (parsedData.length === 0) setImportError("The file had no data rows to process.");
        setIsImporting(false); fetchAvailableStudents(); fetchGroups();
        if (classImportFileInputRef.current) classImportFileInputRef.current.value = null;
    };

    const handleClassFileChange = (event) => {
        const file = event.target.files[0]; if (!file) return; clearMessages();
        const fileName = file.name.toLowerCase();
        const isCsv = file.type.includes('csv') || fileName.endsWith('.csv');
        const isXlsx = file.type.includes('spreadsheetml.sheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls'); // Corrected XLSX type check

        if (!isCsv && !isXlsx) { setImportError('Invalid file type. CSV or XLSX required.'); if (classImportFileInputRef.current) classImportFileInputRef.current.value = null; return; }
        const expectedHeaders = ['class name', 'username'];
        const parseAndProcess = (data, fileHeaders) => {
            const actualHeadersLower = fileHeaders.map(h => String(h).toLowerCase().trim());
            const missingHeaders = expectedHeaders.filter(eh => !actualHeadersLower.includes(eh));
            if (missingHeaders.length > 0) { setImportError(`Missing columns: ${missingHeaders.join(', ')}. Expected "Class name", "Username".`); if (classImportFileInputRef.current) classImportFileInputRef.current.value = null; return; }
            const mappedData = data.map(row => {
                const newRow = {};
                const rowKeysLower = Object.keys(row).map(k => String(k).toLowerCase().trim());
                const classNameKey = Object.keys(row)[rowKeysLower.findIndex(k => k === 'class name')];
                const usernameKey = Object.keys(row)[rowKeysLower.findIndex(k => k === 'username')];
                if (classNameKey) newRow['Class name'] = row[classNameKey]; if (usernameKey) newRow['Username'] = row[usernameKey];
                return newRow;
            });
            processClassImportData(mappedData);
        };
        if (isCsv) {
            Papa.parse(file, { header: true, skipEmptyLines: true,
                complete: (results) => { if (results.errors.length > 0) { setImportError(`CSV error: ${results.errors[0].message}`); return; } parseAndProcess(results.data, results.meta?.fields || (results.data.length > 0 ? Object.keys(results.data[0]) : [])); },
                error: (error) => { setImportError(`Parse CSV error: ${error.message}`); if (classImportFileInputRef.current) classImportFileInputRef.current.value = null; },
            });
        } else if (isXlsx) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const fileData = e.target.result; const workbook = XLSX.read(fileData, { type: 'array' }); const sheetName = workbook.SheetNames[0];
                    if (!sheetName) { setImportError('XLSX empty/no sheets.'); return; }
                    const worksheet = workbook.Sheets[sheetName]; const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                    if (jsonData.length < 1) { setImportError('XLSX sheet no header.'); return; }
                    parseAndProcess(XLSX.utils.sheet_to_json(worksheet, { defval: "" }), jsonData[0].map(h => String(h)));
                } catch (xlsxError) { setImportError(`Process XLSX error: ${xlsxError.message}`); if (classImportFileInputRef.current) classImportFileInputRef.current.value = null; }
            };
            reader.onerror = () => { setImportError('Read XLSX error.'); if (classImportFileInputRef.current) classImportFileInputRef.current.value = null; }; reader.readAsArrayBuffer(file);
        }
    };

    // --- Handlers for Importing Students to a SPECIFIC Group ("Import Students to THIS Class") ---
    const handleImportStudentsToGroupClick = () => {
        if (!selectedGroup) return;
        // Clear messages specific to this action, but keep general modal messages if any
        setStudentImportGroupResult(null);
        setError(''); // Clear general error for this specific action
        setSuccessMessage(''); // Clear general success for this specific action
        studentImportFileInputRef.current?.click();
    };

    const handleStudentImportFileChange = (event) => {
        const file = event.target.files[0];
        if (file && selectedGroup) {
            if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
                setStudentImportGroupResult({ status: 'error', message: 'Invalid file. CSV required for this import.', details: [] });
                if (studentImportFileInputRef.current) studentImportFileInputRef.current.value = '';
                return;
            }
            processStudentImportFile(file);
        }
        if (studentImportFileInputRef.current) studentImportFileInputRef.current.value = '';
    };

    const processStudentImportFile = (file) => {
        if (!selectedGroup) { setStudentImportGroupResult({ status: 'error', message: 'No class selected.', details: [] }); return; }
        setIsImportingStudentsToGroup(true); setStudentImportGroupResult(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result; let lines = text.split(/\r\n|\n|\r/); let usernames = [];
                if (lines.length > 0) {
                    const firstLineTrimmed = lines[0].trim();
                    const commonHeaders = ["username", "user name", "student id", "email", "user", "id", "student"];
                    const firstLineLower = firstLineTrimmed.toLowerCase();
                    let isHeader = commonHeaders.some(header => firstLineLower.includes(header)) || firstLineTrimmed.includes(' ') || firstLineTrimmed.includes(',') || !firstLineTrimmed;
                    if (isHeader && firstLineTrimmed.split(/\s|,/).length === 1 && !firstLineLower.match(/[@.]/)) {
                        if (!commonHeaders.some(header => firstLineLower === header) && !firstLineTrimmed.match(/[^a-zA-Z0-9_.\-@]/)) isHeader = false;
                    }
                    if (isHeader) lines = lines.slice(1);
                }
                usernames = lines.map(line => line.trim()).filter(line => line);
                if (usernames.length === 0) { setStudentImportGroupResult({ status: 'error', message: 'CSV empty or no valid usernames.', details: [] }); setIsImportingStudentsToGroup(false); return; }

                const response = await apiClient.post(`/admin/usergroups/${selectedGroup.id}/import_students_csv`, { usernames });
                setStudentImportGroupResult({ status: response.data.failed_imports?.length > 0 ? 'error' : 'success', message: response.data.message, details: response.data.failed_imports || [] });
                if (response.data.updated_group) {
                    setSelectedGroup(response.data.updated_group);
                    setGroups(currentGroups => currentGroups.map(grp => grp.id === response.data.updated_group.id ? response.data.updated_group : grp));
                }
                fetchAvailableStudents();
            } catch (err) { setStudentImportGroupResult({ status: 'error', message: err.response?.data?.message || err.message || 'Failed to import students.', details: err.response?.data?.failed_imports || [] }); }
            finally { setIsImportingStudentsToGroup(false); }
        };
        reader.onerror = () => { setStudentImportGroupResult({ status: 'error', message: 'Failed to read CSV.', details: [] }); setIsImportingStudentsToGroup(false); };
        reader.readAsText(file);
    };

    // --- API Actions (Create, Update, Delete Group, Add/Remove Student) ---
    // Ensure clearMessages() is called appropriately if these actions should override import messages.
    const handleCreateGroup = async (event) => {
        event.preventDefault(); if (!newGroupName.trim()) { setError('Class name empty.'); return; }
        setIsSubmitting(true); clearMessages(); // Clears all messages
        try {
            const response = await apiClient.post('/admin/usergroups', { name: newGroupName.trim(), description: newGroupDesc.trim() });
            setGroups(prev => [...prev, response.data]); setSuccessMessage(`Class '${response.data.name}' created.`); handleCloseCreateModal();
        } catch (err) { setError(err.response?.data?.message || err.message || 'Create class failed.'); }
        finally { setIsSubmitting(false); }
    };
    const handleUpdateGroup = async (event) => {
        event.preventDefault(); if (!groupToEdit || !newGroupName.trim()) { setError('Class name empty.'); return; }
        setIsSubmitting(true); clearMessages();
        try {
            const response = await apiClient.put(`/admin/usergroups/${groupToEdit.id}`, { name: newGroupName.trim(), description: newGroupDesc.trim() });
            setSuccessMessage(`Class '${response.data.name}' updated.`); handleCloseEditModal();
            setGroups(current => current.map(g => g.id === response.data.id ? response.data : g));
            if (selectedGroup?.id === groupToEdit.id) setSelectedGroup(response.data);
        } catch (err) { setError(err.response?.data?.message || err.message || 'Update class failed.'); }
        finally { setIsSubmitting(false); }
    };
    const handleDeleteGroup = async () => {
        if (!groupToDelete) return; setIsSubmitting(true); clearMessages();
        try {
            await apiClient.delete(`/admin/usergroups/${groupToDelete.id}`);
            setSuccessMessage(`Class '${groupToDelete.name}' deleted.`); closeDeleteConfirm();
            setGroups(current => current.filter(g => g.id !== groupToDelete.id));
            if (selectedGroup?.id === groupToDelete.id) handleCloseDetailsModal();
        } catch (err) { setError(err.response?.data?.message || err.message || 'Delete class failed.'); }
        finally { setIsSubmitting(false); }
    };
    const handleAddStudent = async (event) => {
        event.preventDefault(); if (!selectedGroup || !studentToAdd) { setError('Select student.'); return; }
        setIsSubmitting(true); clearMessages(false); // Keep global import messages if any
        setError(''); setSuccessMessage(''); // Clear specific modal action messages
        try {
            const response = await apiClient.post(`/admin/usergroups/${selectedGroup.id}/students`, { student_id: studentToAdd });
            setSuccessMessage(response.data.message || 'Student added.'); setSelectedGroup(response.data.group);
            setGroups(current => current.map(g => g.id === response.data.group.id ? response.data.group : g));
            fetchAvailableStudents(); handleCloseAddStudentModal();
        } catch (err) { setError(err.response?.data?.message || err.message || 'Add student failed.'); }
        finally { setIsSubmitting(false); }
    };
    const handleRemoveStudent = async () => {
        if (!selectedGroup || !studentToRemove) return; setIsSubmitting(true); clearMessages(false);
        setError(''); setSuccessMessage('');
        try {
            const response = await apiClient.delete(`/admin/usergroups/${selectedGroup.id}/students/${studentToRemove.id}`);
            setSuccessMessage(response.data.message || 'Student removed.'); setSelectedGroup(response.data.group);
            setGroups(current => current.map(g => g.id === response.data.group.id ? response.data.group : g));
            fetchAvailableStudents(); closeRemoveStudentConfirm();
        } catch (err) { setError(err.response?.data?.message || err.message || 'Remove student failed.'); }
        finally { setIsSubmitting(false); }
    };

    // --- Filtering Logic ---
    const displayedGroups = groups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const studentsAvailableToAdd = availableStudents.filter(s => !selectedGroup?.students?.some(m => m.id === s.id));

    // --- Render ---
    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom> Class Management </Typography>

            {/* Global Import New Classes Messages */}
            {importSuccess && <Alert severity="success" onClose={() => setImportSuccess(null)} sx={{ mb: 2 }}>{importSuccess}</Alert>}
            {importError && <Alert severity="error" onClose={() => setImportError(null)} sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>{importError}</Alert>}

            {/* General Success/Error (not for imports, not for modals unless specific) */}
            {successMessage && !showDetailsModal && !importSuccess && !studentImportGroupResult && (
                <Alert severity="success" onClose={() => setSuccessMessage('')} sx={{ mb: 2 }}>{successMessage}</Alert>
            )}
            {error && !showCreateModal && !showEditModal && !showDetailsModal && !showAddStudentModal && !groupToDelete && !studentToRemove && !importError && !studentImportGroupResult && (
                <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>
            )}

            <Paper elevation={0} sx={{ p: theme.spacing(1.5), mb: theme.spacing(3), display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, border: `1px solid ${theme.palette.divider}`, borderRadius: theme.shape.borderRadius }}>
                <TextField variant="outlined" size="small" placeholder="Search class..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>), sx: { borderRadius: '10px', bgcolor: theme.palette.background.paper } }}
                    sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 200 }, mr: { sm: 2 } }} aria-label="Search class" />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, width: { xs: '100%', sm: 'auto' } }}>
                    <Button variant="outlined" onClick={handleTemplateMenuOpen} disabled={isSubmitting || isImporting || isImportingStudentsToGroup} size="medium" sx={{ borderRadius: '10px', textTransform: 'none' }}> Template </Button>
                    <Menu id="class-template-menu" anchorEl={templateMenuAnchorEl} open={Boolean(templateMenuAnchorEl)} onClose={handleTemplateMenuClose}>
                        <MenuItem onClick={() => handleDownloadClassTemplate('csv')}>Download Class Structure CSV</MenuItem>
                        <MenuItem onClick={() => handleDownloadClassTemplate('xlsx')}>Download Class Structure XLSX</MenuItem>
                    </Menu>
                    <input type="file" ref={classImportFileInputRef} onChange={handleClassFileChange} style={{ display: 'none' }} accept=".csv,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
                    <Tooltip title={<span>Import NEW classes and assign students from CSV/XLSX.<br />Required headers: <b>Class name, Username</b></span>}>
                        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportClassClick} disabled={isSubmitting || isImporting || isImportingStudentsToGroup} size="medium" sx={{ borderRadius: '10px', textTransform: 'none' }}>
                            Import New Classes {isImporting && <CircularProgress size={20} sx={{ ml: 1 }} />}
                            <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.7 }} />
                        </Button>
                    </Tooltip>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateModal} sx={{ borderRadius: '10px', fontWeight: 600, textTransform: 'none' }} disabled={isSubmitting || isImporting || isImportingStudentsToGroup}> New Class </Button>
                </Box>
            </Paper>

            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="class table">
                    <TableHead><TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: 'action.hover' } }}><TableCell>Class Name</TableCell><TableCell>Description</TableCell><TableCell align="right">Students</TableCell><TableCell align="center">View Students</TableCell><TableCell align="center">Actions</TableCell></TableRow></TableHead>
                    <TableBody>
                        {isLoadingGroups ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
                        : displayedGroups.length === 0 && !error && !importError && !importSuccess && !studentImportGroupResult ?
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>{searchTerm ? `No class matching "${searchTerm}".` : 'No classes found.'}</TableCell></TableRow>
                        : displayedGroups.map((group) => (
                            <TableRow hover key={group.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                <TableCell>{group.name}</TableCell><TableCell>{group.description || '-'}</TableCell>
                                <TableCell align="right">{group.students?.length ?? group.student_count ?? 'N/A'}</TableCell>
                                <TableCell align="center"><Button variant="outlined" size="small" onClick={() => handleOpenDetailsModal(group)} disabled={isSubmitting || isImporting || isImportingStudentsToGroup}><VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />View</Button></TableCell>
                                <TableCell align="center">
                                    <Tooltip title="Edit Class"><IconButton onClick={() => handleOpenEditModal(group)} color="secondary" size="small" disabled={isSubmitting || isImporting || isImportingStudentsToGroup}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                    <Tooltip title="Delete Class"><IconButton onClick={() => openDeleteConfirm(group)} color="error" size="small" disabled={isSubmitting || isImporting || isImportingStudentsToGroup}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {error && !isLoadingGroups && groups.length === 0 && !importError && !importSuccess && !studentImportGroupResult && (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'error.main' }}>{`Error loading groups: ${error}`}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Create Class Modal */}
            <Dialog open={showCreateModal} onClose={handleCloseCreateModal}><DialogTitle>Create New Class</DialogTitle>
                <Box component="form" onSubmit={handleCreateGroup}>
                    <DialogContent>
                        <TextField autoFocus margin="dense" label="Class Name" fullWidth value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required sx={{ mb: 2 }} error={!!error && error.includes('name')} helperText={error && error.includes('name') ? error : ''} />
                        <TextField margin="dense" label="Description (Optional)" fullWidth multiline rows={3} value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
                        {error && !error.includes('name') && !importError && !studentImportGroupResult && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={handleCloseCreateModal} disabled={isSubmitting}>Cancel</Button><Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={24} /> : 'Create'}</Button></DialogActions>
                </Box>
            </Dialog>

            {/* Edit Class Modal */}
            <Dialog open={showEditModal} onClose={handleCloseEditModal}><DialogTitle>Edit Class: {groupToEdit?.name}</DialogTitle>
                <Box component="form" onSubmit={handleUpdateGroup}>
                    <DialogContent>
                        <TextField autoFocus margin="dense" label="Class Name" fullWidth value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required sx={{ mb: 2 }} error={!!error && error.includes('name')} helperText={error && error.includes('name') ? error : ''} />
                        <TextField margin="dense" label="Description (Optional)" fullWidth multiline rows={3} value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
                        {error && !error.includes('name') && !importError && !studentImportGroupResult && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={handleCloseEditModal} disabled={isSubmitting}>Cancel</Button><Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={24} /> : 'Save'}</Button></DialogActions>
                </Box>
            </Dialog>

            {/* View Class Details & Members Modal */}
            <Dialog open={showDetailsModal} onClose={handleCloseDetailsModal} fullWidth maxWidth="md">
                <DialogTitle>Class Details: {selectedGroup?.name}</DialogTitle>
                <DialogContent>
                    {isLoadingDetails ? <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /></Box>
                    : selectedGroup ? <Box>
                        <Typography variant="body1" gutterBottom><strong>Description:</strong> {selectedGroup.description || <em>No description.</em>}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Created:</strong> {selectedGroup.created_at ? new Date(selectedGroup.created_at).toLocaleString() : 'N/A'}</Typography>
                        
                        {error && !studentImportGroupResult && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
                        {successMessage && !studentImportGroupResult && <Alert severity="success" onClose={() => setSuccessMessage('')} sx={{ mb: 2 }}>{successMessage}</Alert>}

                        <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Students ({selectedGroup.students?.length || 0})</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Button variant="outlined" size="small" startIcon={<GroupAddIcon />} onClick={handleOpenAddStudentModal} disabled={isSubmitting || studentsAvailableToAdd.length === 0 || isImportingStudentsToGroup || isImporting}>Add Student</Button>
                            <input type="file" ref={studentImportFileInputRef} onChange={handleStudentImportFileChange} style={{ display: 'none' }} accept=".csv" />
                            <Tooltip title={<span>Import students to THIS class. CSV: one username per line (optional header).</span>}>
                                <Button variant="outlined" size="small" startIcon={isImportingStudentsToGroup ? <CircularProgress size={16} /> : <CloudUploadIcon />} onClick={handleImportStudentsToGroupClick} disabled={isSubmitting || isLoadingDetails || isImportingStudentsToGroup || isImporting}>
                                    Import Students to Class
                                    <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.7 }} />
                                </Button>
                            </Tooltip>
                        </Box>
                        {studentImportGroupResult && (
                            <Alert severity={studentImportGroupResult.status} onClose={() => setStudentImportGroupResult(null)} sx={{ mb: 2 }}>
                                <Typography fontWeight="bold">{studentImportGroupResult.message}</Typography>
                                {studentImportGroupResult.details?.length > 0 && (
                                    <List dense sx={{ maxHeight: 150, overflow: 'auto', mt: 1, '& .MuiListItemText-root': { my: 0 } }}>
                                        {studentImportGroupResult.details.map((item, index) => (
                                            <ListItem key={index} sx={{ pl: 0, py: 0.2 }}><ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={`${item.username}: ${item.reason}`} /></ListItem>
                                        ))}
                                    </List>
                                )}
                            </Alert>
                        )}
                        {selectedGroup.students?.length > 0 ?
                            <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
                                <List dense>{selectedGroup.students.map(student => (
                                    <ListItem key={student.id} divider>
                                        <ListItemText primary={student.username} secondary={`ID: ${student.id}`} />
                                        <ListItemSecondaryAction>
                                            <Tooltip title="Remove Student"><IconButton edge="end" color="error" size="small" onClick={() => openRemoveStudentConfirm(student)} disabled={isSubmitting || isImportingStudentsToGroup || isImporting}><PersonRemoveIcon fontSize='small' /></IconButton></Tooltip>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}</List>
                            </Paper> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No students in this class.</Typography>
                        }
                    </Box>
                    : <Typography color="error">{error || 'Could not load class details.'}</Typography>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={handleCloseDetailsModal} disabled={isLoadingDetails || isSubmitting || isImportingStudentsToGroup || isImporting}>Close</Button></DialogActions>
            </Dialog>

            {/* Add Student to Class Modal */}
            <Dialog open={showAddStudentModal} onClose={handleCloseAddStudentModal}><DialogTitle>Add Student to Class: {selectedGroup?.name}</DialogTitle>
                <Box component="form" onSubmit={handleAddStudent}>
                    <DialogContent sx={{ minWidth: 300 }}>
                        <FormControl fullWidth margin="dense" required error={!!error && showAddStudentModal}>
                            <InputLabel id="select-student-label">Select Student</InputLabel>
                            <Select labelId="select-student-label" value={studentToAdd} label="Select Student" onChange={(e) => setStudentToAdd(e.target.value)} disabled={studentsAvailableToAdd.length === 0 || isSubmitting}>
                                <MenuItem value="" disabled><em>-- Select a student --</em></MenuItem>
                                {studentsAvailableToAdd.length > 0 ? studentsAvailableToAdd.map(s => (<MenuItem key={s.id} value={s.id}>{s.username} (ID: {s.id})</MenuItem>))
                                : <MenuItem value="" disabled><em>No students available/not in this class.</em></MenuItem>}
                            </Select>
                            {error && showAddStudentModal && !studentImportGroupResult && <DialogContentText color="error" sx={{ mt: 1 }}>{error}</DialogContentText>}
                        </FormControl>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={handleCloseAddStudentModal} disabled={isSubmitting}>Cancel</Button><Button type="submit" variant="contained" disabled={isSubmitting || !studentToAdd || studentsAvailableToAdd.length === 0}>{isSubmitting ? <CircularProgress size={24} /> : 'Add'}</Button></DialogActions>
                </Box>
            </Dialog>

            {/* Delete Class Confirmation */}
            <Dialog open={Boolean(groupToDelete)} onClose={closeDeleteConfirm}><DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent><DialogContentText>Delete class "{groupToDelete?.name}"? Students unassigned. Cannot undo.</DialogContentText>
                    {error && Boolean(groupToDelete) && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={closeDeleteConfirm} disabled={isSubmitting}>Cancel</Button><Button onClick={handleDeleteGroup} color="error" autoFocus disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Delete'}</Button></DialogActions>
            </Dialog>

            {/* Remove Student from Class Confirmation */}
            <Dialog open={Boolean(studentToRemove)} onClose={closeRemoveStudentConfirm}><DialogTitle>Confirm Removal</DialogTitle>
                <DialogContent><DialogContentText>Remove "{studentToRemove?.username}" from "{selectedGroup?.name}"?</DialogContentText>
                    {error && Boolean(studentToRemove) && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={closeRemoveStudentConfirm} disabled={isSubmitting}>Cancel</Button><Button onClick={handleRemoveStudent} color="error" autoFocus disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Remove'}</Button></DialogActions>
            </Dialog>
        </Box>
    );
}
export default UserManagement;