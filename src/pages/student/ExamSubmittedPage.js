// src/pages/student/ExamSubmittedPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, Divider, CircularProgress, Alert, Link
} from '@mui/material';
import apiClient from '../../api'; // If fetching data here

import { format } from 'date-fns'; // You might need to install date-fns: npm install date-fns

/**
 * Formats a date object or string into a human-readable date and time.
 * Example: "Wednesday, 8 February 2023, 10:47 AM"
 * @param {Date|string|number} dateInput - The date to format.
 * @returns {string} - Formatted date string or an empty string if input is invalid.
 */
export const formatDateTime = (dateInput) => {
  try {
    const date = new Date(dateInput);
    // Check if the date is valid after parsing
    if (isNaN(date.getTime())) {
        throw new Error("Invalid Date");
    }
    // e.g., "Wednesday, 8 February 2023, 10:47 AM"
    return format(date, "EEEE, d MMMM yyyy, h:mm a");
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date'; // Return a placeholder or empty string
  }
};

function ExamSubmittedPage() {
    const { examId } = useParams();
    const navigate = useNavigate();
    const location = useLocation(); // <-- Get location object

    // **** MODIFICATION START ****
    // Prioritize data passed via navigation state
    const passedData = location.state?.submissionData;
    console.log("Received data via location state:", passedData);

    const [submissionDetails, setSubmissionDetails] = useState(passedData || null);
    const [isLoading, setIsLoading] = useState(!passedData); // If data passed, we are not initially loading
    const [error, setError] = useState(null);

    // --- Updated Mock Data (Reflecting expected structure, used as fallback) ---
    const mockSubmissionData = {
        examName: "Mock Exam",
        quizName: "Mock Quiz Results",
        status: "Finished",
        submittedAt: new Date().toISOString(),
        correctAnswers: 7, // Example mock value
        totalQuestions: 10, // Example mock value
        attemptsAllowed: 1,
        courseId: 'mock-course-id',
        reviewUrl: null // Optional mock value
    };
    // **** MODIFICATION END ****

    // --- Debug Effect ---
    useEffect(() => {
        if (submissionDetails) {
            console.log("Submission details loaded:", submissionDetails);
            console.log("Total questions:", submissionDetails.totalQuestions);
            console.log("Correct answers:", submissionDetails.correctAnswers);
            
            // Calculate and log the grade for debugging
            // Fixed bug in grade calculation - changed "data" to "submissionDetails"
            const totalQuestions = submissionDetails.totalQuestions ?? 0;
            const correctAnswers = submissionDetails.correctAnswers ?? 0;
            const gradeOutOf = 100.00; // Tetap 100 poin total
            // Setiap pertanyaan memiliki bobot yang sama dari total 100 poin
            const pointsPerQuestion = totalQuestions > 0 ? gradeOutOf / totalQuestions : 0;
            // Hitung total nilai berdasarkan jumlah jawaban benar dikalikan nilai per pertanyaan
            const calculatedGrade = correctAnswers * pointsPerQuestion;

            // Debug log
            console.log("Grade calculation values:", {
                totalQuestions, 
                correctAnswers,
                pointsPerQuestion: pointsPerQuestion.toFixed(2),
                calculatedGrade: calculatedGrade.toFixed(2)
            });
        }
    }, [submissionDetails]);

    // --- Data Fetching Effect (Only if data wasn't passed) ---
    useEffect(() => {
        const fetchSubmission = async () => {
            try {
                if (!passedData && examId) {
                    setIsLoading(true);
                    setError(null);
                    console.log(`Fetching submission details for exam ${examId} (fallback)...`);
    
                    const response = await apiClient.get(`/student/exams/${examId}/submission/latest`);
                    console.log("Fetched submission data (fallback):", response.data);
    
                    const fetchedData = response.data;
    
                    // Pastikan struktur respons backend sesuai
                    setSubmissionDetails({
                        examName: fetchedData.examName || "Exam",
                        quizName: fetchedData.quizName || "Quiz Results",
                        status: fetchedData.status || "Finished",
                        submittedAt: fetchedData.submittedAt || new Date().toISOString(),
                        correctAnswers: fetchedData.correctAnswers ?? 0,
                        totalQuestions: fetchedData.totalQuestions ?? 0,
                        attemptsAllowed: fetchedData.attemptsAllowed ?? 1,
                        courseId: fetchedData.courseId || 'unknown-course',
                        reviewUrl: fetchedData.reviewUrl || null,
                    });
                } else if (passedData) {
                    console.log("Using data passed via navigation state:", passedData);
                    setSubmissionDetails(passedData);
                } else {
                    // No examId and no passedData, fallback ke mock
                    console.warn("Using mock data for ExamSubmittedPage (no examId or passed data).");
                    setSubmissionDetails(mockSubmissionData);
                }
            } catch (err) {
                console.error("Error fetching submission details:", err);
                setError(err.response?.data?.message || err.message || "Failed to load submission details.");
                setSubmissionDetails(mockSubmissionData); // Optional fallback for dev
            } finally {
                setIsLoading(false);
            }
        };
    
        fetchSubmission();
    }, [examId, passedData]);
    

    // --- Event Handlers ---
    const handleBackToCourse = () => {
        // Use courseId from details, fallback if needed
        const courseId = submissionDetails?.courseId || 'default-course-id';
        navigate(`/student/courses/${courseId}`);
    };
     const handlePreviousActivity = () => { navigate(-1); }; // Might go back to exam taking if not replace:true used
     const handleNextActivity = () => { navigate('/student/dashboard'); };


    // --- Render Logic ---
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
    }

    if (error) {
        return <Box sx={{ p: 3 }}><Alert severity="error">Error: {error}</Alert></Box>;
    }

    if (!submissionDetails) {
        return <Box sx={{ p: 3 }}><Alert severity="warning">Could not load submission details.</Alert></Box>;
    }

    // Use the fetched/passed/mock data with defensive checks
    const data = submissionDetails || {};
    const isReviewAvailable = !!data.reviewUrl;

    // --- Calculate Grade with defensive programming ---
    const totalQuestions = data.totalQuestions ?? 0; // Use ?? for null/undefined check
    const correctAnswers = data.correctAnswers ?? 0; // Use ?? for null/undefined check
    const gradeOutOf = 100.00; // Hardcoded as per requirement
    
    // Calculate points per question approach (consistent with debug effect)
    const pointsPerQuestion = totalQuestions > 0 ? gradeOutOf / totalQuestions : 0;
    const calculatedGrade = correctAnswers * pointsPerQuestion;

    // Debug log the values used for grade calculation
    console.log("Grade calculation values:", {
        totalQuestions, 
        correctAnswers, 
        pointsPerQuestion: pointsPerQuestion.toFixed(2),
        calculatedGrade: calculatedGrade.toFixed(2)
    });

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>

             {/* Header Section */}
             <Typography variant="h4" component="h1" sx={{ mb: 2, fontWeight: 'medium' }}>
                 {/* Use quizName if available, fallback to examName */}
                 {data.quizName || data.examName || "Quiz Results"}
             </Typography>
             <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                 Attempts allowed: {data.attemptsAllowed ?? 1}
             </Typography>

            {/* Summary Section */}
            <Typography variant="h5" component="h2" sx={{ mb: 2, mt: 4 }}>
                Summary of your attempt
            </Typography>

            <Paper variant="outlined" sx={{ mb: 4 }}>
                {/* Header Row - Check if headers match intent */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ flexBasis: '25%', fontWeight: 'bold' }}>State</Typography>
                    {/* Header: Correct Count */}
                    <Typography variant="subtitle2" sx={{ flexBasis: '25%', textAlign: 'center', fontWeight: 'bold' }}>Mark / {totalQuestions}</Typography>
                    {/* Header: Calculated Grade */}
                    <Typography variant="subtitle2" sx={{ flexBasis: '25%', textAlign: 'center', fontWeight: 'bold' }}>Grade / {gradeOutOf.toFixed(2)}</Typography>
                    <Typography variant="subtitle2" sx={{ flexBasis: '25%', textAlign: 'right', fontWeight: 'bold' }}>Review</Typography>
                </Box>

                {/* Data Row - Display calculated values */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
                    {/* State */}
                    <Box sx={{ flexBasis: '25%' }}>
                        <Typography variant="body1">{data.status || "Finished"}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Submitted {data.submittedAt ? formatDateTime(data.submittedAt) : 'N/A'}
                        </Typography>
                    </Box>
                    {/* Value: Correct Count */}
                    <Typography variant="body1" sx={{ flexBasis: '25%', textAlign: 'center' }}>{correctAnswers}</Typography>
                    {/* Value: Calculated Grade */}
                    <Typography variant="body1" sx={{ flexBasis: '25%', textAlign: 'center', fontWeight: 'bold' }}>{calculatedGrade.toFixed(2)}</Typography>
                    {/* Review Link */}
                    <Box sx={{ flexBasis: '25%', textAlign: 'right' }}>
                        {isReviewAvailable ? (
                             // Ensure navigation works if reviewUrl is relative/absolute
                             <Link component="button" variant="body2" onClick={() => navigate(data.reviewUrl)}>
                                 Review
                             </Link>
                         ) : (
                             <Typography variant="body2" color="text.disabled">Not available</Typography>
                         )}
                    </Box>
                </Box>
            </Paper>

            {/* Final Grade Text - Use calculated grade */}
            <Typography variant="h6" sx={{ textAlign: 'center', mb: 2 }}>
                Your final grade for this quiz is {calculatedGrade.toFixed(2)} / {gradeOutOf.toFixed(2)}.
            </Typography>

            {/* No More Attempts Message */}
             {(data.attemptsAllowed === 1 || (data.attemptNumber && data.attemptNumber >= data.attemptsAllowed)) && ( // Improved condition if attempt number is available
                 <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
                     No more attempts are allowed
                 </Typography>
             )}


            {/* Navigation Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                 <Button variant="outlined" onClick={handleBackToCourse}>
                     Back to the course
                 </Button>
             </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                <Button variant="outlined" onClick={handlePreviousActivity}>Previous Activity</Button>
                <Button variant="outlined" onClick={handleNextActivity}>Next Activity</Button>
            </Box>
        </Box>
    );
}

export default ExamSubmittedPage;