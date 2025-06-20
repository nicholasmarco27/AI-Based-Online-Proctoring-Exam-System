// src/components/SignUpPage.js
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Button, TextField, Link, Grid, Box, Typography, Container, Paper, Alert } from '@mui/material';
import logoText from '../assets/intellixam-text.png'; // Import the logo
import apiClient from '../api'; // Import the api client

function SignUpPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    // --- Frontend Validation ---
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!username || !password) {
        setError('Username and password are required.');
        return;
    }
     if (username.length < 3) {
        setError('Username must be at least 3 characters long');
        return;
    }
    if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
    }
    // --- End Frontend Validation ---

    setLoading(true);

    try {
      // --- Call Backend API ---
      const response = await apiClient.post('/register', { username, password });

      // --- Handle Success ---
      setSuccess(response.data.message || 'Registration successful! You can now log in.');
      // Optionally clear form or redirect after a delay
      setTimeout(() => {
          navigate('/login'); // Redirect to login page after success
      }, 2000); // 2 second delay

    } catch (err) {
       // --- Handle Errors ---
       if (err.response && err.response.data && err.response.data.message) {
            setError(err.response.data.message); // Display specific error from backend
       } else if (err.request) {
           setError('Registration failed. No response from server.');
       } else {
           setError(`Registration failed: ${err.message}`);
       }
       setSuccess(''); // Clear any previous success message
    } finally {
        setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper elevation={3} sx={{ marginTop: 8, padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 2 }}>
        <Box
            component="img"
            sx={{
              my: 0,
              height: 90, // Adjust height as needed
            }}
            alt="Intellixam Logo"
            src={logoText}
        />
        <Typography component="h1" variant="h5">
          Sign up as Student
        </Typography>

        {/* Display Success or Error Messages */}
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{success}</Alert>}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading || !!success} // Disable if loading or success message shown
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || !!success}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading || !!success}
            error={password !== confirmPassword && confirmPassword !== ''} // Show error if mismatch and confirm has input
            helperText={password !== confirmPassword && confirmPassword !== '' ? "Passwords do not match" : ""}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading || !!success}
          >
            {loading ? 'Signing Up...' : 'Sign Up'}
          </Button>
          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link component={RouterLink} to="/login" variant="body2">
                Already have an account? Sign in
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
       {/* Optional Copyright */}
    </Container>
  );
}

export default SignUpPage;