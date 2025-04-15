// src/pages/admin/ExamResultAdm.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    Container, Typography, Paper, Box, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Tooltip, Button, Link
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityIcon from '@mui/icons-material/Visibility';
import apiClient from '../../api'; // Pastikan apiClient mengirim token auth

// Helper untuk format tanggal dan waktu
const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('id-ID', { // Locale Indonesia
            dateStyle: 'medium', // e.g., 28 Okt 2023
            timeStyle: 'short', // e.g., 14:30
            hour12: false // Gunakan format 24 jam jika diinginkan
        });
    } catch (e) {
        console.error("Error formatting date:", isoString, e);
        return 'Invalid Date';
    }
};

// Helper formatDuration tidak digunakan saat ini karena backend tidak mengirim timeTaken
/*
const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
};
*/

function ExamResultAdm() {
    const { examId } = useParams(); // Ambil examId dari URL
    const navigate = useNavigate();
    // State untuk nama ujian (diambil dari hasil atau ID)
    const [examName, setExamName] = useState(`Ujian ID: ${examId}`);
    const [results, setResults] = useState([]); // State untuk menyimpan array hasil submission
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchResults = async () => {
            setIsLoading(true);
            setError(null);
            console.log(`Fetching results for Exam ID: ${examId}`); // Debug

            try {
                // **PENTING**: Pastikan apiClient otomatis menambahkan header 'Authorization: Bearer <token>'
                const response = await apiClient.get(`/admin/exams/${examId}/results`);

                console.log("API Response Data:", response.data); // Debug

                // Response.data seharusnya adalah array hasil submission
                if (Array.isArray(response.data)) {
                    setResults(response.data);
                    // Ambil nama ujian dari hasil pertama jika ada
                    if (response.data.length > 0 && response.data[0].exam_name) {
                        setExamName(response.data[0].exam_name);
                    } else {
                        // Optional: Jika perlu nama ujian yang pasti,
                        // bisa fetch ke /api/admin/exams/${examId} secara terpisah
                        // Untuk saat ini, gunakan fallback ID jika nama tidak ada di hasil
                        console.warn("Exam name not found in results, using ID fallback.");
                    }
                } else {
                    console.error("API response is not an array:", response.data);
                    throw new Error("Format data hasil ujian tidak sesuai.");
                }

            } catch (err) {
                console.error("Error fetching exam results:", err);
                let errorMessage = 'Gagal memuat hasil ujian.';
                if (err.response) {
                     // Log response error jika ada
                     console.error("API Error Response:", err.response.status, err.response.data);
                    if (err.response.status === 404) {
                        errorMessage = `Hasil ujian untuk Exam ID ${examId} tidak ditemukan.`;
                    } else if (err.response.status === 401 || err.response.status === 403) {
                        errorMessage = 'Autentikasi gagal atau Anda tidak punya izin mengakses hasil ini.';
                         // Mungkin perlu redirect ke login?
                         // navigate('/login');
                    } else if (err.response.data?.message) {
                        errorMessage = err.response.data.message; // Ambil pesan dari backend jika ada
                    }
                } else if (err.request) {
                     console.error("API No Response:", err.request);
                     errorMessage = "Tidak ada respons dari server. Periksa koneksi atau backend.";
                } else {
                    errorMessage = err.message; // Error lain (misal: setup request)
                }
                setError(errorMessage);
            } finally {
                setIsLoading(false);
                 console.log("Fetching results finished."); // Debug
            }
        };

        if (examId) {
            fetchResults();
        } else {
            setError("Exam ID tidak ditemukan di URL.");
            setIsLoading(false);
        }

    }, [examId]); // Re-fetch jika examId berubah

    // Handler untuk kembali ke daftar ujian
    const handleGoBack = () => {
        navigate('/admin/exams'); // Sesuaikan path jika perlu
    };

    // Handler untuk melihat detail jawaban per siswa (Implementasi di masa depan)
    const handleViewSubmissionDetails = (submissionId) => {
        console.log(`Navigasi ke detail submission: ${submissionId}`);
        // Nanti akan navigasi ke halaman baru, contoh:
        // navigate(`/admin/submissions/${submissionId}`);
        alert(`Fitur 'Lihat Detail Jawaban' untuk submission ${submissionId} belum diimplementasikan.`);
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }} elevation={3}>
                <Box display="flex" alignItems="center" mb={3}>
                    <Tooltip title="Kembali ke Daftar Ujian">
                        <IconButton onClick={handleGoBack} sx={{ mr: 1 }}>
                            <ArrowBackIcon />
                        </IconButton>
                    </Tooltip>
                    <Typography variant="h5" component="h1" fontWeight="medium">
                        Hasil Ujian: {isLoading ? 'Memuat...' : examName}
                        {/* Jika ingin menampilkan subject, perlu fetch detail exam terpisah */}
                    </Typography>
                </Box>

                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                        <Typography sx={{ ml: 2 }}>Memuat data...</Typography>
                    </Box>
                )}

                {error && !isLoading && (
                    <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                )}

                {!isLoading && !error && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table stickyHeader aria-label="exam results table">
                            <TableHead>
                                <TableRow sx={{ '& th': { backgroundColor: 'grey.100', fontWeight: 'bold' } }}>
                                    <TableCell>Username Siswa</TableCell>
                                    <TableCell align="right">Skor (%)</TableCell>
                                    <TableCell>Tanggal Submit</TableCell>
                                    {/* Kolom Waktu Pengerjaan dihapus karena data 'timeTaken' belum ada di backend */}
                                    {/* <TableCell>Waktu Pengerjaan</TableCell> */}
                                    <TableCell align="center">Jawaban Benar</TableCell> {/* Kolom tambahan */}
                                    <TableCell align="center">Aksi</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {results.length > 0 ? (
                                    results.map((result) => (
                                        <TableRow hover key={result.id}> {/* Gunakan result.id (dari backend) sebagai key */}
                                            <TableCell component="th" scope="row">
                                                {result.student_username || `User ID: ${result.user_id}`} {/* Gunakan student_username */}
                                            </TableCell>
                                            <TableCell align="right">
                                                {result.score !== null ? result.score.toFixed(2) : 'N/A'} {/* Format skor jadi 2 desimal */}
                                            </TableCell>
                                            <TableCell>
                                                {formatDateTime(result.submitted_at)} {/* Gunakan submitted_at */}
                                            </TableCell>
                                            {/* Cell untuk Waktu Pengerjaan dihapus */}
                                            {/* <TableCell>{formatDuration(result.timeTaken)}</TableCell> */}
                                            <TableCell align="center"> {/* Tampilkan jumlah benar/total */}
                                                {`${result.correct_answers_count ?? 'N/A'} / ${result.total_questions_count ?? 'N/A'}`}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Lihat Detail Jawaban (Belum Tersedia)">
                                                    {/* Nonaktifkan tombol jika fitur belum siap */}
                                                    <span> {/* Wrapper agar tooltip muncul di tombol disabled */}
                                                    <IconButton
                                                        size="small"
                                                        color="primary"
                                                        onClick={() => handleViewSubmissionDetails(result.id)} // Gunakan result.id
                                                        aria-label="view submission details"
                                                        disabled // Hapus 'disabled' jika fitur sudah ada
                                                    >
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}> {/* Sesuaikan colSpan */}
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