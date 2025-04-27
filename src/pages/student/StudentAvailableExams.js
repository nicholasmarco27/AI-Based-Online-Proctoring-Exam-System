// src/pages/student/StudentAvailableExams.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Card, CardContent, CardActions, Button, Grid, Chip, Tooltip,
    CircularProgress, Alert, Divider, List, ListItem, ListItemText, IconButton, Paper // Import tambahan
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; // Untuk tombol di Completed
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility'; // Icon untuk tombol detail submit
import HistoryIcon from '@mui/icons-material/History'; // Icon untuk judul history
import { format } from 'date-fns'; // Untuk format tanggal
import apiClient from '../../api'; // Pastikan path import benar

/**
 * Formats a date object or string into a shorter, readable date and time.
 * Example: "4/27/2025, 8:30 PM"
 * @param {Date|string|number} dateInput - The date to format.
 * @returns {string} - Formatted date string or 'N/A' if input is invalid.
 */
const formatDateTimeShort = (dateInput) => {
  try {
    if (!dateInput) return 'N/A';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) throw new Error("Invalid Date");
    return format(date, "P p"); // Format pendek bawaan date-fns (misal: 04/27/2025, 8:30:00 PM)
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date';
  }
};

// ========================================================================
// ExamCard Component (DIMODIFIKASI untuk menampilkan history)
// ========================================================================
function ExamCard({ exam, isCompletedSection = false }) { // Terima prop isCompletedSection
    const navigate = useNavigate();

    // Parsing attempts (pastikan pakai nama field dari API)
    const attemptsTakenRaw = exam.attempts_taken;
    const allowedAttemptsRaw = exam.allowed_attempts;
    const attemptsTakenParsed = parseInt(attemptsTakenRaw ?? 0, 10);
    const allowedAttemptsParsed = parseInt(allowedAttemptsRaw, 10);
    const validAttemptsTaken = !isNaN(attemptsTakenParsed) ? attemptsTakenParsed : 0;
    const validAllowedAttempts = !isNaN(allowedAttemptsParsed) && allowedAttemptsParsed > 0 ? allowedAttemptsParsed : 1;
    const hasAttemptsLeft = validAttemptsTaken < validAllowedAttempts;

    // Handler Navigasi
    const handleStartExam = (examId) => navigate(`/student/take-exam/${examId}`);
    const handleViewLatestResult = (examId) => navigate(`/student/exam/${examId}/submitted`); // Ke halaman ringkasan akhir
    // Handler untuk melihat detail SUBMISSION SPESIFIK (placeholder)
    const handleViewSpecificSubmission = (submissionId, examId) => {
        console.warn(`Navigasi ke detail submission ${submissionId} belum diimplementasikan.`);
        // Arahkan ke halaman hasil terakhir saja untuk saat ini
        navigate(`/student/exam/${examId}/submitted`);
    };

    // --- Logika Tombol Aksi Utama ---
    let mainActionButton = null;
    if (isCompletedSection) { // Bagian "Completed Exams"
        mainActionButton = (
            <Button
                variant="contained" size="small" color="success"
                startIcon={<CheckCircleIcon />}
                onClick={() => handleViewLatestResult(exam.id)}
                sx={{ borderRadius: '16px', textTransform: 'none', width: '100%' }} // Buat tombol full width
            >
                View Results
            </Button>
        );
    } else { // Bagian "Available Exams"
        if (hasAttemptsLeft) {
            mainActionButton = (
                <Button
                    variant="contained" size="small" color="primary"
                    startIcon={<PlayCircleOutlineIcon />}
                    onClick={() => handleStartExam(exam.id)}
                    sx={{ borderRadius: '16px', textTransform: 'none', width: '100%' }} // Buat tombol full width
                >
                    Start Exam (Attempt {validAttemptsTaken + 1})
                </Button>
            );
        } else {
             // Seharusnya tidak ada di sini jika filter benar, tapi sebagai fallback
             mainActionButton = (
                 <Typography variant="caption" color="text.disabled" align="center" display="block">
                     All attempts used. View in 'Completed Exams'.
                 </Typography>
             );
        }
    }

    // Ekstrak history submission (jika ada)
    const previousSubmissions = exam.previous_submissions || [];

    // --- Render Card ---
    return (
        <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 2 }} elevation={2}>
            {/* Info Ujian Dasar */}
            <CardContent sx={{ pb: previousSubmissions.length > 0 && !isCompletedSection ? 1 : 2 /* Kurangi padding jika ada history */ }}>
                <Typography variant="h6" component="div" gutterBottom noWrap>
                    {exam.name || 'Unnamed Exam'}
                </Typography>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                    {exam.subject || 'No Subject'}
                </Typography>
                <Box>
                    <Chip label={`Duration: ${exam.duration} min`} size="small" sx={{ mr: 1, mb: 1 }} />
                    <Chip
                        label={`Attempts: ${validAttemptsTaken} / ${validAllowedAttempts}`}
                        size="small"
                        color={hasAttemptsLeft ? 'default' : 'warning'}
                        sx={{ mb: 1 }}
                    />
                </Box>
            </CardContent>

            {/* --- BAGIAN HISTORY ATTEMPT (Hanya di Available Exams & Jika Ada History) --- */}
            {!isCompletedSection && previousSubmissions.length > 0 && (
                <Box sx={{
                    px: 2, pt: 1, pb: 1,
                    borderTop: 1, borderColor: 'divider',
                    maxHeight: 150, // Batasi tinggi area history
                    overflowY: 'auto', // Beri scroll jika history panjang
                    bgcolor: 'grey.50' // Background sedikit beda
                 }}>
                    <Typography variant="caption" display="flex" alignItems="center" color="text.secondary" sx={{ mb: 0.5, fontWeight: 'medium' }}>
                       <HistoryIcon sx={{ fontSize: '1rem', mr: 0.5 }}/> Previous Attempts:
                    </Typography>
                    <List dense disablePadding>
                        {/* Tampilkan dari terbaru ke terlama */}
                        {[...previousSubmissions].reverse().map((sub, index) => {
                            const attemptNumber = validAttemptsTaken - index; // Hitung nomor attempt mundur
                            const score = sub.score ?? 0;
                            const correct = sub.correctAnswers ?? 0;
                            const total = sub.totalQuestions ?? '?';
                            return (
                                <ListItem
                                    key={sub.submissionId || `sub-${index}`}
                                    disableGutters dense
                                    secondaryAction={
                                        <Tooltip title={`View details for Attempt ${attemptNumber}`}>
                                            <IconButton edge="end" size="small" onClick={() => handleViewSpecificSubmission(sub.submissionId, exam.id)}>
                                                <VisibilityIcon sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                        </Tooltip>
                                    }
                                    sx={{ py: 0.2 }} // Padding vertikal lebih kecil
                                >
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>
                                                Attempt {attemptNumber}: <Typography component="span" sx={{ color: score >= 50 ? 'success.main' : 'error.main', fontWeight:'bold' }}>{score.toFixed(1)}%</Typography>
                                                <Typography component="span" variant="caption" sx={{ ml: 1 }}>({correct}/{total})</Typography>
                                            </Typography>
                                        }
                                        secondary={formatDateTimeShort(sub.submittedAt)} // Format tanggal lebih pendek
                                        primaryTypographyProps={{ variant: 'body2' }}
                                        secondaryTypographyProps={{ variant: 'caption', sx:{mt: -0.5} }} // Kurangi margin atas secondary
                                    />
                                </ListItem>
                            );
                        })}
                    </List>
                </Box>
            )}
            {/* --- AKHIR BAGIAN HISTORY --- */}

            {/* Tombol Aksi Utama (Selalu di bawah) */}
            <CardActions sx={{ justifyContent: 'center', p: 1.5, mt: 'auto', borderTop: 1, borderColor: 'divider' }}>
                 {mainActionButton}
            </CardActions>
        </Card>
    );
}

