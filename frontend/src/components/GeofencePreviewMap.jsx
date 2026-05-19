import React from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CIRCLE_OPTIONS = {
  color: '#2563eb',
  weight: 2,
  opacity: 0.8,
  fillColor: '#2563eb',
  fillOpacity: 0.15,
};

const GeofencePreviewMap = ({ center, radiusMeters }) => {
  // Dynamic zoom to fit the circle perfectly
  const getZoom = (radius) => {
    if (radius <= 50) return 18;
    if (radius <= 100) return 17;
    if (radius <= 250) return 16;
    if (radius <= 500) return 15;
    if (radius <= 1000) return 14;
    if (radius <= 2500) return 13;
    if (radius <= 5000) return 12;
    return 11;
  };

  return (
    <div className="map-preview-container">
      <div className="map-preview-label">
        <span className="geofence-icon">🟢</span> Geofence Preview
      </div>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={getZoom(radiusMeters)}
        style={{ width: '100%', height: '300px' }}
        scrollWheelZoom={false}
        dragging={true}
        key={`${center.lat}-${center.lng}-${radiusMeters}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[center.lat, center.lng]} />
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusMeters}
          pathOptions={CIRCLE_OPTIONS}
        />
      </MapContainer>
      <div className="map-preview-info">
        Employees can only log attendance within this boundary ({radiusMeters}m radius)
      </div>
    </div>
  );
};

export default GeofencePreviewMap;
