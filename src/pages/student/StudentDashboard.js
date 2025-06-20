// src/pages/student/StudentDashboard.js
import React, { useState, useEffect, useMemo } from 'react';
import {
    Grid, Card, CardContent, Typography, Box, List, ListItem, ListItemText,
    Divider, Paper, Chip, CircularProgress, Alert, Button
} from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useNavigate } from 'react-router-dom';
import studentIllustration from '../../student-exam.png';
import apiClient from '../../api'; // Pastikan path ini benar

// Chart.js Imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

// Helper Component: InfoCard (Reusable)
function InfoCard({ title, icon, children, sx = {}, titleBgColor = 'rgba(25, 118, 210, 0.08)' }) {
    return (
        <Paper
            elevation={2}
            sx={{
                borderRadius: 2,
                display: 'flex', // Buat Paper ini jadi flex container
                flexDirection: 'column', // Susun title dan content secara vertikal
                overflow: 'hidden', // Jaga konten agar tidak keluar
                transition: 'box-shadow 0.3s',
                '&:hover': {
                    boxShadow: 3,
                },
                ...sx // Terapkan sx dari luar (akan berisi flexGrow, minHeight)
            }}
        >
            {/* Title Box */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 2,
                    backgroundColor: titleBgColor,
                    borderBottom: '1px solid rgba(0,0,0,0.08)',
                    flexShrink: 0, // Jangan biarkan title box menyusut
                }}
            >
                {icon}
                <Typography variant="h6" sx={{ ml: 1, fontWeight: 500 }}>{title}</Typography>
            </Box>
            {/* Content Box - Biarkan ia tumbuh jika Paper punya flexGrow */}
            <Box sx={{
                 flexGrow: 1, // Biarkan konten mengisi sisa ruang di dalam card
                 overflow: 'auto', // Beri scroll jika konten terlalu panjang
                 p: 2,
                 minHeight: 0 // Penting agar bisa mengecil jika perlu
            }}>
                {children}
            </Box>
        </Paper>
    );
}


