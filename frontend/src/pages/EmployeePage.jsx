import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../App';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { MapContainer, TileLayer, Circle, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import FeedbackModal from '../components/FeedbackModal';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


// Helper to handle auto-zoom
const MapViewManager = ({ geofences, userLocation, centerTrigger }) => {
  const map = useMap();
  const [initialCentered, setInitialCentered] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(0);
  
  useEffect(() => {
    // 1. Manual trigger from button
    if (centerTrigger > lastTrigger && userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
      setLastTrigger(centerTrigger);
      return; 
    }

    // 2. Initial load focus
    if (!initialCentered) {
      if (userLocation) {
        map.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
        setInitialCentered(true);
      } 
      else if (geofences && geofences.length > 0) {
        if (geofences.length === 1) {
          map.setView([geofences[0].center.lat, geofences[0].center.lng], 16, { animate: true });
          setInitialCentered(true);
        } else {
          let avgLat = 0, avgLng = 0;
          geofences.forEach(gf => { avgLat += gf.center.lat; avgLng += gf.center.lng; });
          avgLat /= geofences.length;
          avgLng /= geofences.length;
          map.setView([avgLat, avgLng], 12, { animate: true });
          setInitialCentered(true);
        }
      }
    }
  }, [geofences, map, userLocation, centerTrigger, initialCentered, lastTrigger]);

  return null;
};

