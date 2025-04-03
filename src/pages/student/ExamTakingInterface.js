// src/pages/student/ExamTakingInterface.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, RadioGroup, FormControlLabel, Radio,
    CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, LinearProgress, useTheme, Divider, FormControl
} from '@mui/material';
// Import necessary icons
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'; // Icon for tab switch warning
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FaceRetouchingOffIcon from '@mui/icons-material/FaceRetouchingOff'; // Icon for no face / cheating
import GroupsIcon from '@mui/icons-material/Groups'; // Icon for multiple faces
// Import API client
import apiClient from '../../api';


/**
 * Helper function to format remaining time in seconds into MM:SS format.
 * @param {number} totalSeconds - Total seconds remaining.
 * @returns {string} - Formatted time string (e.g., "05:30").
 */
const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};


// --- Configuration ---
const MAX_LEAVE_COUNT = 3; // Max times student can move cursor out before cancellation
const LEAVE_WARNING_DURATION = 4000; // How long to show the mouse leave warning (in milliseconds)
const MAX_TAB_SWITCH_COUNT = 3; // Max times student can switch tabs before cancellation
const TAB_SWITCH_WARNING_DURATION = 4000; // How long to show the tab switch warning (in milliseconds)

// --- Proctoring Configuration ---
const FRAME_ANALYSIS_INTERVAL = 4000; // Analyze frame every 4 seconds (adjust as needed)
const MAX_CHEAT_WARNINGS = 3; // Cancel exam after this many cheating flags from backend
const CHEAT_WARNING_DURATION = 5000; // How long to show the cheating warning
const HEAD_POSE_SCORE_THRESHOLD = 0.65; // Match backend threshold for display purposes


