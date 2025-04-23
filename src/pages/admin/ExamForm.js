import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
    Box, Typography, TextField, Button, Paper, Grid, Select, MenuItem, FormControl,
    InputLabel, IconButton, Divider, List, ListItem, ListItemText, RadioGroup,
    FormControlLabel, Radio, Alert, CircularProgress, Tooltip, Chip, // Added Chip for multi-select render
    OutlinedInput // Added OutlinedInput for Select label compatibility
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
    const [isLoading, setIsLoading] = useState(false); // Loading exam data (edit mode)
    const [isSaving, setIsSaving] = useState(false); // Saving state
    const [error, setError] = useState(null); // General/Save errors
    const [fetchError, setFetchError] = useState(null); // Error during initial fetch
    const [importError, setImportError] = useState(null); // Specific CSV import errors
    const [importSuccess, setImportSuccess] = useState(null); // CSV import success message

    // --- State for Groups ---
    const [availableGroups, setAvailableGroups] = useState([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]); // Store IDs of selected groups
    const [isLoadingGroups, setIsLoadingGroups] = useState(false); // Loading state for groups dropdown

    // Ref for the hidden file input
    const fileInputRef = useRef(null);

    // --- Fetch Logic ---

    // Fetch Available Groups (for the dropdown)
    const fetchAvailableGroups = useCallback(async () => {
        setIsLoadingGroups(true);
        try {
            const response = await apiClient.get('/admin/usergroups'); // Use the existing endpoint
            setAvailableGroups(response.data || []);
        } catch (err) {
            console.error("Error fetching groups:", err);
            // Set a general error only if no other fetch error exists
            setFetchError(prev => prev || (err.response?.data?.message || err.message || 'Failed to load user groups.'));
            setAvailableGroups([]);
        } finally {
            setIsLoadingGroups(false);
        }
    }, []); // Empty dependency, fetches once on mount

    // Fetch Exam Data (if editing)
    const fetchExamData = useCallback(async () => {
        if (!examId) return; // Only run if examId exists

        setIsLoading(true);
        setFetchError(null); // Clear previous fetch errors
        try {
            // Backend should return assigned_groups with exam data
            const response = await apiClient.get(`/admin/exams/${examId}`);
            const { name, subject, duration, status, questions: fetchedQuestions, allowed_attempts, assigned_groups } = response.data;

            setExamDetails({
                name: name || '',
                subject: subject || '',
                duration: duration || 60,
                status: status || 'Draft',
                allowed_attempts: allowed_attempts || 1
            });

            // Process fetched questions
            setQuestions(fetchedQuestions ? fetchedQuestions.map(q => {
                const optionsArray = Array.isArray(q.options) ? q.options : [];
                const correctIndex = optionsArray.findIndex(opt => opt === q.correct_answer);
                return {
                    ...q, // Include original question id if present
                    options: optionsArray.length > 0 ? optionsArray : ['', '', '', ''], // Ensure options array format
                    tempId: getTempQuestionId(), // Assign temporary ID for React keys
                    correct_answer_index: optionsArray.length > 0 && correctIndex !== -1 ? correctIndex : null // Set index
                };
            }) : []);

            // Set Selected Group IDs from fetched data
            setSelectedGroupIds(assigned_groups ? assigned_groups.map(g => g.id) : []);

        } catch (err) {
            console.error("Error fetching exam:", err);
            setFetchError(err.response?.data?.message || err.message || 'Failed to load exam data.');
            // Reset form on error
            setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 });
            setQuestions([]);
            setSelectedGroupIds([]);
        } finally {
            setIsLoading(false);
        }
    }, [examId]); // Dependency on examId

    // Combined useEffect for initial data loading
    useEffect(() => {
        // Always fetch groups
        fetchAvailableGroups();
        if (isEditMode) {
            console.log('Edit mode detected, fetching exam data...');
            fetchExamData(); // Fetch specific exam data if editing
        } else {
             // Reset state for create mode
             setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 });
             setQuestions([]);
             setSelectedGroupIds([]);
             setError(null); // Clear any previous errors
             setFetchError(null);
        }
    }, [examId, isEditMode, fetchAvailableGroups, fetchExamData]); // Include all fetch functions


    // --- Event Handlers ---

    const handleDetailChange = (event) => {
        const { name, value, type } = event.target;
        let processedValue = value;
        // Ensure numeric fields are handled correctly
        if ((name === 'allowed_attempts' || name === 'duration') && type === 'number') {
            processedValue = Math.max(1, parseInt(value, 10) || 1); // Ensure at least 1
        }
        setExamDetails(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleAddQuestion = () => {
        setQuestions(prev => [
            ...prev,
            {
                tempId: getTempQuestionId(), // Use temp ID for key
                text: '',
                options: ['', '', '', ''], // Default empty options
                correct_answer_index: null, // Default no correct answer selected
            }
        ]);
    };

    // Update question text
    const handleQuestionChange = (index, field, value) => {
        setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
    };

    // Update option text
    const handleOptionChange = (qIndex, optIndex, value) => {
        setQuestions(prev => prev.map((q, i) => {
            if (i === qIndex) {
                const newOptions = [...q.options];
                newOptions[optIndex] = value;
                // Reset correct index if the text of the correct option is cleared
                let currentCorrectIndex = q.correct_answer_index;
                if (currentCorrectIndex === optIndex && !value?.trim()) {
                   currentCorrectIndex = null;
                }
                return { ...q, options: newOptions, correct_answer_index: currentCorrectIndex };
            }
            return q;
        }));
    };

    // Update selected correct answer index
    const handleCorrectAnswerChange = (qIndex, selectedOptionIndexStr) => {
        // Value from RadioGroup is a string, convert to number
        const selectedIndex = parseInt(selectedOptionIndexStr, 10);
        setQuestions(prev => prev.map((q, i) =>
            i === qIndex ? { ...q, correct_answer_index: selectedIndex } : q
        ));
    };

    const handleRemoveQuestion = (index) => {
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };

    // Handler for Group Selection (Multi-Select)
    const handleGroupSelectionChange = (event) => {
        const { target: { value } } = event;
        // value is an array of selected IDs from the Select component
        setSelectedGroupIds(
            typeof value === 'string' ? value.split(',') : value, // Handle potential string value on autofill
        );
    };

    // --- CSV Import Handlers ---
    const handleImportClick = () => {
        setImportError(null);
        setImportSuccess(null);
        fileInputRef.current?.click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.includes('csv') && !file.name.toLowerCase().endsWith('.csv')) {
            setImportError('Invalid file type. Please upload a CSV file.');
            if(fileInputRef.current) fileInputRef.current.value = null;
            return;
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const importedQuestions = [];
                let rowCount = 0;
                let errorInRow = null;
                let questionsAddedCount = 0;
                let questionsWithErrorCount = 0;

                const expectedHeaders = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer'];
                const actualHeaders = results.meta?.fields?.map(h => h.toLowerCase().trim()) || [];
                const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));

                if (missingHeaders.length > 0) {
                    setImportError(`CSV file is missing required columns: ${missingHeaders.join(', ')}.`);
                    setImportSuccess(null);
                    if(fileInputRef.current) fileInputRef.current.value = null;
                    return;
                }

                for (const row of results.data) {
                    rowCount++;
                    const readColumn = (colName) => {
                        const lowerColName = colName.toLowerCase();
                        const actualKey = Object.keys(row).find(k => k.toLowerCase().trim() === lowerColName);
                        return actualKey ? row[actualKey]?.trim() : undefined;
                    };

                    const questionText = readColumn('question');
                    const option1 = readColumn('option1');
                    const option2 = readColumn('option2');
                    const option3 = readColumn('option3');
                    const option4 = readColumn('option4');
                    const correctAnswerText = readColumn('correct_answer');

                    if (!questionText || !option1 || !option2 || !option3 || !option4 || !correctAnswerText) {
                        errorInRow = `Row ${rowCount + 1}: Missing required data. Skipping row.`;
                        console.warn(errorInRow);
                        questionsWithErrorCount++;
                        continue;
                    }

                    const optionsArray = [option1, option2, option3, option4];
                    const correctIndex = optionsArray.findIndex(opt => opt === correctAnswerText);

                    if (correctIndex === -1) {
                         errorInRow = `Row ${rowCount + 1}: Correct answer '${correctAnswerText}' not found in options. Skipping row.`;
                         console.warn(errorInRow);
                         questionsWithErrorCount++;
                         continue;
                    }

                    importedQuestions.push({
                        tempId: getTempQuestionId(),
                        text: questionText,
                        options: optionsArray,
                        correct_answer_index: correctIndex,
                    });
                    questionsAddedCount++;
                } // End loop

                // Set results
                if (questionsAddedCount > 0) {
                    setQuestions(prev => [...prev, ...importedQuestions]);
                    let successMsg = `${questionsAddedCount} questions imported successfully.`;
                    if (questionsWithErrorCount > 0) {
                       successMsg += ` ${questionsWithErrorCount} rows had errors and were skipped.`;
                       setImportError(`${questionsWithErrorCount} rows had errors/missing data and were skipped.`);
                   } else {
                        setImportError(null);
                   }
                   setImportSuccess(successMsg);
                } else if (results.data.length === 0) {
                    setImportError('No data rows found in the CSV file.');
                    setImportSuccess(null);
                } else if (questionsWithErrorCount > 0) {
                    setImportError(`Import failed. All ${questionsWithErrorCount} data rows had errors or missing data.`);
                    setImportSuccess(null);
                } else {
                    setImportError('Could not import any questions. Check CSV format.');
                    setImportSuccess(null);
                }
                if(fileInputRef.current) fileInputRef.current.value = null; // Reset file input
            },
            error: (error) => {
                console.error("Error parsing CSV:", error);
                setImportError(`Error parsing CSV file: ${error.message}`);
                setImportSuccess(null);
                if(fileInputRef.current) fileInputRef.current.value = null;
            },
        });
    };


    // --- Form Submission ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null); // Clear previous submission errors
        setImportError(null); // Clear import status on save attempt
        setImportSuccess(null);

        // --- Frontend Validation ---
        if (!examDetails.name || !examDetails.subject || !examDetails.duration || !examDetails.allowed_attempts) {
             setError("Exam Name, Subject, Duration, and Allowed Attempts are required.");
             window.scrollTo(0, 0); // Scroll to top to show error
             return;
        }
         if (questions.length === 0) {
             setError("An exam must have at least one question.");
             window.scrollTo(0, 0);
             return;
         }
         // Validate each question
         for (const [index, q] of questions.entries()) {
             if (!q.text?.trim()) { setError(`Question ${index + 1} text cannot be empty.`); window.scrollTo(0, 0); return; }
             // Check if *any* option is empty
             if (q.options.some(opt => !opt?.trim())) { setError(`All options for Question ${index + 1} must be filled.`); window.scrollTo(0, 0); return; }
             // Check if correct answer is selected and valid
             if (q.correct_answer_index === null || q.correct_answer_index < 0 || q.correct_answer_index >= q.options.length ) {
                 setError(`A correct answer must be selected for Question ${index + 1}.`);
                 window.scrollTo(0, 0);
                 return;
             }
             // Check if the text of the selected correct answer is non-empty (belt-and-suspenders)
             if (!q.options[q.correct_answer_index]?.trim()){
                  setError(`Selected correct answer text for Question ${index + 1} cannot be empty (this shouldn't happen if all options are filled).`);
                  window.scrollTo(0, 0);
                  return;
             }
         }
        // --- End Validation ---

        setIsSaving(true);

        // --- Prepare Payload for Backend ---
        const payload = {
            ...examDetails,
            duration: parseInt(examDetails.duration, 10) || 1, // Ensure positive int
            allowed_attempts: parseInt(examDetails.allowed_attempts, 10) || 1, // Ensure positive int
            assigned_group_ids: selectedGroupIds, // Send the array of selected group IDs
            questions: questions.map(({ id, tempId, correct_answer_index, options, ...rest }) => {
                 // Ensure options is an array and trim values
                 const optionsArray = Array.isArray(options) ? options : [];
                 const trimmedOptions = optionsArray.map(opt => (typeof opt === 'string' ? opt.trim() : ''));
                 // Get the correct answer text based on the selected index
                 let correctAnswerText = '';
                 if (correct_answer_index !== null && correct_answer_index >= 0 && correct_answer_index < trimmedOptions.length) {
                     correctAnswerText = trimmedOptions[correct_answer_index];
                 } else {
                     // This case should be caught by frontend validation, but log if it happens
                     console.error(`Invalid correct_answer_index (${correct_answer_index}) during payload creation for question: ${rest.text}`);
                     // Backend should ideally validate this too and return an error
                 }
                 return {
                     ...rest, // Includes 'text'
                     // Only include 'id' if it's an existing question (for updates)
                     ...(id && { id }),
                     options: trimmedOptions,
                     correct_answer: correctAnswerText // Send the correct answer text
                 };
            })
        };

        // --- API Call ---
        try {
            if (isEditMode) {
                await apiClient.put(`/admin/exams/${examId}`, payload);
                // Optional: Add success feedback (e.g., using a snackbar/toast)
            } else {
                await apiClient.post('/admin/exams', payload);
                 // Optional: Add success feedback
            }
            navigate('/admin/exams'); // Redirect on success
        } catch (err) {
            console.error("Error saving exam:", err);
            setError(err.response?.data?.message || err.message || `Failed to ${isEditMode ? 'update' : 'create'} exam.`);
             window.scrollTo(0, 0); // Scroll to top to show error
        } finally {
            setIsSaving(false);
        }
    };


    // --- Render Logic ---

    // Show loading indicator for the whole form if fetching exam data (edit) OR groups (always)
    if ((isLoading && isEditMode) || isLoadingGroups) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    // Show error if initial fetch failed
    if (fetchError) {
        return (
            <Paper sx={{ p: 3, m: 2 }} elevation={3}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Error loading data: {fetchError}
                </Alert>
                <Button
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/admin/exams')}
                >
                    Go Back to Exams
                </Button>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }} elevation={2}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                 <IconButton onClick={() => navigate('/admin/exams')} sx={{ mr: 1 }} aria-label="go back"><ArrowBackIcon /></IconButton>
                <Typography variant="h4" component="h1">{isEditMode ? 'Edit Exam' : 'Create New Exam'}</Typography>
            </Box>

            {/* General Error Alert */}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Form */}
            <Box component="form" onSubmit={handleSubmit}>
                {/* Exam Details Section */}
                <Typography variant="h6" gutterBottom>Exam Details</Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {/* Input Fields */}
                    <Grid item xs={12} md={6}><TextField fullWidth required name="name" label="Exam Name" value={examDetails.name} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth required name="subject" label="Subject" value={examDetails.subject} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><TextField fullWidth required name="duration" label="Duration (min)" type="number" value={examDetails.duration} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><TextField fullWidth required name="allowed_attempts" label="Allowed Attempts" type="number" value={examDetails.allowed_attempts} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><FormControl fullWidth required disabled={isSaving}><InputLabel id="status-select-label">Status</InputLabel><Select labelId="status-select-label" name="status" label="Status" value={examDetails.status} onChange={handleDetailChange}><MenuItem value="Draft">Draft</MenuItem><MenuItem value="Published">Published</MenuItem><MenuItem value="Archived">Archived</MenuItem></Select></FormControl></Grid>

                    {/* Assign to Groups Select */}
                    <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth disabled={isSaving || isLoadingGroups}>
                            <InputLabel id="assign-groups-label">Assign to Groups (Optional)</InputLabel>
                            <Select
                                labelId="assign-groups-label"
                                id="assign-groups-select"
                                multiple
                                value={selectedGroupIds}
                                onChange={handleGroupSelectionChange}
                                input={<OutlinedInput label="Assign to Groups (Optional)" />} // Required for label
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {/* Find group names from availableGroups based on selected IDs */}
                                        {selected.map((id) => {
                                             const group = availableGroups.find(g => g.id === id);
                                             // Display name if found, otherwise ID as fallback
                                             return <Chip key={id} label={group ? group.name : `ID: ${id}`} size="small" />;
                                         })}
                                    </Box>
                                )}
                                MenuProps={{ PaperProps: { style: { maxHeight: 224, width: 250 }}}}
                            >
                                {/* Handle loading/empty states */}
                                {isLoadingGroups && <MenuItem disabled><CircularProgress size={20} sx={{mx: 'auto', display:'block'}}/></MenuItem>}
                                {!isLoadingGroups && availableGroups.length === 0 && <MenuItem disabled>No groups available</MenuItem>}
                                {/* Map available groups */}
                                {availableGroups.map((group) => (
                                    <MenuItem key={group.id} value={group.id}>
                                        {group.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
                <Divider sx={{ my: 3 }} />

                {/* Questions Section Header & Buttons */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                     <Typography variant="h6">Questions</Typography>
                     <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                         {/* Question count display */}
                         <Typography variant="body2" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'inline' } }}>
                            {questions.length > 0 ?
                                `${questions.length} questions` : // Simplified points display
                                'No questions yet'}
                        </Typography>
                        {/* Hidden File Input */}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".csv" />
                         {/* Import Button with Tooltip */}
                        <Tooltip title={ <span> Import questions from CSV.<br /> Required headers: <b>question, option1, option2, option3, option4, correct_answer</b> </span> }>
                             <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportClick} disabled={isSaving} size="small" >
                                Import <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle' }}/>
                            </Button>
                        </Tooltip>
                         {/* Add Question Button */}
                        <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={handleAddQuestion} disabled={isSaving} size="small" >
                            Add Question
                        </Button>
                     </Box>
                 </Box>

                {/* Import Status Messages */}
                {importError && <Alert severity="warning" sx={{ mb: 2 }}>{importError}</Alert>}
                {importSuccess && <Alert severity="success" sx={{ mb: 2 }}>{importSuccess}</Alert>}


                {/* Questions List */}
                {questions.length === 0 && !importError && !importSuccess && (
                    <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic', textAlign: 'center' }}>
                        No questions added yet. Click 'Add Question' or 'Import' to begin.
                    </Typography>
                )}
                <List sx={{mb: 2}}>
                    {questions.map((q, qIndex) => (
                        <React.Fragment key={q.tempId}> {/* Use stable tempId */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, '&:last-child': { mb: 0 } }}>
                                {/* Question Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 'bold' }}>Question {qIndex + 1}</Typography>
                                    <Tooltip title={`Delete Question ${qIndex + 1}`}>
                                        <IconButton size="small" color="error" onClick={() => handleRemoveQuestion(qIndex)} disabled={isSaving} aria-label={`delete question ${qIndex + 1}`}><DeleteIcon fontSize="small" /></IconButton>
                                    </Tooltip>
                                </Box>
                                {/* Question Text */}
                                <TextField fullWidth required multiline minRows={2} label="Question Text" value={q.text || ''} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} sx={{ mb: 2 }} disabled={isSaving} />
                                {/* Options */}
                                 <Typography variant="body2" sx={{mb: 1, fontWeight: 500}}>Options (Select correct answer radio button):</Typography>
                                 <RadioGroup name={`correct-answer-group-${q.tempId}`} // Unique group name
                                    value={q.correct_answer_index !== null ? String(q.correct_answer_index) : ''} // Ensure value is string or empty string
                                    onChange={(e) => handleCorrectAnswerChange(qIndex, e.target.value)} >
                                    {(Array.isArray(q.options) ? q.options : ['', '', '', '']).map((opt, optIndex) => (
                                        <Grid container spacing={1} alignItems="center" key={optIndex} sx={{ mb: 1 }}>
                                            {/* Radio Button */}
                                            <Grid item xs={'auto'} sx={{pr: 0}}>
                                                 <FormControlLabel
                                                    value={String(optIndex)} // Value must be string
                                                    control={<Radio disabled={isSaving} size="small"/>} label="" sx={{ mr: 0 }}
                                                    aria-label={`Select option ${optIndex + 1} as correct answer for question ${qIndex + 1}`}
                                                />
                                            </Grid>
                                            {/* Option Text Field */}
                                            <Grid item xs>
                                                 <TextField fullWidth required size="small" label={`Option ${optIndex + 1}`}
                                                    value={opt || ''} // Handle potential null/undefined
                                                    onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                                                    disabled={isSaving} />
                                            </Grid>
                                        </Grid>
                                    ))}
                                </RadioGroup>
                            </Paper>
                        </React.Fragment>
                    ))}
                </List>


                {/* Submission Area */}
                 {/* Display final submission error here as well */}
                 {error && <Alert severity="error" sx={{ mt: 3, mb: 2 }}>{error}</Alert>}
                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate('/admin/exams')} disabled={isSaving}>Cancel</Button>
                    <Button type="submit" variant="contained" startIcon={isSaving ? <CircularProgress size={20} color="inherit"/> : <SaveIcon />} disabled={isSaving || isLoadingGroups /* Also disable if groups haven't loaded */}>
                        {isSaving ? 'Saving...' : (isEditMode ? 'Update Exam' : 'Create Exam')}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
}

export default ExamForm;