const EmployeePage = () => {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('LOADING');
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [locationSupported, setLocationSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [geofences, setGeofences] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  // New Tracking States
  const [lastInGeofenceTime, setLastInGeofenceTime] = useState(null);
  const [exitTimerStartTime, setExitTimerStartTime] = useState(null);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [countdown, setCountdown] = useState(300);

  const loadStatus = async () => {
    try {
      const res = await api.get('/employee/status');
      setStatus(res.data.status);
      setCheckInTime(res.data.checkInTime);
      setCheckOutTime(res.data.checkOutTime);
    } catch {
      setStatus('ERROR');
    }
  };

  const loadGeofences = async () => {
    try {
      const res = await api.get('/employee/geofence');
      setGeofences(Array.isArray(res.data) ? res.data : [res.data]);
    } catch (err) {
      console.error('Failed to load geofences', err);
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationSupported(false);
    }
    loadStatus();
    loadGeofences();

    let watchId;
    if (locationSupported && !isMockMode) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLocation(loc);
          if (status === 'CHECKED_IN' && geofences.length > 0) {
            let isAutoCheckOutEnabledForAny = false;
            let isSafeWindowForAny = false;
            let insideAnyStrictly = false;
            let completelyOutside = true;

            for (const gf of geofences) {
              if (gf.isAutoCheckoutEnabled !== false) isAutoCheckOutEnabledForAny = true;
              
              const now = new Date();
              const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              if (gf.safeWindows?.some(w => currentTime >= w.start && currentTime <= w.end)) {
                 isSafeWindowForAny = true;
              }

              const dist = haversineDistanceMeters(loc.lat, loc.lng, gf.center.lat, gf.center.lng);
              if (dist <= gf.radiusMeters + 15) insideAnyStrictly = true;
              if (dist <= gf.radiusMeters + 50) completelyOutside = false; // still within buffer of at least one gf
            }

            if (!isAutoCheckOutEnabledForAny) return;
            if (isSafeWindowForAny) return;

            if (insideAnyStrictly) {
              setLastInGeofenceTime(new Date());
              setExitTimerStartTime(null);
              setShowExitWarning(false);
              setCountdown(300);
            } else if (completelyOutside) {
              if (!exitTimerStartTime) {
                setExitTimerStartTime(new Date());
                setShowExitWarning(true);
              } else {
                const elapsed = (new Date() - new Date(exitTimerStartTime)) / 1000;
                if (elapsed >= 300) {
                  handleAutoCheckOut(loc, lastInGeofenceTime);
                } else {
                  setCountdown(Math.max(0, Math.floor(300 - elapsed)));
                }
              }
            }
          } else {
            // Update last known in time even if not checked in, for immediate accuracy on check-in
            setLastInGeofenceTime(new Date());
          }
        },
        (err) => {
          console.error('Location error', err);
          setMessage(getGeoErrorMessage(err));
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [locationSupported, status, geofences]);

  useEffect(() => {
    if (userLocation && status === 'CHECKED_IN' && geofences.length > 0) {
      let isAutoCheckOutEnabledForAny = false;
      let isSafeWindowForAny = false;
      let completelyOutside = true;

      for (const gf of geofences) {
        if (gf.isAutoCheckoutEnabled !== false) isAutoCheckOutEnabledForAny = true;
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (gf.safeWindows?.some(w => currentTime >= w.start && currentTime <= w.end)) {
           isSafeWindowForAny = true;
        }
        const dist = haversineDistanceMeters(userLocation.lat, userLocation.lng, gf.center.lat, gf.center.lng);
        if (dist <= gf.radiusMeters + 50) completelyOutside = false;
      }

      if (!isAutoCheckOutEnabledForAny) return;
      if (isSafeWindowForAny) return;

      if (completelyOutside) {
        handleAutoCheckOut(userLocation, lastInGeofenceTime);
      }
    }
  }, [userLocation, status, geofences]);

  const handleAutoCheckOut = async (loc, exitTime) => {
    if (busy) return;
    try {
      setBusy(true);
      const res = await api.post('/employee/auto-check-out', { ...loc, exitTime });
      setStatus(res.data.status);
      setCheckOutTime(res.data.checkOutTime);
      setExitTimerStartTime(null);
      setShowExitWarning(false);
      setMessage('⚠️ Automatically checked out (Left workplace).');
    } catch (err) {
      console.error('Auto check-out failed', err);
    } finally {
      setBusy(false);
    }
  };

  const bindDevice = async () => {
    setBusy(true);
    setMessage('');
    try {
      const optionsRes = await api.post('/webauthn/register/options');
      const attResp = await startRegistration({
        ...optionsRes.data,
      });
      await api.post('/webauthn/register/verify', attResp);
      setUser({ ...user, deviceBound: true });
      setMessage('Device successfully bound. You can now check in and out.');
    } catch (err) {
      setMessage(
        err.response?.data?.message ||
        'Device binding failed. Make sure your browser supports biometrics / passkeys.'
      );
    } finally {
      setBusy(false);
    }
  };

  const ensureBiometric = async () => {
    const optionsRes = await api.post('/webauthn/auth/options');
    console.log('WebAuthn Auth Options:', JSON.stringify(optionsRes.data, null, 2));
    const assertion = await startAuthentication({
      ...optionsRes.data,
      timeout: 60000,
    });
    // We don't need to verify it here since we will send it to the attendance route
    return assertion;
  };

  const getGeoErrorMessage = (err) => {
    switch (err.code) {
      case 1: return 'Location permission denied. Please click the icon next to the URL and allow location access.';
      case 2: return 'Location unavailable. Your device hardware cannot determine your position.';
      case 3: return 'Location request timed out. Please try moving near a window or check your Wi-Fi.';
      default: return err.message || 'Unknown location error.';
    }
  };

  const getCurrentLocation = () =>
    new Promise((resolve, reject) => {
      const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          console.warn('High accuracy location failed, retrying with lower accuracy...', err);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err2) => reject(err2),
            { enableHighAccuracy: false, timeout: 10000 }
          );
        },
        options
      );
    });

  const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const performCheck = async (type) => {
    if (type === 'OUT') {
      const confirmed = window.confirm('Are you sure you want to check out?');
      if (!confirmed) return;
    }
    setBusy(true);
    setMessage('');
    try {
      let loc;
      setMessage('Fetching accurate GPS location…');
      loc = await getCurrentLocation();
      setUserLocation(loc); // Ensure map is synced

      // 2. Local check for geofence if possible
      if (geofences.length > 0) {
        let insideAnyStrictly = false;
        let minDistanceToAny = Infinity;

        // Only evaluate geofences that are active today for the manual check-in
        const todayStr = new Date().toISOString().split('T')[0];
        const validGfs = geofences.filter(gf => gf.isAttendanceEnabled !== false && !gf.holidays?.includes(todayStr));

        for (const gf of validGfs) {
          const dist = haversineDistanceMeters(loc.lat, loc.lng, gf.center.lat, gf.center.lng);
          if (dist < minDistanceToAny) minDistanceToAny = dist;
          if (dist <= gf.radiusMeters + 15) insideAnyStrictly = true; // 15m buffer
        }

        if (!insideAnyStrictly && validGfs.length > 0) {
          // Check if they are inside an INVALID/HOLIDAY geofence
          let insideInvalid = false;
          let invalidReason = '';
          for (const gf of geofences) {
            if (gf.isAttendanceEnabled === false || gf.holidays?.includes(todayStr)) {
               const dist = haversineDistanceMeters(loc.lat, loc.lng, gf.center.lat, gf.center.lng);
               if (dist <= gf.radiusMeters + 15) {
                 insideInvalid = true;
                 invalidReason = gf.isAttendanceEnabled === false ? 'Disabled' : 'on Holiday';
                 break;
               }
            }
          }
          
          if (insideInvalid) {
            setMessage(`You are inside a site that is currently ${invalidReason}. Please move to an active site.`);
          } else {
            setMessage(`Outside geofence (approx ${Math.round(minDistanceToAny)}m away). Please move closer.`);
          }
          setBusy(false);
          return;
        } else if (validGfs.length === 0) {
          setMessage('All your assigned sites are either offline or on holiday today.');
          setBusy(false);
          return;
        }
      }

      // 3. Biometric verification only if location is valid
      if (user.deviceBound) {
        console.log('EmployeePage: User is bound, triggering biometric prompt...');
        setMessage('Please complete the biometric scan on your device...');
        const assertion = await ensureBiometric();
        console.log('EmployeePage: Biometric signature obtained:', !!assertion);
        
        // 4. Backend check
        setMessage('Verifying signature with server...');
        const payload = { ...loc, assertion };
        if (type === 'IN') {
          const res = await api.post('/employee/check-in', payload);
          setStatus(res.data.status);
          setCheckInTime(res.data.checkInTime);
          setMessage('Checked in successfully (Verified).');
        } else {
          const res = await api.post('/employee/check-out', payload);
          setStatus(res.data.status);
          setCheckOutTime(res.data.checkOutTime);
          setMessage('Checked out successfully (Verified).');
        }
      } else {
        console.log('EmployeePage: User is NOT bound, skipping biometrics.');
        setMessage('Logging attendance...');
        if (type === 'IN') {
          const res = await api.post('/employee/check-in', loc);
          setStatus(res.data.status);
          setCheckInTime(res.data.checkInTime);
          setMessage('Checked in successfully (No Device Bound).');
        } else {
          const res = await api.post('/employee/check-out', loc);
          setStatus(res.data.status);
          setCheckOutTime(res.data.checkOutTime);
          setMessage('Checked out successfully (No Device Bound).');
        }
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      const serverStack = err.response?.data?.stack;
      const msg = err.code ? getGeoErrorMessage(err) : (serverMsg ? `${serverMsg}${serverStack ? '\nStack: ' + serverStack.split('\n')[0] : ''}` : err.message);
      setMessage(msg || 'Action failed. Ensure you are inside the geofence and biometrics are enabled.');
    } finally {
      setBusy(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isHoliday = geofences.length > 0 && geofences.every(gf => gf.holidays?.includes(todayStr));
  const isAttendanceDisabled = geofences.length > 0 && geofences.every(gf => gf.isAttendanceEnabled === false);

  const validGeofences = geofences.filter(gf => gf.isAttendanceEnabled !== false && !gf.holidays?.includes(todayStr));
  const hasValidGeofence = validGeofences.length > 0;

  const canCheckIn = status === 'NOT_CHECKED_IN' && hasValidGeofence;
  const canCheckOut = status === 'CHECKED_IN' && hasValidGeofence;

  const userIcon = L.divIcon({
    className: 'user-marker',
    html: '<div class="user-marker-pulse"></div><div class="user-marker-center"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-title">Attendance Terminal</div>
        <div className="topbar-actions">
          <span className="muted">{user?.email}</span>
          {user?.role === 'MANAGER' && (
            <button className="btn outline" onClick={() => navigate('/representative')}>
              Switch to Management
            </button>
          )}
          <button className="btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="layout-split">
        <section className="side-panel">
          <div className="card">
            <h2>Today&apos;s Status</h2>
            <div className="status-row">
              <div className="status-pill">{status}</div>
              <div className="muted small">
                In: {checkInTime ? new Date(checkInTime).toLocaleTimeString() : '-'}
              </div>
              <div className="muted small">
                Out: {checkOutTime ? new Date(checkOutTime).toLocaleTimeString() : '-'}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {user?.deviceBound ? (
                  <span style={{ color: '#16a34a', fontSize: '0.8em', fontWeight: 'bold' }}>🛡️ Device Protected</span>
                ) : (
                  <span style={{ color: '#ef4444', fontSize: '0.8em', fontWeight: 'bold' }}>⚠️ Device Not Bound</span>
                )}
              </div>
            </div>

            {isHoliday && (
              <div className="notice" style={{ marginTop: '1rem', background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412' }}>
                📅 Today is a scheduled holiday for all your mapped sites.
              </div>
            )}

            {isAttendanceDisabled && !isHoliday && (
              <div className="notice" style={{ marginTop: '1rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                🚫 Attendance is currently disabled globally.
              </div>
            )}

            {user?.deviceBound && (
              <div className="actions" style={{ marginTop: '1.5rem' }}>
                <button
                  className="btn primary large full-width"
                  onClick={() => performCheck('IN')}
                  disabled={!canCheckIn || busy}
                >
                  Check In
                </button>
                <button
                  className="btn large full-width"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => performCheck('OUT')}
                  disabled={!canCheckOut || busy}
                >
                  Check Out
                </button>
              </div>
            )}

            {!user?.deviceBound && (
              <div className="notice">
                <p>You must bind this device first.</p>
                <button className="btn primary" onClick={bindDevice} disabled={busy}>
                  Bind this device
                </button>
              </div>
            )}

            {message && <div className="status-message">{message}</div>}

            {showExitWarning && (
              <div className="notice" style={{ marginTop: '1rem', background: '#fff1f2', border: '2px solid #f43f5e', color: '#9f1239', animation: 'pulse 2s infinite' }}>
                <h4 style={{ margin: '0 0 5px 0' }}>🚨 Geofence Exit Detected</h4>
                <p style={{ fontSize: '0.9rem', margin: 0 }}>
                  You have left the site. Please return or check out manually. 
                  Automatic checkout in: <strong>{Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</strong>
                </p>
              </div>
            )}

            {userLocation && (
              <div className="debug-box small muted" style={{ marginTop: '1rem' }}>
                📍 {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {userLocation && (
                <button
                  className="btn small"
                  onClick={() => setCenterTrigger(prev => prev + 1)} 
                >
                  Focus Me
                </button>
              )}
              <button
                className="btn small outline"
                onClick={() => setShowFeedbackModal(true)}
              >
                Give Feedback
              </button>
            </div>
          </div>
        </section>

        <section className="map-area">
          <MapContainer
            center={[12.9716, 77.5946]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {geofences.length > 0 && (
              <>
                {geofences.map(gf => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  let color = '#4f46e5'; // active (blue)
                  let tooltipLabel = gf.name || 'Site';
                  
                  if (gf.isAttendanceEnabled === false) {
                    color = '#ef4444'; // disabled (red)
                    tooltipLabel += ' (Disabled)';
                  } else if (gf.holidays?.includes(todayStr)) {
                    color = '#f59e0b'; // holiday (amber)
                    tooltipLabel += ' (Holiday)';
                  }

                  return (
                    <Circle
                      key={gf._id}
                      center={[gf.center.lat, gf.center.lng]}
                      radius={gf.radiusMeters}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.2 }}
                    >
                      <Tooltip>{tooltipLabel}</Tooltip>
                    </Circle>
                  );
                })}
                <MapViewManager geofences={geofences} userLocation={userLocation} centerTrigger={centerTrigger} />
              </>
            )}

            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                <Tooltip permanent direction="top" className="no-bg-tooltip">You are here</Tooltip>
              </Marker>
            )}
          </MapContainer>
        </section>
      </main>
      {showFeedbackModal && <FeedbackModal onClose={() => setShowFeedbackModal(false)} />}
    </div>
  );
};

export default EmployeePage;