// Main Component: StudentDashboard
function StudentDashboard() {
    const [dashboardData, setDashboardData] = useState({ upcomingExams: [], recentResults: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // State for Welcome Card
    const [currentDate, setCurrentDate] = useState('');
    const studentName = "Student"; // Placeholder name

    useEffect(() => {
        // Set current date for the welcome card
        const date = new Date();
        setCurrentDate(date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }));
    }, []); // Runs once on component mount to set the date


    // Fetch Data Effect
    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiClient.get('/student/dashboard');

                // Sortir hasil terbaru berdasarkan tanggal (terlama dulu untuk chart)
                const sortedResults = (response.data?.recentResults || []).sort((a, b) => {
                    const dateA = a.dateTaken ? new Date(a.dateTaken) : 0;
                    const dateB = b.dateTaken ? new Date(b.dateTaken) : 0;
                    // Penanganan tanggal invalid sederhana
                    if (isNaN(dateA) && isNaN(dateB)) return 0;
                    if (isNaN(dateA)) return 1; 
                    if (isNaN(dateB)) return -1;
                    return dateA - dateB; // Sort ascending (lama ke baru)
                });

                setDashboardData({
                    upcomingExams: response.data?.upcomingExams || [],
                    recentResults: sortedResults
                });

            } catch (err) {
                console.error("Fetch dashboard data error:", err);
                if (err.response && err.response.status === 401) {
                    // Mungkin perlu navigasi ke halaman login atau refresh token
                    setError("Your session may have expired. Please log in again.");
                } else {
                    setError(err.response?.data?.message || err.message || 'Failed to fetch dashboard data.');
                }
                // Set data kosong jika error
                setDashboardData({ upcomingExams: [], recentResults: [] });
            } finally {
                setIsLoading(false);
            }
        };
        fetchDashboardData();
    }, []); // Dependency array kosong, fetch hanya saat mount

    // Data Preparation for Chart using useMemo
    const chartData = useMemo(() => {
        const labels = [];
        const scores = [];
        if (dashboardData.recentResults && dashboardData.recentResults.length > 0) {
            dashboardData.recentResults.forEach(result => {
                const scoreString = result.score?.toString().replace('%', ''); // Hapus '%' jika ada
                const scoreNumber = parseFloat(scoreString);
                // Pastikan examName ada dan score adalah angka valid
                if (result.examName && !isNaN(scoreNumber)) {
                    labels.push(result.examName); // Gunakan nama ujian sebagai label
                    scores.push(scoreNumber); // Gunakan skor (angka) sebagai data
                }
            });
        }
        return {
            labels: labels,
            datasets: [{
                label: 'Score (%)', // Label untuk tooltip
                data: scores,
                borderColor: 'rgb(54, 162, 235)', // Warna garis
                backgroundColor: 'rgba(54, 162, 235, 0.2)', // Warna area di bawah garis
                tension: 0.3, // Sedikit melengkungkan garis
                fill: true, // Isi area di bawah garis
                pointBackgroundColor: 'rgb(54, 162, 235)', // Warna titik data
                pointRadius: 5, // Ukuran titik data
                pointHoverRadius: 7, // Ukuran titik saat hover
                borderWidth: 2 // Ketebalan garis
            }],
        };
    }, [dashboardData.recentResults]); // Recalculate hanya jika recentResults berubah

    // Chart Options using useMemo
    const chartOptions = useMemo(() => ({
        responsive: true, // Buat chart menyesuaikan ukuran container
        maintainAspectRatio: false, // Jangan pertahankan rasio aspek default, biarkan container menentukan
        plugins: {
            legend: { display: false }, // Sembunyikan legenda
            title: { display: false }, // Sembunyikan judul chart
            tooltip: { // Kustomisasi Tooltip
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: 10,
                cornerRadius: 6,
                callbacks: {
                    label: function(context) { // Format teks tooltip
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) label += context.parsed.y.toFixed(1) + '%'; // Tampilkan skor dengan 1 desimal
                        return label;
                    }
                }
            }
        },
        scales: { // Pengaturan sumbu
            y: { // Sumbu Y (Skor)
                beginAtZero: true, // Mulai dari 0
                suggestedMax: 100, // Sarankan maksimum 100
                grid: { color: 'rgba(0,0,0,0.05)' }, // Warna garis grid Y
                ticks: { // Label sumbu Y
                    color: 'rgba(0,0,0,0.6)',
                    font: { size: 11 },
                    callback: (value) => value + '%' // Tambahkan '%' di label
                }
            },
            x: { // Sumbu X (Nama Ujian)
                grid: { display: false }, // Sembunyikan grid X
                ticks: { // Label sumbu X
                    autoSkip: true, // Lewati beberapa label jika terlalu padat
                    maxRotation: 45, // Rotasi maksimum label
                    color: 'rgba(0,0,0,0.6)',
                    font: { size: 10 }
                }
            }
        },
        elements: {
            point: { // Pengaturan titik data
                 radius: 4, // Ukuran normal
                 hoverRadius: 6 // Ukuran saat hover
            }
        },
        animation: { // Animasi saat chart dimuat
            duration: 1000,
            easing: 'easeOutQuart'
        }
    }), []); // Opsi tidak bergantung pada data, cukup dibuat sekali


    // Render Logic
    return (
        // Outer Box: Container utama halaman, mengatur padding, background, dan tinggi minimum
        // Menjadi flex container agar Grid di dalamnya bisa tumbuh (flexGrow)
        <Box sx={{
            flexGrow: 1, // Ambil space jika di dalam container flex lain (misal layout utama app)
            p: 3, // Padding sekeliling konten
            backgroundColor: '#f5f7fa', // Warna background halaman
            minHeight: 'calc(100vh - 64px)', // Setidaknya setinggi viewport dikurangi tinggi header (asumsi 64px)
            display: 'flex', // Aktifkan flexbox
            flexDirection: 'column' // Susun anak (Judul, Grid) secara vertikal
        }}>
            {/* Removed Original Typography Title "Student Dashboard" */}

            {/* START: New Welcome Card */}
            <Paper
                elevation={2} 
                sx={{
                    p: { xs: 2, sm: 2.5, md: 3 }, // Responsive padding
                    mb: 3,
                    borderRadius: '12px', // Rounded corners like in the reference image
                    backgroundColor: '#1a237e', // Custom purple color, similar to reference image
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    overflow: 'hidden', // To ensure child elements like image respect border radius
                    flexShrink: 0, // Prevent this card from shrinking if parent flex container is constrained
                }}
            >
                <Box sx={{ flexGrow: 1, pr: {sm: 2, md: 3} }}> {/* Text content area, add padding to right before image */}
                    <Typography
                        variant="body2" // Smaller text for date
                        display="block"
                        sx={{ color: '#cfd4ff', mb: 0.75 }} // Dark gray, good contrast on the purple
                    >
                        {currentDate}
                    </Typography>
                    <Typography
                        variant="h5" // Larger, prominent text for welcome message
                        component="h1" // Semantic heading for accessibility
                        sx={{
                            fontWeight: 'bold',
                            color: '#FFFFFF', // Black for maximum emphasis
                            mb: 0.5,
                            lineHeight: 1.3, // Adjust line height for dense text
                        }}
                    >
                        Welcome back, {studentName}!
                    </Typography>
                    <Typography
                        variant="body2" // Standard body text for the portal message
                        sx={{ color: '#cfd4ff' }} // Dark gray, consistent with date
                    >
                        Always stay updated in your student portal
                    </Typography>
                </Box>
                <Box
                    sx={{
                        display: { xs: 'none', sm: 'flex' }, // Hide image on extra-small screens
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: { sm: 130, md: 160, lg: 190 }, // Responsive width for the image container
                        height: { sm: 90, md: 110, lg: 120 }, // Responsive height for the image container
                        flexShrink: 0, // Prevent image box from shrinking
                    }}
                >
                    <img
                        src={studentIllustration}
                        alt="Student portal illustration"
                        style={{
                            maxWidth: '100%', // Ensure image is responsive within its container
                            maxHeight: '100%', // Ensure image is responsive within its container
                            objectFit: 'contain', // Scales image to fit while maintaining aspect ratio
                        }}
                    />
                </Box>
            </Paper>
            {/* END: New Welcome Card */}

            {/* Loading Indicator */}
            {isLoading && (
                <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <CircularProgress size={40} thickness={4} />
                    <Typography sx={{ ml: 2, color: 'text.secondary' }}>Loading dashboard...</Typography>
                </Box>
            )}

            {/* Error Message */}
            {!isLoading && error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2, boxShadow: 1, flexShrink: 0 }}>
                    {error}
                </Alert>
            )}

            {/* Konten Utama (Grid) jika tidak loading dan tidak error */}
            {!isLoading && !error && (
                // Grid Container: Mengatur layout kolom dan baris card
                // Harus tumbuh (flexGrow) mengisi sisa ruang di dalam Outer Box
                <Grid container spacing={3} sx={{
                    flexGrow: 1, // Izinkan Grid Container untuk tumbuh
                    minHeight: 0 // Penting dalam konteks flex agar bisa menyusut jika perlu dan tidak meluap
                 }}>
                    {/* --- Kolom Kiri --- */}
                    {/* Grid Item (Kolom): Container untuk card di kolom kiri */}
                    {/* Menjadi flex container vertikal untuk card di dalamnya */}
                    <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
                        {/* Upcoming Exams Card: Harus bisa tumbuh */}
                        <InfoCard
                            title="Upcoming Exams"
                            icon={<EventIcon sx={{ color: '#1976d2' }} />}
                            titleBgColor="rgba(25, 118, 210, 0.08)"
                            sx={{ flexGrow: 1, minHeight: 0 }} // Izinkan tumbuh dan menyusut
                        >
                           {/* Konten Upcoming Exams */}
                           {dashboardData.upcomingExams.length > 0 ? (
                                <List dense sx={{ p: 0 }}>
                                    {dashboardData.upcomingExams.map((exam, index) => (
                                        <React.Fragment key={exam.id}>
                                             <ListItem
                                                sx={{ px: 1, py: 1.5, borderRadius: 1, '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' } }}
                                                secondaryAction={
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        color="primary"
                                                        sx={{ boxShadow: 'none', textTransform: 'none', '&:hover': { boxShadow: 1 } }}
                                                        onClick={() => navigate(`/student/take-exam/${exam.id}`)} // Navigasi ke halaman ujian
                                                    >
                                                        Start Exam
                                                    </Button>
                                                }
                                            >
                                                <ListItemText
                                                    primary={<Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{exam.name}</Typography>}
                                                    secondary={
                                                        <Typography variant="body2" color="text.secondary">
                                                            {/* Tampilkan subject, durasi, dan sisa percobaan jika ada */}
                                                            {`${exam.subject} (${exam.duration || 'N/A'} min)${exam.total_attempts ? ` - Attempts left: ${exam.attempts_left}/${exam.total_attempts}` : ''}`}
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                            {/* Divider antar item kecuali yang terakhir */}
                                            {index < dashboardData.upcomingExams.length - 1 && <Divider sx={{ my: 0.5 }} />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                // Tampilan jika tidak ada ujian mendatang
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height:'100%', minHeight: 100, p: 3, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                        No upcoming exams available.
                                    </Typography>
                                </Box>
                            )}
                        </InfoCard>

                        {/* Recent Results Card: Harus bisa tumbuh */}
                        <InfoCard
                            title="Recent Results"
                            icon={<CheckCircleOutlineIcon sx={{ color: '#2e7d32' }} />}
                            titleBgColor="rgba(46, 125, 50, 0.08)"
                            sx={{ flexGrow: 1, minHeight: 0 }} // Izinkan tumbuh dan menyusut
                        >
                           {/* Konten Recent Results */}
                            {dashboardData.recentResults.length > 0 ? (
                                <List dense sx={{ p: 0 }}>
                                     {/* Urutkan kembali DESC untuk tampilan (terbaru di atas), tapi chart pakai ASC */}
                                    {[...dashboardData.recentResults].reverse().map((result, index) => (
                                        <React.Fragment key={result.submissionId}>
                                            <ListItem
                                                sx={{ px: 1, py: 1.5, borderRadius: 1, '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' } }}
                                                secondaryAction={
                                                    // Tampilkan Grade Chip hanya jika ada dan bukan N/A
                                                    result.grade && result.grade !== 'N/A' ? (
                                                        <Chip
                                                            label={result.grade}
                                                            color={ // Warna chip berdasarkan grade
                                                                result.grade === 'A' ? 'success' :
                                                                result.grade === 'B' ? 'primary' :
                                                                result.grade === 'C' ? 'info' :
                                                                result.grade === 'D' ? 'warning' : 'error'
                                                            }
                                                            size="small"
                                                            sx={{ fontWeight: 500 }}
                                                        />
                                                    ) : null // Jangan tampilkan chip jika grade N/A
                                                }
                                            >
                                                <ListItemText
                                                    primary={<Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{result.examName}</Typography>}
                                                    secondary={
                                                        <Typography variant="body2" color="text.secondary">
                                                            {/* Tampilkan subject dan tanggal */}
                                                            {`${result.subject} - Taken: ${result.dateTaken || 'N/A'}`}
                                                            {/* Tampilkan skor hanya jika ada dan bukan N/A */}
                                                            {result.score && result.score !== 'N/A' ?
                                                                ` | Score: ${result.score}`
                                                                : '' // Kosongkan jika skor N/A
                                                            }
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                            {/* Divider antar item kecuali yang terakhir */}
                                            {index < dashboardData.recentResults.length - 1 && <Divider sx={{ my: 0.5 }} />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            ) : (
                                // Tampilan jika tidak ada hasil ujian
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 100, p: 3, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                        No recent results available.
                                    </Typography>
                                </Box>
                            )}
                        </InfoCard>
                    </Grid>

                    {/* --- Kolom Kanan --- */}
                     {/* Grid Item (Kolom): Container untuk card di kolom kanan */}
                     {/* Menjadi flex container vertikal untuk card di dalamnya */}
                    <Grid item xs={12} md={5} sx={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
                        {/* Announcements Card: Harus bisa tumbuh */}
                        <InfoCard
                            title="Announcements"
                            icon={<AnnouncementIcon sx={{ color: '#ed6c02' }} />}
                            titleBgColor="rgba(237, 108, 2, 0.08)"
                            sx={{ flexGrow: 1, minHeight: 0 }} // Izinkan tumbuh dan menyusut
                        >
                            {/* Konten Announcements (contoh statis) */}
                             <Box sx={{ px: 1 }}>
                                <Typography variant="body2" sx={{ p: 1.5, borderRadius: 1, backgroundColor: 'rgba(237, 108, 2, 0.05)', mb: 1.5 }}>
                                    <b>• </b>Remember to check the updated syllabus for Calculus I.
                                </Typography>
                                <Typography variant="body2" sx={{ p: 1.5, borderRadius: 1, backgroundColor: 'rgba(237, 108, 2, 0.05)' }}>
                                    <b>• </b>System maintenance scheduled for Sunday 2 AM - 3 AM.
                                </Typography>
                                {/* Tambahkan list atau logic fetch data jika pengumuman dinamis */}
                            </Box>
                        </InfoCard>

                        {/* My Progress Card: Harus bisa tumbuh */}
                        {/* Menggunakan Paper langsung karena struktur dalamnya berbeda (chart) */}
                        <Paper
                            elevation={2}
                            sx={{
                                borderRadius: 2,
                                overflow: 'hidden', // Penting agar chart tidak keluar batas Paper
                                flexGrow: 1, // Izinkan Paper untuk tumbuh
                                minHeight: 0, // Izinkan Paper untuk menyusut
                                display: 'flex', // Jadikan Paper flex container
                                flexDirection: 'column', // Susun Title Box dan Chart Box secara vertikal
                                transition: 'box-shadow 0.3s',
                                '&:hover': { boxShadow: 3 },
                            }}
                        >
                           {/* Title Box untuk My Progress */}
                            <Box sx={{
                                display: 'flex', alignItems: 'center', p: 2,
                                backgroundColor: 'rgba(103, 58, 183, 0.08)', // Warna ungu muda
                                borderBottom: '1px solid rgba(0,0,0,0.08)',
                                flexShrink: 0 // Jangan biarkan title box menyusut
                            }}>
                                <TimelineIcon sx={{ color: '#673ab7' }} />
                                <Typography variant="h6" sx={{ ml: 1, fontWeight: 500 }}> My Progress </Typography>
                            </Box>

                            {/* Chart Container Box: Harus tumbuh mengisi sisa ruang di dalam Paper */}
                            <Box sx={{
                                flexGrow: 1, // Biarkan box ini mengisi sisa ruang
                                position: 'relative', // Diperlukan oleh Chart.js untuk responsivitas
                                p: 2, // Padding di dalam area chart
                                display: 'flex', // Untuk centering placeholder
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 0 // Penting agar bisa menyusut
                            }}>
                                {chartData.labels.length > 0 ? (
                                    // Chart Wrapper: Memberi dimensi pada chart
                                    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                                        <Line options={chartOptions} data={chartData} />
                                    </Box>
                                ) : (
                                    // Placeholder jika tidak ada data chart
                                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 3, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 1, width: '100%', textAlign: 'center', height:'100%' }}>
                                         <TimelineIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 2 }} />
                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                            Complete exams to see your progress chart.
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
}

export default StudentDashboard;