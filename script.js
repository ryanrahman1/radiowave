const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let styleUrl = isDark ? './styles/dark_style.json' : './styles/light_style.json';

let showOnlyFavorites = localStorage.getItem('showFavoritesOnly') === 'true';

let currentStationCoords = null;

const map = new maplibregl.Map({
  container: 'map',
  style: styleUrl,
  center: [0, 20],
  zoom: 2
});

let audio = new Audio();
let isPlaying = false;

const player = document.getElementById('player');
const stationNameEl = document.getElementById('stationName');
const stationCountryEl = document.getElementById('stationCountry');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const favoriteBtn = document.getElementById('favoriteBtn'); // Make sure this exists in your HTML

let currentStation = null;

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

const filterFavoritesBtn = document.getElementById('filterFavoritesBtn');

// On load, set the correct star icon based on saved state
(() => {
  const icon = filterFavoritesBtn.querySelector('i');
  if (showOnlyFavorites) {
    icon.classList.replace('bi-star', 'bi-star-fill');
  } else {
    icon.classList.replace('bi-star-fill', 'bi-star');
  }
})();

filterFavoritesBtn.addEventListener('click', async () => {
  showOnlyFavorites = !showOnlyFavorites;

  // Save to localStorage
  localStorage.setItem('showFavoritesOnly', showOnlyFavorites);

  const icon = filterFavoritesBtn.querySelector('i');
  if (showOnlyFavorites) {
    icon.classList.replace('bi-star', 'bi-star-fill');
    showLoading('Showing favorites...');
  } else {
    icon.classList.replace('bi-star-fill', 'bi-star');
    showLoading('Showing all stations...');
  }

  const data = await fetchStationsGeoJSON();
  map.getSource('stations').setData(data);
  hideLoading();
});

function updateFavoriteBtn(stationName) {
  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  const icon = favoriteBtn.querySelector('i'); // assuming <button><i class="bi bi-heart"></i></button>

  if (favorites.includes(stationName)) {
    favoriteBtn.classList.add('active');
    icon.classList.remove('bi-heart');
    icon.classList.add('bi-heart-fill'); // filled heart
    icon.style.color = '#ff3366'; // or whatever color u want
  } else {
    favoriteBtn.classList.remove('active');
    icon.classList.remove('bi-heart-fill');
    icon.classList.add('bi-heart');
    icon.style.color = 'inherit'; // or reset to default
  }
}

function toggleFavorite(stationName) {
  let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  if (favorites.includes(stationName)) {
    favorites = favorites.filter(name => name !== stationName);
  } else {
    favorites.push(stationName);
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavoriteBtn(stationName);
}

favoriteBtn.addEventListener('click', () => {
  if (currentStation?.name) {
    toggleFavorite(currentStation.name);
  }
});

async function getLocationFromCoords(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'YourAppName/1.0' } });
    const data = await res.json();
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

  const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

  const features = stations
    .filter(s => s.geo_lat && s.geo_long)
    .filter(s => {
      if (!showOnlyFavorites) return true;
      return favorites.includes(s.name);
    })
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
      'circle-color': isDark ? '#ffffff' : '#000',
      'circle-radius': [
        'step', ['get', 'point_count'], 8, 10, 12, 30, 15
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
      'circle-color': '#10ab77',
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
    loadLastPlayedStation(geojsonData.features);
  });

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

  map.on('click', 'unclustered-point', async (e) => {
    const feature = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] })[0];
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    currentStationCoords = coords;
    currentStation = props;
    stationNameEl.textContent = props.name || 'Unknown Station';

    const location = await getLocationFromCoords(coords[1], coords[0]);
    stationCountryEl.textContent = location;

    player.classList.remove('hidden');
    isPlaying = true;

    audio.src = props.url;
    audio.play().catch(() => {});
    playPauseIcon.classList.replace('bi-play-fill', 'bi-pause-fill');

    // Save last played
    localStorage.setItem('lastStation', JSON.stringify({
      name: props.name,
      url: props.url,
      coords,
    }));

    updateFavoriteBtn(props.name);
  });

  ['clusters', 'unclustered-point'].forEach(layer => {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = '';
    });
  });
});

function loadLastPlayedStation(features) {
  const saved = localStorage.getItem('lastStation');
  if (!saved) return;
  const last = JSON.parse(saved);

  const match = features.find(f => f.properties.name === last.name && f.properties.url === last.url);
  if (!match) return;

  currentStation = match.properties;
  currentStationCoords = match.geometry.coordinates;

  stationNameEl.textContent = match.properties.name;
  getLocationFromCoords(match.geometry.coordinates[1], match.geometry.coordinates[0])
  .then(location => {
    stationCountryEl.textContent = location;
  })
  .catch(() => {
    stationCountryEl.textContent = 'Unknown location';
  });
  player.classList.remove('hidden');

  audio.src = match.properties.url;
  isPlaying = false;
  playPauseIcon.classList.replace('bi-pause-fill', 'bi-play-fill');

  updateFavoriteBtn(match.properties.name);
}

document.getElementById('toggleMode').addEventListener('click', () => {
  styleUrl = styleUrl === './styles/dark_style.json' ? './styles/light_style.json' : './styles/dark_style.json';
  map.setStyle(styleUrl);

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

document.getElementById('zoomBtn').addEventListener('click', () => {
  if (!currentStationCoords) return;
  map.flyTo({ center: currentStationCoords, zoom: 10, speed: 1.2 });
});