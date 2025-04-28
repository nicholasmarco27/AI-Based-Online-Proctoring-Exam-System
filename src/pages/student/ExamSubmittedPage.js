// src/pages/student/ExamSubmittedPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, Divider, CircularProgress, Alert, Link as MuiLink, Grid, List, ListItem, ListItemText, IconButton, Tooltip // Import MUI components
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import ReplayIcon from '@mui/icons-material/Replay';
import ListAltIcon from '@mui/icons-material/ListAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiClient from '../../api';
import { format } from 'date-fns';

// *** DEFINE STATUS STRINGS AT MODULE SCOPE ***
const CANCELLED_STATUS_STRING = "Cancelled (Proctoring)";
const COMPLETED_STATUS_STRING = "Completed";

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
    return format(date, "EEEE, d MMMM yyyy, h:mm a");
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date';
  }
};

// --- Komponen untuk menampilkan SATU baris attempt summary ---
function AttemptSummaryRow({ submission, examDetails, attemptNumber }) {
    const navigate = useNavigate();
    if (!submission) return null;

    // Log received status for debugging
    console.log(`Attempt ${attemptNumber} (ID: ${submission.submissionId}) - Status Received: '${submission.status}', Correct Answers: ${submission.correctAnswers}`);

    // Use constants defined at module scope
    // const CANCELLED_STATUS_STRING = "Cancelled (Proctoring)"; // Removed from here
    // const COMPLETED_STATUS_STRING = "Completed"; // Removed from here

    let displayState = "Finished";
    let displayIcon = <CheckCircleOutlineIcon color="success" sx={{ mr: 0.5, fontSize: '1.1rem' }} />;
    let iconColor = "success";
    let isConsideredCancelled = false;

    if (submission.status === CANCELLED_STATUS_STRING) {
        displayState = "Cancelled";
        displayIcon = <HighlightOffIcon color="error" sx={{ mr: 0.5, fontSize: '1.1rem' }} />;
        iconColor = "error";
        isConsideredCancelled = true;
        console.log(`Attempt ${attemptNumber}: Detected as CANCELLED via status string.`);
    } else if (submission.correctAnswers === null && submission.status !== COMPLETED_STATUS_STRING) {
        displayState = "Cancelled";
        displayIcon = <HighlightOffIcon color="error" sx={{ mr: 0.5, fontSize: '1.1rem' }} />;
        iconColor = "error";
        isConsideredCancelled = true;
        console.warn(`Attempt ${attemptNumber}: Inferred as CANCELLED due to null correctAnswers and non-'Completed' status ('${submission.status}'). Displaying as Cancelled.`);
    } else if (submission.status === COMPLETED_STATUS_STRING || (submission.status === null && submission.correctAnswers !== null)) {
        displayState = "Finished";
        displayIcon = <CheckCircleOutlineIcon color="success" sx={{ mr: 0.5, fontSize: '1.1rem' }} />;
        iconColor = "success";
        isConsideredCancelled = false;
    } else if (submission.status) {
         displayState = submission.status;
         displayIcon = <CheckCircleOutlineIcon color="success" sx={{ mr: 0.5, fontSize: '1.1rem' }} />;
         iconColor = "success";
         isConsideredCancelled = false;
         console.warn(`Attempt ${attemptNumber}: Unknown status '${submission.status}' with non-null answers. Defaulting display to Finished.`);
    }

    const totalQuestions = examDetails?.totalQuestionsOverall ?? submission.totalQuestions ?? 0;
    const correctAnswers = submission.correctAnswers;
    const gradeOutOf = 100.00;
    const pointsPerQuestion = totalQuestions > 0 ? gradeOutOf / totalQuestions : 0;

    const calculatedGrade = (!isConsideredCancelled && correctAnswers !== null && correctAnswers !== undefined && totalQuestions > 0)
        ? (correctAnswers * pointsPerQuestion)
        : null;

    const mark = (!isConsideredCancelled && correctAnswers !== null && correctAnswers !== undefined && totalQuestions > 0)
        ? `${correctAnswers} / ${totalQuestions}`
        : (!isConsideredCancelled && correctAnswers !== null && correctAnswers !== undefined)
            ? `${correctAnswers}`
            : "N/A";

    const submittedAt = formatDateTime(submission.submittedAt);
    const isReviewAvailable = !isConsideredCancelled && false;

    const handleViewSpecificSubmission = (submissionId, examId) => {
        console.warn(`View specific submission ${submissionId} not fully implemented.`);
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
                       <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 0.5, color: `${iconColor}.main` }}>
                           {displayIcon}
                           {displayState}
                       </Typography>
                       <Typography variant="caption" color="text.secondary" sx={{ pl: '24px' }}>
                           {submittedAt}
                       </Typography>
                   </Box>
                    <Typography variant="body1" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center' }}>
                       {mark}
                    </Typography>
                   <Typography variant="body1" sx={{ flexBasis: '25%', flexShrink: 0, textAlign: 'center', fontWeight: isConsideredCancelled ? 'normal' : 'bold' }}>
                       {calculatedGrade !== null ? calculatedGrade.toFixed(2) : 'N/A'}
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

    const [pageData, setPageData] = useState({ examDetails: null, submissions: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- useEffect ---
    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            // ... (rest of the fetch logic remains the same) ...
             if (!examId) {
                if (isMounted) { setError("Exam ID is missing."); setIsLoading(false); }
                return;
            }
            setIsLoading(true);
            setError(null);
            // Keep previous details while loading new submissions? Or clear all? Clearing all is safer.
            setPageData({ examDetails: null, submissions: [] });
            console.log(`ExamSubmittedPage: Fetching ALL submissions history for Exam ID: ${examId}...`);

            try {
                const response = await apiClient.get(`/student/exams/${examId}/submissions`);
                console.log("ExamSubmittedPage: Fetched history data:", JSON.stringify(response.data, null, 2));

                if (isMounted) {
                    if (response.data && response.data.examDetails) {
                        const submissionsArray = Array.isArray(response.data.submissions) ? response.data.submissions : [];
                        setPageData({
                            examDetails: response.data.examDetails,
                            submissions: submissionsArray
                        });
                         if (submissionsArray.length === 0) {
                            setError("No submission attempts found for this exam yet.");
                         }
                    } else {
                        // Even if submissions array exists, if examDetails is missing, it's an error
                        throw new Error("Invalid data format received (missing examDetails).");
                    }
                }
            } catch (err) {
                console.error("Error fetching submission history:", err);
                if (isMounted) {
                    let errorMsg = err.response?.data?.message || err.message || "Failed to load submission history.";
                    // Special handling for 404
                    if (err.response?.status === 404) {
                        // If backend provides exam details even on 404 (e.g., exam exists but no subs), use them
                         if(err.response?.data?.examDetails) {
                            setPageData({ examDetails: err.response.data.examDetails, submissions: [] });
                            errorMsg = err.response?.data?.message || "No submission attempts found for this exam yet."; // Use specific message from backend if available
                         } else {
                            // Otherwise, it's likely the exam itself wasn't found
                            errorMsg = err.response?.data?.message || "Exam not found.";
                         }
                    }
                    setError(errorMsg);
                    // Reset details only if they haven't been loaded (e.g., from a 404 response with details)
                    // and the error is not just 'no submissions found'
                    if(!pageData.examDetails && errorMsg !== "No submission attempts found for this exam yet.") {
                       setPageData({ examDetails: null, submissions: [] });
                    }
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchHistory();

        return () => { isMounted = false; };
    // Dependency array: refetch if examId changes. pageData.examDetails is removed to prevent potential loop if error sets it to null.
    }, [examId]);


    // --- Event Handlers ---
     const handleBackToExams = () => { navigate('/student/exams'); };
     const handleRetryExam = () => { navigate(`/student/take-exam/${examId}`); };
     const handlePreviousActivity = () => { navigate(-1); };
     const handleNextActivity = () => { navigate('/student/dashboard'); };


    // --- Render Logic ---
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    // Error displayed only if examDetails are truly missing (and not just 'no submissions' error)
    if (error && !pageData.examDetails && error !== "No submission attempts found for this exam yet.") {
        return (
             <Box sx={{ p: 3, textAlign: 'center', height: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                 <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                 <Button variant="outlined" onClick={handleBackToExams}>Back to Exams</Button>
             </Box>
        );
    }

    // Handle case where examDetails loaded but no submissions yet
     if (pageData.examDetails && pageData.submissions.length === 0) {
          const canAttemptAgain = (pageData.examDetails.attemptsAllowed ?? 1) > (pageData.examDetails.attemptsTaken ?? 0);
          return (
               <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
                    <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'medium', textAlign: 'center' }}>
                         {pageData.examDetails.quizName || pageData.examDetails.examName || "Quiz Results"}
                     </Typography>
                     <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                         Attempts allowed: {pageData.examDetails.attemptsAllowed ?? 1} (Taken: {pageData.examDetails.attemptsTaken ?? 0})
                     </Typography>
                     <Alert severity="info" sx={{ mb: 3 }}>
                       {error || "No submission attempts have been recorded for this exam yet."}
                     </Alert>
                     <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
                        <Button variant="contained" color="primary" onClick={handleBackToExams}>
                             Back to Available Exams
                         </Button>
                          {canAttemptAgain && (
                               <Button variant="outlined" color="secondary" onClick={handleRetryExam} startIcon={<ReplayIcon/>}>
                                    Start Exam (Attempt { (pageData.examDetails.attemptsTaken ?? 0) + 1 })
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

     // Render normally if examDetails and at least one submission exist
     // Check added to prevent rendering if examDetails became null due to error
     if (!pageData.examDetails) {
        // This case should ideally be caught by the error display above, but acts as a safeguard
        return (
            <Box sx={{ p: 3, textAlign: 'center', height: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                 <Alert severity="warning" sx={{ mb: 2 }}>Could not load exam details to display results.</Alert>
                 <Button variant="outlined" onClick={handleBackToExams}>Back to Exams</Button>
             </Box>
        )
     }
     const { examDetails, submissions } = pageData;

    const totalAllowed = parseInt(examDetails.attemptsAllowed ?? 1, 10);
    const taken = parseInt(examDetails.attemptsTaken ?? submissions.length, 10);
    const remainingAttempts = totalAllowed - taken;
    const noMoreAttempts = remainingAttempts <= 0;
    const canAttemptAgain = !noMoreAttempts;

    // *** USE THE MODULE-SCOPED CONSTANT HERE ***
    const validSubmissions = submissions.filter(sub =>
        sub.status !== CANCELLED_STATUS_STRING && // Use constant
        sub.correctAnswers !== null &&
        sub.correctAnswers !== undefined
    );
    let highestScore = 0;
    if (validSubmissions.length > 0) {
        highestScore = Math.max(...validSubmissions.map(sub => sub.score ?? 0));
    }


    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
             <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'medium', textAlign: 'center' }}>
                 {examDetails.quizName || examDetails.examName}
             </Typography>
             <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                  {canAttemptAgain
                    ? `Attempts remaining: ${remainingAttempts} (out of ${totalAllowed} total)`
                    : `Attempts allowed: ${totalAllowed} (All used)`}
             </Typography>
             {error && error !== "No submission attempts found for this exam yet." && <Alert severity="warning" sx={{mb: 2}}>{error}</Alert>}

            <Typography variant="h5" component="h2" sx={{ mb: 2, mt: 4 }}>
                Summary of your attempts
            </Typography>

            {submissions.map((sub, index) => (
                <AttemptSummaryRow
                    key={sub.submissionId || `att-${index}`}
                    submission={sub}
                    examDetails={examDetails}
                    attemptNumber={index + 1}
                />
            ))}

             {validSubmissions.length > 0 && (
                 <Typography variant="h6" sx={{ textAlign: 'center', mt: 4, mb: 2, fontWeight: 'medium' }}>
                     Your final grade for this quiz (highest score from valid attempts) is {highestScore.toFixed(2)} / 100.00.
                 </Typography>
             )}
             {submissions.length > 0 && validSubmissions.length === 0 && (
                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', mt: 4, mb: 2 }}>
                     All recorded attempts for this exam were cancelled or invalidated. No final grade is available.
                 </Typography>
             )}

             {noMoreAttempts && (
                 <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
                     No more attempts are allowed for this exam.
                 </Typography>
             )}

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
                 {canAttemptAgain ? (
                     <Button variant="contained" color="secondary" onClick={handleRetryExam} startIcon={<ReplayIcon />}>
                         Retry Exam (Attempt {taken + 1})
                     </Button>
                 ) : null }
                 <Button variant="contained" color="primary" onClick={handleBackToExams} startIcon={<ListAltIcon />}>
                     Back to Available Exams
                 </Button>
             </Box>

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, opacity: 0.6 }}>
                 <Button variant="outlined" onClick={handlePreviousActivity} disabled>Previous Activity</Button>
                 <Button variant="outlined" onClick={handleNextActivity} disabled>Next Activity</Button>
            </Box>
        </Box>
    );
}

export default ExamSubmittedPage;