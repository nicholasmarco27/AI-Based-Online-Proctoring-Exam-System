// src/pages/student/ExamSubmittedPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, Divider, CircularProgress, Alert, Link as MuiLink, Grid, List, ListItem, ListItemText, IconButton, Tooltip // Import MUI components
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import ListAltIcon from '@mui/icons-material/ListAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiClient from '../../api'; // Pastikan path import benar
import { format } from 'date-fns'; // Import date-fns

/**
 * Formats a date object or string into a human-readable date and time.
 * Example: "Wednesday, 8 February 2023, 10:47 AM"
 * @param {Date|string|number} dateInput - The date to format.
 * @returns {string} - Formatted date string or 'N/A' if input is invalid.
 */
const formatDateTime = (dateInput) => {
  try {
    if (!dateInput) return 'N/A';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) throw new Error("Invalid Date");
    return format(date, "EEEE, d MMMM yyyy, h:mm a"); // Format tanggal lengkap
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date';
  }
};

// --- Komponen untuk menampilkan SATU baris attempt summary ---
function AttemptSummaryRow({ submission, examDetails, attemptNumber }) {
    const navigate = useNavigate();
    if (!submission) return null;

    // Kalkulasi grade untuk attempt ini
    // Ambil total pertanyaan dari detail ujian jika ada, fallback ke data submission
    const totalQuestions = examDetails?.totalQuestionsOverall ?? submission.totalQuestions ?? 0;
    const correctAnswers = submission.correctAnswers ?? 0;
    const gradeOutOf = 100.00;
    const pointsPerQuestion = totalQuestions > 0 ? gradeOutOf / totalQuestions : 0;
    const calculatedGrade = correctAnswers * pointsPerQuestion;
    const mark = totalQuestions > 0 ? `${correctAnswers} / ${totalQuestions}` : `${correctAnswers}`;
    const submittedAt = formatDateTime(submission.submittedAt);
    const isReviewAvailable = false; // Ganti ini jika ada fitur review per attempt

    const handleViewSpecificSubmission = (submissionId, examId) => {
        console.warn(`View specific submission ${submissionId} not fully implemented.`);
        // Arahkan ke halaman hasil ini lagi, atau idealnya ke halaman/modal detail attempt
        navigate(`/student/exam/${examId}/submitted`);
    };

    return (
        <Paper variant="outlined" sx={{ mb: 2 }}>
             <Typography variant="subtitle1" sx={{ bgcolor: 'grey.100', p: 1.5, borderBottom: 1, borderColor: 'divider', fontWeight:'medium' }}>
                Attempt {attemptNumber}
             </Typography>
             <Box sx={{ p: 2 }}>
                {/* Header Row */}
                <Box sx={{ display: 'flex', pb: 1, mb: 1, borderBottom: '1px dashed', borderColor: 'divider', fontWeight: 'bold', typography: 'body2' }}>
                    <Typography component="span" sx={{ flexBasis: '25%', flexShrink: 0 }}>State</Typography>
                    <Typography component="span" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center' }}>Mark</Typography>
                    <Typography component="span" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center' }}>Grade / {gradeOutOf.toFixed(2)}</Typography>
                    <Typography component="span" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'right' }}>Review</Typography>
                </Box>
                {/* Data Row */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ flexBasis: '25%', flexShrink: 0 }}>
                        <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <CheckCircleOutlineIcon color="success" sx={{ mr: 0.5, fontSize: '1.1rem' }} />
                            {submission.status || "Finished"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ pl: '24px' }}>
                            {submittedAt}
                        </Typography>
                    </Box>
                     <Typography variant="body1" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center' }}>
                        {mark}
                     </Typography>
                    <Typography variant="body1" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center', fontWeight: 'bold' }}>
                        {calculatedGrade.toFixed(2)}
                    </Typography>
                    <Box sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'right' }}>
                        {isReviewAvailable ? (
                             <Tooltip title="Review this specific attempt">
                                <IconButton size="small" onClick={() => handleViewSpecificSubmission(submission.submissionId, examDetails.examId)}>
                                    <VisibilityIcon fontSize='small' />
                                </IconButton>
                            </Tooltip>
                         ) : (
                             <Typography variant="body2" color="text.disabled">Not available</Typography>
                         )}
                    </Box>
                </Box>
             </Box>
        </Paper>
    );
}


