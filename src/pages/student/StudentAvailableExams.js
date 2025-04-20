// src/pages/student/StudentAvailableExams.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Card, CardContent, CardActions, Button, Grid, Chip, Tooltip,
    CircularProgress, Alert, Divider // Import Divider
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HistoryIcon from '@mui/icons-material/History'; // Icon for Done exams

import apiClient from '../../api';

// ExamCard Component
function ExamCard({ exam }) {
    const navigate = useNavigate();

    // Handler untuk memulai ujian
    const handleStartExam = (examId) => {
        // Path ini sudah benar berdasarkan App.js -> /student/take-exam/:examId
        navigate(`/student/take-exam/${examId}`);
        console.log("Navigating to take Exam:", examId);
    };

    // Handler untuk melihat hasil (akan dipanggil oleh tombol 'View Results')
    const handleViewResults = (examId) => {
        console.log("Navigating to submitted page for Exam:", examId);
        // Path ini sudah benar berdasarkan App.js -> /student/exam/:examId/submitted
        navigate(`/student/exam/${examId}/submitted`);
    };


    const attemptsTaken = exam.attemptsTaken || 0;
    const hasAttemptsLeft = attemptsTaken < exam.allowed_attempts;

    let buttonProps = {
        text: 'Unavailable',
        icon: <InfoOutlinedIcon />,
        disabled: true,
        color: 'secondary',
        tooltip: `Exam status: ${exam.status}`,
        action: () => {}
    };

    // Tentukan properti tombol berdasarkan status dan attempt
    if (exam.status === 'Published') {
        if (hasAttemptsLeft) {
            // Jika masih ada attempt -> Tombol "Start Exam"
            buttonProps = {
                text: 'Start Exam',
                icon: <PlayCircleOutlineIcon />,
                disabled: false,
                color: 'primary',
                tooltip: `Attempt ${attemptsTaken + 1} of ${exam.allowed_attempts}`,
                action: () => handleStartExam(exam.id) // Panggil handleStartExam
            };
        } else {
            // Jika attempt habis -> Tombol "View Results"
            buttonProps = {
                text: 'View Results',
                icon: <CheckCircleIcon />,
                disabled: false, // Aktifkan tombol
                color: 'success',
                tooltip: `All ${exam.allowed_attempts} attempts used. Click to view results.`,
                action: () => handleViewResults(exam.id) // Panggil handleViewResults
            };
        }
    }

    // Render Card
    return (
        <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }} elevation={2}>
            <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h6" component="div" gutterBottom>
                    {exam.name || 'Unnamed Exam'}
                </Typography>
                <Typography sx={{ mb: 1 }} color="text.secondary">
                    {exam.subject || 'No Subject'}
                </Typography>
                <Chip
                    label={`Duration: ${exam.duration ? `${exam.duration} min` : 'N/A'}`}
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                />
                <Chip
                    label={`Attempts: ${attemptsTaken} / ${exam.allowed_attempts}`}
                    size="small"
                    sx={{ mb: 1 }}
                />
            </CardContent>
            <CardActions sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', p: 2 }}>
                 <Tooltip title={buttonProps.tooltip}>
                    <span>
                        <Button
                            variant="contained"
                            size="small"
                            color={buttonProps.color}
                            startIcon={buttonProps.icon}
                            disabled={buttonProps.disabled}
                            onClick={buttonProps.action} // Akan memanggil handleStartExam atau handleViewResults
                            sx={{ borderRadius: 2 }}
                        >
                            {buttonProps.text}
                        </Button>
                    </span>
                 </Tooltip>
            </CardActions>
        </Card>
    );
}

// Komponen Utama: StudentAvailableExams
function StudentAvailableExams() {
    const [allExamsData, setAllExamsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

     // Fetch data dari backend
     useEffect(() => {
        const fetchAllExams = async () => {
             setIsLoading(true);
             setError(null);
             try {
                 const response = await apiClient.get('/student/exams/available');
                 setAllExamsData(response.data || []);
             } catch (err) {
                 console.error("Fetch available exams error:", err);
                 let errorMessage = "Failed to load available exams.";
                 if (err.response) {
                     errorMessage = `(${err.response.status}) ${err.response.data?.message || errorMessage}`;
                 }
                 setError(errorMessage);
                 setAllExamsData([]);
             } finally {
                 setIsLoading(false);
             }
        };

        fetchAllExams();
    }, []); // Hanya run sekali saat mount

    // Filter data ujian menjadi dua grup
    const examsToDo = allExamsData.filter(exam => (exam.attemptsTaken || 0) < exam.allowed_attempts);
    const examsDone = allExamsData.filter(exam => (exam.attemptsTaken || 0) >= exam.allowed_attempts);

    // Render komponen
    return (
        <Box>
            {/* Loading Indicator */}
            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                    <CircularProgress />
                </Box>
            )}

            {/* Error Message Display */}
            {error && !isLoading && (
                <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
            )}

            {/* Konten Utama (jika tidak loading dan tidak error) */}
            {!isLoading && !error && (
                <>
                    {/* --- BAGIAN AVAILABLE EXAMS --- */}
                    <Typography variant="h5" gutterBottom sx={{ mb: 2, mt: 1, fontWeight: 'medium' }}>
                        Available Exams
                    </Typography>
                    <Grid container spacing={3}>
                        {examsToDo.length > 0 ? (
                            examsToDo.map((exam) => (
                                <Grid item xs={12} sm={6} md={4} key={exam.id}>
                                   <ExamCard exam={exam} />
                                </Grid>
                            ))
                        ) : (
                            <Grid item xs={12}>
                                <Typography sx={{ mt: 2, textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                                    No exams available for you to take right now.
                                </Typography>
                            </Grid>
                        )}
                    </Grid>

                    {/* --- PEMISAH --- */}
                    <Divider sx={{ my: 4 }} />

                    {/* --- BAGIAN COMPLETED EXAMS --- */}
                    <Typography variant="h5" gutterBottom sx={{ mb: 2, fontWeight: 'medium' }}>
                        Completed Exams
                    </Typography>
                    <Grid container spacing={3}>
                        {examsDone.length > 0 ? (
                            examsDone.map((exam) => (
                                <Grid item xs={12} sm={6} md={4} key={exam.id}>
                                   {/* ExamCard yang sama, tapi button action-nya akan berbeda */}
                                   <ExamCard exam={exam} />
                                </Grid>
                            ))
                        ) : (
                            <Grid item xs={12}>
                                <Typography sx={{ mt: 2, textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                                    You haven't completed any exams yet or used all attempts.
                                </Typography>
                            </Grid>
                        )}
                    </Grid>
                </>
            )}
        </Box>
    );
}

export default StudentAvailableExams;