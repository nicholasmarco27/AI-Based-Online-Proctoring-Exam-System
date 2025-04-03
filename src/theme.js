// src/theme.js
import { createTheme } from '@mui/material/styles';
import { blue, pink } from '@mui/material/colors';

const theme = createTheme({
  palette: {
    primary: {
      main: blue[700], // A nice blue
    },
    secondary: {
      main: pink[500], // A contrasting pink
    },
    background: {
      default: '#f4f6f8', // A light grey background
      paper: '#ffffff',
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
        fontWeight: 600,
    },
    h5: {
        fontWeight: 600,
    },
    h6: {
        fontWeight: 600,
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)', // Softer shadow
        },
      },
    },
    MuiDrawer: {
        styleOverrides: {
          paper: {
            // backgroundColor: '#192a56', // Example: Dark blue sidebar
            // color: '#ffffff',
          }
        }
    },
    MuiCard: {
        styleOverrides: {
            root: {
                borderRadius: 8, // Slightly rounded corners
                boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.05)', // Subtle shadow
            }
        }
    }
    // Add more component overrides if desired
  },
});

export default theme;