// --- Komponen Utama Halaman ---
function ExamSubmittedPage() {
    const { examId } = useParams();
    const navigate = useNavigate();
    // location tidak dipakai lagi untuk data utama
    // const location = useLocation();

    // State untuk data gabungan { examDetails: ..., submissions: [] }
    const [pageData, setPageData] = useState({ examDetails: null, submissions: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- useEffect untuk Fetch SEMUA Submission History ---
    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            if (!examId) {
                if (isMounted) { setError("Exam ID is missing."); setIsLoading(false); }
                return;
            }
            setIsLoading(true);
            setError(null);
            setPageData({ examDetails: null, submissions: [] }); // Reset sebelum fetch
            console.log(`ExamSubmittedPage: Fetching ALL submissions history for Exam ID: ${examId}...`);

            try {
                // Panggil endpoint BARU (/submissions) - Pastikan path benar
                const response = await apiClient.get(`/student/exams/${examId}/submissions`);
                console.log("ExamSubmittedPage: Fetched history data:", JSON.stringify(response.data, null, 2));

                if (isMounted) {
                    // Validasi data yang diterima dari backend
                    if (response.data && response.data.examDetails) {
                        setPageData({
                            examDetails: response.data.examDetails,
                            submissions: Array.isArray(response.data.submissions) ? response.data.submissions : []
                        });
                         // Tangani kasus 'No submission found' dari backend
                         if (response.status === 404 && response.data.message?.includes("No submission")) {
                             setError("No submission attempts found for this exam yet.");
                         } else if (response.data.submissions.length === 0) {
                            // Jika array submissions kosong tapi bukan 404
                            setError("No submission attempts found for this exam yet.");
                         }
                    } else {
                        throw new Error("Invalid data format received (missing examDetails).");
                    }
                }
            } catch (err) {
                console.error("Error fetching submission history:", err);
                if (isMounted) {
                    let errorMsg = err.response?.data?.message || err.message || "Failed to load submission history.";
                    if (err.response?.status === 404) {
                         errorMsg = err.response?.data?.message || "Exam not found or no submissions yet.";
                    }
                    setError(errorMsg);
                    setPageData({ examDetails: null, submissions: [] }); // Reset jika error
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchHistory();

        return () => { isMounted = false; }; // Cleanup
    }, [examId]); // Dependency hanya examId


    // --- Event Handlers ---
     const handleBackToExams = () => { navigate('/student/exams'); };
     const handleRetryExam = () => { navigate(`/student/take-exam/${examId}`); };
     const handlePreviousActivity = () => { navigate(-1); };
     const handleNextActivity = () => { navigate('/student/dashboard'); };


    // --- Render Logic ---
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    // Tampilkan error fatal jika detail ujian tidak bisa dimuat
    if (error && !pageData.examDetails) {
        return (
             <Box sx={{ p: 3, textAlign: 'center' }}>
                 <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                 <Button variant="outlined" onClick={handleBackToExams}>Back to Exams</Button>
             </Box>
        );
    }

    // Kondisi jika detail ujian ada tapi submissions kosong (mungkin karena 404 atau memang belum submit)
     if (pageData.examDetails && pageData.submissions.length === 0) {
          return (
               <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
                    <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'medium', textAlign: 'center' }}>
                         {pageData.examDetails.quizName || pageData.examDetails.examName || "Quiz Results"}
                     </Typography>
                     <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                         Attempts allowed: {pageData.examDetails.attemptsAllowed ?? 1}
                     </Typography>
                     {/* Tampilkan pesan error/info */}
                     <Alert severity={error ? "info" : "warning"} sx={{ mb: 3 }}>
                       {error || "You haven't submitted this exam yet."}
                     </Alert>
                     <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
                         {/* Tombol kembali */}
                        <Button variant="contained" color="primary" onClick={handleBackToExams}>
                             Back to Available Exams
                         </Button>
                         {/* Tombol Start/Retry jika attemptsAllowed > 0 */}
                          {(pageData.examDetails.attemptsAllowed ?? 0) > 0 && (
                               <Button variant="outlined" color="secondary" onClick={handleRetryExam} startIcon={<ReplayIcon/>}>
                                    Start Exam (Attempt 1)
                               </Button>
                           )}
                     </Box>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, opacity: 0.6 }}>
                         <Button disabled>Previous Activity</Button>
                         <Button disabled>Next Activity</Button>
                      </Box>
               </Box>
          )
     }

     // Jika kita sampai sini, berarti examDetails dan submissions (minimal 1) ada
     const { examDetails, submissions } = pageData;

    // Hitung Sisa Percobaan (PASTIKAN backend kirim examDetails.attemptsTaken)
    const totalAllowed = parseInt(examDetails.attemptsAllowed ?? 1, 10);
    // Gunakan attemptsTaken dari backend jika ada, fallback ke panjang array submissions
    const taken = parseInt(examDetails.attemptsTaken ?? submissions.length, 10);
    const remainingAttempts = totalAllowed - taken;
    const noMoreAttempts = remainingAttempts <= 0;

    // Hitung Skor Tertinggi dari semua submissions
    let highestScore = 0;
    if (submissions && submissions.length > 0) {
        highestScore = Math.max(...submissions.map(sub => sub.score ?? 0));
    }
    console.log(`Highest score calculated: ${highestScore}`);


    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
             {/* Header */}
             <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'medium', textAlign: 'center' }}>
                 {examDetails.quizName || examDetails.examName}
             </Typography>
             <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                  {noMoreAttempts
                    ? `Attempts allowed: ${totalAllowed} (All used)`
                    : `Attempts remaining: ${remainingAttempts} (out of ${totalAllowed} total)`}
             </Typography>
             {/* Tampilkan error non-fatal jika ada (misal catatan saat fetch) */}
             {error && !error.includes("No submission") && <Alert severity="warning" sx={{mb: 2}}>{error}</Alert>}

            {/* Judul Summary Keseluruhan */}
            <Typography variant="h5" component="h2" sx={{ mb: 2, mt: 4 }}>
                Summary of your attempts
            </Typography>

            {/* Loop untuk menampilkan setiap attempt */}
            {submissions.map((sub, index) => (
                <AttemptSummaryRow
                    key={sub.submissionId || `att-${index}`}
                    submission={sub}
                    examDetails={examDetails}
                    attemptNumber={index + 1} // Kirim nomor attempt (1-based)
                />
            ))}

            {/* Final Grade Text (berdasarkan skor tertinggi) */}
             {submissions && submissions.length > 0 && (
                 <Typography variant="h6" sx={{ textAlign: 'center', mt: 4, mb: 2, fontWeight: 'medium' }}>
                     Your final grade for this quiz (highest score) is {highestScore.toFixed(2)} / 100.00.
                 </Typography>
             )}

            {/* No More Attempts Message */}
             {noMoreAttempts && (
                 <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
                     No more attempts are allowed for this exam.
                 </Typography>
             )}

            {/* Navigation Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
                 {!noMoreAttempts ? (
                     <Button variant="contained" color="secondary" onClick={handleRetryExam} startIcon={<ReplayIcon />}>
                         Retry Exam ({remainingAttempts} left)
                     </Button>
                 ) : null }
                 <Button variant="contained" color="primary" onClick={handleBackToExams} startIcon={<ListAltIcon />}>
                     Back to Available Exams
                 </Button>
             </Box>

             {/* Previous/Next Activity */}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, opacity: 0.6 }}>
                 <Button variant="outlined" onClick={handlePreviousActivity} disabled>Previous Activity</Button>
                 <Button variant="outlined" onClick={handleNextActivity} disabled>Next Activity</Button>
            </Box>
        </Box>
    );
}

export default ExamSubmittedPage;