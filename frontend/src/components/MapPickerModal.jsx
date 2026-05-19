import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon (Leaflet + bundler issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ClickHandler = ({ onClick }) => {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const DEFAULT_CENTER = [17.385, 78.4867]; // Hyderabad

// Helper to manage map center/zoom changes dynamically
const MapViewUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], 17, { animate: true });
  }, [center, map]);
  return null;
};

const MapPickerModal = ({ onSelect, onClose }) => {
  const [selected, setSelected] = useState(null);

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <div className="map-modal-overlay">
      <div className="map-modal">
        <div className="map-modal-header">
          <h3>📍 Pick a Location</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn outline" onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setSelected(loc);
                  },
                  (err) => alert('Failed to get location: ' + err.message),
                  { enableHighAccuracy: true }
                );
              } else {
                alert('Geolocation is not supported by your browser.');
              }
            }}>📡 Use My Current Position</button>
            <button className="btn" onClick={onClose}>✕ Cancel</button>
          </div>
        </div>

        <div className="map-modal-body">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewUpdater center={selected} />
            <ClickHandler onClick={setSelected} />
            {selected && <Marker position={[selected.lat, selected.lng]} />}
          </MapContainer>
        </div>

        <div className="map-modal-footer">
          {selected ? (
            <div className="map-modal-coords">
              <span className="coord-label">Lat:</span>{' '}
              <span className="coord-value">{selected.lat.toFixed(6)}</span>
              <span className="coord-separator">|</span>
              <span className="coord-label">Lng:</span>{' '}
              <span className="coord-value">{selected.lng.toFixed(6)}</span>
            </div>
          ) : (
            <div className="map-modal-hint">Click anywhere on the map to select a point</div>
          )}

          <button
            className="btn primary"
            onClick={handleConfirm}
            disabled={!selected}
          >
            ✓ Select this location
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapPickerModal;
