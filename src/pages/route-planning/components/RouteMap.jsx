import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin } from 'lucide-react'
import { batchGeocode } from '@/lib/routePlans'
import styles from './RouteMap.module.css'
import 'leaflet/dist/leaflet.css'

const US_CENTER = [39.8, -98.5]
const DEFAULT_ZOOM = 5

function buildLocationKey(city, state, address) {
  if (!city && !state) return null
  if (address) return [address, city, state].filter(Boolean).join(', ')
  return [city, state].filter(Boolean).join(', ')
}

function buildCityStateKey(city, state) {
  if (!city && !state) return null
  return [city, state].filter(Boolean).join(', ')
}

function createNumberedIcon(number, color) {
  return L.divIcon({
    className: '',
    html: `<div style="background-color:${color};color:#fff;border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,.3);">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

function formatStopDate(date) {
  if (!date) return 'TBD'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (!positions.length) return
    if (positions.length === 1) {
      map.setView(positions[0], 10)
      return
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] })
  }, [map, positions])
  return null
}

function useGeocoder(teams) {
  const cacheRef = useRef({})
  const [geoCache, setGeoCache] = useState({})
  const [loading, setLoading] = useState(false)

  const uniqueKeys = useMemo(() => {
    const keys = new Set()
    for (const team of teams) {
      for (const stop of team.stops) {
        const primary = buildLocationKey(stop.site_city, stop.site_state, stop.site_address)
        if (primary && !(primary in cacheRef.current)) keys.add(primary)
        const fallback = buildCityStateKey(stop.site_city, stop.site_state)
        if (fallback && fallback !== primary && !(fallback in cacheRef.current)) keys.add(fallback)
      }
    }
    return [...keys]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams])

  useEffect(() => {
    if (!uniqueKeys.length) return
    let cancelled = false
    setLoading(true)
    batchGeocode(uniqueKeys)
      .then((results) => {
        if (cancelled) return
        cacheRef.current = { ...cacheRef.current, ...results }
        setGeoCache(cacheRef.current)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uniqueKeys])

  const retry = useCallback(() => {
    cacheRef.current = {}
    setGeoCache({})
  }, [])

  return { geoCache, loading, retry }
}

export default function RouteMap({ teams }) {
  const { geoCache, loading, retry } = useGeocoder(teams)

  const getStopCoord = useCallback((stop) => {
    const primary = buildLocationKey(stop.site_city, stop.site_state, stop.site_address)
    if (primary && geoCache[primary]) return geoCache[primary]
    const fallback = buildCityStateKey(stop.site_city, stop.site_state)
    if (fallback && geoCache[fallback]) return geoCache[fallback]
    return null
  }, [geoCache])

  const allPositions = useMemo(() => {
    const positions = []
    for (const team of teams) {
      for (const stop of team.stops) {
        const coord = getStopCoord(stop)
        if (coord) positions.push([coord.lat, coord.lng])
      }
    }
    return positions
  }, [teams, getStopCoord])

  const totalStops = teams.reduce((sum, t) => sum + t.stops.length, 0)

  if (totalStops === 0) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.emptyInner}>
          <MapPin size={48} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No stops assigned</p>
          <p className={styles.emptySub}>Assign sites to teams to see them on the map.</p>
        </div>
      </div>
    )
  }

  if (!allPositions.length && !loading) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.emptyInner}>
          <MapPin size={48} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No geocoded locations available</p>
          <button type="button" className={styles.retryBtn} onClick={retry}>Retry Geocoding</button>
          <p className={styles.emptySub}>Stops need city/state information for map display.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.mapWrap}>
      {loading && <div className={styles.loadingPill}>Geocoding locations…</div>}
      <MapContainer center={US_CENTER} zoom={DEFAULT_ZOOM} className={styles.map} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={allPositions} />

        {teams.map((team) => {
          const sortedStops = [...team.stops].sort((a, b) => a.stop_order - b.stop_order)
          const polyline = []
          return (
            <span key={team.id}>
              {sortedStops.map((stop, idx) => {
                const coord = getStopCoord(stop)
                if (!coord) return null
                polyline.push([coord.lat, coord.lng])
                return (
                  <Marker
                    key={stop.id}
                    position={[coord.lat, coord.lng]}
                    icon={createNumberedIcon(idx + 1, team.color)}
                  >
                    <Popup>
                      <div className={styles.popup}>
                        <p className={styles.popupTitle}>{stop.site_name ?? 'Unknown Site'}</p>
                        <p className={styles.popupSub}>
                          {[stop.site_city, stop.site_state].filter(Boolean).join(', ')}
                        </p>
                        <p>
                          <span className={styles.popupTeam} style={{ backgroundColor: team.color }}>
                            {team.name}
                          </span>
                        </p>
                        <p className={styles.popupDates}>
                          {formatStopDate(stop.scheduled_start)} - {formatStopDate(stop.scheduled_end)}
                        </p>
                        {stop.estimated_hours != null && (
                          <p className={styles.popupDates}>Est. {stop.estimated_hours}h</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
              {polyline.length >= 2 && (
                <Polyline
                  positions={polyline}
                  pathOptions={{ color: team.color, weight: 3, opacity: 0.7, dashArray: '8 4' }}
                />
              )}
            </span>
          )
        })}
      </MapContainer>

      {teams.length > 0 && (
        <div className={styles.legend}>
          <p className={styles.legendTitle}>Teams</p>
          {teams.map((team) => (
            <div key={team.id} className={styles.legendRow}>
              <span className={styles.legendDot} style={{ backgroundColor: team.color }} />
              <span>{team.name} ({team.stops.length})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
