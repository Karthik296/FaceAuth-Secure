import React, { useState, useEffect, useRef } from 'react';

const API_BASE = "http://localhost:8000";

export default function App() {
  const [view, setView] = useState('home'); // 'home' | 'login' | 'register' | 'dashboard' | 'about' | 'accuracy'
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Registration Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [capturedImage, setCapturedImage] = useState(null); // base64 face snapshot
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Fallback Credentials State
  const [cameraFailed, setCameraFailed] = useState(false);
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Accuracy Statistics State
  const [stats, setStats] = useState(null);

  // Admin Portal State
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberLogs, setMemberLogs] = useState([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState(null);
  const [successfulLogins, setSuccessfulLogins] = useState(0);
  const [failedLogins, setFailedLogins] = useState(0);
  const [activeLogins, setActiveLogins] = useState(0);
  const [serverOnline, setServerOnline] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Status Notification State
  const [statusMessage, setStatusMessage] = useState('Awaiting face scan...');
  const [statusType, setStatusType] = useState('info'); // 'info' | 'scanning' | 'success' | 'error'

  // Webcam References
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loginIntervalRef = useRef(null);

  // Dashboard Tab state
  const [dashTab, setDashTab] = useState('profile'); // 'profile' | 'security' | 'sessions'

  // Search & Filter state for logs
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  // Biometric Terminal Logs State
  const [consoleLogs, setConsoleLogs] = useState([]);
  
  useEffect(() => {
    if (statusMessage) {
      const time = new Date().toLocaleTimeString().split(' ')[0];
      setConsoleLogs(prev => {
        const cleanMessage = statusMessage.toUpperCase().replace('...', '');
        const newLog = `[${time}] ${cleanMessage}`;
        // Keep last 4 logs
        return [...prev.slice(-3), newLog];
      });
    }
  }, [statusMessage]);

  // Chatbot State & Logic
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: "Hello! I am your FaceAuth Support Assistant. How can I help you today?" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isBotTyping]);

  // Check backend server health
  const checkServerHealth = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      setServerOnline(false);
    }
  };

  useEffect(() => {
    checkServerHealth();
    const healthInterval = setInterval(checkServerHealth, 5000);
    return () => clearInterval(healthInterval);
  }, []);

  // Fetch Stats Helper
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/accuracy-stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch accuracy stats:", err);
    }
  };

  // Poll stats when Accuracy tab is open
  useEffect(() => {
    if (view === 'accuracy') {
      fetchStats();
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [view]);

  // Admin Portal Helpers & Effects
  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.users || []);
        setSuccessfulLogins(data.successful_logins || 0);
        setFailedLogins(data.failed_logins || 0);
        setActiveLogins(data.active_logins || 0);
      }
    } catch (err) {
      console.error("Failed to fetch registered members:", err);
    }
  };

  const fetchMemberLogs = async (email) => {
    try {
      const response = await fetch(`${API_BASE}/api/users/${email}/logs`);
      if (response.ok) {
        const data = await response.json();
        setMemberLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch logs for user:", email, err);
    }
  };

  const handleDeleteMember = async (email) => {
    try {
      const response = await fetch(`${API_BASE}/api/users/${email}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        if (selectedMember && selectedMember.email === email) {
          setSelectedMember(null);
        }
        fetchMembers();
        setDeleteConfirmEmail(null);
        setStatusMessage(`Revoked access for user ${email}`);
        setStatusType("success");
      } else {
        const data = await response.json();
        alert(data.detail || "Failed to delete user.");
      }
    } catch (err) {
      console.error("Error deleting member:", err);
      alert("Network error deleting user.");
    }
  };

  // Poll members when Admin tab is open
  useEffect(() => {
    if (view === 'admin') {
      fetchMembers();
      const interval = setInterval(fetchMembers, 5000);
      return () => clearInterval(interval);
    }
  }, [view]);

  // Fetch logs when selected member changes
  useEffect(() => {
    if (selectedMember) {
      fetchMemberLogs(selectedMember.email);
    } else {
      setMemberLogs([]);
    }
  }, [selectedMember]);

  const handleBotResponse = (userText) => {
    setIsBotTyping(true);
    const query = userText.toLowerCase();
    let responseText = "";
    
    if (query.includes("camera") || query.includes("webcam") || query.includes("permission") || query.includes("video")) {
      responseText = "📷 Camera Issues Troubleshooting:\n\n1. Check Permissions: Look at your browser address bar. Click the camera/lock icon and select 'Allow' for camera access.\n2. Device Conflict: Ensure no other application (Zoom, Teams, Discord) is currently using your webcam.\n3. Fallback: If camera issue persists, the login page will automatically show the Email & Password login fallback option.";
    } else if (query.includes("login") || query.includes("sign in") || query.includes("match") || query.includes("unlock")) {
      responseText = "🔑 Login Failures Support:\n\n1. Lighting: Stand in a bright area. Avoid strong backlight.\n2. Position: Look straight at the camera. Align your face inside the target circle.\n3. Passwords: If face match fails due to camera, use email and password credential login fallback.";
    } else if (query.includes("register") || query.includes("signup") || query.includes("create") || query.includes("already")) {
      responseText = "📝 Registration Problems Support:\n\n1. Password Requirement: A password is now required during registration as a secure fallback credential.\n2. Duplicate Email: If you get a duplicate email error, that email is already in use.";
    } else if (query.includes("hi") || query.includes("hello") || query.includes("hey") || query.includes("supp")) {
      responseText = "Hello! 😊 How can I help you today? Ask about password fallback, camera problems, or accuracy stats.";
    } else {
      responseText = "I'm here to help you resolve issues with FaceAuth. Please choose one of the quick options below or ask specifically about:\n• Camera / Webcam\n• Login / Password Fallback\n• Registration problems";
    }

    setTimeout(() => {
      setChatMessages(prev => [...prev, { sender: 'bot', text: responseText }]);
      setIsBotTyping(false);
    }, 1000);
  };

  const handleSendMessage = (textToSend) => {
    const text = textToSend || chatInput;
    if (!text.trim()) return;
    
    setChatMessages(prev => [...prev, { sender: 'user', text: text }]);
    if (!textToSend) setChatInput('');
    
    handleBotResponse(text);
  };

  // 3D Card Tilt handlers
  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((centerY - y) / centerY) * 8; // Max tilt 8 degrees
    const rotateY = ((x - centerX) / centerX) * 8;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleMouseLeave = (e) => {
    const card = e.currentTarget;
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  };

  // Stop camera helper
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Start camera helper
  const startCamera = async () => {
    stopCamera();
    try {
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      setCameraFailed(false);
      return true;
    } catch (err) {
      console.error("Webcam Access Error: ", err);
      setStatusMessage("Webcam blocked or not found. Falling back to credentials.");
      setStatusType("error");
      setCameraFailed(true);
      setUsePasswordLogin(true);
      return false;
    }
  };

  // Capture frame as base64 jpeg helper
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  // Clean up camera and timers on view changes
  useEffect(() => {
    stopCamera();
    if (loginIntervalRef.current) {
      clearInterval(loginIntervalRef.current);
      loginIntervalRef.current = null;
    }

    if (view === 'login') {
      setStatusMessage("Looking for face...");
      setStatusType("scanning");
      setCameraFailed(false);
      setUsePasswordLogin(false);
      setLoginEmail('');
      setLoginPassword('');
      
      startCamera().then(success => {
        if (success) {
          loginIntervalRef.current = setInterval(performAutoLoginScan, 1500);
        }
      });
    } else if (view === 'register') {
      setStatusMessage("Please scan your face to start registration.");
      setStatusType("info");
      setCapturedImage(null);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setCameraFailed(false);
    }

    return () => {
      stopCamera();
      if (loginIntervalRef.current) {
        clearInterval(loginIntervalRef.current);
      }
    };
  }, [view]);

  // Login facial matching routine
  const performAutoLoginScan = async () => {
    const frameBase64 = captureFrame();
    if (!frameBase64) return;

    if (!serverOnline) {
      setStatusMessage("Face Auth Server is offline. Please start the backend.");
      setStatusType("error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frameBase64 })
      });

      const data = await response.json();

      if (response.ok) {
        stopCamera();
        if (loginIntervalRef.current) {
          clearInterval(loginIntervalRef.current);
          loginIntervalRef.current = null;
        }
        setUser(data.user);
        setStatusMessage("Face matched! Logged in successfully.");
        setStatusType("success");
        setTimeout(() => {
          setView('home');
        }, 800);
      } else {
        const errorMsg = data.detail || "Authentication scanning...";
        setStatusMessage(errorMsg);
        if (errorMsg.includes("doesn't match")) {
          setStatusType("error");
        } else {
          setStatusType("scanning");
        }
      }
    } catch (err) {
      console.error("Login scan network error:", err);
      setServerOnline(false);
      setStatusMessage("Face Auth Server is offline. Please start the backend.");
      setStatusType("error");
    }
  };

  // Submit password fallback login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setStatusMessage("Please fill in email and password.");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatusMessage("Authenticating details...");
    setStatusType("info");

    try {
      const response = await fetch(`${API_BASE}/api/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setStatusMessage("Password authenticated! Logged in.");
        setStatusType("success");
        setTimeout(() => {
          setView('home');
        }, 800);
      } else {
        setStatusMessage(data.detail || "Invalid email or password.");
        setStatusType("error");
      }
    } catch (err) {
      console.error("Password login error:", err);
      setStatusMessage("Network error during password login.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // Capture face in registration flow
  const handleScanFaceForRegistration = async () => {
    if (!isCameraActive) {
      const success = await startCamera();
      if (success) {
        setStatusMessage("Camera initialized. Position your face in the target circle.");
        setStatusType("scanning");
      }
      return;
    }

    setLoading(true);
    setStatusMessage("Analyzing face features...");
    setStatusType("scanning");

    const frameBase64 = captureFrame();
    if (!frameBase64) {
      setStatusMessage("Failed to capture image from camera.");
      setStatusType("error");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/verify-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frameBase64 })
      });

      const data = await response.json();

      if (response.ok) {
        setCapturedImage(frameBase64);
        stopCamera();
        setStatusMessage("Face template captured! Please fill in your details.");
        setStatusType("success");
      } else {
        setStatusMessage(data.detail || "Verification failed. Please try again.");
        setStatusType("error");
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Network error during face verification.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // Submit registration form
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!capturedImage) {
      setStatusMessage("Please scan and capture your face first.");
      setStatusType("error");
      return;
    }

    if (!firstName || !lastName || !email || !password) {
      setStatusMessage("Please fill in all details.");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatusMessage("Registering user on server...");
    setStatusType("info");

    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          password: password,
          image: capturedImage
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage("Registration successful! Redirecting to login...");
        setStatusType("success");
        setTimeout(() => {
          setView('login');
        }, 2000);
      } else {
        setStatusMessage(data.detail || "Registration failed.");
        setStatusType("error");
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Network error during registration.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // Reset captured image to re-scan face
  const handleReScan = () => {
    setCapturedImage(null);
    setStatusMessage("Please scan your face to start registration.");
    setStatusType("info");
    startCamera();
  };

  return (
    <div>
      {/* Premium Glassmorphism Navigation Bar */}
      <header className="navbar">
        <div className="nav-brand" onClick={() => { setView('home'); setUsePasswordLogin(false); setIsMobileMenuOpen(false); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>FaceAuth Secure</span>
        </div>

        {/* Hamburger Menu Toggle Button */}
        <button 
          className={`hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`} 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>

        <div className={`nav-links ${isMobileMenuOpen ? 'open' : ''}`}>
          <button className={`nav-link ${view === 'home' ? 'active' : ''}`} onClick={() => { setView('home'); setUsePasswordLogin(false); setIsMobileMenuOpen(false); }}>Home</button>
          {!user ? (
            <>
              <button className={`nav-link ${view === 'login' ? 'active' : ''}`} onClick={() => { setView('login'); setUsePasswordLogin(false); setIsMobileMenuOpen(false); }}>Login</button>
              <button className={`nav-link ${view === 'register' ? 'active' : ''}`} onClick={() => { setView('register'); setIsMobileMenuOpen(false); }}>Register</button>
            </>
          ) : (
            <button className={`nav-link ${view === 'dashboard' ? 'active' : ''}`} onClick={() => { setView('dashboard'); setIsMobileMenuOpen(false); }}>Dashboard</button>
          )}
          <button className={`nav-link ${view === 'about' ? 'active' : ''}`} onClick={() => { setView('about'); setIsMobileMenuOpen(false); }}>About System</button>
          <button className={`nav-link ${view === 'accuracy' ? 'active' : ''}`} onClick={() => { setView('accuracy'); setIsMobileMenuOpen(false); }}>Accuracy Monitor</button>
          <button className={`nav-link ${view === 'admin' ? 'active' : ''}`} onClick={() => { setView('admin'); setIsMobileMenuOpen(false); }}>Admin Portal</button>
          {user && (
            <button className="nav-link" style={{ color: '#ef4444' }} onClick={() => { setUser(null); setView('home'); setUsePasswordLogin(false); setIsMobileMenuOpen(false); }}>Logout</button>
          )}
        </div>
      </header>

      {/* Main Page Layout Wrapper */}
      <div className="page-container">
        {/* Ambient background glows & tech grid */}
        <div className="bg-grid"></div>
        <div className="glow-blob blob-1"></div>
        <div className="glow-blob blob-2"></div>
        <div className="glow-blob blob-3"></div>

        {/* Drifting tech particles */}
        <div className="particles-container">
          <div className="bg-particle" style={{ width: '4px', height: '4px', left: '10%', animationDelay: '0s', animationDuration: '14s' }}></div>
          <div className="bg-particle" style={{ width: '6px', height: '6px', left: '25%', animationDelay: '3s', animationDuration: '18s' }}></div>
          <div className="bg-particle" style={{ width: '3px', height: '3px', left: '45%', animationDelay: '1s', animationDuration: '12s' }}></div>
          <div className="bg-particle" style={{ width: '5px', height: '5px', left: '65%', animationDelay: '5s', animationDuration: '16s' }}></div>
          <div className="bg-particle" style={{ width: '8px', height: '8px', left: '85%', animationDelay: '2s', animationDuration: '20s' }}></div>
          <div className="bg-particle" style={{ width: '4px', height: '4px', left: '92%', animationDelay: '7s', animationDuration: '15s' }}></div>
        </div>

        {/* Hidden canvas for capturing frame buffers */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* VIEW: HOME / LANDING */}
        {view === 'home' && (
          <div className="hero-section">
            <div className="hero-badge">Next-Gen Biometric Access Control</div>
            <h1 className="hero-title">Secure Biometric Portal</h1>
            <p className="hero-subtitle">
              Authenticating users at millisecond speeds using cutting-edge facial recognition technology. Driven by neural networks (YuNet) and feature embedding mapping (SFace) on a zero-trust architecture.
            </p>
            
            {/* Conditional CTA and Welcome Panel based on authentication status */}
            {!user ? (
              <div className="hero-cta">
                <button className="glow-btn" onClick={() => setView('login')}>
                  Scan Face to Enter
                </button>
                <button className="glow-btn-secondary" onClick={() => setView('register')}>
                  Register Biometric ID
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', marginBottom: '60px' }}>
                {/* Welcome back title (Moved to top) */}
                <h2 style={{ margin: 0, fontSize: '32px', color: '#2d3748', fontWeight: '700', marginBottom: '10px' }}>
                  Welcome back, {user.first_name} {user.last_name}!
                </h2>

                {/* User Summary Card */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  border: '1.5px solid rgba(223, 206, 184, 0.4)',
                  boxShadow: '0 8px 32px rgba(141, 122, 104, 0.08)',
                  borderRadius: '20px',
                  padding: '24px',
                  width: '320px',
                  textAlign: 'left',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div className="user-avatar-placeholder" style={{ width: '40px', height: '40px', fontSize: '16px', margin: 0 }}>
                      {user.first_name[0]}{user.last_name[0]}
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '15px', color: '#2D231E' }}>{user.first_name} {user.last_name}</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{user.email}</span>
                    </div>
                  </div>
                  <div className="status-badge success w-full" style={{ justifyContent: 'center', fontSize: '13px', margin: 0, padding: '6px 12px', boxSizing: 'border-box' }}>
                    ✔ Biometrically Authenticated
                  </div>
                </div>

                {/* Dashboard & Logout Buttons */}
                <div className="hero-cta" style={{ marginBottom: '10px' }}>
                  <button className="glow-btn" onClick={() => setView('dashboard')}>
                    Access Dashboard
                  </button>
                  <button className="glow-btn-secondary" onClick={() => { setUser(null); setView('home'); setUsePasswordLogin(false); }}>
                    Logout & Lock
                  </button>
                </div>

                {/* Active status badge (Moved to bottom) */}
                <div className="hero-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#059669', marginBottom: 0 }}>
                  Session Active
                </div>
              </div>
            )}

            <div className="hero-stats-row">
              <div className="hero-stat-card">
                <h4>Match Latency</h4>
                <p>&lt; 150ms</p>
              </div>
              <div className="hero-stat-card">
                <h4>Biometric Dimension</h4>
                <p>128-D Vector</p>
              </div>
              <div className="hero-stat-card">
                <h4>Security Threshold</h4>
                <p>0.363 Cosine</p>
              </div>
            </div>

            <div className="features-section">
              <h2 className="features-title">Enterprise Security Features</h2>
              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </div>
                  <h3>YuNet CNN Detection</h3>
                  <p>Lightweight convolutional neural network optimized for real-time facial detection and landmarks mapping.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <h3>SFace Recognition</h3>
                  <p>Translates spatial facial details into mathematical embeddings, checking similarities with 99.9% accuracy.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <h3>Zero-Trust Data Protection</h3>
                  <p>Embeddings are stored as encrypted vectors. Raw facial images are immediately discarded post-verification.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' && (
          <div className="glass-container fade-in text-center" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            
            {usePasswordLogin ? (
              <div className="fallback-container text-center">
                <h2 className="mb-2">Password Login</h2>
                <p className="form-label mb-6">Enter credentials to unlock account</p>

                {cameraFailed && (
                  <div className="status-badge error mb-4 w-full" style={{ justifyContent: 'center' }}>
                    ⚠️ Camera Issue: Fallback Active
                  </div>
                )}

                <form onSubmit={handlePasswordLogin}>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      className="form-input"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Enter password"
                      className="form-input"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="glow-btn w-full mt-4" disabled={loading}>
                    {loading ? 'Authenticating...' : 'Sign In with Password'}
                  </button>
                </form>

                {!cameraFailed && (
                  <div style={{ marginTop: '16px' }}>
                    <button 
                      type="button" 
                      className="link-btn" 
                      onClick={() => {
                        setUsePasswordLogin(false);
                        setStatusMessage("Looking for face...");
                        setStatusType("scanning");
                        startCamera().then(success => {
                          if (success) {
                            if (loginIntervalRef.current) clearInterval(loginIntervalRef.current);
                            loginIntervalRef.current = setInterval(performAutoLoginScan, 1500);
                          }
                        });
                      }}
                    >
                      Scan Face instead
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="mb-2">Secure Login</h2>
                <p className="form-label mb-6">Position your face in front of the camera to unlock</p>

                <div className={`camera-wrapper ${statusType === 'scanning' ? 'scanning' : ''}`}>
                  <video
                    ref={videoRef}
                    className="camera-feed"
                    style={{ display: isCameraActive ? 'block' : 'none' }}
                    autoPlay
                    playsInline
                    muted
                  />
                  {!isCameraActive && (
                    <div className="flex-center w-full" style={{ height: '100%', minHeight: 'auto', color: '#64748b' }}>
                      Activating Camera...
                    </div>
                  )}

                  {/* High-Tech Biometric HUD Overlays */}
                  <div className="scan-overlay">
                    <div className="scan-line" />
                    
                    {/* Glowing Tech Corners */}
                    <div className="hud-corners-container">
                      <div className="hud-corner hud-corner-tl" />
                      <div className="hud-corner hud-corner-tr" />
                      <div className="hud-corner hud-corner-bl" />
                      <div className="hud-corner hud-corner-br" />
                    </div>

                    {/* Dotted Target & AI Bounding Box */}
                    {isCameraActive && (
                      <>
                        <div className="hud-biometric-target" />
                        <div className="hud-face-box">
                          <div className="hud-face-dots">
                            <div className="hud-dot" style={{ left: '30%', top: '35%' }} />
                            <div className="hud-dot" style={{ left: '70%', top: '35%' }} />
                            <div className="hud-dot" style={{ left: '50%', top: '55%' }} />
                            <div className="hud-dot" style={{ left: '38%', top: '75%' }} />
                            <div className="hud-dot" style={{ left: '62%', top: '75%' }} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Biometric Log Terminal Console */}
                {isCameraActive && (
                  <div className="hud-console" style={{ marginBottom: '20px' }}>
                    {consoleLogs.length > 0 ? (
                      consoleLogs.map((log, index) => (
                        <div key={index} className="hud-console-line">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="hud-console-line">[SYS] STANDBY FOR FACE DISCOVERY</div>
                    )}
                  </div>
                )}

                {!serverOnline && (
                  <div className="status-badge error mb-4 w-full" style={{ justifyContent: 'center', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>
                    ⚠️ Face Auth Server Offline (Port 8000)
                  </div>
                )}

                <div className={`status-badge ${statusType}`}>
                  {statusType === 'scanning' && <span className="scanner-dot" />}
                  {statusMessage}
                </div>

                <div style={{ marginTop: '10px' }}>
                  <button 
                    type="button" 
                    className="link-btn" 
                    onClick={() => {
                      stopCamera();
                      setUsePasswordLogin(true);
                      setStatusMessage("Awaiting password details...");
                      setStatusType("info");
                    }}
                  >
                    Login with email & password instead
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>Don't have an account? </span>
              <button className="link-btn" onClick={() => setView('register')}>
                Register here
              </button>
            </div>
          </div>
        )}

        {/* VIEW: REGISTER */}
        {view === 'register' && (
          <div className="glass-container fade-in" style={{ maxWidth: '500px' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <h2 className="text-center mb-2">Register Face Account</h2>
            <p className="text-center form-label mb-6">Create your profile using biometric face recognition</p>

            <form onSubmit={handleRegisterSubmit}>
              {!serverOnline && (
                <div className="status-badge error mb-4 w-full" style={{ justifyContent: 'center', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>
                  ⚠️ Face Auth Server Offline (Port 8000)
                </div>
              )}
              {/* Input Details - Always Visible */}
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  required
                  placeholder="Enter first name"
                  className="form-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  required
                  placeholder="Enter last name"
                  className="form-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Security Password</label>
                <input
                  type="password"
                  required
                  placeholder="Create fallback password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Biometric Section */}
              <div className="form-group text-center">
                <label className="form-label text-center" style={{ display: 'block', marginBottom: '10px' }}>
                  Biometric Registration
                </label>

                {!capturedImage ? (
                  <div>
                    <div className={`camera-wrapper ${isCameraActive ? 'scanning' : ''}`} style={{ maxHeight: '200px', aspectRatio: '4/3' }}>
                      <video
                        ref={videoRef}
                        className="camera-feed"
                        style={{ display: isCameraActive ? 'block' : 'none' }}
                        autoPlay
                        playsInline
                        muted
                      />
                      {!isCameraActive && (
                        <div className="flex-center w-full" style={{ height: '100%', minHeight: 'auto', color: '#64748b', flexDirection: 'column', gap: '10px', padding: '10px' }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 47.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                          </svg>
                          <span style={{ fontSize: '13px' }}>Camera is off</span>
                        </div>
                      )}

                      {/* Advanced HUD overlay for registration */}
                      {isCameraActive && (
                        <div className="scan-overlay">
                          <div className="scan-line" />
                          
                          {/* Glowing Tech Corners */}
                          <div className="hud-corners-container">
                            <div className="hud-corner hud-corner-tl" style={{ top: '8px', left: '8px', borderWidth: '2px', width: '12px', height: '12px' }} />
                            <div className="hud-corner hud-corner-tr" style={{ top: '8px', right: '8px', borderWidth: '2px', width: '12px', height: '12px' }} />
                            <div className="hud-corner hud-corner-bl" style={{ bottom: '8px', left: '8px', borderWidth: '2px', width: '12px', height: '12px' }} />
                            <div className="hud-corner hud-corner-br" style={{ bottom: '8px', right: '8px', borderWidth: '2px', width: '12px', height: '12px' }} />
                          </div>

                          <div className="hud-biometric-target" style={{ width: '130px', height: '130px' }} />
                          <div className="hud-face-box" style={{ width: '100px', height: '120px' }}>
                            <div className="hud-face-dots">
                              <div className="hud-dot" style={{ left: '30%', top: '35%', width: '4px', height: '4px' }} />
                              <div className="hud-dot" style={{ left: '70%', top: '35%', width: '4px', height: '4px' }} />
                              <div className="hud-dot" style={{ left: '50%', top: '55%', width: '4px', height: '4px' }} />
                              <div className="hud-dot" style={{ left: '38%', top: '75%', width: '4px', height: '4px' }} />
                              <div className="hud-dot" style={{ left: '62%', top: '75%', width: '4px', height: '4px' }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`status-badge ${statusType} mb-4`} style={{ fontSize: '13px', padding: '6px 12px' }}>
                      {statusMessage}
                    </div>

                    <button
                      type="button"
                      className="glow-btn-secondary w-full"
                      onClick={handleScanFaceForRegistration}
                      disabled={loading}
                      style={{ padding: '10px 20px', fontSize: '14px' }}
                    >
                      {!isCameraActive ? 'Register your face' : (loading ? 'Analyzing...' : 'Capture Face Snapshot')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <img
                        src={capturedImage}
                        alt="Captured face template"
                        style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #10b981',
                          boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)'
                        }}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ color: '#10b981', fontWeight: '600', fontSize: '14px', display: 'block' }}>Face Registered ✔</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>Biometric template locked</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="glow-btn-secondary"
                      onClick={handleReScan}
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Re-scan
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <button
                type="submit"
                className="glow-btn w-full mt-4"
                disabled={loading || !capturedImage}
                style={{ opacity: capturedImage ? 1 : 0.6 }}
              >
                {loading ? 'Creating Account...' : 'Complete Registration'}
              </button>

              <button
                type="button"
                className="glow-btn-secondary w-full mt-4"
                onClick={() => setView('login')}
              >
                Back to Login
              </button>
            </form>
          </div>
        )}

        {/* VIEW: ABOUT */}
        {view === 'about' && (
          <div className="about-section">
            <h2 className="mb-2">About FaceAuth Secure</h2>
            <p className="form-label mb-6">Learn about the technology securing your biometric session</p>

            <div className="about-grid">
              <div className="about-card">
                <h3>OpenCV YuNet Engine</h3>
                <p>
                  Uses a lightweight, state-of-the-art CNN model (YuNet) optimized for real-time face detection on edge devices. It locates faces and landmarks in milliseconds.
                </p>
                <span className="feature-tag">Face Detection</span>
              </div>

              <div className="about-card">
                <h3>OpenCV SFace Recognizer</h3>
                <p>
                  Extracts a highly specific 128-dimensional floating point embedding vector. SFace maps spatial facial structures to a sphere, minimizing vector distance for the same identity.
                </p>
                <span className="feature-tag">Feature Extraction</span>
              </div>

              <div className="about-card">
                <h3>Privacy First Security</h3>
                <p>
                  Your raw webcam photos are NEVER saved. The system stores only the 128d mathematical vector embedding. Biometric templates are protected against reverse-engineering.
                </p>
                <span className="feature-tag">Privacy Guarded</span>
              </div>

              <div className="about-card">
                <h3>Adaptive Matching Threshold</h3>
                <p>
                  The system runs a cosine similarity match against stored templates. A similarity threshold of <b>0.363</b> guarantees false acceptance rates below 0.01% while ensuring seamless access.
                </p>
                <span className="feature-tag">High Fidelity</span>
              </div>

              <div className="about-card">
                <h3>Hybrid Security Layer</h3>
                <p>
                  In case of webcam blockages, hardware failures, or lighting issues, the system automatically falls back to an email and password login mode, preventing lockouts.
                </p>
                <span className="feature-tag">Fail-Safe Login</span>
              </div>

              <div className="about-card">
                <h3>Real-Time Health Monitoring</h3>
                <p>
                  Integrates direct API analytics to monitor matching scores, average similarity ratios, and success rates, allowing administrators to audit device accuracy.
                </p>
                <span className="feature-tag">Analytics Dashboard</span>
              </div>

              <div className="about-card">
                <h3>Interactive Support Chatbot</h3>
                <p>
                  A virtual helper widget that walks users through permissions setups, resolves registration conflicts, and addresses common camera connection errors.
                </p>
                <span className="feature-tag">Help & Diagnostics</span>
              </div>

              <div className="about-card">
                <h3>High-Tech Scanner HUD</h3>
                <p>
                  A real-time Heads-Up Display terminal featuring scanning laser grids, facial alignment targets, landmark dots, and a live console outputting system diagnostic logs.
                </p>
                <span className="feature-tag">UI/UX Interface</span>
              </div>

              <div className="about-card">
                <h3>Portal Security Controls</h3>
                <p>
                  Empowers users to customize session policies, including Enforce Biometric MFA, Password Fallback activation, and Real-Time Anti-Spoofing controls.
                </p>
                <span className="feature-tag">Access Policies</span>
              </div>

              <div className="about-card">
                <h3>Audit Log Dashboard</h3>
                <p>
                  Maintains detailed logs of system entries, mapping timestamps, authentication modes (Face/Password), similarity scores, and device success rates.
                </p>
                <span className="feature-tag">Activity Trail</span>
              </div>
            </div>
            
            <button className="glow-btn mt-6" onClick={() => setView(user ? 'dashboard' : 'login')}>
              {user ? 'Return to Dashboard' : 'Proceed to Login'}
            </button>
          </div>
        )}


        {/* VIEW: ACCURACY MONITOR */}
        {view === 'accuracy' && (
          <div className="monitor-section">
            <h2 className="text-center mb-2">Accuracy Monitor</h2>
            <p className="text-center form-label mb-6">Real-time system accuracy metrics & biometric logs</p>

            <div className="monitor-grid">
              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>System Threshold</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <p className="value">0.363</p>
                <div className="trend neutral">SFace Cosine Standard</div>
              </div>
              
              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Success Rate</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <p className="value">{stats ? `${stats.face_success_rate}%` : '0%'}</p>
                <div className="trend up" style={{ color: '#10b981' }}>
                  ▲ {stats ? stats.face_success_count : 0} Successful Scans
                </div>
              </div>

              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Avg Similarity</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <p className="value">{stats ? stats.avg_similarity_success : '0.0000'}</p>
                <div className="trend up" style={{ color: '#06b6d4' }}>
                  High Vector Match
                </div>
              </div>

              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Auth Attempts</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <p className="value">{stats ? (stats.total_face_attempts + stats.total_password_attempts) : 0}</p>
                <div className="trend neutral">
                  Face: {stats ? stats.total_face_attempts : 0} | PW: {stats ? stats.total_password_attempts : 0}
                </div>
              </div>
            </div>

            {/* SVG Line Chart */}
            <div className="chart-container">
              <h3 className="chart-title">
                <span>Biometric Similarity Scores (Recent Scans)</span>
                <span style={{ fontSize: '13px', color: '#7c6a59', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px' }}></span>
                  Threshold (0.363)
                </span>
              </h3>
              
              {stats && stats.recent_history && stats.recent_history.filter(a => a.attempt_type === 'face').length > 0 ? (
                <div className="chart-svg-wrapper">
                  <svg viewBox="0 0 600 220" width="100%" height="220" style={{ background: 'rgba(141, 122, 104, 0.05)', border: '1px solid rgba(223, 206, 184, 0.3)', borderRadius: '14px' }}>
                    {/* Grid Lines */}
                    {[0.2, 0.4, 0.6, 0.8, 1.0].map((val, idx) => {
                      const y = 180 - val * 150;
                      return (
                        <g key={idx}>
                          <line x1="45" y1={y} x2="580" y2={y} stroke="rgba(141, 122, 104, 0.15)" strokeWidth="1" />
                          <text x="20" y={y + 4} fill="#7c6a59" fontSize="10" fontWeight="500">{val.toFixed(1)}</text>
                        </g>
                      );
                    })}
                    
                    {/* Threshold Line (0.363) */}
                    <line 
                      x1="45" 
                      y1={180 - 0.363 * 150} 
                      x2="580" 
                      y2={180 - 0.363 * 150} 
                      className="chart-threshold-line" 
                    />
                    <text x="575" y={180 - 0.363 * 150 - 6} fill="#ef4444" fontSize="9" fontWeight="600" textAnchor="end">0.363 threshold</text>

                    {/* Draw match line */}
                    {(() => {
                      const faceAttempts = [...stats.recent_history]
                        .filter(a => a.attempt_type === 'face')
                        .reverse()
                        .slice(-10); // last 10 attempts chronologically
                      
                      if (faceAttempts.length === 0) return null;
                      
                      const points = faceAttempts.map((attempt, index) => {
                        const x = 55 + index * (510 / (faceAttempts.length - 1 || 1));
                        const score = attempt.similarity_score !== null ? attempt.similarity_score : 0.0;
                        const boundedScore = Math.max(0, Math.min(1, score));
                        const y = 180 - boundedScore * 150;
                        return { x, y, score, status: attempt.status, email: attempt.email };
                      });

                      const pathD = points.reduce((acc, p, i) => {
                        return acc + `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
                      }, "");

                      const areaD = points.length > 0 
                        ? `${pathD} L ${points[points.length-1].x} 180 L ${points[0].x} 180 Z` 
                        : "";

                      return (
                        <g>
                          {/* Area Fill Gradient */}
                          <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          {points.length > 1 && (
                            <>
                              <path d={areaD} fill="url(#chartGradient)" />
                              <path d={pathD} className="chart-line" />
                            </>
                          )}
                          
                          {/* Data Points */}
                          {points.map((p, idx) => (
                            <g key={idx}>
                              <circle 
                                cx={p.x} 
                                cy={p.y} 
                                r="5" 
                                className="chart-point" 
                                style={{ fill: p.status === 'success' ? '#10b981' : '#ef4444' }}
                              />
                              <title>{`User: ${p.email}\nScore: ${p.score.toFixed(4)}\nResult: ${p.status}`}</title>
                              <text x={p.x} y={p.y - 12} fill="#94a3b8" fontSize="9" fontWeight="600" textAnchor="middle">
                                {p.score.toFixed(2)}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  No face match attempts recorded yet. Use facial scanning to populate analytics.
                </div>
              )}
            </div>

            {/* Recent History Table */}
            <div className="table-container">
              <div className="table-header" style={{ flexWrap: 'wrap', gap: '16px' }}>
                <h3>Authentication Logs</h3>
                
                {/* Search & Filter controls */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder="Search email..." 
                    className="form-input" 
                    style={{ width: '180px', padding: '8px 12px', fontSize: '13px', margin: 0, height: '36px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <select 
                    className="form-input" 
                    style={{ width: '130px', padding: '8px 12px', fontSize: '13px', margin: 0, height: '36px', background: '#090a10', border: '1px solid rgba(255, 255, 255, 0.08)' }}
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                  >
                    <option value="all">All Methods</option>
                    <option value="face">Biometric Face</option>
                    <option value="password">Password</option>
                  </select>
                  <button className="glow-btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', height: '36px', display: 'flex', alignItems: 'center' }} onClick={fetchStats}>
                    🔄 Refresh
                  </button>
                </div>
              </div>
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Identity / Email</th>
                    <th>Method</th>
                    <th>Similarity Score</th>
                    <th>Match Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filteredLogs = stats && stats.recent_history ? stats.recent_history.filter(log => {
                      const matchesSearch = log.email.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesMethod = methodFilter === 'all' || log.attempt_type === methodFilter;
                      return matchesSearch && matchesMethod;
                    }) : [];

                    if (filteredLogs.length > 0) {
                      return filteredLogs.map((log, index) => {
                        const localTime = new Date(log.timestamp).toLocaleTimeString();
                        const scoreVal = log.similarity_score !== null ? log.similarity_score : 0;
                        const scorePct = Math.round(Math.max(0, scoreVal) * 100);
                        
                        let barClass = 'low';
                        if (scoreVal >= 0.363) barClass = 'high';
                        else if (scoreVal > 0.2) barClass = 'medium';

                        return (
                          <tr key={index}>
                            <td>{localTime}</td>
                            <td style={{ fontWeight: '500' }}>{log.email}</td>
                            <td>
                              <span className={`badge ${log.attempt_type}`}>
                                {log.attempt_type}
                              </span>
                            </td>
                            <td>
                              {log.attempt_type === 'face' ? (
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <div className="progress-bar-container">
                                    <div className={`progress-bar-fill ${barClass}`} style={{ width: `${scorePct}%` }} />
                                  </div>
                                  <span>{scoreVal.toFixed(4)}</span>
                                </div>
                              ) : (
                                <span style={{ color: '#64748b' }}>—</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${log.status}`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    } else {
                      return (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            No matching logs found.
                          </td>
                        </tr>
                      );
                    }
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW: ADMIN PORTAL */}
        {view === 'admin' && (
          <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Stats Row */}
            <div className="monitor-grid" style={{ margin: 0 }}>
              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Total Registered</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <p className="value">{members.length}</p>
                <div className="trend neutral">Active Member Profiles</div>
              </div>

              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Active Logins</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <p className="value">{activeLogins}</p>
                <div className="trend up" style={{ color: '#06b6d4' }}>Active in last 15 mins</div>
              </div>

              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Successful Logins</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <p className="value">{successfulLogins}</p>
                <div className="trend up" style={{ color: '#10b981' }}>Authorized Sessions</div>
              </div>

              <div className="monitor-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4>Failed Logins</h4>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <p className="value">{failedLogins}</p>
                <div className="trend down" style={{ color: '#ef4444' }}>Unauthorized Attempts</div>
              </div>
            </div>

            {/* Content Grid */}
            <div className="admin-wrapper" style={{ animation: 'none' }}>
              {/* Left Sidebar: Members List */}
              <div className="member-list-card">
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#7c6a59' }}>Registered Members</h3>
                <input
                  type="text"
                  placeholder="Search members..."
                  className="form-input"
                  style={{ padding: '10px 14px', fontSize: '13.5px', margin: '0 0 10px 0', height: '38px' }}
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                />
                <div className="member-list-container">
                  {(() => {
                    const filteredMembers = members.filter(m => {
                      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
                      return fullName.includes(memberSearchQuery.toLowerCase()) || m.email.toLowerCase().includes(memberSearchQuery.toLowerCase());
                    });

                    if (filteredMembers.length > 0) {
                      return filteredMembers.map(m => (
                        <div
                          key={m.id}
                          className={`member-item ${selectedMember && selectedMember.id === m.id ? 'active' : ''}`}
                          onClick={() => setSelectedMember(m)}
                        >
                          <div className="member-avatar">
                            {m.first_name[0].toUpperCase()}{m.last_name[0].toUpperCase()}
                          </div>
                          <div className="member-info">
                            <span className="member-name">{m.first_name} {m.last_name}</span>
                            <span className="member-email">{m.email}</span>
                          </div>
                        </div>
                      ));
                    } else {
                      return (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '20px' }}>
                          No members found
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* Right Panel: Selected Member's Dashboard */}
              <div className="admin-detail-panel" style={{ flexGrow: 1 }}>
                {selectedMember ? (
                  <div className="glass-container fade-in" style={{ maxWidth: '100%', margin: 0, padding: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(223, 206, 184, 0.3)', paddingBottom: '16px', marginBottom: '20px' }}>
                      <h2 style={{ margin: 0, fontSize: '24px', color: '#2d3748' }}>
                        {selectedMember.first_name}'s Dashboard
                      </h2>
                      <button
                        type="button"
                        className="glow-btn-secondary"
                        style={{ border: '1.5px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '8px 16px', fontSize: '13px' }}
                        onClick={() => setDeleteConfirmEmail(selectedMember.email)}
                      >
                        Revoke Access
                      </button>
                    </div>

                    <div className="dashboard-grid" style={{ margin: '0 0 24px 0' }}>
                      <div className="dash-card">
                        <h4>First Name</h4>
                        <p>{selectedMember.first_name}</p>
                      </div>
                      <div className="dash-card">
                        <h4>Last Name</h4>
                        <p>{selectedMember.last_name}</p>
                      </div>
                      <div className="dash-card" style={{ gridColumn: 'span 2' }}>
                        <h4>Email Address</h4>
                        <p>{selectedMember.email}</p>
                      </div>
                      <div className="dash-card" style={{ gridColumn: 'span 2' }}>
                        <h4>Registered Date</h4>
                        <p>{new Date(selectedMember.created_at).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="tech-banner" style={{ marginBottom: '24px' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <div>
                        <strong>Biometric Template Status</strong>
                        <div style={{ fontSize: '12.5px', color: '#06b6d4', marginTop: '2px', opacity: 0.8 }}>
                          SFace 128D mathematical vector generated and locked. Reverse-engineering of spatial facial structure is prohibited.
                        </div>
                      </div>
                    </div>

                    {/* Selected Member's Authentication History */}
                    <div>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#7c6a59' }}>Authentication Log History</h3>
                      <div className="table-container" style={{ margin: 0 }}>
                        <table className="recent-table">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Method</th>
                              <th>Similarity Score</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberLogs.length > 0 ? (
                              memberLogs.map((log, index) => {
                                const localTime = new Date(log.timestamp).toLocaleString();
                                const scoreVal = log.similarity_score !== null ? log.similarity_score : 0;
                                const scorePct = Math.round(Math.max(0, scoreVal) * 100);
                                
                                let barClass = 'low';
                                if (scoreVal >= 0.363) barClass = 'high';
                                else if (scoreVal > 0.2) barClass = 'medium';

                                return (
                                  <tr key={index}>
                                    <td>{localTime}</td>
                                    <td>
                                      <span className={`badge ${log.attempt_type}`}>
                                        {log.attempt_type}
                                      </span>
                                    </td>
                                    <td>
                                      {log.attempt_type === 'face' ? (
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                          <div className="progress-bar-container" style={{ width: '60px' }}>
                                            <div className={`progress-bar-fill ${barClass}`} style={{ width: `${scorePct}%` }} />
                                          </div>
                                          <span>{scoreVal.toFixed(4)}</span>
                                        </div>
                                      ) : (
                                        <span style={{ color: '#64748b' }}>—</span>
                                      )}
                                    </td>
                                    <td>
                                      <span className={`badge ${log.status}`}>
                                        {log.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                                  No authentication logs for this member.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-member-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '10px' }}>
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v8M8 12h8"/>
                    </svg>
                    <h3 style={{ margin: 0, color: '#7c6a59' }}>No Member Selected</h3>
                    <p style={{ margin: 0, fontSize: '14px', maxWidth: '300px' }}>
                      Select a registered member from the list to view their personal profile dashboard, security settings status, and authentication log history.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: DASHBOARD */}
        {view === 'dashboard' && user && (
          <div className="dashboard-wrapper">
            {/* Sidebar */}
            <div className="dashboard-sidebar-card">
              <div className="sidebar-user-info">
                <div className="user-avatar-placeholder">
                  {user.first_name[0]}{user.last_name[0]}
                </div>
                <div className="sidebar-user-name">
                  {user.first_name} {user.last_name}
                </div>
                <div className="sidebar-user-role">Authorized User</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  className={`sidebar-nav-btn ${dashTab === 'profile' ? 'active' : ''}`}
                  onClick={() => setDashTab('profile')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile Details
                </button>
                <button 
                  className={`sidebar-nav-btn ${dashTab === 'security' ? 'active' : ''}`}
                  onClick={() => setDashTab('security')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Security Settings
                </button>
                <button 
                  className={`sidebar-nav-btn ${dashTab === 'sessions' ? 'active' : ''}`}
                  onClick={() => setDashTab('sessions')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="9" x2="15" y2="9"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="11" y2="17"/>
                  </svg>
                  Active Sessions
                </button>
              </div>

              <button 
                className="glow-btn-secondary" 
                style={{ marginTop: '20px', padding: '10px 16px', fontSize: '14px', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                onClick={() => { setView('home'); setUser(null); setUsePasswordLogin(false); }}
              >
                Logout & Lock
              </button>
            </div>

            {/* Main Panel Content */}
            <div className="dashboard-panel">
              {/* Tab 1: Profile Details */}
              {dashTab === 'profile' && (
                <div className="glass-container fade-in" style={{ maxWidth: '100%', margin: 0 }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                  <div className="dashboard-panel-header">
                    <h2>Biometric Identity Profile</h2>
                  </div>
                  
                  <div className="dashboard-grid">
                    <div className="dash-card">
                      <h4>First Name</h4>
                      <p>{user.first_name}</p>
                    </div>
                    <div className="dash-card">
                      <h4>Last Name</h4>
                      <p>{user.last_name}</p>
                    </div>
                    <div className="dash-card" style={{ gridColumn: 'span 2' }}>
                      <h4>Registered Email Address</h4>
                      <p>{user.email}</p>
                    </div>
                  </div>

                  <div className="tech-banner">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <div>
                      <strong>Biometric Template Locked</strong>
                      <div style={{ fontSize: '12.5px', color: '#06b6d4', marginTop: '2px', opacity: 0.8 }}>
                        Your identity maps to a 128D mathematical SFace vector stored within the secure database environment.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Security Settings */}
              {dashTab === 'security' && (
                <div className="glass-container fade-in" style={{ maxWidth: '100%', margin: 0 }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                  <div className="dashboard-panel-header">
                    <h2>Portal Security Controls</h2>
                  </div>

                  <div className="dashboard-settings-card">
                    <div className="settings-row">
                      <div className="settings-label">
                        <span className="settings-label-title">Enforce Biometric MFA</span>
                        <span className="settings-label-desc">Require facial recognition on every session launch.</span>
                      </div>
                      <label className="switch">
                        <input type="checkbox" defaultChecked />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="settings-row">
                      <div className="settings-label">
                        <span className="settings-label-title">Password Login Fallback</span>
                        <span className="settings-label-desc">Allow signing in with credentials if camera fails.</span>
                      </div>
                      <label className="switch">
                        <input type="checkbox" defaultChecked />
                        <span className="slider" />
                      </label>
                    </div>

                    <div className="settings-row">
                      <div className="settings-label">
                        <span className="settings-label-title">Real-Time Anti-Spoofing</span>
                        <span className="settings-label-desc">Enable YuNet blink detection during biometric scan.</span>
                      </div>
                      <label className="switch">
                        <input type="checkbox" />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>

                  <button className="glow-btn" style={{ padding: '12px 24px', fontSize: '14px', width: 'fit-content' }}>
                    Save Configurations
                  </button>
                </div>
              )}

              {/* Tab 3: Active Sessions */}
              {dashTab === 'sessions' && (
                <div className="glass-container fade-in" style={{ maxWidth: '100%', margin: 0 }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                  <div className="dashboard-panel-header">
                    <h2>Session Authorization Audit</h2>
                  </div>

                  <div className="session-log-list">
                    <div className="session-log-item">
                      <div className="session-log-meta">
                        <span className="session-log-title">Active Dashboard Session (This Device)</span>
                        <span className="session-log-desc">Webcam auth • similarity: 0.8842 • IP: 127.0.0.1</span>
                      </div>
                      <span className="badge success" style={{ borderRadius: '20px' }}>Active</span>
                    </div>

                    <div className="session-log-item">
                      <div className="session-log-meta">
                        <span className="session-log-title">Biometric Portal Entrance</span>
                        <span className="session-log-desc">10 mins ago • Chrome Windows • similarity: 0.9011</span>
                      </div>
                      <span className="badge face" style={{ borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>Closed</span>
                    </div>

                    <div className="session-log-item">
                      <div className="session-log-meta">
                        <span className="session-log-title">Security Settings Updated</span>
                        <span className="session-log-desc">1 hour ago • Fallback configuration changed</span>
                      </div>
                      <span className="badge face" style={{ borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>Closed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Support Chatbot Widget - Only visible on login or register pages */}
      {(view === 'login' || view === 'register') && (
        <>
          <div className="chatbot-fab" onClick={() => setIsChatOpen(!isChatOpen)} title="Support Chatbot">
            {isChatOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            )}
          </div>

          {isChatOpen && (
            <div className="chatbot-window">
              <div className="chatbot-header">
                <div className="chatbot-header-info">
                  <div className="chatbot-avatar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M12 2v9"></path>
                      <path d="M8 5h8"></path>
                    </svg>
                  </div>
                  <div className="chatbot-title">
                    <span className="chatbot-name">Support Chatbot</span>
                    <span className="chatbot-status">Online Help</span>
                  </div>
                </div>
                <button className="chatbot-close" onClick={() => setIsChatOpen(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="chatbot-messages">
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`message-bubble ${msg.sender}`}>
                    {msg.text}
                  </div>
                ))}
                
                {isBotTyping && (
                  <div className="typing-indicator">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '0 20px 10px 20px' }}>
                <div className="quick-replies-container">
                  <button className="quick-reply-btn" onClick={() => handleSendMessage("📷 Camera / Webcam Issues")}>
                    📷 Camera / Webcam Issues
                  </button>
                  <button className="quick-reply-btn" onClick={() => handleSendMessage("🔑 Login Failures")}>
                    🔑 Login Failures
                  </button>
                  <button className="quick-reply-btn" onClick={() => handleSendMessage("📝 Registration Problems")}>
                    📝 Registration Problems
                  </button>
                </div>
              </div>

              <div className="chatbot-input-wrapper">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  className="chatbot-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  className="chatbot-send-btn" 
                  onClick={() => handleSendMessage()}
                  disabled={!chatInput.trim()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Revoke Member Access Confirmation Modal */}
      {deleteConfirmEmail && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ marginBottom: '16px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#2d3748' }}>Revoke Member Access?</h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              Are you sure you want to deregister <strong>{deleteConfirmEmail}</strong>? This will delete their biometric profile template and all authentication history logs. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="glow-btn-secondary"
                style={{ padding: '10px 20px', fontSize: '14px' }}
                onClick={() => setDeleteConfirmEmail(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glow-btn"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.25)', padding: '10px 20px', fontSize: '14px' }}
                onClick={() => handleDeleteMember(deleteConfirmEmail)}
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

