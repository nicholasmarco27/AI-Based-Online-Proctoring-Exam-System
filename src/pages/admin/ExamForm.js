// src/pages/admin/ExamForm.js
import React, { useState, useEffect, useRef } from 'react'; // Added useRef
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse'; // Import papaparse
import {
    Box, Typography, TextField, Button, Paper, Grid, Select, MenuItem, FormControl,
    InputLabel, IconButton, Divider, List, ListItem, ListItemText, RadioGroup,
    FormControlLabel, Radio, Alert, CircularProgress, Tooltip // Added Tooltip for info
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile'; // Icon for import button
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'; // Icon for CSV info tooltip
import apiClient from '../../api';

// Helper function (formatDateTimeForInput) remains the same...
const formatDateTimeForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date string");
        }
        const offset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offset);
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        console.error("Error formatting date for input:", isoString, e);
        return '';
    }
};

// Counter for temporary unique keys
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
    const [error, setError] = useState(null); // General/Save errors
    const [fetchError, setFetchError] = useState(null);
    const [importError, setImportError] = useState(null); // Specific CSV import errors
    const [importSuccess, setImportSuccess] = useState(null); // CSV import success message

    // Ref for the hidden file input
    const fileInputRef = useRef(null);

    // --- Fetch Logic ---
    useEffect(() => {
        if (isEditMode) {
            setIsLoading(true);
            setFetchError(null);
            apiClient.get(`/admin/exams/${examId}`)
                .then(response => {
                    const { name, subject, duration, status, questions: fetchedQuestions, allowed_attempts } = response.data;
                    setExamDetails({
                        name: name || '', subject: subject || '', duration: duration || 60, status: status || 'Draft',
                        allowed_attempts: allowed_attempts || 1
                    });
                    // Map fetched questions, ensuring options is an array and adding tempId/correct_answer_index
                    setQuestions(fetchedQuestions ? fetchedQuestions.map(q => {
                        const optionsArray = Array.isArray(q.options) ? q.options : []; // Ensure options is array
                        // Attempt to find the index of the correct answer
                        const correctIndex = optionsArray.findIndex(opt => opt === q.correct_answer);
                        return {
                            ...q,
                            options: optionsArray.length > 0 ? optionsArray : ['', '', '', ''], // Ensure at least 4 empty slots if needed, or keep existing
                            tempId: getTempQuestionId(),
                            // Use found index, default to null if not found or no options
                            correct_answer_index: optionsArray.length > 0 && correctIndex !== -1 ? correctIndex : null
                        };
                    }) : []);
                })
                .catch(err => {
                    console.error("Error fetching exam:", err);
                    setFetchError(err.response?.data?.message || err.message || 'Failed to load exam data.');
                 })
                .finally(() => setIsLoading(false));
        } else {
             setExamDetails({ name: '', subject: '', duration: 60, status: 'Draft', allowed_attempts: 1 });
             setQuestions([]);
        }
    }, [examId, isEditMode]);


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
            ...prev,
            {
                tempId: getTempQuestionId(),
                text: '',
                options: ['', '', '', ''],
                correct_answer_index: null,
            }
        ]);
    };

    const handleQuestionChange = (index, field, value) => {
        setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
    };

    const handleOptionChange = (qIndex, optIndex, value) => {
        setQuestions(prev => prev.map((q, i) => {
            if (i === qIndex) {
                const newOptions = [...q.options];
                newOptions[optIndex] = value;
                let currentCorrectIndex = q.correct_answer_index;
                 // If the correct answer index pointed to the option being cleared, reset it
                if (currentCorrectIndex === optIndex && !value?.trim()) {
                   currentCorrectIndex = null;
                } else if (currentCorrectIndex !== null && currentCorrectIndex >= newOptions.length) {
                   // If options were somehow removed making index invalid (less likely here)
                    currentCorrectIndex = null;
                }

                return { ...q, options: newOptions, correct_answer_index: currentCorrectIndex };
            }
            return q;
        }));
    };

    const handleCorrectAnswerChange = (qIndex, selectedOptionIndexStr) => {
        const selectedIndex = parseInt(selectedOptionIndexStr, 10);
        setQuestions(prev => prev.map((q, i) =>
            i === qIndex ? { ...q, correct_answer_index: selectedIndex } : q
        ));
    };

    const handleRemoveQuestion = (index) => {
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };

    // --- CSV Import Handlers ---

    // Trigger the hidden file input click
    const handleImportClick = () => {
        // Clear previous import messages
        setImportError(null);
        setImportSuccess(null);
        fileInputRef.current?.click(); // Use optional chaining
    };

    // Process the selected CSV file
        // Process the selected CSV file
        const handleFileChange = (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }
    
            if (!file.type.includes('csv') && !file.name.toLowerCase().endsWith('.csv')) {
                setImportError('Invalid file type. Please upload a CSV file.');
                if(fileInputRef.current) fileInputRef.current.value = null;
                return;
            }
    
            Papa.parse(file, {
                header: true, // Expect headers: question, option1, option2, option3, option4, correct_answer
                skipEmptyLines: true,
                complete: (results) => {
                    console.log("Parsed CSV data:", results.data);
                    const importedQuestions = [];
                    let rowCount = 0;
                    let errorInRow = null;
                    let questionsAddedCount = 0;
                    let questionsWithErrorCount = 0;
    
                    // --- Periksa Header CSV ---
                    const expectedHeaders = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer'];
                    const actualHeaders = results.meta?.fields || []; // Ambil header dari hasil parse
                    const missingHeaders = expectedHeaders.filter(h => !actualHeaders.map(ah => ah.toLowerCase().trim()).includes(h.toLowerCase().trim()));
    
                    if (missingHeaders.length > 0) {
                        setImportError(`CSV file is missing required columns: ${missingHeaders.join(', ')}. Expected: ${expectedHeaders.join(', ')}`);
                        setImportSuccess(null);
                        if(fileInputRef.current) fileInputRef.current.value = null;
                        return; // Hentikan proses jika header hilang
                    }
                    // --- Akhir Pemeriksaan Header ---
    
    
                    for (const row of results.data) {
                        rowCount++;
                        // Gunakan fungsi bantu untuk membaca kolom dengan aman (handle case variations)
                        const readColumn = (colName) => {
                            const lowerColName = colName.toLowerCase();
                            // Cari key yang cocok (case-insensitive)
                            const actualKey = Object.keys(row).find(k => k.toLowerCase().trim() === lowerColName);
                            return actualKey ? row[actualKey]?.trim() : undefined;
                        };
    
                        const questionText = readColumn('question');
                        const option1 = readColumn('option1');
                        const option2 = readColumn('option2');
                        const option3 = readColumn('option3');
                        const option4 = readColumn('option4');
                        const correctAnswerText = readColumn('correct_answer'); // Baca jawaban benar dari CSV
    
                        // Validation: Ensure required fields are present
                        if (!questionText || !option1 || !option2 || !option3 || !option4 || !correctAnswerText) {
                            errorInRow = `Row ${rowCount + 1} (data row ${rowCount}): Missing required data. Ensure 'question', 'option1', 'option2', 'option3', 'option4', and 'correct_answer' columns are present and filled. Skipping row.`;
                            console.warn(errorInRow); // Log warning
                            questionsWithErrorCount++;
                            continue; // Lanjut ke baris berikutnya
                        }
    
                        const optionsArray = [option1, option2, option3, option4];
    
                        // --- Cari Index Jawaban Benar ---
                        const correctIndex = optionsArray.findIndex(opt => opt === correctAnswerText);
    
                        if (correctIndex === -1) {
                            // Jawaban benar dari CSV tidak ditemukan di antara opsi
                             errorInRow = `Row ${rowCount + 1} (data row ${rowCount}): Correct answer '${correctAnswerText}' was not found in the provided options [${optionsArray.join(', ')}]. Skipping row.`;
                             console.warn(errorInRow);
                             questionsWithErrorCount++;
                             continue; // Lanjut ke baris berikutnya
                        }
                        // --- Akhir Pencarian Index ---
    
    
                        importedQuestions.push({
                            tempId: getTempQuestionId(),
                            text: questionText,
                            options: optionsArray,
                            // --- SET INDEX YANG DITEMUKAN ---
                            correct_answer_index: correctIndex,
                        });
                        questionsAddedCount++;
                    } // End loop through rows
    
                    // --- Set State dan Pesan Hasil ---
                    if (questionsAddedCount > 0) {
                        setQuestions(prev => [...prev, ...importedQuestions]);
                         let successMsg = `${questionsAddedCount} questions imported successfully.`;
                         if (questionsWithErrorCount > 0) {
                            successMsg += ` ${questionsWithErrorCount} rows had errors and were skipped (see console for details). Please review carefully.`;
                            setImportError(`${questionsWithErrorCount} rows had errors and were skipped. Check console logs.`); // Optional: Tampilkan error ringkasan juga
                        } else {
                             setImportError(null); // Hapus error lama jika import baru berhasil sebagian/seluruhnya
                        }
                        setImportSuccess(successMsg);
                    } else if (results.data.length === 0) {
                        // File kosong setelah header
                        setImportError('No data rows found in the CSV file.');
                        setImportSuccess(null);
                    } else if (questionsWithErrorCount > 0 && questionsAddedCount === 0) {
                        // Semua baris error
                        setImportError(`Import failed. All ${questionsWithErrorCount} data rows had errors (see console for details). Please check CSV format and content.`);
                         setImportSuccess(null);
                    } else {
                         // Kasus lain (misal header salah total, ditangani di awal)
                         // atau jika file hanya header
                         setImportError('Could not import any questions. Please check CSV format, headers, and ensure data rows exist.');
                         setImportSuccess(null);
                    }
                     // Reset file input value
                     if(fileInputRef.current) fileInputRef.current.value = null;
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
        setError(null); // Clear general errors
        setImportError(null); // Clear import errors on submit attempt
        setImportSuccess(null); // Clear import success message

        // --- Frontend Validation --- (remains mostly the same)
        if (!examDetails.name || !examDetails.subject || !examDetails.duration || !examDetails.allowed_attempts) {
             setError("Exam Name, Subject, Duration, and Allowed Attempts are required.");
             return;
        }
         if (questions.length === 0) {
             setError("An exam must have at least one question.");
             return;
         }
         for (const [index, q] of questions.entries()) {
             if (!q.text?.trim()) { setError(`Question ${index + 1} text cannot be empty.`); return; }
             if (q.options.some(opt => !opt?.trim())) { setError(`All options for Question ${index + 1} must be filled.`); return; }
             if (q.correct_answer_index === null || q.correct_answer_index < 0 || q.correct_answer_index >= q.options.length ) {
                 setError(`A correct answer must be selected for Question ${index + 1}.`);
                 return;
             }
             if (!q.options[q.correct_answer_index]?.trim()){
                  setError(`Selected correct answer text for Question ${index + 1} cannot be empty.`);
                  return;
             }
         }
        // --- End Validation ---


        setIsSaving(true);

        // --- Prepare Payload for Backend --- (remains the same)
        const payload = {
            ...examDetails,
            duration: parseInt(examDetails.duration, 10) || 0,
            allowed_attempts: parseInt(examDetails.allowed_attempts, 10) || 1,
            questions: questions.map(({ id, tempId, correct_answer_index, options, ...rest }, index) => {
                 const optionsArray = Array.isArray(options) ? options : [];
                 const trimmedOptions = optionsArray.map(opt => (typeof opt === 'string' ? opt.trim() : ''));
                 let correctAnswerText = '';
                 if (correct_answer_index !== null && correct_answer_index >= 0 && correct_answer_index < trimmedOptions.length) {
                     correctAnswerText = trimmedOptions[correct_answer_index];
                 } else {
                     console.error(`Invalid correct_answer_index (${correct_answer_index}) found during payload creation for question index: ${index}`);
                     // Set error state maybe? For now, log it. Backend validation should catch missing correct_answer.
                 }
                 return {
                     ...rest,
                     // Only include 'id' if it exists (i.e., it's an existing question being updated)
                     ...(id && { id }),
                     options: trimmedOptions,
                     correct_answer: correctAnswerText
                 };
            })
        };

        // --- API Call --- (remains the same)
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
        } finally {
            setIsSaving(false);
        }
    };


    // --- Render Logic ---

    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    if (fetchError) {
        return (
            <Paper sx={{ p: 3 }}><Alert severity="error">Error loading exam data: {fetchError}
            <Button onClick={() => navigate('/admin/exams')} sx={{ ml: 2 }}>Go Back</Button></Alert></Paper>
        );
    }

    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }} elevation={2}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                 <IconButton onClick={() => navigate('/admin/exams')} sx={{ mr: 1 }} aria-label="go back"><ArrowBackIcon /></IconButton>
                <Typography variant="h4">{isEditMode ? 'Edit Exam' : 'Create New Exam'}</Typography>
            </Box>

            {/* Form */}
            <Box component="form" onSubmit={handleSubmit}>
                {/* Exam Details */}
                <Typography variant="h6" gutterBottom>Exam Details</Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {/* Fields remain the same */}
                    <Grid item xs={12} md={6}><TextField fullWidth required name="name" label="Exam Name" value={examDetails.name} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth required name="subject" label="Subject" value={examDetails.subject} onChange={handleDetailChange} disabled={isSaving} /></Grid>
                    <Grid item xs={12} sm={6} md={4}><TextField fullWidth required name="duration" label="Duration (min)" type="number" value={examDetails.duration} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControl fullWidth required disabled={isSaving}><InputLabel id="status-select-label">Status</InputLabel><Select labelId="status-select-label" name="status" label="Status" value={examDetails.status} onChange={handleDetailChange}><MenuItem value="Draft">Draft</MenuItem><MenuItem value="Published">Published</MenuItem><MenuItem value="Archived">Archived</MenuItem></Select></FormControl></Grid>
                     <Grid item xs={12} sm={6} md={4}><TextField fullWidth required name="allowed_attempts" label="Allowed Attempts" type="number" value={examDetails.allowed_attempts} onChange={handleDetailChange} disabled={isSaving} InputProps={{ inputProps: { min: 1 } }} /></Grid>
                </Grid>
                <Divider sx={{ my: 3 }} />

                {/* Questions Section Header */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                     <Typography variant="h6">Questions</Typography>
                     <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                         <Typography variant="body2" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'inline' } }}>
                            {questions.length > 0 ?
                                `${questions.length} questions (${(100 / questions.length).toFixed(2)} points each)` :
                                'No questions yet'}
                        </Typography>
                        {/* Hidden File Input */}
                        <input
                             type="file"
                             ref={fileInputRef}
                             onChange={handleFileChange}
                             style={{ display: 'none' }}
                             accept=".csv" // Specify accepted file type
                         />
                         {/* Import Button */}
                        <Tooltip title={
                            <span>
                                Import from CSV. <br />
                                Required columns: <br />
                                <b>question, option1, option2, option3, option4</b> <br/>
                                (Header row expected)
                            </span>
                        }>
                             <Button
                                variant="outlined"
                                startIcon={<UploadFileIcon />}
                                onClick={handleImportClick}
                                disabled={isSaving}
                                size="small" // Make buttons similar size
                            >
                                Import <InfoOutlinedIcon fontSize='inherit' sx={{ ml: 0.5, verticalAlign: 'middle' }}/>
                            </Button>
                        </Tooltip>
                         {/* Add Question Button */}
                        <Button
                            variant="outlined"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={handleAddQuestion}
                            disabled={isSaving}
                            size="small" // Make buttons similar size
                        >
                            Add Question
                        </Button>
                     </Box>
                 </Box>

                {/* Import Status Messages */}
                {importError && <Alert severity="error" sx={{ mb: 2 }}>{importError}</Alert>}
                {importSuccess && <Alert severity="success" sx={{ mb: 2 }}>{importSuccess}</Alert>}


                {/* Questions List */}
                {questions.length === 0 && !importError && !importSuccess && (
                    <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                        No questions added yet. Click 'Add Question' or 'Import' to begin.
                    </Typography>
                )}
                <List sx={{mb: 2}}>
                    {questions.map((q, qIndex) => (
                        <React.Fragment key={q.tempId}> {/* Use stable tempId */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, '&:last-child': { mb: 0 } }}>
                                {/* Question Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Question {qIndex + 1}</Typography>
                                    <IconButton size="small" color="error" onClick={() => handleRemoveQuestion(qIndex)} disabled={isSaving} aria-label={`delete question ${qIndex + 1}`}><DeleteIcon /></IconButton>
                                </Box>
                                {/* Question Text */}
                                <TextField fullWidth required multiline rows={2} label="Question Text" value={q.text || ''} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} sx={{ mb: 2 }} disabled={isSaving} />
                                {/* Options */}
                                 <Typography variant="body2" sx={{mb: 1, fontWeight: 500}}>Options (Select correct answer below):</Typography>
                                 <RadioGroup name={`correct-answer-group-${q.tempId}`} // Use tempId for unique group name
                                    value={q.correct_answer_index !== null ? String(q.correct_answer_index) : ''}
                                    onChange={(e) => handleCorrectAnswerChange(qIndex, e.target.value)} >
                                    {(Array.isArray(q.options) ? q.options : ['', '', '', '']).map((opt, optIndex) => ( // Ensure options is array
                                        <Grid container spacing={1} alignItems="center" key={optIndex} sx={{ mb: 1 }}>
                                            <Grid item xs={'auto'} sx={{pr: 0}}>
                                                 <FormControlLabel
                                                    value={String(optIndex)}
                                                    control={<Radio disabled={isSaving} size="small"/>} label="" sx={{ mr: 0 }}
                                                />
                                            </Grid>
                                            <Grid item xs>
                                                 <TextField fullWidth required size="small" label={`Option ${optIndex + 1}`}
                                                    value={opt || ''} // Handle potential null/undefined options gracefully
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