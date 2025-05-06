// src/pages/student/ExamTakingInterface.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, RadioGroup, FormControlLabel, Radio,
    CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, LinearProgress, useTheme, Divider, FormControl,
    IconButton, // Added for flag button
    Tooltip // Added for flag button clarity
} from '@mui/material';
// Import necessary icons
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FaceRetouchingOffIcon from '@mui/icons-material/FaceRetouchingOff';
import GroupsIcon from '@mui/icons-material/Groups';
import FlagIcon from '@mui/icons-material/Flag'; // Icon for Flagged
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'; // Icon for Not Flagged
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'; // Icon for Current
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'; // Icon for submission error feedback

// Import API client
import apiClient from '../../api';

import { format } from 'date-fns';

// --- Helper Functions (formatDateTime, formatTime) ---
export const formatDateTime = (dateInput) => {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) { throw new Error("Invalid Date"); }
    return format(date, "EEEE, d MMMM yyyy, h:mm a");
  } catch (error) {
    console.error("Error formatting date:", error, "Input:", dateInput);
    return 'Invalid Date';
  }
};

const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};


// --- Configuration ---
const MAX_LEAVE_COUNT = 3;
const LEAVE_WARNING_DURATION = 4000;
const MAX_TAB_SWITCH_COUNT = 3;
const TAB_SWITCH_WARNING_DURATION = 4000;
const FRAME_ANALYSIS_INTERVAL = 4000; // ms
const MAX_CHEAT_WARNINGS = 3;
const CHEAT_WARNING_DURATION = 5000; // ms
const HEAD_POSE_SCORE_THRESHOLD = 0.65; // Example threshold


