import React, { useState } from 'react';
// Import RouterLink for navigation links within the app
import { Link as RouterLink } from 'react-router-dom';
// Import MUI components
import { Button, TextField, Link, Grid, Box, Typography, Container, Paper, Alert } from '@mui/material';
// Import Logo
import logoText from '../assets/intellixam-text.png';
// Import API client helper and Auth context hook
import apiClient from '../api';
import { useAuth } from '../App';

function LoginPage() {
  // State for form inputs, loading status, and error messages
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Get the login function from the authentication context
  const { login } = useAuth();

  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission
    setError(''); // Clear previous errors
    setLoading(true); // Set loading state

    try {
      // --- Call Backend Login API ---
      const response = await apiClient.post('/login', { username, password });

      // --- Handle Successful Login ---
      if (response.data && response.data.token && response.data.role) {
        // Call the login function from AuthContext to update global state and store token
        login(response.data.token, response.data.role);
        // Navigation to the dashboard will be handled by the redirect logic in App.js
      } else {
         // Should not happen with the current backend setup, but good practice
         setError('Login failed. Invalid response from server.');
      }
    } catch (err) {
       // --- Handle Login Errors ---
       let errorMessage = 'Login failed. Please try again.'; // Default error
       if (err.response && err.response.data && err.response.data.message) {
            // Use specific error message from backend if available
            errorMessage = err.response.data.message;
       } else if (err.request) {
           // Error: No response received from server
           errorMessage = 'Login failed. Cannot connect to the server.';
       } else {
           // Other errors (e.g., network issues, setup problems)
           errorMessage = `Login failed: ${err.message}`;
       }
       setError(errorMessage);
       console.error("Login error:", err); // Log detailed error for debugging
    } finally {
        setLoading(false); // Reset loading state regardless of success or failure
    }
  };

  return (
    // Main container for the login form, centered on the page
    <Container component="main" maxWidth="xs">
      {/* Paper component for visual grouping and elevation */}
      <Paper elevation={3} sx={{ marginTop: 8, padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 2 }}>
        {/* Logo Image */}
        <Box
          component="img"
          sx={{
            my: 0,
            height: 90, // Adjust height as needed
          }}
          alt="Intellixam Logo"
          src={logoText}
        />
        {/* Title */}
        <Typography component="h1" variant="h5">
          Sign in
        </Typography>

        {/* Display error message if login fails */}
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}

        {/* Login Form */}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          {/* Username Input */}
          <TextField
            margin="normal"
            required // HTML5 required attribute
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus // Automatically focus this field on load
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading} // Disable input while loading
          />
          {/* Password Input */}
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading} // Disable input while loading
          />
          {/* Remember Me checkbox - Not implemented */}
          {/* <FormControlLabel control={<Checkbox value="remember" color="primary" />} label="Remember me" /> */}

          {/* Submit Button */}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading} // Disable button while loading
          >
            {/* Show different text while loading */}
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>

          {/* Links Grid */}
          <Grid container>
            <Grid item xs>
              {/* Placeholder for Forgot Password link */}
              {/* <Link href="#" variant="body2"> Forgot password? </Link> */}
            </Grid>
            <Grid container justifyContent="flex-end">
              <Grid item>
                <Link component={RouterLink} to="/signup" variant="body2">
                  {"Don't have an account? Sign Up (Student)"}
                </Link>
              </Grid>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Optional Copyright Footer */}
       <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 5 }}>
         {'© '}
         <Link color="inherit" href="#"> {/* Replace with your app name/link */}
           Intellixam
         </Link>{' '}
         {new Date().getFullYear()}
         {'.'}
       </Typography>
    </Container>
  );
}

export default LoginPage;