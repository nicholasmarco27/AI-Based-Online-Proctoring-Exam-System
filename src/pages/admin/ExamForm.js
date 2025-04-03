// src/pages/admin/ExamForm.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, Grid, Select, MenuItem, FormControl,
    InputLabel, IconButton, Divider, List, ListItem, ListItemText, RadioGroup,
    FormControlLabel, Radio, Alert, CircularProgress
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import apiClient from '../../api'; // Your Axios instance


/**
 * Helper function to format an ISO date string (or null/undefined)
 * into the 'YYYY-MM-DDTHH:MM' format required by datetime-local input fields.
 * Adjusts for the local timezone offset.
 * @param {string | null | undefined} isoString - The ISO date string from the backend.
 * @returns {string} - The formatted string for the input, or '' if input is invalid/null.
 */
const formatDateTimeForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date string");
        }
        // Calculate local timezone offset in milliseconds
        const offset = date.getTimezoneOffset() * 60000;
        // Create a new Date object adjusted for the local timezone
        const localDate = new Date(date.getTime() - offset);
        // Return the date in 'YYYY-MM-DDTHH:MM' format
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        console.error("Error formatting date for input:", isoString, e);
        return ''; // Fallback to empty string on error
    }
};


// Counter for generating temporary unique keys for newly added questions
let tempQuestionIdCounter = 0;
const getTempQuestionId = () => `temp-${tempQuestionIdCounter++}`;


