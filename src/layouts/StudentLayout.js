// src/layouts/StudentLayout.js
import React, { useState } from 'react';
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom';
import {
    Box, Drawer, AppBar, Toolbar, List, ListItem, ListItemButton, ListItemIcon,
    ListItemText, Typography, CssBaseline, IconButton, Divider, Avatar, Menu,
    MenuItem, Tooltip, useTheme, useMediaQuery
} from '@mui/material';
// Import necessary student menu icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import HistoryIcon from '@mui/icons-material/History'; // If using Results page
import AccountCircleIcon from '@mui/icons-material/AccountCircle'; // If using Profile page
// Import common icons
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';

// Standard width for the sidebar drawer
const drawerWidth = 240;

// Main Layout component for students
function StudentLayout({ onLogout }) {
    // State for mobile drawer visibility and user menu anchor
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorElUser, setAnchorElUser] = useState(null);

    // Hooks for theme, responsiveness, and routing location
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // Check if screen is small
    const location = useLocation(); // Get current URL location

    // --- Check if the student is currently taking an exam ---
    // This determines whether to show the full layout or just the exam interface
    const isTakingExam = location.pathname.startsWith('/student/take-exam/');

    // --- Event Handlers ---
    const handleDrawerToggle = () => setMobileOpen(!mobileOpen); // Toggle mobile drawer
    const handleOpenUserMenu = (event) => setAnchorElUser(event.currentTarget); // Open user menu
    const handleCloseUserMenu = () => setAnchorElUser(null); // Close user menu
    const handleLogoutClick = () => { // Handle logout action
        handleCloseUserMenu(); // Close menu first
        onLogout(); // Call the logout function passed from App.js
    };

    // --- Navigation Menu Items ---
    // Define items for the sidebar navigation
    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/student' },
        { text: 'Available Exams', icon: <AssignmentTurnedInIcon />, path: '/student/exams' },
        // Uncomment these if you implement the corresponding pages/routes
        // { text: 'My Results', icon: <HistoryIcon />, path: '/student/results' },
        // { text: 'Profile', icon: <AccountCircleIcon />, path: '/student/profile' },
    ];

    // --- Drawer Content (Sidebar) ---
    const drawerContent = (
        <div>
            {/* Toolbar spacer in the drawer */}
            <Toolbar sx={{
                justifyContent: 'center',
                bgcolor: theme.palette.primary.main, // Use theme primary color
                color: theme.palette.primary.contrastText // Use contrast text color
            }}>
                <Typography variant="h6" noWrap component="div">
                    Student Portal
                </Typography>
            </Toolbar>
            <Divider />
            {/* List of navigation items */}
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.text} disablePadding>
                        <ListItemButton
                            component={RouterLink} // Use React Router Link for navigation
                            to={item.path}
                            // Highlight the button if its path matches the current location
                            selected={location.pathname === item.path || (item.path !== '/student' && location.pathname.startsWith(item.path))}
                            onClick={isMobile ? handleDrawerToggle : undefined} // Close drawer on mobile after click
                            sx={{
                                // Styling for selected item
                                '&.Mui-selected': {
                                    backgroundColor: theme.palette.action.selected,
                                    '&:hover': { backgroundColor: theme.palette.action.hover, },
                                    '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                                        color: theme.palette.primary.main,
                                        fontWeight: 600
                                    }
                                }
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </div>
    );
    // --- End Drawer Content ---


    // --- Conditional Rendering: Exam Mode vs Normal Mode ---

    // If the student is taking an exam, render ONLY the content area (<Outlet/>)
    // This effectively hides the AppBar and Drawer.
    if (isTakingExam) {
        return (
            <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
                {/* Outlet renders the nested route component (ExamTakingInterface) */}
                <Outlet />
            </Box>
        );
    }

    // If not taking an exam, render the full standard layout
    return (
        <Box sx={{ display: 'flex' }}>
            <CssBaseline /> {/* Apply baseline styling */}

            {/* Top Application Bar */}
            <AppBar
                position="fixed"
                sx={{
                    // Adjust width and margin to account for the permanent drawer on larger screens
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    ml: { sm: `${drawerWidth}px` },
                    // Style overrides for appearance
                    backgroundColor: theme.palette.background.paper, // Use paper background color
                    color: theme.palette.text.primary, // Use primary text color
                }}
                elevation={1} // Subtle shadow
            >
               <Toolbar>
                   {/* Hamburger icon for mobile drawer */}
                   <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { sm: 'none' } }}><MenuIcon /></IconButton>
                   {/* Title (optional) */}
                   <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>{/* Can be dynamic based on route */}</Typography>
                   {/* User Menu (Avatar, Dropdown) */}
                   <Box sx={{ flexGrow: 0 }}>
                       <Tooltip title="User Options">
                           <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                               {/* Placeholder Avatar */}
                               <Avatar sx={{ bgcolor: theme.palette.primary.main }}>S</Avatar>
                           </IconButton>
                       </Tooltip>
                       <Menu
                           sx={{ mt: '45px' }} id="menu-appbar" anchorEl={anchorElUser}
                           anchorOrigin={{ vertical: 'top', horizontal: 'right' }} keepMounted
                           transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                           open={Boolean(anchorElUser)} onClose={handleCloseUserMenu}
                       >
                           {/* Add Profile link here if implementing profile page */}
                           {/* <MenuItem component={RouterLink} to="/student/profile" onClick={handleCloseUserMenu}><ListItemIcon><AccountCircleIcon fontSize="small" /></ListItemIcon>Profile</MenuItem> */}
                           {/* <Divider /> */}
                           <MenuItem onClick={handleLogoutClick}>
                               <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Logout
                           </MenuItem>
                       </Menu>
                   </Box>
               </Toolbar>
            </AppBar>

            {/* Navigation Drawer (Sidebar) */}
            <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="navigation drawer">
                {/* Temporary Drawer for mobile */}
                <Drawer
                    variant="temporary" open={mobileOpen} onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }} // Better open performance on mobile.
                    sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
                >
                    {drawerContent}
                </Drawer>
                {/* Permanent Drawer for desktop */}
                <Drawer
                    variant="permanent" open
                    sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}
                >
                    {drawerContent}
                </Drawer>
            </Box>

             {/* Main Content Area */}
            <Box component="main" sx={{
                flexGrow: 1, // Takes remaining width
                p: 3, // Padding around content
                width: { sm: `calc(100% - ${drawerWidth}px)` }, // Adjust width for drawer
                minHeight: '100vh', // Ensure it takes full viewport height
                bgcolor: theme.palette.background.default // Apply background color from theme
            }} >
                {/* Toolbar acts as a spacer to push content below the fixed AppBar */}
                <Toolbar />
                {/* Outlet renders the appropriate page component based on the nested route */}
                <Outlet />
            </Box>
        </Box>
    );
}

export default StudentLayout;