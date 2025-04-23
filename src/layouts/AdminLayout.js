import React, { useState } from 'react';
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom';
import { Box, Drawer, AppBar, Toolbar, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, CssBaseline, IconButton, Divider, Avatar, Menu, MenuItem, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import GroupIcon from '@mui/icons-material/Group';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import platformLogo from '../logo-myits-white.svg';

const drawerWidth = 240;

// Receive onLogout function as a prop
function AdminLayout({ onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorElUser, setAnchorElUser] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const location = useLocation(); // To highlight the active link

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleOpenUserMenu = (event) => setAnchorElUser(event.currentTarget);
  const handleCloseUserMenu = () => setAnchorElUser(null);

  const handleLogoutClick = () => {
    handleCloseUserMenu();
    onLogout(); // Call the logout function passed from App.js
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/admin' },
    { text: 'Exams', icon: <AssignmentIcon />, path: '/admin/exams' },
    { text: 'Users', icon: <GroupIcon />, path: '/admin/usergroups' },
    // { text: 'Question Bank', icon: <QuestionAnswerIcon />, path: '/admin/questions' },
    // { text: 'Users', icon: <PeopleIcon />, path: '/admin/users' },
    // { text: 'Results', icon: <BarChartIcon />, path: '/admin/results' },
    // { text: 'Settings', icon: <SettingsIcon />, path: '/admin/settings' },
  ];

  const drawerContent = (
    <div>
      <Toolbar sx={{
                      justifyContent: 'center',   // Center the content (logo + text group)
                      bgcolor: theme.palette.primary.main,
                      color: theme.palette.primary.contrastText,
                      alignItems: 'center' // Ensure items align vertically in the center
                  }}>
                      {/* Logo using Box component */}
                      <Box
                          component="img"
                          sx={{
                              height: 30, // Adjust height as needed
                              mr: 1.5,    // Add margin to the right (theme spacing units)
                              // verticalAlign: 'middle' // Alternative alignment if needed
                          }}
                          alt="MyITS Platform Logo" // Important for accessibility
                          src={platformLogo} // Use the imported logo variable
                      />
      
                      {/* Your Title */}
                      <Typography variant="h6" noWrap component="div">
                          Admin
                      </Typography>
                  </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              selected={location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path))} // Highlight active link
              onClick={isMobile ? handleDrawerToggle : undefined} // Close drawer on mobile click
              sx={{
                '&.Mui-selected': {
                  backgroundColor: theme.palette.action.selected,
                  '&:hover': {
                    backgroundColor: theme.palette.action.hover,
                  },
                  '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                     color: theme.palette.primary.main, // Highlight color for icon and text
                     fontWeight: 600
                  }
                }
              }}
            >
              <ListItemIcon sx={{minWidth: 40}}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: theme.palette.background.paper, // White AppBar
          color: theme.palette.text.primary, // Dark text
        }}
        elevation={1} // Subtle shadow
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
             {/* You could display the current page title here dynamically */}
          </Typography>
          <Box sx={{ flexGrow: 0 }}>
              <Tooltip title="User Options">
                <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
                  <Avatar alt="Admin User" sx={{ bgcolor: theme.palette.secondary.main }}>A</Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                sx={{ mt: '45px' }}
                id="menu-appbar"
                anchorEl={anchorElUser}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                keepMounted
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                open={Boolean(anchorElUser)}
                onClose={handleCloseUserMenu}
              >
                {/* <MenuItem onClick={handleCloseUserMenu}> // Add Profile page later
                  <ListItemIcon><AccountCircleIcon fontSize="small" /></ListItemIcon>
                  Profile
                </MenuItem>
                <Divider /> */}
                <MenuItem onClick={handleLogoutClick}>
                  <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="mailbox folders"
      >
        <Drawer
          variant={isMobile ? "temporary" : "permanent"}
          open={isMobile ? mobileOpen : true}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }} // Better open performance on mobile.
          sx={{
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3, // Padding around content
           // bgcolor: theme.palette.background.default, // Apply background color
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh' // Ensure content area takes full height
        }}
      >
        <Toolbar /> {/* Necessary spacer for content below AppBar */}
        {/* The actual page content renders here */}
        <Outlet />
      </Box>
    </Box>
  );
}

export default AdminLayout;