const MAP_ZOOM = 16
const MAX_LATITUDE = 90
const MAX_LONGITUDE = 180

function isCoordinate(value, limit) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

function openStreetMapUrl(place) {
  const lat = place && place.lat
  const lon = place && place.lon
  if (!isCoordinate(lat, MAX_LATITUDE) || !isCoordinate(lon, MAX_LONGITUDE)) return null
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${MAP_ZOOM}/${lat}/${lon}`
}

module.exports = { openStreetMapUrl }
