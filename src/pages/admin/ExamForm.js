import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx'; // Import xlsx library
import {
    Box, Typography, TextField, Button, Paper, Grid, Select, MenuItem, FormControl,
    InputLabel, IconButton, Divider, List, ListItem, ListItemText, RadioGroup,
    FormControlLabel, Radio, Alert, CircularProgress, Tooltip, Chip,
    OutlinedInput,
    Menu // Added Menu for the template dropdown
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
// import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'; // Optional for template button
import apiClient from '../../api'; // Adjust path as needed

// Helper function to format date-time (if needed elsewhere, keep it)
const formatDateTimeForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) { throw new Error("Invalid date string"); }
        const offset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offset);
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        console.error("Error formatting date for input:", isoString, e);
        return '';
    }
};

// Counter for temporary unique keys for new questions
let tempQuestionIdCounter = 0;
const getTempQuestionId = () => `temp-${tempQuestionIdCounter++}`;

// --- ExamForm Component ---
function ExamForm() {
    const { examId } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(examId);

    // --- State Variables ---
    const [examDetails, setExamDetails] = useState({
        name: '',
        subject: '',
        duration: 60,
        status: 'Draft',
        allowed_attempts: 1,
    });
    const [questions, setQuestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [importError, setImportError] = useState(null);
    const [importSuccess, setImportSuccess] = useState(null);

    const [availableGroups, setAvailableGroups] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);

    const fileInputRef = useRef(null);

    // State for Template download menu
    const [templateMenuAnchorEl, setTemplateMenuAnchorEl] = useState(null);


    // --- Fetch Logic ---
    const fetchAvailableGroups = useCallback(async () => {
        setIsLoadingGroups(true);
        try {
            const response = await apiClient.get('/admin/usergroups');
            setAvailableGroups(response.data || []);
        } catch (err) {
            console.error("Error fetching groups:", err);
            setFetchError(prev => prev || (err.response?.data?.message || err.message || 'Failed to load user groups.'));
            setAvailableGroups([]);
        } finally {
            setIsLoadingGroups(false);
        }
    }, []);

    const fetchExamData = useCallback(async () => {
        if (!examId) return;
        setIsLoading(true);
        setFetchError(null);
        try {
            const response = await apiClient.get(`/admin/exams/${examId}`);
            const { name, subject, duration, status, questions: fetchedQuestions, allowed_attempts, assigned_groups } = response.data;
            setExamDetails({
                name: name || '', subject: subject || '', duration: duration || 60,
                status: status || 'Draft', allowed_attempts: allowed_attempts || 1
            });
            setQuestions(fetchedQuestions ? fetchedQuestions.map(q => {
                const optionsArray = Array.isArray(q.options) ? q.options : [];
                const correctIndex = optionsArray.findIndex(opt => opt === q.correct_answer);
                return {
                    ...q, options: optionsArray.length > 0 ? optionsArray : ['', '', '', ''],
                    tempId: getTempQuestionId(), correct_answer_index: optionsArray.length > 0 && correctIndex !== -1 ? correctIndex : null
                };
            }) : []);
            setSelectedGroupIds(assigned_groups ? assigned_groups.map(g => g.id) : []);
        } catch (err) {
            console.error("Error fetching exam:", err);
            setFetchError(err.response?.data?.message || err.message || 'Failed to load exam data.');
            setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 });
            setQuestions([]);
            setSelectedGroupIds([]);
        } finally {
            setIsLoading(false);
        }
    }, [examId]);

    useEffect(() => {
        fetchAvailableGroups();
        if (isEditMode) {
            fetchExamData();
        } else {
            setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 });
            setQuestions([]);
            setSelectedGroupIds([]);
            setError(null);
            setFetchError(null);
        }
    }, [examId, isEditMode, fetchAvailableGroups, fetchExamData]);


    // --- Event Handlers ---
    const handleDetailChange = (event) => {
        const { name, value, type } = event.target;
        let processedValue = value;
        if ((name === 'allowed_attempts' || name === 'duration') && type === 'number') {
            processedValue = Math.max(1, parseInt(value, 10) || 1);
        }
        setExamDetails(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleAddQuestion = () => {
        setQuestions(prev => [
            ...prev, { tempId: getTempQuestionId(), text: '', options: ['', '', '', ''], correct_answer_index: null }
        ]);
    };

    const handleQuestionChange = (index, field, value) => {
        setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
    };

    const handleOptionChange = (qIndex, optIndex, value) => {
        setQuestions(prev => prev.map((q, i) => {
            if (i === qIndex) {
                const newOptions = [...q.options]; newOptions[optIndex] = value;
                let currentCorrectIndex = q.correct_answer_index;
                if (currentCorrectIndex === optIndex && !value?.trim()) currentCorrectIndex = null;
                return { ...q, options: newOptions, correct_answer_index: currentCorrectIndex };
            }
            return q;
        }));
    };

    const handleCorrectAnswerChange = (qIndex, selectedOptionIndexStr) => {
        const selectedIndex = parseInt(selectedOptionIndexStr, 10);
        setQuestions(prev => prev.map((q, i) => i === qIndex ? { ...q, correct_answer_index: selectedIndex } : q));
    };

    const handleRemoveQuestion = (index) => {
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };

    const handleGroupSelectionChange = (event) => {
        const { target: { value } } = event;
        setSelectedGroupIds(typeof value === 'string' ? value.split(',') : value);
    };


    // --- Template Download Handlers ---
    const handleTemplateMenuOpen = (event) => {
        setTemplateMenuAnchorEl(event.currentTarget);
    };

    const handleTemplateMenuClose = () => {
        setTemplateMenuAnchorEl(null);
    };

    const handleDownloadTemplate = (format) => {
        const headers = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer'];
        const filename = `exam_questions_template`;

        if (format === 'csv') {
            const csvContent = headers.join(",") + "\n";
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `${filename}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } else if (format === 'xlsx') {
            const worksheetData = [headers]; // Data for XLSX is an array of arrays
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
        handleTemplateMenuClose();
    };

    // --- File Import Handlers ---
    const handleImportClick = () => {
        setImportError(null);
        setImportSuccess(null);
        fileInputRef.current?.click();
    };

    // Centralized function to process parsed data from CSV or XLSX
    const processParsedFileData = (parsedResults) => {
        // parsedResults = { data: [arrayOfObjects], meta: { fields: [arrayOfHeaders] } }
        const importedQuestions = [];
        let questionsAddedCount = 0;
        let questionsWithErrorCount = 0;
        let generalImportError = null;

        const expectedHeaders = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer'];
        const actualFileHeaders = parsedResults.meta?.fields?.map(h => String(h).toLowerCase().trim()) || [];

        const missingHeaders = expectedHeaders.filter(h => !actualFileHeaders.includes(h));
        if (missingHeaders.length > 0) {
            setImportError(`File is missing required columns: ${missingHeaders.join(', ')}.`);
            setImportSuccess(null);
            if (fileInputRef.current) fileInputRef.current.value = null;
            return;
        }

        // Filter out rows where all values are empty strings (can happen with XLSX if defval is used)
        // PapaParse with skipEmptyLines=true already handles truly empty lines for CSV.
        const dataRows = parsedResults.data.filter(row =>
            Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '')
        );

        if (dataRows.length === 0) {
            setImportError('No data rows found in the file.');
            setImportSuccess(null);
            if (fileInputRef.current) fileInputRef.current.value = null;
            return;
        }
        
        let rowSpecificErrors = [];

        dataRows.forEach((row, rowIndex) => {
            const currentRowNumberForError = rowIndex + 1; // 1-based for user messages

            const readColumn = (colName) => {
                const lowerColName = colName.toLowerCase();
                // Find the key in the current row object that matches the expected header (case-insensitive, trimmed)
                const actualKey = Object.keys(row).find(k => String(k).toLowerCase().trim() === lowerColName);
                return actualKey && row[actualKey] !== undefined && row[actualKey] !== null ? String(row[actualKey]).trim() : undefined;
            };

            const questionText = readColumn('question');
            const option1 = readColumn('option1');
            const option2 = readColumn('option2');
            const option3 = readColumn('option3');
            const option4 = readColumn('option4');
            const correctAnswerText = readColumn('correct_answer');

            if (!questionText || !option1 || !option2 || !option3 || !option4 || !correctAnswerText) {
                rowSpecificErrors.push(`Row ${currentRowNumberForError}: Missing required data.`);
                questionsWithErrorCount++;
                return; // Skips this row
            }

            const optionsArray = [option1, option2, option3, option4];
            const correctIndex = optionsArray.findIndex(opt => opt === correctAnswerText);

            if (correctIndex === -1) {
                rowSpecificErrors.push(`Row ${currentRowNumberForError}: Correct answer '${correctAnswerText}' not found in options.`);
                questionsWithErrorCount++;
                return; // Skips this row
            }

            importedQuestions.push({
                tempId: getTempQuestionId(),
                text: questionText,
                options: optionsArray,
                correct_answer_index: correctIndex,
            });
            questionsAddedCount++;
        }); // End forEach dataRow

        if (questionsAddedCount > 0) {
            setQuestions(prev => [...prev, ...importedQuestions]);
            let successMsg = `${questionsAddedCount} questions imported successfully.`;
            if (questionsWithErrorCount > 0) {
                successMsg += ` ${questionsWithErrorCount} rows had errors and were skipped.`;
                // Show first few errors or a summary
                generalImportError = `${questionsWithErrorCount} rows had errors. First error: ${rowSpecificErrors[0]}`;
            }
            setImportSuccess(successMsg);
        } else if (dataRows.length > 0 && questionsWithErrorCount === dataRows.length) {
            generalImportError = `Import failed. All ${questionsWithErrorCount} data rows had errors or missing data. First error: ${rowSpecificErrors[0]}`;
        } else if (dataRows.length === 0) { // Should have been caught earlier, but as a fallback
            generalImportError = 'No valid data rows found to import.';
        } else { // No questions added, but not all rows had errors (e.g. file structure issue not caught earlier)
            generalImportError = 'Could not import any questions. Please check file format and data.';
        }

        if (generalImportError) {
            setImportError(generalImportError);
        } else if (questionsAddedCount > 0 && questionsWithErrorCount === 0) {
            setImportError(null); // Clear previous errors if all good
        }


        if (fileInputRef.current) fileInputRef.current.value = null; // Reset file input
    };


    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setImportError(null); // Clear previous import messages
        setImportSuccess(null);

        const fileName = file.name.toLowerCase();
        const isCsv = file.type.includes('csv') || fileName.endsWith('.csv');
        const isXlsx = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                       file.type === 'application/vnd.ms-excel' || // For .xls
                       fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (!isCsv && !isXlsx) {
            setImportError('Invalid file type. Please upload a CSV or XLSX file.');
            if (fileInputRef.current) fileInputRef.current.value = null;
            return;
        }

        if (isCsv) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    // Ensure meta.fields exists or derive from first data row keys if possible
                    const headers = results.meta && results.meta.fields
                        ? results.meta.fields
                        : (results.data.length > 0 ? Object.keys(results.data[0]) : []);
                    processParsedFileData({ data: results.data, meta: { fields: headers } });
                },
                error: (error) => {
                    console.error("Error parsing CSV:", error);
                    setImportError(`Error parsing CSV file: ${error.message}`);
                    if (fileInputRef.current) fileInputRef.current.value = null;
                },
            });
        } else if (isXlsx) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];

                    if (!sheetName) {
                        setImportError('XLSX file seems empty or has no sheets.');
                        if (fileInputRef.current) fileInputRef.current.value = null;
                        return;
                    }
                    const worksheet = workbook.Sheets[sheetName];
                    // header: 1 -> array of arrays. defval: "" to handle empty cells as empty strings
                    const jsonDataAoA = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                    if (jsonDataAoA.length === 0) {
                        setImportError('XLSX sheet is empty (no header row).');
                        if (fileInputRef.current) fileInputRef.current.value = null;
                        return;
                    }

                    const headersFromXlsx = jsonDataAoA[0].map(h => String(h)); // Keep original case for keys, normalization in processParsedFileData
                    const dataRowsRaw = jsonDataAoA.slice(1);

                    const parsedData = dataRowsRaw.map(rowArray => {
                        const rowObject = {};
                        headersFromXlsx.forEach((header, index) => {
                            // Use original header string as key, as PapaParse does with `header: true`
                            rowObject[header] = (rowArray[index] !== undefined && rowArray[index] !== null) ? String(rowArray[index]) : "";
                        });
                        return rowObject;
                    });
                    processParsedFileData({ data: parsedData, meta: { fields: headersFromXlsx } });

                } catch (xlsxError) {
                    console.error("Error processing XLSX:", xlsxError);
                    setImportError(`Error processing XLSX file: ${xlsxError.message}`);
                    if (fileInputRef.current) fileInputRef.current.value = null;
                }
            };
            reader.onerror = (readError) => {
                console.error("Error reading XLSX file:", readError);
                setImportError('Error reading XLSX file.');
                if (fileInputRef.current) fileInputRef.current.value = null;
            };
            reader.readAsArrayBuffer(file);
        }
    };


    // --- Form Submission ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setImportError(null);
        setImportSuccess(null);

        if (!examDetails.name || !examDetails.subject || !examDetails.duration || !examDetails.allowed_attempts) {
            setError("Exam Name, Subject, Duration, and Allowed Attempts are required.");
            window.scrollTo(0, 0); return;
        }
        if (questions.length === 0) {
            setError("An exam must have at least one question.");
            window.scrollTo(0, 0); return;
        }
        for (const [index, q] of questions.entries()) {
            if (!q.text?.trim()) { setError(`Question ${index + 1} text cannot be empty.`); window.scrollTo(0, 0); return; }
            if (q.options.some(opt => !opt?.trim())) { setError(`All options for Question ${index + 1} must be filled.`); window.scrollTo(0, 0); return; }
            if (q.correct_answer_index === null || q.correct_answer_index < 0 || q.correct_answer_index >= q.options.length) {
                setError(`A correct answer must be selected for Question ${index + 1}.`); window.scrollTo(0, 0); return;
            }
            if (!q.options[q.correct_answer_index]?.trim()) {
                setError(`Selected correct answer text for Question ${index + 1} cannot be empty.`); window.scrollTo(0, 0); return;
            }
        }
        setIsSaving(true);
        const payload = {
            ...examDetails,
            duration: parseInt(examDetails.duration, 10) || 1,
            allowed_attempts: parseInt(examDetails.allowed_attempts, 10) || 1,
            assigned_group_ids: selectedGroupIds,
            questions: questions.map(({ id, tempId, correct_answer_index, options, ...rest }) => {
                const optionsArray = Array.isArray(options) ? options : [];
                const trimmedOptions = optionsArray.map(opt => (typeof opt === 'string' ? opt.trim() : ''));
                let correctAnswerText = '';
                if (correct_answer_index !== null && correct_answer_index >= 0 && correct_answer_index < trimmedOptions.length) {
                    correctAnswerText = trimmedOptions[correct_answer_index];
                } else {
                    console.error(`Invalid correct_answer_index (${correct_answer_index}) for question: ${rest.text}`);
                }
                return { ...rest, ...(id && { id }), options: trimmedOptions, correct_answer: correctAnswerText };
            })
        };

        try {
            if (isEditMode) {
                await apiClient.put(`/admin/exams/${examId}`, payload);
            } else {
                await apiClient.post('/admin/exams', payload);
            }
            navigate('/admin/exams');
        } catch (err) {
            console.error("Error saving exam:", err);
            setError(err.response?.data?.message || err.message || `Failed to ${isEditMode ? 'update' : 'create'} exam.`);
            window.scrollTo(0, 0);
        } finally {
            setIsSaving(false);
        }
    };


    // --- Render Logic ---
    if ((isLoading && isEditMode) || isLoadingGroups) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }
    if (fetchError) {
        return (
            <Paper sx={{ p: 3, m: 2 }} elevation={3}>
                <Alert severity="error" sx={{ mb: 2 }}>Error loading data: {fetchError}</Alert>
                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/exams')}>Go Back to Exams</Button>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }} elevation={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <IconButton onClick={() => navigate('/admin/exams')} sx={{ mr: 1 }} aria-label="go back"><ArrowBackIcon /></IconButton>
                <Typography variant="h4" component="h1">{isEditMode ? 'Edit Exam' : 'Create New Exam'}</Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit}>
                <Typography variant="h6" gutterBottom>Exam Details</Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={6}><TextField fullWidth required name="name" label="Exam Name" value={examDetails.name} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth required name="subject" label="Subject" value={examDetails.subject} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} sm={6} md={2}><TextField fullWidth required name="duration" label="Duration (min)" type="number" value={examDetails.duration} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={2}><TextField fullWidth required name="allowed_attempts" label="Allowed Attempts" type="number" value={examDetails.allowed_attempts} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth required disabled={isSaving}>
                            <InputLabel id="status-select-label">Status</InputLabel>
                            <Select labelId="status-select-label" name="status" label="Status" value={examDetails.status} onChange={handleDetailChange}>
                                <MenuItem value="Draft">Draft</MenuItem>
                                <MenuItem value="Published">Published</MenuItem>
                                <MenuItem value="Archived">Archived</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={5}>
                        <FormControl fullWidth disabled={isSaving || isLoadingGroups}>
                            <InputLabel id="assign-groups-label">Assign to Groups (Optional)</InputLabel>
                            <Select labelId="assign-groups-label" id="assign-groups-select" multiple value={selectedGroupIds} onChange={handleGroupSelectionChange}
                                input={<OutlinedInput label="Assign to Groups (Optional)" />}
                                renderValue={(selected) => {
                                    if (selected.length === 0) return <Box component="span" sx={{ opacity: 0 }}> </Box>;
                                    const MAX_VISIBLE_CHIPS = 1;
                                    const chipsToRender = selected.slice(0, MAX_VISIBLE_CHIPS).map(id => {
                                        const group = availableGroups.find(g => g.id === id);
                                        return <Chip key={id} label={group ? group.name : `ID: ${id}`} size="small" />;
                                    });
                                    const remainingCount = selected.length - MAX_VISIBLE_CHIPS;
                                    return (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
                                            {chipsToRender}
                                            {remainingCount > 0 && <Typography variant="body2" component="span" sx={{ whiteSpace: 'nowrap', pl: chipsToRender.length > 0 ? 0.5 : 0 }}>+{remainingCount} more</Typography>}
                                        </Box>
                                    );
                                }}
                                MenuProps={{ PaperProps: { style: { maxHeight: 224 } } }} >
                                {isLoadingGroups && <MenuItem disabled><CircularProgress size={20} sx={{ mx: 'auto', display: 'block' }} /></MenuItem>}
                                {!isLoadingGroups && availableGroups.length === 0 && <MenuItem disabled>No groups available</MenuItem>}
                                {availableGroups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
                <Divider sx={{ my: 3 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h6">Questions</Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'inline' } }}>
                            {questions.length > 0 ? `${questions.length} questions` : 'No questions yet'}
                        </Typography>

                        {/* Template Button and Menu */}
                        <Button
                            variant="outlined"
                            onClick={handleTemplateMenuOpen}
                            disabled={isSaving}
                            size="small"
                            // endIcon={<ArrowDropDownIcon />} // Optional: to indicate dropdown
                        >
                            Template
                        </Button>
                        <Menu
                            id="template-menu"
                            anchorEl={templateMenuAnchorEl}
                            open={Boolean(templateMenuAnchorEl)}
                            onClose={handleTemplateMenuClose}
                            MenuListProps={{ 'aria-labelledby': 'template-button' }}
                        >
                            <MenuItem onClick={() => handleDownloadTemplate('csv')}>Download CSV Template</MenuItem>
                            <MenuItem onClick={() => handleDownloadTemplate('xlsx')}>Download XLSX Template</MenuItem>
                        </Menu>

                        {/* Hidden File Input (accepts .csv and .xlsx) */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept=".csv,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        />
                        {/* Import Button with Updated Tooltip */}
                        <Tooltip title={<span>Import questions from CSV or XLSX.<br />Required headers: <b>question, option1, option2, option3, option4, correct_answer</b></span>}>
                            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportClick} disabled={isSaving} size="small">
                                Import <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                            </Button>
                        </Tooltip>
                        <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={handleAddQuestion} disabled={isSaving} size="small">
                            Add Question
                        </Button>
                    </Box>
                </Box>

                {importError && <Alert severity="warning" sx={{ mb: 2 }}>{importError}</Alert>}
                {importSuccess && <Alert severity="success" sx={{ mb: 2 }}>{importSuccess}</Alert>}

                {questions.length === 0 && !importError && !importSuccess && (
                    <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic', textAlign: 'center' }}>
                        No questions added yet. Click 'Add Question' or 'Import' to begin.
                    </Typography>
                )}
                <List sx={{ mb: 2 }}>
                    {questions.map((q, qIndex) => (
                        <React.Fragment key={q.tempId}>
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, '&:last-child': { mb: 0 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 'bold' }}>Question {qIndex + 1}</Typography>
                                    <Tooltip title={`Delete Question ${qIndex + 1}`}>
                                        <IconButton size="small" color="error" onClick={() => handleRemoveQuestion(qIndex)} disabled={isSaving} aria-label={`delete question ${qIndex + 1}`}><DeleteIcon fontSize="small" /></IconButton>
                                    </Tooltip>
                                </Box>
                                <TextField fullWidth required multiline minRows={2} label="Question Text" value={q.text || ''} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} sx={{ mb: 2 }} disabled={isSaving} />
                                <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>Options (Select correct answer radio button):</Typography>
                                <RadioGroup name={`correct-answer-group-${q.tempId}`} value={q.correct_answer_index !== null ? String(q.correct_answer_index) : ''} onChange={(e) => handleCorrectAnswerChange(qIndex, e.target.value)} >
                                    {(Array.isArray(q.options) ? q.options : ['', '', '', '']).map((opt, optIndex) => (
                                        <Grid container spacing={1} alignItems="center" key={optIndex} sx={{ mb: 1 }}>
                                            <Grid item xs={'auto'} sx={{ pr: 0 }}>
                                                <FormControlLabel value={String(optIndex)} control={<Radio disabled={isSaving} size="small" />} label="" sx={{ mr: 0 }} aria-label={`Select option ${optIndex + 1} as correct answer for question ${qIndex + 1}`} />
                                            </Grid>
                                            <Grid item xs>
                                                <TextField fullWidth required size="small" label={`Option ${optIndex + 1}`} value={opt || ''} onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)} disabled={isSaving} />
                                            </Grid>
                                        </Grid>
                                    ))}
                                </RadioGroup>
                            </Paper>
                        </React.Fragment>
                    ))}
                </List>

                {error && <Alert severity="error" sx={{ mt: 3, mb: 2 }}>{error}</Alert>}
                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate('/admin/exams')} disabled={isSaving}>Cancel</Button>
                    <Button type="submit" variant="contained" startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />} disabled={isSaving || isLoadingGroups}>
                        {isSaving ? 'Saving...' : (isEditMode ? 'Update Exam' : 'Create Exam')}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
}

export default ExamForm;