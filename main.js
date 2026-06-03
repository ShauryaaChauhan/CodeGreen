// Lists to keep track of where the user clicked and the markers on the map
let coordinates = [];
let markers = [];
let routeClearTimer = null;

// Setup the map on the webpage
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty', // The map's visual design
    center: [85.3240, 27.7172], // Starts looking at Kathmandu
    zoom: 12 // How close the camera is to the ground
});

// Once the map finishes loading, start looking for clicks
map.on('load', () => {
    map.on('click', async (e) => {
        // If there are already two pins on the map, remove them before adding a new one
        if (coordinates.length >= 2) {
            if (routeClearTimer) {
                clearTimeout(routeClearTimer);
                routeClearTimer = null;
            }
            markers.forEach(m => m.remove());
            markers = [];
            coordinates = [];
            if (map.getLayer('route')) map.removeLayer('route');
            if (map.getSource('route')) map.removeSource('route');
            document.getElementById('result').innerText = 'Result: 0g CO₂';
        }

        // Get the exact spot (latitude/longitude) where the user clicked
        const coord = [e.lngLat.lng, e.lngLat.lat];
        // Put a pin on that spot
        const marker = new maplibregl.Marker().setLngLat(coord).addTo(map);
        
        // Save the pin and location in our lists
        markers.push(marker);
        coordinates.push(coord);
        
        // If we have two pins, we can calculate a route between them
        if (coordinates.length === 2) {
            // Ask the routing service to find the best road path between the two points
            const url = `https://router.project-osrm.org/route/v1/driving/${coordinates[0][0]},${coordinates[0][1]};${coordinates[1][0]},${coordinates[1][1]}?overview=full&geometries=geojson`;
            
            try {
                // Get the route data
                const response = await fetch(url);
                const data = await response.json();
                
                // If the route was found successfully
                if (data.routes && data.routes.length > 0) {
                    // Turn meters into kilometers
                    const distance = data.routes[0].distance / 1000;
                    // Do the math for CO2 emissions
                    calculateFromDistance(distance);
                    
                    // If there's an old green line on the map, clear it first
                    if (map.getLayer('route')) map.removeLayer('route');
                    if (map.getSource('route')) map.removeSource('route');
                    
                    // Draw the new green route line on the map
                    map.addSource('route', { 'type': 'geojson', 'data': { 'type': 'Feature', 'geometry': data.routes[0].geometry } });
                    map.addLayer({ 
                        'id': 'route', 
                        'type': 'line', 
                        'source': 'route', 
                        'layout': { 'line-join': 'round', 'line-cap': 'round' }, 
                        'paint': { 'line-color': '#2e7d32', 'line-width': 5 } 
                    });
                }
            } catch (error) {
                console.error("Routing error:", error);
                document.getElementById('result').innerText = "Could not find a route.";
            }
            
            // Wait 5 seconds, then clear everything so the map is clean again
            routeClearTimer = setTimeout(() => {
                markers.forEach(m => m.remove());
                markers = [];
                coordinates = [];
                if (map.getLayer('route')) map.removeLayer('route');
                if (map.getSource('route')) map.removeSource('route');
                routeClearTimer = null;
            }, 5000);
        }
    });
});

// Math function: Multiply distance by the CO2 rate selected in the dropdown
function calculateFromDistance(distance) {
    const transportValue = document.getElementById('transport').value;
    const co2 = (distance * parseFloat(transportValue)).toFixed(2);
    // Show the results on the webpage
    document.getElementById('result').innerHTML = `<strong>${co2}g CO₂ Emissions</strong> for ${distance.toFixed(2)}km`;
}

// --- Search Bar Tools ---
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('search-results');
let searchMarker = null;
let searchMarkerTimer = null; 

// A helper to make sure we don't spam the search service while someone is typing
function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Send the typed text to the geocoding service to find coordinates
async function performSearch(query) {
    if (!query) {
        resultsList.innerHTML = '';
        return;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        renderResults(data);
    } catch (err) {
        console.error('Search error', err);
        resultsList.innerHTML = '';
    }
}

// Show the list of places found in the dropdown
function renderResults(items) {
    resultsList.innerHTML = '';
    if (!items || items.length === 0) return;
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.display_name;
        li.addEventListener('click', () => selectResult(item));
        resultsList.appendChild(li);
    });
}

// When a user picks a place, zoom the map to it and show a temporary pin
function selectResult(item) {
    const lon = parseFloat(item.lon);
    const lat = parseFloat(item.lat);
    
    map.flyTo({ center: [lon, lat], zoom: 14 });

    // Clean up old search pins
    if (searchMarkerTimer) {
        clearTimeout(searchMarkerTimer);
        searchMarkerTimer = null;
    }
    if (searchMarker) searchMarker.remove();
    
    // Add a pink marker for the search result
    searchMarker = new maplibregl.Marker({ color: '#e91e63' }).setLngLat([lon, lat]).addTo(map);
    const popup = new maplibregl.Popup({ offset: 12 }).setText(item.display_name);
    searchMarker.setPopup(popup).togglePopup();

    // Auto-remove this pin after 10 seconds
    searchMarkerTimer = setTimeout(() => {
        if (searchMarker) {
            try { searchMarker.remove(); } catch(e){}
            searchMarker = null;
        }
        searchMarkerTimer = null;
    }, 10000);

    resultsList.innerHTML = '';
    searchInput.value = item.display_name;
}

// Listen for typing in the search box
if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
        performSearch(e.target.value.trim());
    }, 300));

    // Close the list if the user clicks somewhere else on the page
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('.search-container')) {
            resultsList.innerHTML = '';
        }
    });
}
function calculateFromDistance(distance) {
    const transportValue = document.getElementById('transport').value;
    
    // 1. Calculate CO2
    const co2 = (distance * parseFloat(transportValue));
    
    // 2. Calculate time in days (1g CO2 = 24 minutes → 1/60 day)
    const totalDays = co2 / 60; // since 24 minutes per gram => 24/1440 = 1/60 days per gram

    // 3. Update the main result
    document.getElementById('result').innerHTML = `<strong>${co2.toFixed(2)}g CO₂ Emissions</strong> for ${distance.toFixed(2)}km`;

    // 4. Update the tree time display in days
    document.getElementById('tree-time').innerText = `1 tree takes ${totalDays.toFixed(2)} days to absorb this.`;
}