// --- ExamForm Component ---
function ExamForm() {
    const { examId } = useParams(); // Get examId from URL if editing: /admin/exams/:examId/edit
    const navigate = useNavigate(); // Hook for navigation
    const isEditMode = Boolean(examId); // Check if we are in edit mode


    // --- State Variables ---
    const [examDetails, setExamDetails] = useState({
        name: '',
        subject: '',
        duration: 60,
        status: 'Draft',
        allowed_attempts: 1,
    });
    const [questions, setQuestions] = useState([]); // Array of question objects
    const [isLoading, setIsLoading] = useState(false); // Loading data state (for edit mode)
    const [isSaving, setIsSaving] = useState(false); // Saving data state
    const [error, setError] = useState(null); // Submission/validation errors
    const [fetchError, setFetchError] = useState(null); // Errors during initial data load


    // --- Update Fetch Logic ---
    useEffect(() => {
        if (isEditMode) {
            setIsLoading(true);
            setFetchError(null);
            apiClient.get(`/admin/exams/${examId}`)
                .then(response => {
                    // Destructure without start_time, end_time
                    const { name, subject, duration, status, questions: fetchedQuestions, allowed_attempts } = response.data;
                    setExamDetails({
                        name: name || '', subject: subject || '', duration: duration || 60, status: status || 'Draft',
                        allowed_attempts: allowed_attempts || 1
                        // --- REMOVE date formatting ---
                    });
                    // ... (question state setting remains similar) ...
                     setQuestions(fetchedQuestions ? fetchedQuestions.map(q => ({...q, tempId: getTempQuestionId(), correct_answer_index: q.options.indexOf(q.correct_answer) ?? null })) : []);
                })
                .catch(err => { setFetchError(/*...*/); })
                .finally(() => setIsLoading(false));
        } else {
             // Reset state for create mode
             setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 }); // Remove dates here too
             setQuestions([]);
        }
    }, [examId, isEditMode]);


    // --- Event Handlers ---


    // Update basic exam details (name, subject, duration, etc.)
    const handleDetailChange = (event) => {
        const { name, value, type } = event.target;
        let processedValue = value;
        if ((name === 'allowed_attempts' || name === 'duration') && type === 'number') {
            processedValue = Math.max(1, parseInt(value, 10) || 1); // Ensure positive integer >= 1
        }
        setExamDetails(prev => ({ ...prev, [name]: processedValue }));
    };


    // Add a new blank question structure to the state
    const handleAddQuestion = () => {
        setQuestions(prev => [
            ...prev,
            {
                tempId: getTempQuestionId(), // Use temporary ID for key
                text: '',
                options: ['', '', '', ''], // Default 4 options
                correct_answer_index: null, // Store index, null initially
            }
        ]);
    };


    // Update the text of a question
    const handleQuestionChange = (index, field, value) => {
        setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
    };


    // Update the text of a specific option within a question
    const handleOptionChange = (qIndex, optIndex, value) => {
        setQuestions(prev => prev.map((q, i) => {
            if (i === qIndex) {
                const newOptions = [...q.options];
                newOptions[optIndex] = value;
                // If the currently selected correct answer index points outside the new options
                // or if the text at that index no longer matches the previously derived text, clear the index.
                let currentCorrectIndex = q.correct_answer_index;
                if (currentCorrectIndex !== null && !newOptions[currentCorrectIndex]){
                    currentCorrectIndex = null; // Clear if index becomes invalid
                }


                return { ...q, options: newOptions, correct_answer_index: currentCorrectIndex };
            }
            return q;
        }));
    };


    // Update which option is marked as the correct answer (stores the index)
    const handleCorrectAnswerChange = (qIndex, selectedOptionIndexStr) => {
        const selectedIndex = parseInt(selectedOptionIndexStr, 10); // Convert string value from radio button to number
        setQuestions(prev => prev.map((q, i) =>
            i === qIndex ? { ...q, correct_answer_index: selectedIndex } : q
        ));
    };


    // Remove a question from the list by its index
    const handleRemoveQuestion = (index) => {
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };


    // --- Form Submission ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null); // Clear previous errors


        // --- Frontend Validation ---
        if (!examDetails.name || !examDetails.subject || !examDetails.duration || !examDetails.allowed_attempts) {
             setError("Exam Name, Subject, Duration, and Allowed Attempts are required.");
             return;
        }

        // Validate questions
         if (questions.length === 0) {
             setError("An exam must have at least one question.");
             return;
         }
         for (const [index, q] of questions.entries()) {
             if (!q.text?.trim()) { setError(`Question ${index + 1} text cannot be empty.`); return; }
             if (q.options.some(opt => !opt?.trim())) { setError(`All options for Question ${index + 1} must be filled.`); return; }
             // Check if index is selected and valid
             if (q.correct_answer_index === null || q.correct_answer_index < 0 || q.correct_answer_index >= q.options.length ) {
                 setError(`A correct answer must be selected for Question ${index + 1}.`);
                 return;
             }
              // Check if the text at the selected index is valid
             if (!q.options[q.correct_answer_index]?.trim()){
                  setError(`Selected correct answer text for Question ${index + 1} cannot be empty.`);
                  return;
             }
         }
        // --- End Validation ---


        setIsSaving(true);


        // --- Prepare Payload for Backend ---
        const payload = {
            ...examDetails,
            duration: parseInt(examDetails.duration, 10) || 0,
            allowed_attempts: parseInt(examDetails.allowed_attempts, 10) || 1,
            // Process questions: get correct answer text using the stored index
            questions: questions.map(({ id, tempId, correct_answer_index, options, ...rest }, index) => {
                const optionsArray = Array.isArray(options) ? options : [];
                const trimmedOptions = optionsArray.map(opt => (typeof opt === 'string' ? opt.trim() : ''));
                let correctAnswerText = '';
                if (correct_answer_index !== null && correct_answer_index >= 0 && correct_answer_index < trimmedOptions.length) {
                    correctAnswerText = trimmedOptions[correct_answer_index]; // Get text using index
                } else {
                    // This case should be prevented by validation, but handle defensively
                    console.error(`Invalid correct_answer_index (${correct_answer_index}) found during payload creation for question text: "${rest.text?.substring(0,50)}..." (Index: ${index})`);
                }
                return { ...rest, options: trimmedOptions, correct_answer: correctAnswerText };
            })
        };


        // --- API Call ---
        try {
            if (isEditMode) {
                await apiClient.put(`/admin/exams/${examId}`, payload);
            } else {
                await apiClient.post('/admin/exams', payload);
            }
            navigate('/admin/exams'); // Navigate back to list on success
        } catch (err) {
            console.error("Error saving exam:", err);
            setError(err.response?.data?.message || err.message || `Failed to ${isEditMode ? 'update' : 'create'} exam.`);
        } finally {
            setIsSaving(false);
        }
    };


    // --- Render Logic ---


    // Show loading spinner while fetching data
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }


    // Show error message if fetching failed
    if (fetchError) {
        return (
            <Paper sx={{ p: 3 }}><Alert severity="error">Error loading exam data: {fetchError}
            <Button onClick={() => navigate('/admin/exams')} sx={{ ml: 2 }}>Go Back</Button></Alert></Paper>
        );
    }


    // Render the form
    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }} elevation={2}>
            {/* Header with Back Button and Title */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                 <IconButton onClick={() => navigate('/admin/exams')} sx={{ mr: 1 }} aria-label="go back"><ArrowBackIcon /></IconButton>
                <Typography variant="h4">{isEditMode ? 'Edit Exam' : 'Create New Exam'}</Typography>
            </Box>


            {/* Form */}
            <Box component="form" onSubmit={handleSubmit}>
                {/* Exam Details Fields */}
                <Typography variant="h6" gutterBottom>Exam Details</Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {/* Row 1: Name, Subject */}
                    <Grid item xs={12} md={6}><TextField fullWidth required name="name" label="Exam Name" value={examDetails.name} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth required name="subject" label="Subject" value={examDetails.subject} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    {/* Row 2: Duration, Status, Attempts */}
                    <Grid item xs={12} sm={6} md={4}><TextField fullWidth required name="duration" label="Duration (min)" type="number" value={examDetails.duration} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControl fullWidth required disabled={isSaving}><InputLabel id="status-select-label">Status</InputLabel><Select labelId="status-select-label" name="status" label="Status" value={examDetails.status} onChange={handleDetailChange}><MenuItem value="Draft">Draft</MenuItem><MenuItem value="Published">Published</MenuItem><MenuItem value="Archived">Archived</MenuItem></Select></FormControl></Grid>
                    <Grid item xs={12} sm={6} md={4}><TextField fullWidth required name="allowed_attempts" label="Allowed Attempts" type="number" value={examDetails.allowed_attempts} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                </Grid>
                <Divider sx={{ my: 3 }} />


                {/* Questions Section */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                     <Typography variant="h6">Questions</Typography>
                     <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={handleAddQuestion} disabled={isSaving} >Add Question</Button>
                </Box>
                {questions.length === 0 && <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>No questions added yet. Click 'Add Question' to begin.</Typography>}
                <List sx={{mb: 2}}> {/* Add margin bottom to list */}
                    {questions.map((q, qIndex) => (
                        <React.Fragment key={q.id || q.tempId || qIndex}>
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, '&:last-child': { mb: 0 } }}>
                                {/* Question Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Question {qIndex + 1}</Typography>
                                    <IconButton size="small" color="error" onClick={() => handleRemoveQuestion(qIndex)} disabled={isSaving} aria-label={`delete question ${qIndex + 1}`}><DeleteIcon /></IconButton>
                                </Box>
                                {/* Question Text */}
                                <TextField fullWidth required multiline rows={2} label="Question Text" value={q.text} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} sx={{ mb: 2 }} disabled={isSaving} />
                                {/* Options */}
                                 <Typography variant="body2" sx={{mb: 1, fontWeight: 500}}>Options (Select correct answer below):</Typography>
                                 <RadioGroup name={`correct-answer-group-${qIndex}`}
                                    // Bind group value to the stored index (as string)
                                    value={q.correct_answer_index !== null ? String(q.correct_answer_index) : ''}
                                    // Update index state on change
                                    onChange={(e) => handleCorrectAnswerChange(qIndex, e.target.value)} >
                                    {q.options.map((opt, optIndex) => (
                                        <Grid container spacing={1} alignItems="center" key={optIndex} sx={{ mb: 1 }}>
                                            <Grid item xs={'auto'} sx={{pr: 0}}>
                                                 <FormControlLabel
                                                    // Value of this specific radio is its index (as string)
                                                    value={String(optIndex)}
                                                    control={<Radio disabled={isSaving} size="small"/>} label="" sx={{ mr: 0 }}
                                                />
                                            </Grid>
                                            <Grid item xs>
                                                 <TextField fullWidth required size="small" label={`Option ${optIndex + 1}`}
                                                    value={opt} onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
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
                {error && <Alert severity="error" sx={{ mt: 3, mb: 2 }}>{error}</Alert>}
                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate('/admin/exams')} disabled={isSaving}>Cancel</Button>
                    <Button type="submit" variant="contained" startIcon={isSaving ? <CircularProgress size={20} color="inherit"/> : <SaveIcon />} disabled={isSaving}>
                        {isSaving ? 'Saving...' : (isEditMode ? 'Update Exam' : 'Create Exam')}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
}


export default ExamForm;