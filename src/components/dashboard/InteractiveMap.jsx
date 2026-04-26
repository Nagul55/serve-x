import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet + React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Helper to center map when a marker is clicked or needs change
function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function InteractiveMap({ needs, onSelectNeed }) {
  // Center on India/Tamil Nadu by default if no needs
  const defaultCenter = [11.1271, 78.6569];
  const activeNeeds = needs.filter(n => n.location_coords?.lat && n.location_coords?.lng);
  
  const center = activeNeeds.length > 0 
    ? [activeNeeds[0].location_coords.lat, activeNeeds[0].location_coords.lng]
    : defaultCenter;

  return (
    <div className="h-[320px] sm:h-[400px] w-full rounded-xl border border-servex-periwinkle/70 overflow-hidden shadow-sm relative z-0">
      <MapContainer 
        center={center} 
        zoom={activeNeeds.length > 0 ? 10 : 7} 
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {activeNeeds.map((need) => (
          <Marker 
            key={need.id} 
            position={[need.location_coords.lat, need.location_coords.lng]}
            eventHandlers={{
              click: () => onSelectNeed(need.id),
            }}
          >
            <Popup>
              <div className="p-1">
                <h4 className="font-bold text-sm text-foreground">{need.title}</h4>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{need.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    need.urgency_level === 'critical' ? 'bg-servex-navy text-servex-blush' :
                    need.urgency_level === 'high' ? 'bg-servex-indigo text-servex-blush' :
                    'bg-servex-periwinkle text-servex-navy'
                  }`}>
                    {need.urgency_level}
                  </span>
                  <button 
                    onClick={() => onSelectNeed(need.id)}
                    className="text-[10px] text-primary font-bold hover:underline"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        
        {activeNeeds.length > 0 && <ChangeView center={center} zoom={11} />}
      </MapContainer>
    </div>
  );
}