// --- ExamTakingInterface Component ---
function ExamTakingInterface() {
    const { examId } = useParams(); // Get exam ID from URL
    const navigate = useNavigate(); // Hook for navigation
    const theme = useTheme(); // Access theme for styling

    // --- Component State ---
    // Exam Data and Progress
    const [examDetails, setExamDetails] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(null);

    // UI / Interaction State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submissionError, setSubmissionError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

    // Camera State
    const [stream, setStream] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const videoRef = useRef(null); // Ref for the <video> element

    // Proctoring State (Existing)
    const [leaveCount, setLeaveCount] = useState(0);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const leaveWarningTimeoutId = useRef(null);

    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
    const tabSwitchWarningTimeoutId = useRef(null);

    // Proctoring State (CV Cheating Detection)
    const canvasRef = useRef(null); // Ref for hidden canvas used for frame capture
    const frameAnalysisIntervalId = useRef(null); // Ref for the interval timer
    const [isAnalyzingFrame, setIsAnalyzingFrame] = useState(false); // Prevent concurrent analyses
    const [cheatingWarningCount, setCheatingWarningCount] = useState(0); // Counts flags from backend
    const [showCheatingWarning, setShowCheatingWarning] = useState(false); // Flag to show UI warning
    const [cheatingWarningMsg, setCheatingWarningMsg] = useState(''); // Message for the warning
    const cheatingWarningTimeoutId = useRef(null); // Timeout for hiding the warning
    const [proctoringScore, setProctoringScore] = useState(0.0); // Store proctoring score from backend

    // Exam Cancellation State
    const [isExamCancelled, setIsExamCancelled] = useState(false);
    const [cancellationReason, setCancellationReason] = useState(''); // 'time', 'leave', 'tabswitch', 'cheating'


    // --- Effects ---

    // Fetch Exam Data on Mount
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        apiClient.get(`/student/exams/${examId}/take`)
            .then(response => {
                const data = response.data;
                if (!data || !data.questions || data.questions.length === 0) {
                    throw new Error("Exam data is invalid or contains no questions.");
                }
                setExamDetails(data);
                setTimeLeft(data.duration ? data.duration * 60 : 3600);
                const initialAnswers = {};
                data.questions.forEach(q => { initialAnswers[String(q.id)] = null; });
                setAnswers(initialAnswers);
                // Reset proctoring counts on load
                setLeaveCount(0);
                setTabSwitchCount(0);
                setCheatingWarningCount(0);
                setProctoringScore(0.0); // Reset score
            })
            .catch(err => {
                console.error("Error fetching exam details:", err);
                setError(err.response?.data?.message || err.message || "Failed to load exam.");
            })
            .finally(() => setIsLoading(false));
    }, [examId]); // Dependency: examId

    // --- Camera Logic ---
    const startCamera = useCallback(async () => {
        if (stream) return;
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
            }
        } catch (err) {
            console.error("Camera Error:", err);
            let message = `Error accessing camera: ${err.name || 'Unknown Error'}`;
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") message = "Camera access denied by user.";
            else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") message = "No camera device found.";
            setCameraError(message);
            setStream(null);
        }
    }, [stream]);

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

    // Effect to manage camera lifecycle
    useEffect(() => {
        if (!isExamCancelled) {
             startCamera();
        }
        return () => stopCamera();
    }, [startCamera, stopCamera, isExamCancelled]);


    // Timer Countdown Effect
    useEffect(() => {
        if (isExamCancelled || timeLeft === null || timeLeft <= 0 || !examDetails) return;

        const timerId = setInterval(() => {
            setTimeLeft(prevTime => {
                const newTime = prevTime - 1;
                if (newTime <= 0) {
                    clearInterval(timerId);
                    console.log("Time's up!");
                    setCancellationReason('time');
                    setIsExamCancelled(true);
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [timeLeft, isExamCancelled, examDetails]);

    // Mouse Leave Detection Effect
    useEffect(() => {
        if (isExamCancelled || !examDetails) return;

        const handleMouseLeave = (event) => {
             if (!isExamCancelled && !event.relatedTarget && (event.clientY <= 0 || event.clientX <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) {
                 setLeaveCount(prevCount => {
                    const newCount = prevCount + 1;
                    console.log(`Mouse left window. Count: ${newCount}`);
                    if (newCount >= MAX_LEAVE_COUNT) {
                        console.warn("--- EXAM CANCELLED due to exceeding leave count! ---");
                        setCancellationReason('leave');
                        setIsExamCancelled(true);
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
    }, [isExamCancelled, examDetails]);

    // Tab Switch / Visibility Change Detection Effect
    useEffect(() => {
        if (isExamCancelled || !examDetails) return;

        const handleVisibilityChange = () => {
            if (document.hidden && !isExamCancelled) {
                setTabSwitchCount(prevCount => {
                    const newCount = prevCount + 1;
                    console.log(`Tab switched away / minimized. Count: ${newCount}`);
                    if (newCount >= MAX_TAB_SWITCH_COUNT) {
                        console.warn("--- EXAM CANCELLED due to exceeding tab switch count! ---");
                        setCancellationReason('tabswitch');
                        setIsExamCancelled(true);
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
    }, [isExamCancelled, examDetails]);

    // --- Frame Capture and Analysis Effect ---
    const captureAndAnalyzeFrame = useCallback(async () => {
        if (isAnalyzingFrame || isExamCancelled || isLoading || !stream || !videoRef.current || !canvasRef.current) {
            return;
        }

        setIsAnalyzingFrame(true);

        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            canvas.width = video.videoWidth || 160;
            canvas.height = video.videoHeight || 120;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameData = canvas.toDataURL('image/jpeg', 0.7);

            // Send frame to backend
            const response = await apiClient.post('/proctor/analyze_frame', { frameData });
            const { cheating_detected, reason, head_pose_score } = response.data;

            // Update score state (for display)
            setProctoringScore(head_pose_score !== undefined ? head_pose_score : 0.0);

            if (cheating_detected) {
                console.warn("Cheating Flag received from backend:", reason);
                setCheatingWarningCount(prevCount => {
                    const newCount = prevCount + 1;
                    // Use the detailed reason from the backend directly
                    setCheatingWarningMsg(reason || 'Potential violation detected.');
                    setShowCheatingWarning(true);

                    if (cheatingWarningTimeoutId.current) clearTimeout(cheatingWarningTimeoutId.current);
                    cheatingWarningTimeoutId.current = setTimeout(() => setShowCheatingWarning(false), CHEAT_WARNING_DURATION);

                    if (newCount >= MAX_CHEAT_WARNINGS) {
                        console.error("--- EXAM CANCELLED due to exceeding cheat warning count! ---");
                        setCancellationReason('cheating');
                        setIsExamCancelled(true);
                        setShowCheatingWarning(false); // Hide warning immediately on final cancellation
                        if (cheatingWarningTimeoutId.current) clearTimeout(cheatingWarningTimeoutId.current);
                    }
                    return newCount;
                });
            } else {
                // Optionally hide warning if backend says OK
                // setShowCheatingWarning(false);
                // if (cheatingWarningTimeoutId.current) clearTimeout(cheatingWarningTimeoutId.current);
            }

        } catch (err) {
            console.error("Error during frame capture/analysis:", err.response?.data?.message || err.message);
            setProctoringScore(0.0); // Reset score on error
        } finally {
            setIsAnalyzingFrame(false);
        }
    // Dependencies include state setters and external variables used
    }, [isAnalyzingFrame, isExamCancelled, isLoading, stream, apiClient, setCheatingWarningCount, setIsExamCancelled, setProctoringScore]);

    // Effect to run frame analysis periodically
    useEffect(() => {
        if (!isExamCancelled && !isLoading && examDetails && stream) {
            console.log(`Starting frame analysis interval (${FRAME_ANALYSIS_INTERVAL}ms)`);
            if (frameAnalysisIntervalId.current) clearInterval(frameAnalysisIntervalId.current);
            frameAnalysisIntervalId.current = setInterval(captureAndAnalyzeFrame, FRAME_ANALYSIS_INTERVAL);
        } else {
             if (frameAnalysisIntervalId.current) {
                 console.log("Clearing frame analysis interval.");
                 clearInterval(frameAnalysisIntervalId.current);
                 frameAnalysisIntervalId.current = null;
             }
        }

        return () => {
            if (frameAnalysisIntervalId.current) {
                console.log("Clearing frame analysis interval on unmount/dep change.");
                clearInterval(frameAnalysisIntervalId.current);
                frameAnalysisIntervalId.current = null;
            }
        };
    }, [isExamCancelled, isLoading, examDetails, stream, captureAndAnalyzeFrame]);


    // --- Event Handlers ---
    const handleAnswerChange = (event) => {
        if (isExamCancelled || isSubmitting) return;
        const questionId = examDetails.questions[currentQuestionIndex].id;
        setAnswers(prev => ({ ...prev, [String(questionId)]: event.target.value }));
    };
    const handleNextQuestion = () => {
        if (isExamCancelled || isSubmitting) return;
        if (currentQuestionIndex < examDetails.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };
    const handlePrevQuestion = () => {
        if (isExamCancelled || isSubmitting) return;
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };
    const handleSubmitClick = () => {
         if (isExamCancelled || isSubmitting) return;
         setSubmissionError(null);
         setShowSubmitConfirm(true);
     };
    const handleConfirmSubmit = async () => {
        if (isExamCancelled || isSubmitting) return;
        setShowSubmitConfirm(false);
        setIsSubmitting(true);
        setSubmissionError(null);

        const answersPayload = {};
        for (const qId in answers){ answersPayload[String(qId)] = answers[qId]; }
        console.log("Submitting answers:", answersPayload);

        try {
             const response = await apiClient.post(`/student/exams/${examId}/submit`, { answers: answersPayload });
             console.log("Submission response:", response.data);
             // Clear analysis interval explicitly before navigating
             if (frameAnalysisIntervalId.current) clearInterval(frameAnalysisIntervalId.current);
             alert(response.data?.message || "Exam submitted successfully!");
             navigate('/student/dashboard');
        } catch (err) {
            console.error("Error submitting exam:", err);
            setSubmissionError(err.response?.data?.message || err.message || "Failed to submit exam.");
             setIsSubmitting(false);
        }
    };


    // --- Render Logic ---

    // 1. Loading State
    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress size={60} /><Typography sx={{ml: 2}}>Loading Exam...</Typography></Box>;
    }

    // 2. Fetch Error State
    if (error) {
        return <Box sx={{p: 3}}><Alert severity="error">Error loading exam: {error} <Button onClick={() => navigate('/student/exams')}>Go Back</Button></Alert></Box>;
    }

    // 3. Invalid Exam Data State
    if (!examDetails || !examDetails.questions || examDetails.questions.length === 0) {
        return <Box sx={{p: 3}}><Alert severity="warning">Exam data is invalid or contains no questions. <Button onClick={() => navigate('/student/exams')}>Go Back</Button></Alert></Box>;
    }

    // 4. Exam Cancelled/Ended State
    if (isExamCancelled) {
         let cancelMessage = "This exam session has ended.";
         let icon = <WarningAmberIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />;

         if (cancellationReason === 'time') {
             cancelMessage = "The time limit for this exam has been reached.";
         } else if (cancellationReason === 'leave') {
             cancelMessage = `This exam session has been cancelled because the cursor left the designated testing area ${MAX_LEAVE_COUNT} time(s).`;
         } else if (cancellationReason === 'tabswitch') {
             cancelMessage = `This exam session has been cancelled because you switched tabs or minimized the window ${MAX_TAB_SWITCH_COUNT} time(s).`;
         } else if (cancellationReason === 'cheating') {
             // Use the last cheating warning message for context, or a generic message.
             cancelMessage = `This exam session has been cancelled due to proctoring violations. (Last warning: ${cheatingWarningMsg || 'N/A'})`;
             // Or more generic:
             // cancelMessage = `This exam session has been cancelled due to proctoring violations (Warnings: ${cheatingWarningCount}/${MAX_CHEAT_WARNINGS}).`;
             icon = <FaceRetouchingOffIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />; // Specific icon for cheating/proctoring cancellation
         }

         return (
             <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', p: 3, textAlign: 'center' }}>
                 {icon}
                 <Typography variant="h4" color="error" gutterBottom>Exam Ended / Cancelled</Typography>
                 <Typography variant="body1" sx={{mb: 1}}>
                      {cancelMessage}
                 </Typography>
                 <Typography variant="body2" color="text.secondary">
                     Please contact your administrator or instructor if you have questions.
                 </Typography>
                  <Button variant="contained" sx={{ mt: 4 }} onClick={() => navigate('/student/dashboard')}>
                     Return to Dashboard
                  </Button>
             </Box>
         );
    }

    // 5. Normal Exam Taking Render
    const currentQuestion = examDetails.questions[currentQuestionIndex];
    const totalQuestions = examDetails.questions.length;
    const progress = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

    // Determine icon for cheating warning dynamically based on message content
    let cheatingIcon = <FaceRetouchingOffIcon fontSize="inherit" />; // Default to general face issue
    if (cheatingWarningMsg.toLowerCase().includes('multiple faces')) {
        cheatingIcon = <GroupsIcon fontSize="inherit" />;
    } else if (cheatingWarningMsg.toLowerCase().includes('no face')) {
        cheatingIcon = <VideocamOffIcon fontSize="inherit"/>; // Or keep FaceRetouchingOffIcon
    }


    return (
        // Main Flex Container
         <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

            {/* Hidden Canvas for Frame Capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

             {/* Left Panel (Camera, Timer, Proctoring Info) */}
             <Paper elevation={3} sx={{ width: 200, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: `1px solid ${theme.palette.divider}`, flexShrink: 0, overflowY: 'auto', gap: 1.5 }}>
                 <Typography variant="subtitle1" sx={{fontWeight: 'bold', mb: -1}}>Monitor</Typography>
                 {/* Camera Video Element */}
                 <Box sx={{ width: 160, height: 120, bgcolor: 'grey.300', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', border: cameraError ? `2px solid ${theme.palette.error.main}` : 'none', borderRadius: 1 }}>
                     <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }} />
                     {!stream && !cameraError && !isExamCancelled && <CircularProgress size={24}/>}
                     {(cameraError || isExamCancelled) && <VideocamOffIcon color={cameraError ? "error" : "inherit"} sx={{ fontSize: 40, opacity: isExamCancelled ? 0.5 : 1 }}/>}
                 </Box>
                 {/* Camera Error Message */}
                 {cameraError && !isExamCancelled && <Alert severity="warning" sx={{ fontSize: '0.75rem', width: '100%', p: '2px 8px' }}>{cameraError}</Alert>}

                 <Divider sx={{ width: '100%' }}/>
                 {/* Timer */}
                 <Typography variant="subtitle1" sx={{fontWeight: 'bold', mb: -1 }}>Time Left</Typography>
                 <Typography variant="h4" sx={{ fontWeight: 'bold', color: timeLeft < 60 ? 'error.main' : 'primary.main' }}>{formatTime(timeLeft ?? 0)}</Typography>

                 {/* Proctoring Section */}
                 <Divider sx={{ width: '100%' }}/>
                 <Typography variant="subtitle1" sx={{fontWeight: 'bold', mb: 0 }}>Proctoring Status</Typography>

                 {/* Leave Count */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Window Leave:</Typography>
                    <Typography variant="body2" sx={{ color: leaveCount >= MAX_LEAVE_COUNT - 1 ? 'error.main' : 'inherit' }}>{leaveCount} / {MAX_LEAVE_COUNT}</Typography>
                 </Box>
                 {showLeaveWarning && <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit"/>} sx={{fontSize: '0.8rem', width: '100%', mt: 0.5, p: '2px 8px'}}>Cursor left window!</Alert>}

                 {/* Tab Switch Count */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Tab Switch:</Typography>
                    <Typography variant="body2" sx={{ color: tabSwitchCount >= MAX_TAB_SWITCH_COUNT - 1 ? 'error.main' : 'inherit' }}>{tabSwitchCount} / {MAX_TAB_SWITCH_COUNT}</Typography>
                 </Box>
                 {showTabSwitchWarning && <Alert severity="warning" icon={<VisibilityOffIcon fontSize="inherit"/>} sx={{fontSize: '0.8rem', width: '100%', mt: 0.5, p: '2px 8px'}}>Switched away from tab!</Alert>}

                 {/* CV Cheating Warnings */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">CV Warnings:</Typography>
                    <Typography variant="body2" sx={{ color: cheatingWarningCount >= MAX_CHEAT_WARNINGS - 1 ? 'error.main' : 'inherit' }}>{cheatingWarningCount} / {MAX_CHEAT_WARNINGS}</Typography>
                 </Box>
                 {/* Optional: Display Proctoring Score */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mt: 0.2 }}>
                    <Typography variant="caption" color="text.secondary">Suspicion Score:</Typography>
                    <Typography variant="caption" sx={{ color: proctoringScore >= HEAD_POSE_SCORE_THRESHOLD ? 'warning.dark' : 'text.secondary', fontWeight: proctoringScore >= HEAD_POSE_SCORE_THRESHOLD ? 'bold' : 'normal' }}>
                        {proctoringScore.toFixed(2)}
                    </Typography>
                 </Box>

                 {/* Cheating Warning Alert - uses backend reason */}
                 {showCheatingWarning && <Alert severity="error" icon={cheatingIcon} sx={{fontSize: '0.8rem', width: '100%', mt: 0.5, p: '2px 8px'}}>{cheatingWarningMsg}</Alert>}
                 {isAnalyzingFrame && <CircularProgress size={14} sx={{ mt: 0.5 }}/>} {/* Indicator */}


             </Paper>

             {/* Right Panel (Exam Content) */}
             <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                 {/* Exam Title */}
                 <Typography variant="h5" component="h1" gutterBottom sx={{textAlign: 'center', mb: 1}}>{examDetails.name}</Typography>
                 {/* Progress Bar and Question Count */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                     <Box sx={{ width: '100%', mr: 2 }}><LinearProgress variant="determinate" value={progress} /></Box>
                     <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}> Q {currentQuestionIndex + 1} / {totalQuestions} </Typography>
                 </Box>

                 {/* Question Display Area */}
                 <Paper elevation={0} sx={{ flexGrow: 1, mb: 2, p: {xs: 1.5, sm: 2, md: 3}, border: `1px solid ${theme.palette.divider}`, borderRadius: 1, overflowY: 'auto' }}>
                     <Typography variant="h6" sx={{ mb: 2.5, fontWeight: 500, lineHeight: 1.4 }}>{currentQuestion.text}</Typography>
                     {/* Answer Options */}
                     <FormControl component="fieldset" sx={{width: '100%'}}>
                        <RadioGroup name={`question-${currentQuestion.id}`} value={answers[String(currentQuestion.id)] || ''} onChange={handleAnswerChange} >
                            {currentQuestion.options.map((option, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, '&:hover': { bgcolor: 'action.hover' }, cursor: 'pointer', display: 'flex', borderRadius: 2 }}>
                                    <FormControlLabel value={option} control={<Radio disabled={isSubmitting || isExamCancelled}/>} label={<Typography variant="body1">{option}</Typography>} sx={{ width: '100%', m: 0 }}/>
                                </Paper>
                            ))}
                        </RadioGroup>
                     </FormControl>
                 </Paper>

                 {/* Submission Error Alert */}
                 {submissionError && <Alert severity="error" sx={{ mb: 2 }}>{submissionError}</Alert>}

                {/* Navigation Buttons Area */}
                 <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 'auto', pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                     <Button variant="outlined" onClick={handlePrevQuestion} disabled={currentQuestionIndex === 0 || isSubmitting || isExamCancelled}>Previous</Button>
                     {currentQuestionIndex < totalQuestions - 1 ? (
                        <Button variant="contained" onClick={handleNextQuestion} disabled={isSubmitting || isExamCancelled}>Next</Button>
                     ) : (
                        <Button variant="contained" color="success" onClick={handleSubmitClick} disabled={isSubmitting || isExamCancelled} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit"/> : null}>
                            {isSubmitting ? 'Submitting...' : 'Finish & Submit Exam'}
                        </Button>
                     )}
                 </Box>
             </Box>

             {/* Submission Confirmation Dialog */}
             <Dialog open={showSubmitConfirm} onClose={() => !isSubmitting && setShowSubmitConfirm(false)}>
                <DialogTitle>Confirm Submission</DialogTitle>
                <DialogContent><DialogContentText>Are you sure you want to finish and submit your exam? You cannot make changes after submitting.</DialogContentText></DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowSubmitConfirm(false)} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleConfirmSubmit} variant="contained" color="success" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={20} color="inherit"/> : null}>{isSubmitting ? 'Submitting...' : 'Confirm Submit'}</Button>
                </DialogActions>
            </Dialog>

        </Box> // End Main Flex Container
    );
}

export default ExamTakingInterface;