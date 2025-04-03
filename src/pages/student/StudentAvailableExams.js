// src/pages/student/StudentAvailableExams.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Card, CardContent, CardActions, Button, Grid, Chip, Tooltip,
    CircularProgress, Alert
} from '@mui/material';
// Import necessary icons
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'; // Kept if needed for other statuses

// Import the API client
import apiClient from '../../api';

/**
 * ExamCard Component: Renders a single exam card for the student.
 * Handles displaying exam details and the logic for the 'Start Exam' button.
 */
function ExamCard({ exam }) {
    const navigate = useNavigate();

    // Function to navigate to the exam taking interface
    const handleStartExam = (examId) => {
        console.log("Navigating to take Exam:", examId);
        navigate(`/student/take-exam/${examId}`);
    };

    // --- Determine Button State based on Status and Attempts ---
    let buttonProps = {
        text: 'Unavailable',        // Default text
        icon: <InfoOutlinedIcon />, // Default icon
        disabled: true,             // Default state
        color: 'secondary',         // Default color
        tooltip: `Exam status: ${exam.status}`, // Default tooltip
        action: () => {}            // Default action (none)
    };

    // Placeholder for actual attempts taken by the student for this specific exam
    // In a real application, this value would need to be fetched or passed down.
    const attemptsTaken = exam.attemptsTaken || 0; // Use 0 if undefined
    const hasAttemptsLeft = attemptsTaken < exam.allowed_attempts;

    // Logic only applies if the exam is 'Published'
    if (exam.status === 'Published') {
        if (hasAttemptsLeft) {
            // If published and attempts are left, allow starting
            buttonProps = {
                text: 'Start Exam',
                icon: <PlayCircleOutlineIcon />,
                disabled: false,
                color: 'primary',
                tooltip: `Attempt ${attemptsTaken + 1} of ${exam.allowed_attempts}`,
                action: () => handleStartExam(exam.id) // Action navigates
            };
        } else {
            // If published but no attempts left
            buttonProps = {
                text: 'No Attempts Left',
                icon: <CheckCircleIcon />,
                disabled: true,
                color: 'success', // Use success color to indicate completion/exhaustion
                tooltip: `All ${exam.allowed_attempts} attempts used`,
                action: () => {}
            };
        }
    }
    // Note: For 'Draft' or 'Archived' status, the default 'Unavailable' props will be used.

    return (
        // Card container with flex column layout to push actions to the bottom
        <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }} elevation={2}>
            {/* Main content area */}
            <CardContent sx={{ flexGrow: 1 }}>
                {/* Exam Name */}
                <Typography variant="h6" component="div" gutterBottom>
                    {exam.name || 'Unnamed Exam'}
                </Typography>
                {/* Subject */}
                <Typography sx={{ mb: 1 }} color="text.secondary">
                    {exam.subject || 'No Subject'}
                </Typography>
                {/* Duration Chip */}
                <Chip
                    label={`Duration: ${exam.duration ? `${exam.duration} min` : 'N/A'}`}
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                />
                {/* Attempts Chip */}
                <Chip
                    label={`Attempts: ${attemptsTaken} / ${exam.allowed_attempts}`}
                    size="small"
                    sx={{ mb: 1 }}
                />
                {/* Removed Start/End Time Display */}
            </CardContent>
            {/* Action area at the bottom of the card */}
            <CardActions sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', p: 2 }}>
                 {/* Tooltip provides extra info on hover, especially for disabled buttons */}
                 <Tooltip title={buttonProps.tooltip}>
                    {/* Span wrapper is necessary for Tooltip to work on disabled buttons */}
                    <span>
                        <Button
                            variant="contained"
                            size="small"
                            color={buttonProps.color}
                            startIcon={buttonProps.icon}
                            disabled={buttonProps.disabled}
                            onClick={buttonProps.action}
                            sx={{ borderRadius: 2 }} // Apply consistent styling
                        >
                            {buttonProps.text}
                        </Button>
                    </span>
                 </Tooltip>
            </CardActions>
        </Card>
    );
}


/**
 * StudentAvailableExams Component: Fetches and displays the list of exams
 * available for the currently logged-in student.
 */
function StudentAvailableExams() {
    // State for the list of exams, loading status, and potential errors
    const [availableExams, setAvailableExams] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

     // Effect Hook to fetch data when the component mounts
     useEffect(() => {
        const fetchAvailableExams = async () => {
             setIsLoading(true); // Set loading true before fetch
             setError(null); // Clear previous errors
             try {
                 // Fetch exams from the student-specific endpoint
                 // Backend currently returns only 'Published' exams
                 const response = await apiClient.get('/student/exams/available');
                 setAvailableExams(response.data || []); // Ensure it's an array even if data is null/undefined
             } catch (err) {
                 console.error("Fetch available exams error:", err);
                 let errorMessage = "Failed to load available exams.";
                 if (err.response) {
                     errorMessage = `(${err.response.status}) ${err.response.data?.message || errorMessage}`;
                 }
                 setError(errorMessage);
                 setAvailableExams([]); // Clear exams on error
             } finally {
                 setIsLoading(false); // Set loading false after fetch attempt (success or fail)
             }
        };

        fetchAvailableExams(); // Call the fetch function
    }, []); // Empty dependency array ensures this runs only once on mount

    // --- Render Logic ---
    return (
        <Box>
            {/* Page Title */}
            <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
                Available Exams
            </Typography>

             {/* Loading Indicator */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                    <CircularProgress />
                </Box>
            )}

            {/* Error Message Display */}
            {error && !isLoading && (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            )}

            {/* Grid Container for Exam Cards - Render only if not loading and no error */}
            {!isLoading && !error && (
                <Grid container spacing={3}>
                    {/* Check if there are exams to display */}
                    {availableExams.length > 0 ? (
                        // Map over the fetched exams and render an ExamCard for each
                        availableExams.map((exam) => (
                            <Grid item xs={12} sm={6} md={4} key={exam.id}>
                               {/* Pass the full exam object to the ExamCard */}
                               <ExamCard exam={exam} />
                            </Grid>
                        ))
                    ) : (
                        // Display message if no exams are available
                        <Grid item xs={12}>
                            <Typography sx={{ mt: 3, textAlign: 'center', color: 'text.secondary' }}>
                                No exams are currently available for you.
                            </Typography>
                        </Grid>
                    )}
                </Grid>
            )}
        </Box>
    );
}

export default StudentAvailableExams;