// --- ExamTakingInterface Component ---
function ExamTakingInterface() {
    const { examId } = useParams();
    const navigate = useNavigate();
    const theme = useTheme();

    // --- Component State ---
    // Exam Data and Progress
    const [examDetails, setExamDetails] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({}); // { qId: selectedOptionValue }
    const [timeLeft, setTimeLeft] = useState(null); // in seconds
    const [flags, setFlags] = useState({}); // { qId: true/false }

    // UI / Interaction State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null); // For data loading errors
    const [submissionError, setSubmissionError] = useState(null); // For API errors AND pre-submit validation
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

    // Camera State
    const [stream, setStream] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const videoRef = useRef(null);

    // Proctoring State (Window/Tab Monitoring)
    const [leaveCount, setLeaveCount] = useState(0);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const leaveWarningTimeoutId = useRef(null);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
    const tabSwitchWarningTimeoutId = useRef(null);

    // Proctoring State (CV Cheating Detection)
    const canvasRef = useRef(null); // Hidden canvas for frame capture
    const frameAnalysisIntervalId = useRef(null);
    const [isAnalyzingFrame, setIsAnalyzingFrame] = useState(false);
    const [cheatingWarningCount, setCheatingWarningCount] = useState(0);
    const [showCheatingWarning, setShowCheatingWarning] = useState(false);
    const [cheatingWarningMsg, setCheatingWarningMsg] = useState('');
    const cheatingWarningTimeoutId = useRef(null);
    const [proctoringScore, setProctoringScore] = useState(0.0); // CV analysis score

    // Exam Cancellation State
    const [isExamCancelled, setIsExamCancelled] = useState(false);
    const [cancellationReason, setCancellationReason] = useState(''); // 'time', 'leave', 'tabswitch', 'cheating'
    const isCancellingRef = useRef(false); // <-- LOCK Ref untuk mencegah cancel ganda

    // --- Effects ---

    // Fetch Exam Data on Mount
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        isCancellingRef.current = false; // Reset lock saat load exam baru
        apiClient.get(`/student/exams/${examId}/take`)
            .then(response => {
                const data = response.data;
                if (!data || !data.questions || data.questions.length === 0) {
                    throw new Error("Exam data is invalid or contains no questions.");
                }
                setExamDetails(data);
                setTimeLeft(data.duration ? data.duration * 60 : 3600);

                const initialAnswers = {};
                const initialFlags = {};
                data.questions.forEach(q => {
                    initialAnswers[String(q.id)] = null;
                    initialFlags[String(q.id)] = false;
                });
                setAnswers(initialAnswers);
                setFlags(initialFlags);

                setLeaveCount(0);
                setTabSwitchCount(0);
                setCheatingWarningCount(0);
                setProctoringScore(0.0);
                setIsExamCancelled(false);
                setCancellationReason('');
            })
            .catch(err => {
                console.error("Error fetching exam details:", err);
                setError(err.response?.data?.message || err.message || "Failed to load exam.");
            })
            .finally(() => setIsLoading(false));
    }, [examId]);

    // --- Camera Logic ---
    const startCamera = useCallback(async () => {
        if (stream || isExamCancelled) return;
        setCameraError(null);
        console.log("Attempting to start camera...");
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 160 }, height: { ideal: 120 }, facingMode: "user" },
                audio: false
            });
            console.log("Camera stream acquired.");
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.play().catch(e => console.error("Video play failed:", e));
            }
        } catch (err) {
            console.error("Camera Error:", err);
            let message = `Error accessing camera: ${err.name || 'Unknown Error'}`;
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") message = "Camera access denied by user.";
            else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") message = "No camera device found.";
            else if (err.name === "NotReadableError") message = "Camera is already in use or hardware error.";
            setCameraError(message);
            setStream(null);
        }
    }, [stream, isExamCancelled]);

    const stopCamera = useCallback(() => {
        if (stream) {
            console.log("Stopping camera stream...");
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        }
    }, [stream]);

    useEffect(() => {
        if (!isLoading && examDetails && !isExamCancelled) {
             startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isLoading, examDetails, isExamCancelled, startCamera, stopCamera]);

    // Timer Countdown Effect
    useEffect(() => {
        if (isExamCancelled || timeLeft === null || timeLeft <= 0 || !examDetails || isLoading) return;
        const timerId = setInterval(() => {
            setTimeLeft(prevTime => {
                const newTime = prevTime - 1;
                if (newTime <= 0) {
                    clearInterval(timerId);
                    console.log("Time's up!");
                    // Gunakan reportCancellationToBackend agar tercatat sebagai 1 attempt
                    if (!isCancellingRef.current) { // Cek lock ref juga
                         console.error("--- TRIGGERING CANCELLATION from Timer ---");
                         reportCancellationToBackend('time', 'Exam time limit reached.');
                    }
                    return 0;
                }
                return newTime;
            });
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft, isExamCancelled, examDetails, isLoading]); // reportCancellationToBackend tidak perlu di deps timer

    // --- Cancellation Function with Lock ---
    const reportCancellationToBackend = useCallback(async (reasonCode, reasonMessage) => {
        // --- GUNAKAN REF SEBAGAI LOCK UTAMA ---
        if (isCancellingRef.current) {
            console.warn("Cancellation process already initiated (ref lock), skipping duplicate call.");
            return;
        }
        // Jika belum ada yang proses, LANGSUNG set Ref lock
        isCancellingRef.current = true;
        console.log(`Ref lock acquired for cancellation. Reason: ${reasonCode}`);

        // Cek state (sebagai lapisan kedua)
        if (isExamCancelled) {
             console.warn("State isExamCancelled was already true, cancelling duplicate call.");
             return;
        }

        // Set state (sekarang aman dari race condition)
        console.log(`Setting cancellation state locally. Reason Code: ${reasonCode}`);
        setCancellationReason(reasonCode);
        setIsExamCancelled(true);

        // --- Baru lakukan tindakan lain (stop proctoring, panggil API) ---
        console.log(`Reporting exam cancellation to backend. Reason Code: ${reasonCode}, Message: ${reasonMessage}`);

        if (!examId) {
            console.error("Cannot report cancellation: Exam ID is missing.");
            return; // Tetap cancelled di frontend, tapi log error
        }

        // Stop proctoring processes
        if (frameAnalysisIntervalId.current) {
             clearInterval(frameAnalysisIntervalId.current);
             frameAnalysisIntervalId.current = null;
             console.log("Cleared frame analysis interval due to cancellation trigger.");
        }
        stopCamera(); // Stop camera stream

        try {
             const response = await apiClient.post(`/student/exams/${examId}/cancel`, {
                 reason: reasonMessage
             });
             if (response.status === 200) {
                 console.log('Exam cancellation successfully reported to backend and recorded.');
             } else {
                 console.warn('Backend responded to cancellation report with status:', response.status, response.data?.message);
             }
        } catch (error) {
             console.error('Error reporting exam cancellation to backend:', error.response?.data?.message || error.message);
        }
        // Biarkan isCancellingRef.current = true agar tidak bisa cancel lagi
    }, [examId, isExamCancelled, stopCamera, setCancellationReason, setIsExamCancelled]); // Ref tidak perlu di deps

    // Mouse Leave Detection Effect
    useEffect(() => {
        if (isExamCancelled || isLoading || !examDetails) return;
        const handleMouseLeave = (event) => {
             if (!isExamCancelled && !isCancellingRef.current && !event.relatedTarget && (event.clientY <= 0 || event.clientX <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) {
                 setLeaveCount(prevCount => {
                    const newCount = prevCount + 1;
                    console.warn(`Mouse left window boundary. Count: ${newCount}/${MAX_LEAVE_COUNT}`);
                    if (newCount >= MAX_LEAVE_COUNT) {
                        console.error("--- TRIGGERING CANCELLATION from handleMouseLeave ---");
                        reportCancellationToBackend('leave', `Cursor left the designated testing area ${MAX_LEAVE_COUNT} time(s).`);
                        if (leaveWarningTimeoutId.current) clearTimeout(leaveWarningTimeoutId.current);
                        setShowLeaveWarning(false);
                    } else {
                        setShowLeaveWarning(true);
                        if(leaveWarningTimeoutId.current) clearTimeout(leaveWarningTimeoutId.current);
                        leaveWarningTimeoutId.current = setTimeout(() => setShowLeaveWarning(false), LEAVE_WARNING_DURATION);
                    }
                    return newCount;
                 });
            }
        };
        document.documentElement.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
            if(leaveWarningTimeoutId.current) clearTimeout(leaveWarningTimeoutId.current);
        };
    }, [isExamCancelled, isLoading, examDetails, reportCancellationToBackend]); // Tambahkan reportCancellationToBackend ke deps

    // Tab Switch / Visibility Change Detection Effect
    useEffect(() => {
        if (isExamCancelled || isLoading || !examDetails) return;
        const handleVisibilityChange = () => {
            if (document.hidden && !isExamCancelled && !isCancellingRef.current) { // Cek lock ref juga
                setTabSwitchCount(prevCount => {
                    const newCount = prevCount + 1;
                    console.warn(`Tab switched away / minimized. Count: ${newCount}/${MAX_TAB_SWITCH_COUNT}`);
                    if (newCount >= MAX_TAB_SWITCH_COUNT) {
                        console.error("--- TRIGGERING CANCELLATION from handleVisibilityChange ---");
                        reportCancellationToBackend('tabswitch', `Tab switched or window minimized ${MAX_TAB_SWITCH_COUNT} time(s).`);
                        if (tabSwitchWarningTimeoutId.current) clearTimeout(tabSwitchWarningTimeoutId.current);
                        setShowTabSwitchWarning(false);
                    } else {
                        setShowTabSwitchWarning(true);
                         if (tabSwitchWarningTimeoutId.current) clearTimeout(tabSwitchWarningTimeoutId.current);
                        tabSwitchWarningTimeoutId.current = setTimeout(() => setShowTabSwitchWarning(false), TAB_SWITCH_WARNING_DURATION);
                    }
                     return newCount;
                });
            } else if (!document.hidden) {
                console.log("Tab became visible again.");
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (tabSwitchWarningTimeoutId.current) clearTimeout(tabSwitchWarningTimeoutId.current);
        };
    }, [isExamCancelled, isLoading, examDetails, reportCancellationToBackend]); // Tambahkan reportCancellationToBackend ke deps

    // --- Frame Capture and Analysis Effect ---
    const captureAndAnalyzeFrame = useCallback(async () => {
        if (isAnalyzingFrame || isExamCancelled || isCancellingRef.current || isLoading || !stream || !videoRef.current?.srcObject || !canvasRef.current || document.hidden) {
            return;
        }
        setIsAnalyzingFrame(true);
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (video.videoWidth === 0 || video.videoHeight === 0) {
                console.warn("Video dimensions not ready for frame capture."); setIsAnalyzingFrame(false); return;
            }
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameData = canvas.toDataURL('image/jpeg', 0.7);

            const response = await apiClient.post('/proctor/analyze_frame', { frameData });
            const { cheating_detected, reason, head_pose_score } = response.data;
            setProctoringScore(head_pose_score !== undefined && head_pose_score !== null ? head_pose_score : 0.0);

            if (cheating_detected) {
                console.warn("CV Cheating Flag received from backend:", reason, "Score:", head_pose_score);
                setCheatingWarningCount(prevCount => {
                    const newCount = prevCount + 1;
                    setCheatingWarningMsg(reason || 'Potential violation detected.');
                    setShowCheatingWarning(true);
                    if (cheatingWarningTimeoutId.current) clearTimeout(cheatingWarningTimeoutId.current);
                    cheatingWarningTimeoutId.current = setTimeout(() => setShowCheatingWarning(false), CHEAT_WARNING_DURATION);

                    if (newCount >= MAX_CHEAT_WARNINGS) {
                        console.error("--- TRIGGERING CANCELLATION from Cheating Warnings ---");
                        // Tidak perlu panggil reportCancellationToBackend di sini
                        // Cukup set state, backend akan tahu dari tidak adanya submit
                        setCancellationReason('cheating');
                        setIsExamCancelled(true); // <-- Langsung set cancel
                        isCancellingRef.current = true; // <-- Set lock juga
                        setShowCheatingWarning(false);
                        if (cheatingWarningTimeoutId.current) clearTimeout(cheatingWarningTimeoutId.current);
                        // Stop proctoring secara manual karena tidak lewat reportCancellationToBackend
                        if (frameAnalysisIntervalId.current) { clearInterval(frameAnalysisIntervalId.current); frameAnalysisIntervalId.current = null; }
                        stopCamera();
                    }
                    return newCount;
                });
            }
        } catch (err) {
            console.error("Error during frame capture/analysis:", err.response?.data?.message || err.message);
            setProctoringScore(0.0);
        } finally {
            setIsAnalyzingFrame(false);
        }
    }, [isAnalyzingFrame, isExamCancelled, isLoading, stream, setProctoringScore, setCheatingWarningCount, setCheatingWarningMsg, setShowCheatingWarning, setIsExamCancelled, stopCamera]); // Dependencies

    useEffect(() => {
        if (!isExamCancelled && !isLoading && examDetails && stream && videoRef.current?.srcObject) {
            console.log(`Starting frame analysis interval (${FRAME_ANALYSIS_INTERVAL}ms)`);
            if (frameAnalysisIntervalId.current) clearInterval(frameAnalysisIntervalId.current);
            frameAnalysisIntervalId.current = setInterval(captureAndAnalyzeFrame, FRAME_ANALYSIS_INTERVAL);
        } else {
             if (frameAnalysisIntervalId.current) {
                 console.log("Clearing frame analysis interval.");
                 clearInterval(frameAnalysisIntervalId.current); frameAnalysisIntervalId.current = null;
             }
        }
        return () => {
            if (frameAnalysisIntervalId.current) {
                console.log("Clearing frame analysis interval on unmount/dep change.");
                clearInterval(frameAnalysisIntervalId.current); frameAnalysisIntervalId.current = null;
            }
             if (cheatingWarningTimeoutId.current) { clearTimeout(cheatingWarningTimeoutId.current); }
        };
    }, [isExamCancelled, isLoading, examDetails, stream, videoRef.current?.srcObject, captureAndAnalyzeFrame]);

    // --- Event Handlers ---
    const handleAnswerChange = (event) => {
        if (isExamCancelled || isSubmitting) return;
        const questionId = examDetails.questions[currentQuestionIndex].id;
        setAnswers(prev => ({ ...prev, [String(questionId)]: event.target.value }));
        if (submissionError === "Please answer all questions before submitting.") { setSubmissionError(null); }
    };

    const goToNextQuestion = () => {
        if (isExamCancelled || isSubmitting) return;
        if (currentQuestionIndex < examDetails.questions.length - 1) { setCurrentQuestionIndex(prev => prev + 1); }
    };
    const goToPrevQuestion = () => {
        if (isExamCancelled || isSubmitting) return;
        if (currentQuestionIndex > 0) { setCurrentQuestionIndex(prev => prev - 1); }
    };
    const navigateToQuestion = (index) => {
        if (isExamCancelled || isSubmitting || index < 0 || index >= examDetails.questions.length) return;
        setCurrentQuestionIndex(index);
    };

    const handleToggleFlag = () => {
        if (isExamCancelled || isSubmitting || !examDetails) return;
        const questionId = examDetails.questions[currentQuestionIndex].id;
        setFlags(prev => ({ ...prev, [String(questionId)]: !prev[String(questionId)] }));
    };

    const checkAllQuestionsAnswered = useCallback(() => {
        if (!examDetails || !examDetails.questions || examDetails.questions.length === 0) return false;
        return examDetails.questions.every(q => {
            const qId = String(q.id);
            return answers[qId] !== null && answers[qId] !== undefined && String(answers[qId]).trim() !== '';
        });
    }, [examDetails, answers]);

    const handleSubmitClick = () => {
         if (isExamCancelled || isSubmitting) return;
         setSubmissionError(null);
         if (!checkAllQuestionsAnswered()) {
             setSubmissionError("Please answer all questions before submitting.");
             console.warn("Submit attempt failed: Not all questions answered.");
             return;
         }
         setShowSubmitConfirm(true);
     };

    const handleConfirmSubmit = async (bypassAnswerCheck = false) => {
        if (isExamCancelled || isSubmitting) return;
        if (!bypassAnswerCheck && !checkAllQuestionsAnswered()) {
            setSubmissionError("Please answer all questions before submitting."); setShowSubmitConfirm(false);
            console.warn("Confirm submit aborted: Not all questions answered."); return;
        }
        setShowSubmitConfirm(false); setIsSubmitting(true); setSubmissionError(null);

        // Stop proctoring processes before submitting
        isCancellingRef.current = true; // Lock juga saat submit
        if (frameAnalysisIntervalId.current) { clearInterval(frameAnalysisIntervalId.current); frameAnalysisIntervalId.current = null; }
        stopCamera();

        const answersPayload = {};
        for (const qId in answers){
            if (answers[qId] !== null && answers[qId] !== undefined) { answersPayload[String(qId)] = answers[qId]; }
        }
        console.log("Submitting answers payload:", answersPayload);

        try {
             const response = await apiClient.post(`/student/exams/${examId}/submit`, { answers: answersPayload });
             console.log("Submission successful:", response.data);
             const submissionResult = response.data || {};
             const submissionDataForPage = {
                 examName: examDetails?.name || "Exam",
                 quizName: examDetails?.name || `Exam ${examId}`,
                 status: "Finished",
                 submittedAt: new Date().toISOString(),
                 correctAnswers: submissionResult.correctAnswers ?? 0,
                 totalQuestions: examDetails?.questions?.length ?? 0,
                 attemptsAllowed: examDetails?.attemptsAllowed || 1,
                 courseId: examDetails?.courseId || 'unknown-course',
                 reviewUrl: submissionResult.reviewUrl || null
             };
             navigate(`/student/exam/${examId}/submitted`, { state: { submissionData: submissionDataForPage }, replace: true });
        } catch (err) {
            console.error("Error submitting exam:", err);
            const errorMessage = err.response?.data?.message || err.message || "Failed to submit exam.";
            setSubmissionError(errorMessage);
            setIsSubmitting(false);
            isCancellingRef.current = false; // Buka lock jika submit gagal
            // Decide if restart camera needed
        }
    };

    // --- Render Logic ---
    if (isLoading) { /* ... Loading UI ... */
        return ( <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 2 }}> <CircularProgress size={60} /> <Typography>Loading Exam...</Typography> </Box> );
    }
    if (error) { /* ... Error UI ... */
        return ( <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}> <Alert severity="error" sx={{ mb: 2 }}> Error loading exam: {error} </Alert> <Button variant="outlined" onClick={() => navigate('/student/dashboard')}>Go to Dashboard</Button> </Box> );
    }
    if (!examDetails || !examDetails.questions || examDetails.questions.length === 0) { /* ... Invalid Data UI ... */
        return ( <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}> <Alert severity="warning" sx={{ mb: 2 }}> Exam data is invalid or contains no questions. </Alert> <Button variant="outlined" onClick={() => navigate('/student/dashboard')}>Go to Dashboard</Button> </Box> );
    }

    // Exam Cancelled/Ended State (Tampilan setelah cancel)
    if (isExamCancelled) {
         let cancelMessage = "This exam session has ended unexpectedly.";
         let icon = <WarningAmberIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />;
         switch (cancellationReason) {
            case 'time': cancelMessage = "The time limit for this exam has been reached."; break;
            case 'leave': cancelMessage = `This exam session has been cancelled because the cursor left the designated testing area ${MAX_LEAVE_COUNT} time(s).`; break;
            case 'tabswitch': cancelMessage = `This exam session has been cancelled because you switched tabs or minimized the window ${MAX_TAB_SWITCH_COUNT} time(s).`; break;
            case 'cheating': cancelMessage = `This exam session has been cancelled due to proctoring violations. (Last Warning: ${cheatingWarningMsg || 'Multiple warnings'})`; icon = <FaceRetouchingOffIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />; break;
         }
         return (
             <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', p: 3, textAlign: 'center' }}>
                 {icon}
                 <Typography variant="h4" color="error" gutterBottom>Exam Ended / Cancelled</Typography>
                 <Typography variant="body1" sx={{mb: 1}}>{cancelMessage}</Typography>
                 <Typography variant="body2" color="text.secondary" sx={{mb: 3}}>Please contact your instructor or administrator if you believe this was in error.</Typography>
                 <Button variant="contained" onClick={() => navigate('/student/dashboard')}>Return to Dashboard</Button>
             </Box>
         );
    }

    // --- Normal Exam Taking Render (Main UI) ---
    const currentQuestion = examDetails.questions[currentQuestionIndex];
    const totalQuestions = examDetails.questions.length;
    const progress = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;
    const currentQuestionId = String(currentQuestion.id);

    let cheatingIcon = <FaceRetouchingOffIcon fontSize="inherit" />;
    if (cheatingWarningMsg.toLowerCase().includes('multiple') || cheatingWarningMsg.toLowerCase().includes('faces')) { cheatingIcon = <GroupsIcon fontSize="inherit" />; }
    else if (cheatingWarningMsg.toLowerCase().includes('no face') || cheatingWarningMsg.toLowerCase().includes('not visible')) { cheatingIcon = <VideocamOffIcon fontSize="inherit"/>; }

    const allQuestionsAnswered = checkAllQuestionsAnswered();

    const getNumberButtonStyle = (index) => {
        const qId = String(examDetails.questions[index].id);
        const isCurrent = index === currentQuestionIndex;
        const isFlagged = flags[qId];
        const isAnswered = answers[qId] !== null && answers[qId] !== undefined && String(answers[qId]).trim() !== '';
        let style = { minWidth: 36, height: 36, margin: '4px', padding: '0', fontSize: '0.875rem', border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: 'none', '&:hover': { backgroundColor: theme.palette.action.hover, border: `1px solid ${theme.palette.grey[500]}`, } };
        if (isFlagged) { style.backgroundColor = theme.palette.warning.light; style.color = theme.palette.warning.contrastText; style.border = `1px solid ${theme.palette.warning.main}`; style['&:hover'] = { backgroundColor: theme.palette.warning.main, border: `1px solid ${theme.palette.warning.dark}`, }; }
        else if (isAnswered) { style.backgroundColor = theme.palette.info.light; style.color = theme.palette.info.contrastText; style.border = `1px solid ${theme.palette.info.main}`; style['&:hover'] = { backgroundColor: theme.palette.info.main, border: `1px solid ${theme.palette.info.dark}`, }; }
        if (isCurrent) { style.border = `2px solid ${theme.palette.primary.main}`; style.fontWeight = 'bold'; }
        return style;
    };

    const LegendItem = ({ color, icon, label, isBorder = false }) => ( /* ... Legend Item Component ... */
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}> {icon ? ( React.cloneElement(icon, { sx: { color: isBorder ? theme.palette.primary.main : color || 'inherit', fontSize: 18, mr: 1 } }) ) : ( <Box sx={{ width: 16, height: 16, bgcolor: color, mr: 1, border: isBorder ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`, boxSizing: 'border-box' }} /> )} <Typography variant="caption">{label}</Typography> </Box>
    );

    // --- Main JSX structure ---
    return (
         <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
             {/* Left Panel */}
             <Paper elevation={2} sx={{ width: 200, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: `1px solid ${theme.palette.divider}`, flexShrink: 0, overflowY: 'auto', gap: 1.5, bgcolor: 'background.paper' }}>
                 <Typography variant="subtitle2" sx={{fontWeight: 'bold', mb: -1, color: 'text.secondary'}}>Monitor</Typography>
                 <Box sx={{ width: 160, height: 120, bgcolor: 'grey.300', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: cameraError ? `2px solid ${theme.palette.error.main}` : 'none', borderRadius: 1 }}>
                     <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none', transform: 'scaleX(-1)' }} />
                     {!stream && !cameraError && !isExamCancelled && <CircularProgress size={24} titleAccess="Starting camera..."/>}
                     {(cameraError || (!stream && isExamCancelled)) && <VideocamOffIcon color={cameraError ? "error" : "disabled"} sx={{ fontSize: 40 }} titleAccess={cameraError ? cameraError : "Camera off"} />}
                 </Box>
                 {cameraError && !isExamCancelled && <Alert severity="warning" sx={{ fontSize: '0.75rem', width: '100%', p: '2px 8px', mt: 0.5 }}>{cameraError}</Alert>}
                 <Divider sx={{ width: '90%', my: 1 }}/>
                 <Typography variant="subtitle2" sx={{fontWeight: 'bold', mb: -1, color: 'text.secondary' }}>Time Left</Typography>
                 <Typography variant="h4" sx={{ fontWeight: 'bold', color: timeLeft < 60 ? 'error.main' : 'primary.main', mt: 0.5 }}>{formatTime(timeLeft ?? 0)}</Typography>
                 <Divider sx={{ width: '90%', my: 1 }}/>
                 <Typography variant="subtitle2" sx={{fontWeight: 'bold', mb: 0, color: 'text.secondary' }}>Proctoring Status</Typography>
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}> <Typography variant="caption" color="text.secondary">Window Leave:</Typography> <Typography variant="caption" sx={{ color: leaveCount >= MAX_LEAVE_COUNT - 1 ? 'error.main' : 'text.primary', fontWeight: leaveCount > 0 ? 'bold' : 'normal' }}>{leaveCount} / {MAX_LEAVE_COUNT}</Typography> </Box>
                 {showLeaveWarning && <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit"/>} sx={{fontSize: '0.75rem', width: '100%', mt: 0.5, p: '2px 8px'}}>Cursor left window!</Alert>}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}> <Typography variant="caption" color="text.secondary">Tab Switch:</Typography> <Typography variant="caption" sx={{ color: tabSwitchCount >= MAX_TAB_SWITCH_COUNT - 1 ? 'error.main' : 'text.primary', fontWeight: tabSwitchCount > 0 ? 'bold' : 'normal' }}>{tabSwitchCount} / {MAX_TAB_SWITCH_COUNT}</Typography> </Box>
                 {showTabSwitchWarning && <Alert severity="warning" icon={<VisibilityOffIcon fontSize="inherit"/>} sx={{fontSize: '0.75rem', width: '100%', mt: 0.5, p: '2px 8px'}}>Switched away from tab!</Alert>}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}> <Typography variant="caption" color="text.secondary">CV Warnings:</Typography> <Typography variant="caption" sx={{ color: cheatingWarningCount >= MAX_CHEAT_WARNINGS - 1 ? 'error.main' : 'text.primary', fontWeight: cheatingWarningCount > 0 ? 'bold' : 'normal' }}>{cheatingWarningCount} / {MAX_CHEAT_WARNINGS}</Typography> </Box>
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.2 }}> <Tooltip title="Computer Vision suspicion score based on head pose, etc. Higher indicates potential issues."> <Typography variant="caption" color="text.secondary" sx={{textDecoration: 'underline dotted'}}>Suspicion Score:</Typography> </Tooltip> <Typography variant="caption" sx={{ color: proctoringScore >= HEAD_POSE_SCORE_THRESHOLD ? 'warning.dark' : 'text.secondary', fontWeight: proctoringScore >= HEAD_POSE_SCORE_THRESHOLD ? 'bold' : 'normal' }}> {proctoringScore.toFixed(2)} </Typography> </Box>
                 {showCheatingWarning && <Alert severity="error" icon={cheatingIcon} sx={{fontSize: '0.75rem', width: '100%', mt: 0.5, p: '2px 8px'}}>{cheatingWarningMsg}</Alert>}
                 {isAnalyzingFrame && <CircularProgress size={14} sx={{ mt: 1 }} titleAccess="Analyzing frame..."/>}
             </Paper>
             {/* Center Panel */}
             <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', overflowY: 'auto', borderRight: `1px solid ${theme.palette.divider}` }}>
                 <Typography variant="h5" component="h1" gutterBottom sx={{textAlign: 'center', mb: 1, fontWeight: 'medium'}}>{examDetails.name}</Typography>
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}> <Box sx={{ width: '100%', mr: 2 }}> <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} /> </Box> <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: 'medium' }}> Q {currentQuestionIndex + 1} / {totalQuestions} </Typography> </Box>
                 <Paper elevation={0} sx={{ flexGrow: 1, mb: 2, p: {xs: 1.5, sm: 2, md: 3}, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, overflowY: 'auto', bgcolor: 'background.paper' }}>
                     <Typography variant="h6" component="div" sx={{ mb: 2.5, fontWeight: 500, lineHeight: 1.4 }}> <Typography component="span" variant="body1" color="text.secondary" sx={{ mr: 1 }}>{currentQuestionIndex + 1}.</Typography> {currentQuestion.text} </Typography>
                     <FormControl component="fieldset" sx={{width: '100%'}}>
                        <RadioGroup aria-label={`Question ${currentQuestionIndex + 1} options`} name={`question-${currentQuestion.id}`} value={answers[currentQuestionId] || ''} onChange={handleAnswerChange} >
                            {currentQuestion.options.map((option, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, '&:hover': { bgcolor: isSubmitting || isExamCancelled ? 'inherit' : 'action.hover' }, cursor: isSubmitting || isExamCancelled ? 'default' : 'pointer', display: 'flex', borderRadius: 2, borderColor: answers[currentQuestionId] === option ? theme.palette.primary.main : theme.palette.divider, borderWidth: answers[currentQuestionId] === option ? '1px' : '1px', boxShadow: answers[currentQuestionId] === option ? '0 0 0 1px ' + theme.palette.primary.light : 'none', transition: 'border-color 0.2s ease, box-shadow 0.2s ease', }} onClick={() => !isSubmitting && !isExamCancelled && handleAnswerChange({ target: { value: option } })} >
                                    <FormControlLabel value={option} control={<Radio disabled={isSubmitting || isExamCancelled} sx={{ py: 0 }} />} label={<Typography variant="body1">{option}</Typography>} sx={{ width: '100%', m: 0 }} onClick={(e) => e.stopPropagation()} />
                                </Paper>
                            ))}
                        </RadioGroup>
                     </FormControl>
                 </Paper>
                 {submissionError && ( <Alert severity={submissionError === "Please answer all questions before submitting." ? "warning" : "error"} icon={submissionError === "Please answer all questions before submitting." ? <ErrorOutlineIcon fontSize="inherit"/> : undefined} sx={{ mb: 2 }} onClose={submissionError !== "Please answer all questions before submitting." ? () => setSubmissionError(null) : undefined} > {submissionError} </Alert> )}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 'auto', pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                     <Button variant="outlined" onClick={goToPrevQuestion} disabled={currentQuestionIndex === 0 || isSubmitting || isExamCancelled}>Previous</Button>
                     <Button variant="contained" onClick={goToNextQuestion} disabled={currentQuestionIndex === totalQuestions - 1 || isSubmitting || isExamCancelled}>Next</Button>
                 </Box>
             </Box>
            {/* Right Panel */}
            <Paper elevation={2} sx={{ width: 240, p: 2, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', gap: 1.5, bgcolor: 'background.paper' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', textAlign: 'center', mb: 1 }}>Question Palette</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', maxHeight: 'calc(100vh - 400px)', overflowY: 'auto', mb: 1, border: `1px solid ${theme.palette.divider}`, p: 1, borderRadius: 1, alignContent: 'flex-start' }}>
                    {examDetails.questions.map((q, index) => ( <Tooltip key={q.id} title={`Go to Question ${index + 1}`}> <Button variant="contained" onClick={() => navigateToQuestion(index)} disabled={isSubmitting || isExamCancelled} sx={getNumberButtonStyle(index)} > {index + 1} </Button> </Tooltip> ))}
                </Box>
                 <Button variant="outlined" fullWidth startIcon={flags[currentQuestionId] ? <FlagIcon /> : <FlagOutlinedIcon />} onClick={handleToggleFlag} color={flags[currentQuestionId] ? "warning" : "inherit"} disabled={isSubmitting || isExamCancelled} sx={{ textTransform: 'none', justifyContent: 'flex-start', pl: 2 }} > {flags[currentQuestionId] ? 'Unflag Question' : 'Flag for Review'} </Button>
                 <Divider sx={{ width: '100%', my: 1 }} />
                 <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Legend</Typography>
                 <Box sx={{mb: 1}}>
                    <LegendItem color={theme.palette.info.light} label="Answered" />
                    <LegendItem color={theme.palette.warning.light} label="Flagged for Review" />
                    <LegendItem color={theme.palette.background.paper} label="Not Attempted" />
                    <LegendItem label="Current Question" isBorder={true} />
                 </Box>
                <Divider sx={{ width: '100%', my: 1 }} />
                 <Tooltip title={!allQuestionsAnswered ? "Please answer all questions first" : (isSubmitting ? "" : "Finish and submit your answers")} arrow>
                    <span style={{ display: 'block', marginTop: 'auto' }}>
                        <Button variant="contained" color="success" fullWidth onClick={handleSubmitClick} disabled={isSubmitting || isExamCancelled || !allQuestionsAnswered} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit"/> : null} sx={{ py: 1.2 }} > {isSubmitting ? 'Submitting...' : 'Finish & Submit'} </Button>
                    </span>
                 </Tooltip>
            </Paper>
             {/* Submission Confirmation Dialog */}
             <Dialog open={showSubmitConfirm} onClose={() => !isSubmitting && setShowSubmitConfirm(false)} aria-labelledby="confirm-submit-dialog-title" aria-describedby="confirm-submit-dialog-description" >
                <DialogTitle id="confirm-submit-dialog-title">Confirm Submission</DialogTitle>
                <DialogContent> <DialogContentText id="confirm-submit-dialog-description"> Are you sure you want to finish and submit your exam? You cannot make changes after submitting. </DialogContentText> </DialogContent>
                <DialogActions sx={{ p: 2 }}> <Button onClick={() => setShowSubmitConfirm(false)} disabled={isSubmitting} color="inherit">Cancel</Button> <Button onClick={() => handleConfirmSubmit(false)} variant="contained" color="success" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit"/> : null} autoFocus > {isSubmitting ? 'Submitting...' : 'Confirm Submit'} </Button> </DialogActions>
            </Dialog>
        </Box>
    );
}

export default ExamTakingInterface;