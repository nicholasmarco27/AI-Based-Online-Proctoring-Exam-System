// src/pages/admin/ExamResultAdm.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container, Typography, Paper, Box, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Tooltip, Button
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download'; // Ikon untuk download per siswa
import FileDownloadIcon from '@mui/icons-material/FileDownload'; // Ikon untuk export semua
import apiClient from '../../api';
import * as XLSX from 'xlsx'; // Import library xlsx

// Helper formatDateTime
const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
            hour12: false
        });
    } catch (e) {
        console.error("Error formatting date:", isoString, e);
        return 'Invalid Date';
    }
};

function ExamResultAdm() {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [examDetails, setExamDetails] = useState(null); // State untuk detail ujian (termasuk questions)
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch Data (Results and Exam Details)
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            console.log(`Fetching data for Exam ID: ${examId}`);

            try {
                const [resultsResponse, examDetailsResponse] = await Promise.all([
                    apiClient.get(`/admin/exams/${examId}/results`),
                    apiClient.get(`/admin/exams/${examId}`)
                ]);

                console.log("API Results Response Data:", resultsResponse.data);
                console.log("API Exam Details Response Data:", examDetailsResponse.data);

                if (Array.isArray(resultsResponse.data)) {
                    setResults(resultsResponse.data);
                } else {
                    console.error("API results response is not an array:", resultsResponse.data);
                    throw new Error("Format data hasil ujian tidak sesuai.");
                }

                if (examDetailsResponse.data && typeof examDetailsResponse.data === 'object') {
                    setExamDetails(examDetailsResponse.data);
                } else {
                    console.error("API exam details response is not valid:", examDetailsResponse.data);
                    throw new Error("Format data detail ujian tidak sesuai.");
                }

            } catch (err) {
                console.error("Error fetching exam data:", err);
                let errorMessage = 'Gagal memuat data.';
                 if (err.response) {
                    console.error("API Error Response:", err.response.status, err.response.data);
                    if (err.response.status === 404) {
                         errorMessage = `Data untuk Exam ID ${examId} tidak ditemukan.`;
                    } else if (err.response.status === 401 || err.response.status === 403) {
                         errorMessage = 'Autentikasi gagal atau Anda tidak punya izin mengakses data ini.';
                         // navigate('/login');
                    } else if (err.response.data?.message) {
                         errorMessage = err.response.data.message;
                    }
                } else if (err.request) {
                     console.error("API No Response:", err.request);
                     errorMessage = "Tidak ada respons dari server.";
                } else {
                    errorMessage = err.message;
                }
                setError(errorMessage);
                 setResults([]);
                 setExamDetails(null);
            } finally {
                setIsLoading(false);
                console.log("Fetching data finished.");
            }
        };

        if (examId) {
            fetchData();
        } else {
            setError("Exam ID tidak ditemukan di URL.");
            setIsLoading(false);
        }

    }, [examId]); // Dependency array

    // Handler untuk kembali
    const handleGoBack = () => {
        navigate('/admin/exams');
    };

    // Handler Download Excel Per Siswa
    const handleDownloadExcel = (submission) => {
        console.log("Preparing download for submission:", submission.id);
        if (!examDetails || !examDetails.questions || !submission || !submission.answers) {
            alert("Data pertanyaan atau jawaban tidak lengkap untuk membuat file Excel.");
            console.error("Missing data for Excel generation:", { examDetails, submission });
            return;
        }
        const examQuestions = examDetails.questions;
        const studentAnswers = submission.answers;
        const dataForExcel = examQuestions.map((question) => {
            const qIdStr = String(question.id);
            const studentAnswer = studentAnswers[qIdStr] || "Tidak Dijawab";
            const correctAnswer = question.correct_answer || "N/A";
            const isCorrect = studentAnswer === correctAnswer;
            return {
                'Pertanyaan': question.text,
                'Jawaban Siswa': studentAnswer,
                'Jawaban Benar': correctAnswer,
                'Benar/Salah': isCorrect ? 'Benar' : 'Salah',
            };
        });
        dataForExcel.push({});
        dataForExcel.push({ 'Pertanyaan': 'TOTAL SKOR', 'Jawaban Siswa': submission.score !== null ? `${submission.score.toFixed(2)}%` : 'N/A' });
        dataForExcel.push({ 'Pertanyaan': 'Jawaban Benar', 'Jawaban Siswa': `${submission.correctAnswer ?? 'N/A'} / ${submission.totalQuestions ?? 'N/A'}` });

        try {
            const ws = XLSX.utils.json_to_sheet(dataForExcel);
            ws['!cols'] = [ { wch: 60 }, { wch: 30 }, { wch: 30 }, { wch: 15 } ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Detail Jawaban");
            const studentUsernameSafe = (submission.username || `user_${submission.user_id}`).replace(/[^a-zA-Z0-9_]/g, '_');
            const fileName = `Hasil_${examDetails.name?.replace(/[^a-zA-Z0-9_]/g, '_')}_${studentUsernameSafe}.xlsx`;
            XLSX.writeFile(wb, fileName);
        } catch (excelError) {
            console.error("Error creating Excel file:", excelError);
            alert("Terjadi kesalahan saat membuat file Excel.");
        }
    };

    // Handler Export Semua Hasil
    const handleExportAllResults = () => {
        console.log("Preparing to export all results...");
        if (results.length === 0) {
            alert("Tidak ada data hasil untuk diexport.");
            return;
        }
        let totalScore = 0;
        let validScoresCount = 0;
        const dataForExcel = results.map((result) => {
            if (result.score !== null && !isNaN(result.score)) {
                totalScore += result.score;
                validScoresCount++;
            }
            return {
                'Username Siswa': result.username || `User ID: ${result.user_id}`,
                'Skor (%)': result.score !== null ? result.score.toFixed(2) : 'N/A',
                'Tanggal Submit': formatDateTime(result.submittedAt),
                'Jawaban Benar': `${result.correctAnswers ?? 'N/A'} / ${result.totalQuestions ?? 'N/A'}`,
            };
        });
        const averageScore = validScoresCount > 0 ? (totalScore / validScoresCount) : 0;
        dataForExcel.push({});
        dataForExcel.push({ 'Username Siswa': 'RATA-RATA KELAS', 'Skor (%)': averageScore.toFixed(2), 'Tanggal Submit': '', 'Jawaban Benar': '' });

        try {
            const ws = XLSX.utils.json_to_sheet(dataForExcel);
            ws['!cols'] = [ { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 20 } ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Ringkasan Hasil Ujian");
            const examNameSafe = (examDetails?.name || `Exam_${examId}`).replace(/[^a-zA-Z0-9_]/g, '_');
            const fileName = `Ringkasan_Hasil_${examNameSafe}.xlsx`;
            XLSX.writeFile(wb, fileName);
        } catch (excelError) {
            console.error("Error creating Excel file:", excelError);
            alert("Terjadi kesalahan saat membuat file Excel ringkasan.");
        }
    };

    // --- Render Logic ---
    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }} elevation={3}>
                {/* --- Header Box with Title and Export Button --- */}
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
                    {/* Left Part: Back Button and Title */}
                    <Box display="flex" alignItems="center">
                        <Tooltip title="Kembali ke Daftar Ujian">
                            <IconButton onClick={handleGoBack} sx={{ mr: 1 }}>
                                <ArrowBackIcon />
                            </IconButton>
                        </Tooltip>
                        <Typography variant="h5" component="h1" fontWeight="medium">
                            Hasil Ujian: {isLoading ? 'Memuat...' : (examDetails?.name || `Ujian ID: ${examId}`)}
                        </Typography>
                    </Box>

                    {/* Right Part: Export Button */}
                    <Tooltip title="Export semua hasil ke Excel">
                        {/* Span diperlukan agar tooltip bekerja saat button disabled */}
                        <span>
                            <Button
                                variant="contained" // Mungkin contained lebih cocok di sini
                                startIcon={<FileDownloadIcon />}
                                onClick={handleExportAllResults}
                                disabled={isLoading || !results || results.length === 0} // Nonaktif saat loading atau tidak ada hasil
                                size="medium" // Ukuran medium mungkin lebih pas di header
                            >
                                Export Data
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
                {/* --- End Header Box --- */}


                {/* Loading Indicator */}
                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                        <Typography sx={{ ml: 2 }}>Memuat data...</Typography>
                    </Box>
                )}

                {/* Error Message */}
                {error && !isLoading && (
                    <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                )}

                {/* Warning if exam details failed but results exist */}
                {!isLoading && !error && !examDetails && results.length > 0 && (
                     <Alert severity="warning" sx={{ mb: 2 }}>Detail ujian tidak dapat dimuat, fitur download detail per siswa tidak akan berfungsi.</Alert>
                 )}


                {/* Table Container */}
                {!isLoading && !error && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table stickyHeader aria-label="exam results table">
                             <TableHead>
                                <TableRow sx={{ '& th': { backgroundColor: 'grey.100', fontWeight: 'bold' } }}>
                                    <TableCell>Username Siswa</TableCell>
                                    <TableCell align="right">Skor (%)</TableCell>
                                    <TableCell>Tanggal Submit</TableCell>
                                    <TableCell align="center">Jawaban Benar</TableCell>
                                    <TableCell align="center">Aksi</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {results.length > 0 ? (
                                    results.map((result) => (
                                        <TableRow hover key={result.id}>
                                            <TableCell component="th" scope="row">
                                                {result.username || `User ID: ${result.userId}`}
                                            </TableCell>
                                            <TableCell align="right">
                                                {result.score !== null ? result.score.toFixed(2) : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                {formatDateTime(result.submittedAt)}
                                            </TableCell>
                                            <TableCell align="center">
                                                {`${result.correctAnswers ?? 'N/A'} / ${result.totalQuestions ?? 'N/A'}`}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Download Detail Jawaban (.xlsx)">
                                                    <span> {/* Wrapper needed for disabled button tooltip */}
                                                        <IconButton
                                                            size="small"
                                                            color="primary"
                                                            onClick={() => handleDownloadExcel(result)}
                                                            aria-label="download submission details"
                                                            disabled={!examDetails} // Tombol nonaktif jika detail ujian belum load
                                                        >
                                                            <DownloadIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                            Belum ada siswa yang menyelesaikan ujian ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>
        </Container>
    );
}

export default ExamResultAdm;