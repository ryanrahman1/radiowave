
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let styleUrl = isDark ? './styles/dark_style.json' : './styles/light_style.json';

const map = new maplibregl.Map({
  container: 'map',
  style: styleUrl,
  center: [0, 20],
  zoom: 2
});

let audio = new Audio();
let isPlaying = false;

// Player UI elements
const player = document.getElementById('player');
const stationNameEl = document.getElementById('stationName');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');

function showLoading(message = 'Loading...') {
  const loadingPopup = document.getElementById('loadingPopup');
  if (loadingPopup) {
    loadingPopup.textContent = message;
    loadingPopup.style.display = 'block';
  }
}

function hideLoading() {
  const loadingPopup = document.getElementById('loadingPopup');
  if (loadingPopup) {
    loadingPopup.style.display = 'none';
  }
}

async function getLocationFromCoords(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'YourAppName/1.0' } });
    const data = await res.json();

    // Grab city or town or state or country
    const address = data.address;
    return address.city || address.town || address.village || address.state || address.country || 'Unknown location';
  } catch (e) {
    return 'Unknown location';
  }
}

playPauseBtn.addEventListener('click', () => {
  if (!audio.src) return;

  if (isPlaying) {
    audio.pause();
    playPauseIcon.classList.replace('bi-pause-fill', 'bi-play-fill');
    isPlaying = false;
  } else {
    audio.play().catch(() => {});
    playPauseIcon.classList.replace('bi-play-fill', 'bi-pause-fill');
    isPlaying = true;
  }
});

async function fetchStationsGeoJSON() {
  const response = await fetch('https://de1.api.radio-browser.info/json/stations');
  const stations = await response.json();

  const features = stations
    .filter(s => s.geo_lat && s.geo_long)
    .map(s => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(s.geo_long), parseFloat(s.geo_lat)]
      },
      properties: {
        name: s.name,
        url: s.url,
        country: s.country,
        language: s.language,
      }
    }));

  return {
    type: 'FeatureCollection',
    features
  };
}

function addLayers() {
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'stations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#00c3ff',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        15, 100,
        20, 750,
        25
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'stations',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Open Sans Bold'],
      'text-size': 12
    }
  });

  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'stations',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#ff4081',
      'circle-radius': 5,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  });
}

map.on('load', async () => {
    showLoading('Loading stations...');
  const geojsonData = await fetchStationsGeoJSON();
  

  map.addSource('stations', {
    type: 'geojson',
    data: geojsonData,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  addLayers();

    map.once('idle', () => {
    hideLoading();
    });

  // Zoom cluster on click, zoom in 1.5 levels for more zoom
  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    const coordinates = features[0].geometry.coordinates;
    const source = map.getSource('stations');

    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: coordinates, zoom: zoom + 1.5 });
    });
  });

  // Play station on point click
    map.on('click', 'unclustered-point', async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
    if (!features.length) return;

    const feature = features[0];
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    audio.src = props.url;
    audio.play().catch(() => {});

    const location = await getLocationFromCoords(coords[1], coords[0]);
    document.getElementById('stationCountry').textContent = location;

    isPlaying = true;
    playPauseIcon.classList.replace('bi-play-fill', 'bi-pause-fill');

    stationNameEl.textContent = props.name || 'Unknown Station';
    player.classList.remove('hidden');
    });

    // Cursor pointer for interactive layers
    ['clusters', 'unclustered-point'].forEach(layer => {
        map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
        });
    });
    });

// Toggle dark/light mode
document.getElementById('toggleMode').addEventListener('click', () => {
  styleUrl = styleUrl === './styles/dark_style.json' ? './styles/light_style.json' : './styles/dark_style.json';
  map.setStyle(styleUrl);

  // Swap icon
  const icon = document.querySelector('#toggleMode i');
  icon.classList.toggle('bi-moon-fill');
  icon.classList.toggle('bi-sun-fill');

  map.once('styledata', async () => {
    const geojsonData = await fetchStationsGeoJSON();

    if (map.getSource('stations')) {
      map.getSource('stations').setData(geojsonData);
    } else {
      map.addSource('stations', {
        type: 'geojson',
        data: geojsonData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    addLayers();
  });
});