// ========================================================================
// Komponen Utama: StudentAvailableExams (Mengambil data dan memfilter)
// ========================================================================
function StudentAvailableExams() {
    const [allExamsData, setAllExamsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

     // Fetch data (Asumsi backend SUDAH mengirim 'previous_submissions')
     useEffect(() => {
        const fetchAllExams = async () => {
             setIsLoading(true);
             setError(null);
             try {
                 console.log("StudentAvailableExams: Fetching exams with history...");
                 // Panggil endpoint yang sama (yang sudah dimodifikasi di backend)
                 const response = await apiClient.get('/student/exams/available');
                 console.log("StudentAvailableExams: Raw data received:", JSON.stringify(response.data, null, 2));

                 if (Array.isArray(response.data)) {
                    setAllExamsData(response.data);
                 } else {
                    console.error("API response is not an array:", response.data);
                    setAllExamsData([]);
                    setError("Received invalid data format from server.");
                 }
             } catch (err) {
                console.error("StudentAvailableExams: Fetch available exams error:", err);
                let errorMessage = "Failed to load available exams.";
                if (err.response) {
                    errorMessage = `Error ${err.response.status}: ${err.response.data?.message || errorMessage}`;
                    if (err.response.status === 401) errorMessage = "Session expired. Please log in again.";
                }
                setError(errorMessage);
                setAllExamsData([]);
             } finally {
                 setIsLoading(false);
             }
        };
        fetchAllExams();
     }, []);

    // --- Filter Logic (Tidak berubah, tetap memisahkan Available / Completed) ---
    console.log("StudentAvailableExams: Data in allExamsData state BEFORE filtering:", JSON.stringify(allExamsData, null, 2));
    const examsToDo = [];
    const examsDone = [];
    if (Array.isArray(allExamsData)) {
        allExamsData.forEach((exam, index) => {
            const taken = parseInt(exam.attempts_taken ?? 0, 10);
            const allowed = parseInt(exam.allowed_attempts, 10);

            console.log(`[Filter Check ${index}] ID: ${exam.id}, taken: ${taken}, allowed: ${allowed}`);

            if (!isNaN(taken) && !isNaN(allowed) && allowed > 0) {
                if (taken < allowed) {
                    console.log(` ---> Adding to examsToDo`);
                    examsToDo.push(exam);
                } else {
                    console.log(` ---> Adding to examsDone`);
                    examsDone.push(exam);
                }
            } else {
                console.warn(` ---> SKIPPING Exam ID: ${exam.id}. Invalid attempt data.`);
            }
        });
    }
    console.log("StudentAvailableExams: Filtered examsToDo:", examsToDo.map(e=>e.id));
    console.log("StudentAvailableExams: Filtered examsDone:", examsDone.map(e=>e.id));
    // --- Akhir Filter Logic ---


    // --- Render UI ---
    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            {/* Loading Indicator */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 5, minHeight: '200px' }}>
                    <CircularProgress />
                    <Typography sx={{ ml: 2 }} color="text.secondary">Loading exams...</Typography>
                </Box>
            )}

            {/* Error Display */}
            {error && !isLoading && (
                <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
            )}

            {/* Main Content */}
            {!isLoading && !error && (
                <>
                    {/* === Bagian Available Exams === */}
                    <Typography variant="h5" gutterBottom sx={{ mb: 2, mt: 1, fontWeight: 'medium' }}>
                        Available Exams
                    </Typography>
                    <Grid container spacing={3}>
                        {examsToDo.length > 0 ? (
                            examsToDo.map((exam) => (
                                <Grid item xs={12} sm={6} md={4} lg={3} key={`todo-${exam.id}`}>
                                   {/* Kirim data ujian lengkap (termasuk history) */}
                                   {/* Kartu ini akan menampilkan history dan tombol "Start Exam" */}
                                   <ExamCard exam={exam} isCompletedSection={false} />
                                </Grid>
                            ))
                        ) : (
                            <Grid item xs={12}>
                                <Paper variant="outlined" sx={{p: 2, textAlign: 'center', bgcolor: 'action.hover'}}>
                                    <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                        No exams available for you to take right now.
                                    </Typography>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                    {/* === Akhir Bagian Available Exams === */}

                    <Divider sx={{ my: 4, borderBottomWidth: 'medium' }} />

                    {/* === Bagian Completed Exams === */}
                    <Typography variant="h5" gutterBottom sx={{ mb: 2, fontWeight: 'medium' }}>
                        Completed Exams
                    </Typography>
                    <Grid container spacing={3}>
                        {examsDone.length > 0 ? (
                            examsDone.map((exam) => (
                                <Grid item xs={12} sm={6} md={4} lg={3} key={`done-${exam.id}`}>
                                   {/* Tandai sebagai completed, history tidak ditampilkan */}
                                   {/* Tombol yang muncul adalah "View Results" */}
                                   <ExamCard exam={exam} isCompletedSection={true} />
                                </Grid>
                            ))
                        ) : (
                             <Grid item xs={12}>
                                <Paper variant="outlined" sx={{p: 2, textAlign: 'center', bgcolor: 'action.hover'}}>
                                    <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                        You haven't completed any exams yet or used all attempts.
                                    </Typography>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                     {/* === Akhir Bagian Completed Exams === */}
                </>
            )}
        </Box>
    );
}

export default StudentAvailableExams;