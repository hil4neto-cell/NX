import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import maplibregl, {
  type GeoJSONSource,
  type ImageSource,
  type LngLatLike,
  type Marker,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import proj4 from 'proj4'
import {
  ArrowLeft,
  BringToFront,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  FolderOpen,
  LogOut,
  Palette,
  RotateCcw,
  Satellite,
  Save,
  Undo2,
  Upload,
} from 'lucide-react'
import './App.css'
import { supabase } from './supabase'

type Coordinate = [number, number]
type FourCoordinates = [Coordinate, Coordinate, Coordinate, Coordinate]
type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
type CoordinateMode = 'utm' | 'latlon'
type SatelliteVariant = 'esri' | 'clarity'

type OverlayOptions = {
  showImported: boolean
  showControl: boolean
  showSurvey: boolean
  showLabels: boolean
  importedColor: string
  controlColor: string
  surveyColor: string
}

type ImportedGeometry = {
  id: string
  name: string
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon'
    coordinates: Coordinate | Coordinate[] | Coordinate[][]
  }
}

type SurveyPoint = {
  id: string
  description: string
  coordinate: Coordinate
  elevation?: number
}

type ProjectMetadata = {
  projectName: string
  address: string
  client: string
  note: string
}

type Corner = {
  key: CornerKey
  label: string
  short: string
}

export type SavedProject = {
  schemaVersion?: number
  name: string
  createdAt: string
  updatedAt?: string
  imageUrl: string
  hasControlGeometry?: boolean
  opacity: number
  zone: number
  hemisphere: 'N' | 'S'
  coordinateMode?: CoordinateMode
  coordinateInputs?: string[]
  corners: FourCoordinates
  metadata: ProjectMetadata
  surveyPoints?: SurveyPoint[]
  importedGeometries?: ImportedGeometry[]
  overlayOptions?: OverlayOptions
  satellite?: boolean
  satelliteVariant?: SatelliteVariant
  streetNames?: boolean
  viewport?: {
    bounds: [Coordinate, Coordinate]
  }
}

type MapEditorProps = {
  initialProject?: SavedProject
  workspaceTitle?: string
  onBack?: () => void
  onSaveProject?: (project: SavedProject) => Promise<number>
  onSaveExport?: (exportImage: Blob, revision: number) => Promise<void>
}

type AppSnapshot = {
  imageUrl: string
  imageName: string
  hasControlGeometry: boolean
  corners: FourCoordinates
  inputs: string[]
  mode: CoordinateMode
  zone: number
  hemisphere: 'N' | 'S'
  opacity: number
  satellite: boolean
  satelliteVariant: SatelliteVariant
  streetNames: boolean
  metadata: ProjectMetadata
  surveyPoints: SurveyPoint[]
  importedGeometries: ImportedGeometry[]
  overlayOptions: OverlayOptions
}

const cornersMeta: Corner[] = [
  { key: 'topLeft', label: 'Superior esquerdo', short: 'SE' },
  { key: 'topRight', label: 'Superior direito', short: 'SD' },
  { key: 'bottomRight', label: 'Inferior direito', short: 'ID' },
  { key: 'bottomLeft', label: 'Inferior esquerdo', short: 'IE' },
]

const demoUtm = [
  'E 521941.330  N 9535373.850',
  'E 522250.980  N 9535419.530',
  'E 522300.970  N 9535080.700',
  'E 521991.320  N 9535035.020',
]

const emptyInputs = ['', '', '', '']

const defaultOverlayOptions: OverlayOptions = {
  showImported: true,
  showControl: false,
  showSurvey: true,
  showLabels: true,
  importedColor: '#22c55e',
  controlColor: '#64748b',
  surveyColor: '#22c55e',
}

const overlayPalette = [
  { label: 'Original', value: '#22c55e' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Branco', value: '#f8fafc' },
]

const EXPORT_WIDTH = 3840
const EXPORT_HEIGHT = 2160
const EXPORT_FOOTER_HEIGHT = 300
const EXPORT_MAP_HEIGHT = EXPORT_HEIGHT - EXPORT_FOOTER_HEIGHT
const defaultCorners: FourCoordinates = [
  [-44.789215, -4.201319],
  [-44.786305, -4.2009],
  [-44.785834, -4.203967],
  [-44.788745, -4.204386],
]

const emptyPlanImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

const defaultMetadata: ProjectMetadata = {
  projectName: 'Estudo de implantacao',
  address: 'Endereco do projeto',
  client: 'NX Projetos',
  note: '',
}

const demoPlanSvg = encodeSvg(`
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1400" viewBox="0 0 1100 1400">
  <rect width="1100" height="1400" fill="white"/>
  <g fill="none" stroke="#8b39d6" stroke-width="7">
    <path d="M115 70 L960 35 L1035 1305 L135 1352 Z"/>
    <path d="M190 185 L922 155 L980 1190 L245 1232 Z"/>
  </g>
  <g stroke="#8142b7" stroke-width="4" fill="none">
    ${Array.from({ length: 8 }, (_, col) => {
      const x = 230 + col * 86
      return `<path d="M${x} 205 L${x + 42} 203 L${x + 92} 1165 L${x + 50} 1168 Z"/>`
    }).join('')}
    ${Array.from({ length: 30 }, (_, row) => {
      const y = 230 + row * 31
      return `<path d="M210 ${y} L920 ${y - 18}"/>`
    }).join('')}
    <path d="M202 705 L958 674" stroke="#56b870" stroke-width="6"/>
    <path d="M568 180 L620 1200" stroke="#56b870" stroke-width="6"/>
  </g>
  <g fill="#8142b7" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">
    ${Array.from({ length: 130 }, (_, index) => {
      const col = index % 10
      const row = Math.floor(index / 10)
      return `<text x="${235 + col * 72}" y="${250 + row * 70}">${index + 1}</text>`
    }).join('')}
  </g>
  <g fill="#33a85f" font-family="Arial, sans-serif" font-size="34" font-weight="700">
    <text x="130" y="93" transform="rotate(-2 130 93)">RUA NORTE</text>
    <text x="740" y="1300" transform="rotate(-3 740 1300)">AVENIDA SUL</text>
    <text x="980" y="270" transform="rotate(86 980 270)">RUA LESTE</text>
  </g>
</svg>
`)

function encodeSvg(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function satelliteMaxZoom(satelliteVisible: boolean, variant: SatelliteVariant) {
  if (!satelliteVisible) return 20
  return variant === 'clarity' ? 19 : 17
}

function makeStyle(
  satelliteVisible: boolean,
  satelliteVariant: SatelliteVariant = 'esri',
  streetNamesVisible = true,
): StyleSpecification {
  const useEsri = satelliteVisible && satelliteVariant === 'esri'
  const useClarity = satelliteVisible && satelliteVariant === 'clarity'

  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'OpenStreetMap contributors',
      },
      esri: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: 'Esri, Maxar, Earthstar Geographics and the GIS User Community',
      },
      esriClarity: {
        type: 'raster',
        tiles: [
          'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics and the GIS User Community',
      },
      streetLabels: {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'OpenStreetMap contributors, CARTO',
      },
    },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: satelliteVisible ? 'none' : 'visible' } },
      { id: 'esri', type: 'raster', source: 'esri', layout: { visibility: useEsri ? 'visible' : 'none' } },
      { id: 'esri-clarity', type: 'raster', source: 'esriClarity', layout: { visibility: useClarity ? 'visible' : 'none' } },
      {
        id: 'street-labels',
        type: 'raster',
        source: 'streetLabels',
        layout: { visibility: satelliteVisible && streetNamesVisible ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.96 },
      },
    ],
  }
}

function parseNumbers(value: string) {
  return value
    .replace(/,/g, '.')
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((number) => Number.isFinite(number)) ?? []
}

function utmToLngLat(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): Coordinate {
  const projection = `+proj=utm +zone=${zone} ${hemisphere === 'S' ? '+south' : ''} +datum=WGS84 +units=m +no_defs`
  return proj4(projection, 'WGS84', [easting, northing]) as Coordinate
}

function coordinateToInput(coordinate: Coordinate) {
  return `${coordinate[1].toFixed(7)}, ${coordinate[0].toFixed(7)}`
}

function lngLatToUtmInput(coordinate: Coordinate, zone: number, hemisphere: 'N' | 'S') {
  const projection = `+proj=utm +zone=${zone} ${hemisphere === 'S' ? '+south' : ""} +datum=WGS84 +units=m +no_defs`
  const [easting, northing] = proj4('WGS84', projection, coordinate) as Coordinate
  return `E ${easting.toFixed(3)}  N ${northing.toFixed(3)}`
}

function getBounds(coordinates: Coordinate[]): [Coordinate, Coordinate] {
  const lngs = coordinates.map(([lng]) => lng)
  const lats = coordinates.map(([, lat]) => lat)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

function fitMapToCoordinates(map: maplibregl.Map, coordinates: Coordinate[], maxZoom: number) {
  if (!coordinates.length) return
  const [sw, ne] = getBounds(coordinates)
  map.fitBounds([sw, ne], { padding: 80, maxZoom, duration: 800 })
}

function collectImportedCoordinates(importedGeometries: ImportedGeometry[]) {
  return importedGeometries.flatMap((feature) => {
    if (feature.geometry.type === 'Point') return [feature.geometry.coordinates as Coordinate]
    if (feature.geometry.type === 'LineString') return feature.geometry.coordinates as Coordinate[]
    return (feature.geometry.coordinates as Coordinate[][]).flat()
  })
}

function footprintGeoJson(
  coordinates: FourCoordinates,
  surveyPoints: SurveyPoint[] = [],
  importedGeometries: ImportedGeometry[] = [],
  hasControlGeometry = true,
) {
  const features: Array<{
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: ImportedGeometry['geometry'] | { type: 'Polygon', coordinates: Coordinate[][] } | { type: 'Point', coordinates: Coordinate }
  }> = importedGeometries.map((feature) => ({
    type: 'Feature' as const,
    properties: { role: 'imported', name: feature.name, id: feature.id },
    geometry: feature.geometry,
  }))

  if (hasControlGeometry) {
    const closed = [...coordinates, coordinates[0]]
    features.push({
      type: 'Feature' as const,
      properties: { name: 'Controle NXGEO', role: 'footprint' },
      geometry: { type: 'Polygon' as const, coordinates: [closed] },
    })
    features.push(...coordinates.map((coordinate, index) => ({
      type: 'Feature' as const,
      properties: { role: 'corner', label: cornersMeta[index].short },
      geometry: { type: 'Point' as const, coordinates: coordinate },
    })))
  }

  features.push(...surveyPoints.map((point) => ({
    type: 'Feature' as const,
    properties: {
      role: 'survey',
      label: point.id,
      description: point.description,
      elevation: point.elevation ?? null,
    },
    geometry: { type: 'Point' as const, coordinates: point.coordinate },
  })))

  return {
    type: 'FeatureCollection' as const,
    features,
  }
}


function layerVisibility(visible: boolean) {
  return visible ? 'visible' : 'none'
}

function setLayerVisibility(map: maplibregl.Map, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', layerVisibility(visible))
}

function applyOverlayOptions(map: maplibregl.Map, options: OverlayOptions) {
  setLayerVisibility(map, 'imported-fill', options.showImported)
  setLayerVisibility(map, 'imported-line', options.showImported)
  setLayerVisibility(map, 'footprint-fill', options.showControl)
  setLayerVisibility(map, 'footprint-line', options.showControl)
  setLayerVisibility(map, 'corner-points', options.showControl)
  setLayerVisibility(map, 'corner-labels', options.showControl && options.showLabels)
  setLayerVisibility(map, 'survey-points', options.showSurvey)
  setLayerVisibility(map, 'survey-labels', options.showSurvey && options.showLabels)

  if (map.getLayer('imported-fill')) map.setPaintProperty('imported-fill', 'fill-color', options.importedColor)
  if (map.getLayer('imported-line')) map.setPaintProperty('imported-line', 'line-color', options.importedColor)
  if (map.getLayer('footprint-fill')) map.setPaintProperty('footprint-fill', 'fill-color', options.controlColor)
  if (map.getLayer('footprint-line')) map.setPaintProperty('footprint-line', 'line-color', options.controlColor)
  if (map.getLayer('corner-points')) map.setPaintProperty('corner-points', 'circle-color', options.controlColor)
  if (map.getLayer('survey-points')) map.setPaintProperty('survey-points', 'circle-color', options.surveyColor)
  if (map.getLayer('survey-labels')) {
    map.setPaintProperty('survey-labels', 'text-color', options.surveyColor)
    map.setPaintProperty('survey-labels', 'text-halo-color', '#052e16')
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function kmlCoordinateString(coordinates: Coordinate[]) {
  return coordinates.map(([lng, lat]) => `${lng.toFixed(8)},${lat.toFixed(8)},0`).join(' ')
}

function kmlGeometryMarkup(feature: ImportedGeometry) {
  if (feature.geometry.type === 'Point') {
    return `<Point><coordinates>${kmlCoordinateString([feature.geometry.coordinates as Coordinate])}</coordinates></Point>`
  }

  if (feature.geometry.type === 'LineString') {
    return `<LineString><tessellate>1</tessellate><coordinates>${kmlCoordinateString(feature.geometry.coordinates as Coordinate[])}</coordinates></LineString>`
  }

  const rings = feature.geometry.coordinates as Coordinate[][]
  const outer = rings[0] ?? []
  const inner = rings.slice(1)
  return `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${kmlCoordinateString(outer)}</coordinates></LinearRing></outerBoundaryIs>${inner.map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${kmlCoordinateString(ring)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`
}

function makeKml(project: SavedProject) {
  const closed = [...project.corners, project.corners[0]]
  const projectName = normalizeLabel(project.metadata.projectName, 'Estudo de implantacao')
  const address = normalizeLabel(project.metadata.address, 'Endereco do projeto')
  const client = normalizeLabel(project.metadata.client, 'NX Projetos')
  const note = project.metadata.note.trim()
  const description = `${client}\n${address}${note ? `\n${note}` : ''}`
  const hasControlGeometry = project.hasControlGeometry ?? true

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(projectName)} - NXGEO</name>
    <description>${escapeXml(description)}</description>
    <Style id="nxgeo-footprint">
      <LineStyle><color>ff1673f9</color><width>3</width></LineStyle>
      <PolyStyle><color>331673f9</color></PolyStyle>
    </Style>
    <Style id="nxgeo-imported">
      <LineStyle><color>ff22c55e</color><width>2</width></LineStyle>
      <PolyStyle><color>3322c55e</color></PolyStyle>
    </Style>
    <Style id="nxgeo-corner">
      <IconStyle><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon></IconStyle>
    </Style>
    ${hasControlGeometry ? `<Placemark>
      <name>${escapeXml(projectName)}</name>
      <description>${escapeXml(description)}</description>
      <styleUrl>#nxgeo-footprint</styleUrl>
      <Polygon>
        <tessellate>1</tessellate>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${kmlCoordinateString(closed)}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>` : ''}
    ${(project.importedGeometries ?? []).map((feature) => `<Placemark>
      <name>${escapeXml(feature.name)}</name>
      <styleUrl>#nxgeo-imported</styleUrl>
      ${kmlGeometryMarkup(feature)}
    </Placemark>`).join('')}
    ${hasControlGeometry ? project.corners.map((coordinate, index) => `
    <Placemark>
      <name>${cornersMeta[index].short} - ${escapeXml(cornersMeta[index].label)}</name>
      <styleUrl>#nxgeo-corner</styleUrl>
      <Point><coordinates>${kmlCoordinateString([coordinate])}</coordinates></Point>
    </Placemark>`).join('') : ''}
    ${(project.surveyPoints ?? []).map((point) => `
    <Placemark>
      <name>${escapeXml(point.id)}${point.description ? ` - ${escapeXml(point.description)}` : ''}</name>
      <description>${point.elevation !== undefined ? `Cota: ${point.elevation}` : ''}</description>
      <Point><coordinates>${kmlCoordinateString([point.coordinate])}</coordinates></Point>
    </Placemark>`).join('')}
  </Document>
</kml>
`
}


function parseFlexibleNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return Number.NaN

  const comma = trimmed.lastIndexOf(',')
  const dot = trimmed.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    return Number(comma > dot
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed.replace(/,/g, ''))
  }

  return Number(trimmed.replace(',', '.'))
}

function splitTabularLine(line: string) {
  if (line.includes(';') || line.includes('\t')) return line.split(/[;\t]/).map((item) => item.trim()).filter(Boolean)

  const commaParts = line.split(',').map((item) => item.trim()).filter(Boolean)
  if (commaParts.length >= 5 || (commaParts.length >= 4 && commaParts.every((item) => !/\s/.test(item)))) return commaParts

  return line.trim().split(/\s+/).filter(Boolean)
}

function normalizeColumnName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findColumnIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(normalizeColumnName(header)))
}

function parsePdnezText(text: string, zone: number, hemisphere: 'N' | 'S') {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))

  if (!lines.length) throw new Error('PDNEZ vazio.')

  const first = splitTabularLine(lines[0])
  const normalizedFirst = first.map(normalizeColumnName)
  const hasHeader = normalizedFirst.some((item) => ['n', 'north', 'northing', 'norte', 'y'].includes(item))
    && normalizedFirst.some((item) => ['e', 'east', 'easting', 'leste', 'x'].includes(item))

  let rows = lines
  let pointIndex = 0
  let descriptionIndex = 1
  let northIndex = 2
  let eastIndex = 3
  let elevationIndex = 4

  if (hasHeader) {
    rows = lines.slice(1)
    pointIndex = findColumnIndex(first, ['p', 'pt', 'ponto', 'point', 'numero', 'id'])
    descriptionIndex = findColumnIndex(first, ['d', 'desc', 'descricao', 'description'])
    northIndex = findColumnIndex(first, ['n', 'north', 'northing', 'norte', 'y'])
    eastIndex = findColumnIndex(first, ['e', 'east', 'easting', 'leste', 'x'])
    elevationIndex = findColumnIndex(first, ['z', 'cota', 'elev', 'elevation', 'altitude'])
  }

  const points: SurveyPoint[] = []
  for (const row of rows) {
    const parts = splitTabularLine(row)
    if (parts.length < 4) continue

    const id = pointIndex >= 0 ? parts[pointIndex] : String(points.length + 1)
    const description = descriptionIndex >= 0 ? parts[descriptionIndex] ?? '' : ''
    let northing = Number.NaN
    let easting = Number.NaN
    let elevation = Number.NaN

    if (hasHeader) {
      northing = northIndex >= 0 ? parseFlexibleNumber(parts[northIndex] ?? '') : Number.NaN
      easting = eastIndex >= 0 ? parseFlexibleNumber(parts[eastIndex] ?? '') : Number.NaN
      elevation = elevationIndex >= 0 ? parseFlexibleNumber(parts[elevationIndex] ?? '') : Number.NaN
    } else if (parts.length === 4) {
      northing = parseFlexibleNumber(parts[1])
      easting = parseFlexibleNumber(parts[2])
      elevation = parseFlexibleNumber(parts[3])
    } else {
      northing = parseFlexibleNumber(parts[parts.length - 3])
      easting = parseFlexibleNumber(parts[parts.length - 2])
      elevation = parseFlexibleNumber(parts[parts.length - 1])
    }

    if (!Number.isFinite(northing) || !Number.isFinite(easting)) continue

    points.push({
      id: id || String(points.length + 1),
      description,
      coordinate: utmToLngLat(easting, northing, zone, hemisphere),
      elevation: Number.isFinite(elevation) ? elevation : undefined,
    })
  }

  if (points.length < 2) throw new Error('PDNEZ sem pontos suficientes. Use ordem P D N E Z ou cabecalho com N/E.')
  return points
}

function parseKmlCoordinateList(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((item) => {
      const [lng, lat] = item.split(',').map(Number)
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] as Coordinate : null
    })
    .filter((coordinate): coordinate is Coordinate => Boolean(coordinate))
}

function sameCoordinate(a: Coordinate, b: Coordinate) {
  return Math.abs(a[0] - b[0]) < 0.0000001 && Math.abs(a[1] - b[1]) < 0.0000001
}

function coordinatesToFourCorners(coordinates: Coordinate[]): { corners: FourCoordinates, exact: boolean } {
  const open = coordinates.length > 1 && sameCoordinate(coordinates[0], coordinates[coordinates.length - 1])
    ? coordinates.slice(0, -1)
    : coordinates

  if (open.length === 4) return { corners: open as FourCoordinates, exact: true }

  if (open.length < 2) throw new Error('Arquivo sem coordenadas suficientes.')

  const lngs = open.map(([lng]) => lng)
  const lats = open.map(([, lat]) => lat)
  const west = Math.min(...lngs)
  const east = Math.max(...lngs)
  const south = Math.min(...lats)
  const north = Math.max(...lats)

  return {
    corners: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    exact: false,
  }
}

function closeRing(coordinates: Coordinate[]) {
  if (coordinates.length < 3) return coordinates
  return sameCoordinate(coordinates[0], coordinates[coordinates.length - 1])
    ? coordinates
    : [...coordinates, coordinates[0]]
}

function importedFileName(currentName: string, fileName: string) {
  return currentName === 'Nenhum arquivo carregado' ? fileName : currentName
}

function getElements(parent: ParentNode, tagName: string) {
  const namespaced = Array.from((parent as Document | Element).getElementsByTagNameNS?.('*', tagName) ?? [])
  const plain = Array.from((parent as Document | Element).getElementsByTagName?.(tagName) ?? [])
  return namespaced.length ? namespaced : plain
}

function firstText(parent: ParentNode, tagName: string) {
  return getElements(parent, tagName)[0]?.textContent?.trim() ?? ''
}

function makeImportedGeometry(id: string, name: string, type: ImportedGeometry['geometry']['type'], coordinates: ImportedGeometry['geometry']['coordinates']): ImportedGeometry {
  return { id, name: name || id, geometry: { type, coordinates } }
}

function extractKmlGeometries(kmlText: string) {
  const document = new DOMParser().parseFromString(kmlText, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('KML invalido ou mal formatado.')

  const placemarks = getElements(document, 'Placemark')
  const importedGeometries: ImportedGeometry[] = []
  const addGeometry = (name: string, type: ImportedGeometry['geometry']['type'], coordinates: ImportedGeometry['geometry']['coordinates']) => {
    importedGeometries.push(makeImportedGeometry(`kml-${importedGeometries.length + 1}`, name, type, coordinates))
  }

  const readGeometryContainer = (container: ParentNode, fallbackName: string) => {
    for (const polygon of getElements(container, 'Polygon')) {
      const rings = getElements(polygon, 'LinearRing')
        .map((ring) => parseKmlCoordinateList(firstText(ring, 'coordinates')))
        .filter((ring) => ring.length >= 3)
      if (rings.length) addGeometry(fallbackName, 'Polygon', rings)
    }

    for (const line of getElements(container, 'LineString')) {
      const coordinates = parseKmlCoordinateList(firstText(line, 'coordinates'))
      if (coordinates.length >= 2) addGeometry(fallbackName, 'LineString', coordinates)
    }

    for (const point of getElements(container, 'Point')) {
      const coordinates = parseKmlCoordinateList(firstText(point, 'coordinates'))
      if (coordinates.length >= 1) addGeometry(fallbackName, 'Point', coordinates[0])
    }
  }

  if (placemarks.length) {
    for (const placemark of placemarks) {
      readGeometryContainer(placemark, firstText(placemark, 'name') || 'Geometria KML')
    }
  } else {
    readGeometryContainer(document, 'Geometria KML')
  }

  const allCoordinates = collectImportedCoordinates(importedGeometries)
  if (allCoordinates.length < 1) throw new Error('Nao encontrei coordenadas no KML/KMZ.')

  return {
    importedGeometries,
    allCoordinates,
    polygonCount: importedGeometries.filter((feature) => feature.geometry.type === 'Polygon').length,
    lineCount: importedGeometries.filter((feature) => feature.geometry.type === 'LineString').length,
    pointCount: importedGeometries.filter((feature) => feature.geometry.type === 'Point').length,
  }
}


type DxfPair = { code: string, value: string }
type DxfRawGeometry = {
  id: string
  name: string
  type: ImportedGeometry['geometry']['type']
  coordinates: ImportedGeometry['geometry']['coordinates']
}

function readDxfPairs(text: string) {
  const lines = text.replace(/\r/g, '').split('\n')
  const pairs: DxfPair[] = []

  for (let index = 0; index < lines.length - 1; index += 2) {
    const code = lines[index].trim()
    const value = lines[index + 1].trim()
    if (code) pairs.push({ code, value })
  }

  return pairs
}

function readDxfBlock(pairs: DxfPair[], startIndex: number) {
  let nextIndex = startIndex
  while (nextIndex < pairs.length && pairs[nextIndex].code !== '0') nextIndex += 1
  return { block: pairs.slice(startIndex, nextIndex), nextIndex }
}

function dxfLayerName(block: DxfPair[], fallback: string) {
  return block.find((pair) => pair.code === '8')?.value || fallback
}

function rawGeometryCoordinates(geometry: DxfRawGeometry) {
  if (geometry.type === 'Point') return [geometry.coordinates as Coordinate]
  if (geometry.type === 'LineString') return geometry.coordinates as Coordinate[]
  return (geometry.coordinates as Coordinate[][]).flat()
}

function dxfLooksLikeLngLat(coordinates: Coordinate[]) {
  return coordinates.length > 0
    && coordinates.every(([x, y]) => x >= -180 && x <= 180 && y >= -90 && y <= 90)
    && coordinates.some(([x, y]) => x < 0 || y < 0)
}

function convertDxfCoordinate(coordinate: Coordinate, useLatLon: boolean, zone: number, hemisphere: 'N' | 'S'): Coordinate {
  return useLatLon ? coordinate : utmToLngLat(coordinate[0], coordinate[1], zone, hemisphere)
}

function convertDxfGeometry(geometry: DxfRawGeometry, useLatLon: boolean, zone: number, hemisphere: 'N' | 'S') {
  if (geometry.type === 'Point') {
    return makeImportedGeometry(
      geometry.id,
      geometry.name,
      'Point',
      convertDxfCoordinate(geometry.coordinates as Coordinate, useLatLon, zone, hemisphere),
    )
  }

  if (geometry.type === 'LineString') {
    return makeImportedGeometry(
      geometry.id,
      geometry.name,
      'LineString',
      (geometry.coordinates as Coordinate[]).map((coordinate) => convertDxfCoordinate(coordinate, useLatLon, zone, hemisphere)),
    )
  }

  return makeImportedGeometry(
    geometry.id,
    geometry.name,
    'Polygon',
    (geometry.coordinates as Coordinate[][]).map((ring) => ring.map((coordinate) => convertDxfCoordinate(coordinate, useLatLon, zone, hemisphere))),
  )
}

function dxfArcCoordinates(center: Coordinate, radius: number, startDegrees = 0, endDegrees = 360) {
  const fullCircle = Math.abs(endDegrees - startDegrees) >= 360
  const sweep = fullCircle
    ? 360
    : ((endDegrees - startDegrees + 360) % 360) || 360
  const segments = Math.max(12, Math.ceil(sweep / 8))

  return Array.from({ length: segments + 1 }, (_, index) => {
    const degrees = startDegrees + (sweep * index) / segments
    const radians = (degrees * Math.PI) / 180
    return [center[0] + Math.cos(radians) * radius, center[1] + Math.sin(radians) * radius] as Coordinate
  })
}

function extractDxfGeometries(dxfText: string, zone: number, hemisphere: 'N' | 'S') {
  const pairs = readDxfPairs(dxfText)
  const rawGeometries: DxfRawGeometry[] = []
  let inEntities = false

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    if (pair.code !== '0') continue

    const marker = pair.value.toUpperCase()
    const nextPair = pairs[index + 1]
    if (marker === 'SECTION' && nextPair?.code === '2' && nextPair.value.toUpperCase() === 'ENTITIES') {
      inEntities = true
      continue
    }
    if (marker === 'ENDSEC') {
      inEntities = false
      continue
    }
    if (!inEntities) continue

    if (marker === 'LINE') {
      const { block, nextIndex } = readDxfBlock(pairs, index + 1)
      const x1 = parseFlexibleNumber(block.find((item) => item.code === '10')?.value ?? '')
      const y1 = parseFlexibleNumber(block.find((item) => item.code === '20')?.value ?? '')
      const x2 = parseFlexibleNumber(block.find((item) => item.code === '11')?.value ?? '')
      const y2 = parseFlexibleNumber(block.find((item) => item.code === '21')?.value ?? '')
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        rawGeometries.push({
          id: `dxf-${rawGeometries.length + 1}`,
          name: dxfLayerName(block, 'Linha DXF'),
          type: 'LineString',
          coordinates: [[x1, y1], [x2, y2]],
        })
      }
      index = nextIndex - 1
      continue
    }

    if (marker === 'POINT') {
      const { block, nextIndex } = readDxfBlock(pairs, index + 1)
      const x = parseFlexibleNumber(block.find((item) => item.code === '10')?.value ?? '')
      const y = parseFlexibleNumber(block.find((item) => item.code === '20')?.value ?? '')
      if (Number.isFinite(x) && Number.isFinite(y)) {
        rawGeometries.push({
          id: `dxf-${rawGeometries.length + 1}`,
          name: dxfLayerName(block, 'Ponto DXF'),
          type: 'Point',
          coordinates: [x, y],
        })
      }
      index = nextIndex - 1
      continue
    }

    if (marker === 'CIRCLE' || marker === 'ARC') {
      const { block, nextIndex } = readDxfBlock(pairs, index + 1)
      const x = parseFlexibleNumber(block.find((item) => item.code === '10')?.value ?? '')
      const y = parseFlexibleNumber(block.find((item) => item.code === '20')?.value ?? '')
      const radius = parseFlexibleNumber(block.find((item) => item.code === '40')?.value ?? '')
      const start = marker === 'ARC' ? parseFlexibleNumber(block.find((item) => item.code === '50')?.value ?? '0') : 0
      const end = marker === 'ARC' ? parseFlexibleNumber(block.find((item) => item.code === '51')?.value ?? '360') : 360
      if ([x, y, radius, start, end].every(Number.isFinite) && radius > 0) {
        const coordinates = dxfArcCoordinates([x, y], radius, start, end)
        rawGeometries.push({
          id: `dxf-${rawGeometries.length + 1}`,
          name: dxfLayerName(block, marker === 'ARC' ? 'Arco DXF' : 'Circulo DXF'),
          type: marker === 'ARC' ? 'LineString' : 'Polygon',
          coordinates: marker === 'ARC' ? coordinates : [closeRing(coordinates)],
        })
      }
      index = nextIndex - 1
      continue
    }

    if (marker === 'LWPOLYLINE') {
      const { block, nextIndex } = readDxfBlock(pairs, index + 1)
      const vertices: Coordinate[] = []
      let currentX = Number.NaN
      let closed = false
      for (const item of block) {
        if (item.code === '70') closed = (Number.parseInt(item.value, 10) & 1) === 1
        if (item.code === '10') currentX = parseFlexibleNumber(item.value)
        if (item.code === '20') {
          const y = parseFlexibleNumber(item.value)
          if (Number.isFinite(currentX) && Number.isFinite(y)) vertices.push([currentX, y])
        }
      }
      if (vertices.length >= 2) {
        rawGeometries.push({
          id: `dxf-${rawGeometries.length + 1}`,
          name: dxfLayerName(block, 'Polilinha DXF'),
          type: closed && vertices.length >= 3 ? 'Polygon' : 'LineString',
          coordinates: closed && vertices.length >= 3 ? [closeRing(vertices)] : vertices,
        })
      }
      index = nextIndex - 1
      continue
    }

    if (marker === 'POLYLINE') {
      const { block, nextIndex } = readDxfBlock(pairs, index + 1)
      const vertices: Coordinate[] = []
      const closed = (Number.parseInt(block.find((item) => item.code === '70')?.value ?? '0', 10) & 1) === 1
      let cursor = nextIndex

      while (cursor < pairs.length && pairs[cursor].code === '0') {
        const vertexMarker = pairs[cursor].value.toUpperCase()
        if (vertexMarker === 'SEQEND') {
          cursor += 1
          break
        }
        if (vertexMarker !== 'VERTEX') break

        const vertexBlock = readDxfBlock(pairs, cursor + 1)
        const x = parseFlexibleNumber(vertexBlock.block.find((item) => item.code === '10')?.value ?? '')
        const y = parseFlexibleNumber(vertexBlock.block.find((item) => item.code === '20')?.value ?? '')
        if (Number.isFinite(x) && Number.isFinite(y)) vertices.push([x, y])
        cursor = vertexBlock.nextIndex
      }

      if (vertices.length >= 2) {
        rawGeometries.push({
          id: `dxf-${rawGeometries.length + 1}`,
          name: dxfLayerName(block, 'Polilinha DXF'),
          type: closed && vertices.length >= 3 ? 'Polygon' : 'LineString',
          coordinates: closed && vertices.length >= 3 ? [closeRing(vertices)] : vertices,
        })
      }
      index = cursor - 1
    }
  }

  const rawCoordinates = rawGeometries.flatMap(rawGeometryCoordinates)
  if (!rawCoordinates.length) throw new Error('DXF sem entidades suportadas. Use LINE, LWPOLYLINE, POLYLINE, POINT, CIRCLE ou ARC.')

  const useLatLon = dxfLooksLikeLngLat(rawCoordinates)
  const importedGeometries = rawGeometries.map((geometry) => convertDxfGeometry(geometry, useLatLon, zone, hemisphere))
  const allCoordinates = collectImportedCoordinates(importedGeometries)

  return {
    importedGeometries,
    allCoordinates,
    source: useLatLon ? 'latlon' : 'utm',
    polygonCount: importedGeometries.filter((feature) => feature.geometry.type === 'Polygon').length,
    lineCount: importedGeometries.filter((feature) => feature.geometry.type === 'LineString').length,
    pointCount: importedGeometries.filter((feature) => feature.geometry.type === 'Point').length,
  }
}


async function readKmlText(file: File) {
  const extension = file.name.toLowerCase().split('.').pop()
  if (extension === 'kmz') {
    const zip = await JSZip.loadAsync(file)
    const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith('.kml'))
    if (!entry) throw new Error('KMZ sem arquivo KML interno.')
    return entry.async('text')
  }

  return file.text()
}

function downloadObjectUrl(name: string, url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadFile(name: string, content: string, type = 'application/json') {
  downloadObjectUrl(name, URL.createObjectURL(new Blob([content], { type })))
}

function downloadBlob(name: string, blob: Blob) {
  downloadObjectUrl(name, URL.createObjectURL(blob))
}

function fileSafeName(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'PROJETO'
}

function todayFileDate() {
  const date = new Date()
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

function exportPngName(metadata: ProjectMetadata) {
  return `NX-${todayFileDate()}-${fileSafeName(metadata.projectName)}.png`
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Nao consegui gerar o PNG 4K.'))
    }, 'image/png')
  })
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Nao consegui carregar o SVG da marca NX.'))
    image.src = src
  })
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  let line = ''
  let lines = 0

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (context.measureText(testLine).width <= maxWidth) {
      line = testLine
      continue
    }

    if (line) {
      const isLastLine = lines + 1 >= maxLines
      context.fillText(isLastLine ? `${line}...` : line, x, y + lines * lineHeight)
      lines += 1
      if (isLastLine) return
    }
    line = word
  }

  if (line && lines < maxLines) {
    context.fillText(line, x, y + lines * lineHeight)
  }
}

function drawExportInfoBlock(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  maxLines = 2,
) {
  context.fillStyle = '#f97316'
  context.font = '700 24px Arial, sans-serif'
  context.fillText(label.toUpperCase(), x, y)

  context.fillStyle = '#f8fafc'
  context.font = '700 38px Arial, sans-serif'
  drawWrappedText(context, value, x, y + 52, width, 44, maxLines)
}

async function composeExportCanvasWithFooter(
  mapCanvas: HTMLCanvasElement,
  metadata: ProjectMetadata,
  attribution: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_WIDTH
  canvas.height = EXPORT_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Nao consegui preparar o rodape do PNG 4K.')
  const nxLogo = await loadImageElement(`${import.meta.env.BASE_URL}nx-white.svg`)

  context.drawImage(mapCanvas, 0, 0, EXPORT_WIDTH, EXPORT_MAP_HEIGHT)

  const footerTop = EXPORT_MAP_HEIGHT
  context.fillStyle = 'rgba(5, 7, 10, 0.94)'
  context.fillRect(0, footerTop, EXPORT_WIDTH, EXPORT_FOOTER_HEIGHT)

  context.fillStyle = '#f97316'
  context.fillRect(0, footerTop, EXPORT_WIDTH, 10)

  context.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, footerTop)
  context.lineTo(EXPORT_WIDTH, footerTop)
  context.stroke()

  const contentTop = footerTop + 58
  const margin = 92
  const brandWidth = 560
  const columnGap = 54
  const infoStart = margin + brandWidth + columnGap
  const infoWidth = EXPORT_WIDTH - infoStart - margin
  const projectWidth = Math.floor(infoWidth * 0.38)
  const addressWidth = Math.floor(infoWidth * 0.38)
  const noteWidth = infoWidth - projectWidth - addressWidth - columnGap * 2

  context.drawImage(nxLogo, margin - 10, contentTop - 28, 118, 88)
  context.fillStyle = '#f97316'
  context.font = '900 44px Arial, sans-serif'
  context.fillText('PROJETOS', margin + 132, contentTop + 54)
  context.fillStyle = '#94a3b8'
  context.font = '700 26px Arial, sans-serif'
  context.fillText('NXGEO - imagem georreferenciada', margin, contentTop + 108)
  context.fillText(new Date().toLocaleString('pt-BR'), margin, contentTop + 150)
  context.fillStyle = '#94a3b8'
  context.font = '500 18px Arial, sans-serif'
  drawWrappedText(context, attribution, margin, contentTop + 190, brandWidth - 30, 22, 2)

  context.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  context.beginPath()
  context.moveTo(margin + brandWidth, footerTop + 44)
  context.lineTo(margin + brandWidth, EXPORT_HEIGHT - 44)
  context.stroke()

  const projectName = normalizeLabel(metadata.projectName, 'Estudo de implantacao')
  const address = normalizeLabel(metadata.address, 'Endereco do projeto')
  const client = normalizeLabel(metadata.client, 'NX Projetos')
  const note = metadata.note.trim() ? `${client} - ${metadata.note.trim()}` : client

  drawExportInfoBlock(context, 'Projeto', projectName, infoStart, contentTop, projectWidth, 2)
  drawExportInfoBlock(context, 'Endereco', address, infoStart + projectWidth + columnGap, contentTop, addressWidth, 2)
  drawExportInfoBlock(context, 'Marca / observacao', note, infoStart + projectWidth + addressWidth + columnGap * 2, contentTop, noteWidth, 3)

  return canvas
}

function normalizeLabel(value: string, fallback: string) {
  return value.trim() || fallback
}

function waitForMapIdle(map: maplibregl.Map, timeoutMs = 45000) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      map.off('idle', done)
      reject(new Error('Tempo esgotado ao preparar os detalhes do mapa. Tente novamente.'))
    }, timeoutMs)
    const done = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }))
    if (map.loaded() && map.areTilesLoaded()) {
      done()
      return
    }
    map.once('idle', done)
  })
}

function App({ initialProject, workspaceTitle, onBack, onSaveProject, onSaveExport }: MapEditorProps) {
  const hasWorkspaceSave = Boolean(onSaveProject)
  const startingMetadata = initialProject
    ? { ...defaultMetadata, ...initialProject.metadata }
    : { ...defaultMetadata, projectName: workspaceTitle || defaultMetadata.projectName }
  const startingCorners = initialProject?.corners ?? defaultCorners
  const startingOverlayOptions = { ...defaultOverlayOptions, ...(initialProject?.overlayOptions ?? {}) }
  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<Marker[]>([])
  const projectCreatedAtRef = useRef(initialProject?.createdAt ?? new Date().toISOString())
  const initialMapRef = useRef({
    imageUrl: initialProject?.imageUrl ?? emptyPlanImage,
    corners: startingCorners,
    opacity: initialProject?.opacity ?? (initialProject ? 0.62 : 0),
    satellite: initialProject?.satellite ?? true,
    satelliteVariant: initialProject?.satelliteVariant ?? 'esri',
    streetNames: initialProject?.streetNames ?? true,
    viewport: initialProject?.viewport,
  })
  const [imageUrl, setImageUrl] = useState(initialProject?.imageUrl ?? emptyPlanImage)
  const [imageName, setImageName] = useState(initialProject?.name ?? 'Nenhum arquivo carregado')
  const [hasControlGeometry, setHasControlGeometry] = useState(initialProject?.hasControlGeometry ?? false)
  const [corners, setCorners] = useState<FourCoordinates>(startingCorners)
  const [inputs, setInputs] = useState(initialProject?.coordinateInputs ?? (initialProject ? startingCorners.map(coordinateToInput) : emptyInputs))
  const [mode, setMode] = useState<CoordinateMode>(initialProject?.coordinateMode ?? (initialProject ? 'latlon' : 'utm'))
  const [zone, setZone] = useState(initialProject?.zone ?? 23)
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>(initialProject?.hemisphere ?? 'S')
  const [opacity, setOpacity] = useState(initialProject?.opacity ?? 0.62)
  const [satellite, setSatellite] = useState(initialProject?.satellite ?? true)
  const [satelliteVariant, setSatelliteVariant] = useState<SatelliteVariant>(initialProject?.satelliteVariant ?? 'esri')
  const [streetNames, setStreetNames] = useState(initialProject?.streetNames ?? true)
  const [metadata, setMetadata] = useState<ProjectMetadata>(startingMetadata)
  const [surveyPoints, setSurveyPoints] = useState<SurveyPoint[]>(initialProject?.surveyPoints ?? [])
  const [importedGeometries, setImportedGeometries] = useState<ImportedGeometry[]>(initialProject?.importedGeometries ?? [])
  const [overlayOptions, setOverlayOptions] = useState<OverlayOptions>(startingOverlayOptions)
  const [status, setStatus] = useState(initialProject
    ? 'Mapa salvo aberto. Continue o trabalho ou prepare uma nova imagem.'
    : 'Comece importando PDNEZ/TXT, KML/KMZ, DXF ou carregando uma imagem da planta.')
  const [isExporting4k, setIsExporting4k] = useState(false)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const export4kLockRef = useRef(false)
  const canMarkDirtyRef = useRef(false)
  const changeVersionRef = useRef(0)
  const undoStackRef = useRef<AppSnapshot[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const latestMapStateRef = useRef({
    imageUrl,
    corners,
    hasControlGeometry,
    opacity,
    surveyPoints,
    importedGeometries,
    satellite,
    satelliteVariant,
    streetNames,
    overlayOptions,
  })

  latestMapStateRef.current = {
    imageUrl,
    corners,
    hasControlGeometry,
    opacity,
    surveyPoints,
    importedGeometries,
    satellite,
    satelliteVariant,
    streetNames,
    overlayOptions,
  }

  const project = useMemo<SavedProject>(() => ({
    schemaVersion: 2,
    name: imageName,
    createdAt: projectCreatedAtRef.current,
    updatedAt: new Date().toISOString(),
    imageUrl,
    hasControlGeometry,
    opacity,
    zone,
    hemisphere,
    coordinateMode: mode,
    coordinateInputs: inputs,
    corners,
    metadata,
    surveyPoints,
    importedGeometries,
    overlayOptions,
    satellite,
    satelliteVariant,
    streetNames,
  }), [corners, hasControlGeometry, hemisphere, imageName, imageUrl, importedGeometries, inputs, metadata, mode, opacity, overlayOptions, satellite, satelliteVariant, streetNames, surveyPoints, zone])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      canMarkDirtyRef.current = true
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (canMarkDirtyRef.current && hasWorkspaceSave) {
      changeVersionRef.current += 1
      setHasUnsavedChanges(true)
    }
  }, [hasWorkspaceSave, project])

  useEffect(() => {
    if (!hasUnsavedChanges || !hasWorkspaceSave) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsavedChanges, hasWorkspaceSave])

  const makeSnapshot = useCallback((): AppSnapshot => {
    return {
      imageUrl,
      imageName,
      hasControlGeometry,
      corners: corners.map((coordinate) => [...coordinate]) as FourCoordinates,
      inputs: [...inputs],
      mode,
      zone,
      hemisphere,
      opacity,
      satellite,
      satelliteVariant,
      streetNames,
      metadata: { ...metadata },
      surveyPoints: surveyPoints.map((point) => ({ ...point, coordinate: [...point.coordinate] as Coordinate })),
      importedGeometries: importedGeometries.map((feature) => JSON.parse(JSON.stringify(feature)) as ImportedGeometry),
      overlayOptions: { ...overlayOptions },
    }
  }, [corners, hasControlGeometry, hemisphere, imageName, imageUrl, importedGeometries, inputs, metadata, mode, opacity, overlayOptions, satellite, satelliteVariant, streetNames, surveyPoints, zone])

  const rememberState = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-24), makeSnapshot()]
    setCanUndo(true)
  }, [makeSnapshot])

  function restoreSnapshot(snapshot: AppSnapshot) {
    setImageUrl(snapshot.imageUrl)
    setImageName(snapshot.imageName)
    setHasControlGeometry(snapshot.hasControlGeometry)
    setCorners(snapshot.corners)
    setInputs(snapshot.inputs)
    setMode(snapshot.mode)
    setZone(snapshot.zone)
    setHemisphere(snapshot.hemisphere)
    setOpacity(snapshot.opacity)
    setSatellite(snapshot.satellite)
    setSatelliteVariant(snapshot.satelliteVariant ?? 'esri')
    setStreetNames(snapshot.streetNames ?? true)
    setMetadata(snapshot.metadata)
    setSurveyPoints(snapshot.surveyPoints ?? [])
    setImportedGeometries(snapshot.importedGeometries ?? [])
    setOverlayOptions(snapshot.overlayOptions ?? defaultOverlayOptions)
    window.requestAnimationFrame(() => fitToData(mapRef.current, snapshot.corners, snapshot.importedGeometries ?? [], snapshot.hasControlGeometry))
  }

  function undoLastChange() {
    const previous = undoStackRef.current.pop()
    if (!previous) return

    restoreSnapshot(previous)
    setCanUndo(undoStackRef.current.length > 0)
    setStatus('Alteracao desfeita. Voltei para o estado anterior do estudo.')
  }

  function updateOverlayOptions(update: Partial<OverlayOptions>) {
    rememberState()
    setOverlayOptions((current) => ({ ...current, ...update }))
  }

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return

    const initial = initialMapRef.current
    let viewportTrackingReady = false
    let viewportTrackingTimer = 0
    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: makeStyle(initial.satellite, initial.satelliteVariant, initial.streetNames),
      center: initial.corners[0] as LngLatLike,
      zoom: 15.5,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.addSource('floor-plan', {
        type: 'image',
        url: initial.imageUrl,
        coordinates: initial.corners,
      })
      map.addLayer({
        id: 'floor-plan-layer',
        type: 'raster',
        source: 'floor-plan',
        paint: { 'raster-opacity': initial.opacity, 'raster-fade-duration': 0 },
      })
      map.addSource('footprint', { type: 'geojson', data: footprintGeoJson(initial.corners, [], [], false) })
      map.addLayer({
        id: 'imported-fill',
        type: 'fill',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'imported']],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showImported) },
        paint: { 'fill-color': defaultOverlayOptions.importedColor, 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'footprint-fill',
        type: 'fill',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'footprint']],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showControl) },
        paint: { 'fill-color': defaultOverlayOptions.controlColor, 'fill-opacity': 0.14 },
      })
      map.addLayer({
        id: 'imported-line',
        type: 'line',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'imported'],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showImported) },
        paint: { 'line-color': defaultOverlayOptions.importedColor, 'line-width': 2.5 },
      })
      map.addLayer({
        id: 'footprint-line',
        type: 'line',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'footprint']],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showControl) },
        paint: { 'line-color': defaultOverlayOptions.controlColor, 'line-width': 3 },
      })
      map.addLayer({
        id: 'survey-points',
        type: 'circle',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'survey'],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showSurvey) },
        paint: {
          'circle-color': defaultOverlayOptions.surveyColor,
          'circle-radius': 5,
          'circle-stroke-color': '#052e16',
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: 'survey-labels',
        type: 'symbol',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'survey'],
        layout: {
          visibility: layerVisibility(defaultOverlayOptions.showSurvey && defaultOverlayOptions.showLabels),
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Regular'],
          'text-offset': [0, 1.2],
        },
        paint: { 'text-color': '#dcfce7', 'text-halo-color': '#052e16', 'text-halo-width': 1.2 },
      })
      map.addLayer({
        id: 'corner-points',
        type: 'circle',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'corner'],
        layout: { visibility: layerVisibility(defaultOverlayOptions.showControl) },
        paint: {
          'circle-color': defaultOverlayOptions.controlColor,
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'corner-labels',
        type: 'symbol',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'corner'],
        layout: {
          visibility: layerVisibility(defaultOverlayOptions.showControl && defaultOverlayOptions.showLabels),
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, 1.4],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#111827', 'text-halo-width': 1.5 },
      })
      const latest = latestMapStateRef.current
      const floorPlanSource = map.getSource('floor-plan') as ImageSource | undefined
      floorPlanSource?.updateImage({ url: latest.imageUrl, coordinates: latest.corners })
      map.setPaintProperty('floor-plan-layer', 'raster-opacity', latest.opacity)

      const footprintSource = map.getSource('footprint') as GeoJSONSource | undefined
      footprintSource?.setData(footprintGeoJson(
        latest.corners,
        latest.surveyPoints,
        latest.importedGeometries,
        latest.hasControlGeometry,
      ))
      applyOverlayOptions(map, latest.overlayOptions)

      map.setCenter([-47.88, -15.79])
      map.setZoom(4)
      setMapReady(true)
      window.requestAnimationFrame(() => {
        if (initial.viewport) {
          map.fitBounds(initial.viewport.bounds, { padding: 0, duration: 0 })
        } else {
          fitMapToCoordinates(
            map,
            [
              ...(latest.hasControlGeometry ? latest.corners : []),
              ...collectImportedCoordinates(latest.importedGeometries),
            ],
            satelliteMaxZoom(latest.satellite, latest.satelliteVariant),
          )
        }
        viewportTrackingTimer = window.setTimeout(() => {
          viewportTrackingReady = true
        }, 500)
      })
    })

    const markViewportDirty = () => {
      if (viewportTrackingReady && canMarkDirtyRef.current && hasWorkspaceSave) {
        changeVersionRef.current += 1
        setHasUnsavedChanges(true)
      }
    }
    map.on('moveend', markViewportDirty)

    mapRef.current = map

    return () => {
      window.clearTimeout(viewportTrackingTimer)
      map.off('moveend', markViewportDirty)
      markersRef.current.forEach((marker) => marker.remove())
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [hasWorkspaceSave])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTextInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (isTextInput) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoLastChange()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    if (map.getLayer('osm')) map.setLayoutProperty('osm', 'visibility', satellite ? 'none' : 'visible')
    if (map.getLayer('esri')) map.setLayoutProperty('esri', 'visibility', satellite && satelliteVariant === 'esri' ? 'visible' : 'none')
    if (map.getLayer('esri-clarity')) map.setLayoutProperty('esri-clarity', 'visibility', satellite && satelliteVariant === 'clarity' ? 'visible' : 'none')
    if (map.getLayer('street-labels')) map.setLayoutProperty('street-labels', 'visibility', satellite && streetNames ? 'visible' : 'none')
    const maxZoom = satelliteMaxZoom(satellite, satelliteVariant)
    if (satellite && map.getZoom() > maxZoom) map.zoomTo(maxZoom, { duration: 250 })
  }, [mapReady, satellite, satelliteVariant, streetNames])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    applyOverlayOptions(map, overlayOptions)
  }, [mapReady, overlayOptions])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    const source = map.getSource('floor-plan') as ImageSource | undefined
    if (!source || !map.getLayer('floor-plan-layer')) return
    source.updateImage({ url: imageUrl, coordinates: corners })
    map.setPaintProperty('floor-plan-layer', 'raster-opacity', opacity)

    const footprintSource = map.getSource('footprint') as GeoJSONSource | undefined
    if (!footprintSource) return
    footprintSource.setData(footprintGeoJson(corners, surveyPoints, importedGeometries, hasControlGeometry))

    markersRef.current.forEach((marker) => marker.remove())
    if (!hasControlGeometry || !overlayOptions.showControl) {
      markersRef.current = []
      return
    }
    markersRef.current = corners.map((coordinate, index) => {
      const element = document.createElement('button')
      element.className = 'corner-marker'
      element.type = 'button'
      element.textContent = cornersMeta[index].short
      element.title = cornersMeta[index].label
      element.style.backgroundColor = overlayOptions.controlColor

      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat(coordinate)
        .addTo(map)

      marker.on('dragend', () => {
        rememberState()
        const lngLat = marker.getLngLat()
        setCorners((current) => current.map((item, cornerIndex) => (
          cornerIndex === index ? [lngLat.lng, lngLat.lat] : item
        )) as FourCoordinates)
        setMode('latlon')
        setInputs((current) => current.map((item, cornerIndex) => (
          cornerIndex === index ? coordinateToInput([lngLat.lng, lngLat.lat]) : item
        )))
        setStatus('Ponto ajustado no mapa. As coordenadas agora estao em lat/lon.')
      })

      return marker
    })
  }, [corners, hasControlGeometry, imageUrl, importedGeometries, mapReady, opacity, overlayOptions.controlColor, overlayOptions.showControl, rememberState, surveyPoints])

  function fitToData(
    map = mapRef.current,
    nextCorners: FourCoordinates = corners,
    nextImportedGeometries: ImportedGeometry[] = importedGeometries,
    nextHasControlGeometry = hasControlGeometry,
  ) {
    if (!map) return
    const coordinates = [
      ...(nextHasControlGeometry ? nextCorners : []),
      ...collectImportedCoordinates(nextImportedGeometries),
    ]
    fitMapToCoordinates(map, coordinates, satelliteMaxZoom(satellite, satelliteVariant))
  }

  function scheduleFitToData(
    nextCorners: FourCoordinates = corners,
    nextImportedGeometries: ImportedGeometry[] = importedGeometries,
    nextHasControlGeometry = hasControlGeometry,
  ) {
    const map = mapRef.current
    const fit = () => fitToData(mapRef.current, nextCorners, nextImportedGeometries, nextHasControlGeometry)

    if (map?.getSource('footprint')) {
      window.requestAnimationFrame(fit)
      return
    }

    map?.once('load', () => window.requestAnimationFrame(fit))
  }

  function applyCoordinates() {
    try {
      const parsed = inputs.map((input) => {
        const numbers = parseNumbers(input)
        if (numbers.length < 2) throw new Error('Cada canto precisa de dois numeros.')

        if (mode === 'utm') {
          return utmToLngLat(numbers[0], numbers[1], zone, hemisphere)
        }

        return [numbers[1], numbers[0]] as Coordinate
      })

      if (parsed.length !== 4) throw new Error('Informe exatamente quatro cantos.')
      const nextCorners = parsed as FourCoordinates
      rememberState()
      setHasControlGeometry(true)
      setCorners(nextCorners)
      setStatus('Coordenadas aplicadas. Refine o encaixe pelos pontos de controle no mapa.')
      scheduleFitToData(nextCorners)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui ler essas coordenadas.')
    }
  }

  function handlePlanUpload(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      rememberState()
      setImageUrl(String(reader.result))
      setImageName(file.name)
      setStatus(hasControlGeometry ? 'Planta carregada sobre a geometria atual. Ajuste a opacidade ou os pontos se precisar.' : 'Planta carregada. Ela aparece como rascunho; importe PDNEZ/KML/DXF ou aplique coordenadas para posicionar com precisao.')
      window.requestAnimationFrame(() => {
        if (mapRef.current) fitMapToCoordinates(mapRef.current, corners, satelliteMaxZoom(satellite, satelliteVariant))
      })
    }
    reader.readAsDataURL(file)
  }

  function exportProject() {
    downloadFile('nxgeo-estudo.json', JSON.stringify(project, null, 2))
    setStatus('Estudo tecnico exportado em JSON com imagem, opacidade e quatro pontos.')
  }

  function exportGeoJson() {
    if (!hasControlGeometry && !importedGeometries.length && !surveyPoints.length) {
      setStatus('Nada para exportar ainda. Importe PDNEZ/TXT, KML/KMZ ou DXF primeiro.')
      return
    }
    downloadFile('nxgeo-contorno.geojson', JSON.stringify(footprintGeoJson(corners, surveyPoints, importedGeometries, hasControlGeometry), null, 2), 'application/geo+json')
    setStatus('Contorno exportado como GeoJSON.')
  }

  function exportKml() {
    if (!hasControlGeometry && !importedGeometries.length && !surveyPoints.length) {
      setStatus('Nada para exportar ainda. Importe PDNEZ/TXT, KML/KMZ ou DXF primeiro.')
      return
    }
    downloadFile('nxgeo-contorno.kml', makeKml(project), 'application/vnd.google-earth.kml+xml')
    setStatus('Contorno exportado como KML para Google Earth, Google Maps e apps GIS.')
  }

  async function exportKmz() {
    if (!hasControlGeometry && !importedGeometries.length && !surveyPoints.length) {
      setStatus('Nada para exportar ainda. Importe PDNEZ/TXT, KML/KMZ ou DXF primeiro.')
      return
    }
    const zip = new JSZip()
    zip.file('doc.kml', makeKml(project))
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' })
    downloadBlob('nxgeo-contorno.kmz', blob)
    setStatus('Contorno exportado como KMZ compacto para Google Earth e compartilhamento.')
  }

  async function importKmlKmz(file?: File) {
    if (!file) return

    try {
      const kmlText = await readKmlText(file)
      const extracted = extractKmlGeometries(kmlText)
      const imported = coordinatesToFourCorners(extracted.allCoordinates)
      rememberState()
      setHasControlGeometry(true)
      setSurveyPoints([])
      setImportedGeometries(extracted.importedGeometries)
      setOverlayOptions({ ...defaultOverlayOptions, showImported: true, showControl: false })
      setCorners(imported.corners)
      setMode('latlon')
      setInputs(imported.corners.map(coordinateToInput))
      setImageName((current) => importedFileName(current, file.name))
      setStatus(`KML/KMZ importado: ${extracted.polygonCount} poligonos, ${extracted.lineCount} linhas e ${extracted.pointCount} pontos. ${imported.exact ? 'Usei quatro vertices como controle.' : 'Usei o envelope geral como pontos de controle.'}`)
      scheduleFitToData(imported.corners, extracted.importedGeometries, true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui importar o KML/KMZ.')
    }
  }

  async function importPdnez(file?: File) {
    if (!file) return

    try {
      const text = await file.text()
      const points = parsePdnezText(text, zone, hemisphere)
      const pointCoordinates = points.map((point) => point.coordinate)
      const imported = coordinatesToFourCorners(pointCoordinates)
      const pdnezGeometry = pointCoordinates.length >= 3
        ? [makeImportedGeometry('pdnez-poligonal', 'Poligonal PDNEZ', 'Polygon', [closeRing(pointCoordinates)])]
        : [makeImportedGeometry('pdnez-linha', 'Linha PDNEZ', 'LineString', pointCoordinates)]

      rememberState()
      setHasControlGeometry(true)
      setSurveyPoints(points)
      setImportedGeometries(pdnezGeometry)
      setOverlayOptions({ ...defaultOverlayOptions, showImported: true, showControl: false, showSurvey: true })
      setCorners(imported.corners)
      setMode('utm')
      setInputs(imported.corners.map((coordinate) => lngLatToUtmInput(coordinate, zone, hemisphere)))
      setImageName((current) => importedFileName(current, file.name))
      setStatus(imported.exact
        ? `PDNEZ importado com ${points.length} pontos. Substitui os quatro controles em UTM ${zone}${hemisphere} e desenhei a poligonal.`
        : `PDNEZ importado com ${points.length} pontos. Desenhei a poligonal e usei o envelope como controle em UTM ${zone}${hemisphere}.`)
      scheduleFitToData(imported.corners, pdnezGeometry, true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui importar o PDNEZ.')
    }
  }

  async function importDxf(file?: File) {
    if (!file) return

    try {
      const text = await file.text()
      const extracted = extractDxfGeometries(text, zone, hemisphere)
      const imported = coordinatesToFourCorners(extracted.allCoordinates)
      rememberState()
      setHasControlGeometry(true)
      setSurveyPoints([])
      setImportedGeometries(extracted.importedGeometries)
      setOverlayOptions({ ...defaultOverlayOptions, showImported: true, showControl: false })
      setCorners(imported.corners)
      setMode(extracted.source === 'latlon' ? 'latlon' : 'utm')
      setInputs(extracted.source === 'latlon'
        ? imported.corners.map(coordinateToInput)
        : imported.corners.map((coordinate) => lngLatToUtmInput(coordinate, zone, hemisphere)))
      setImageName((current) => importedFileName(current, file.name))
      setStatus(`DXF importado: ${extracted.polygonCount} poligonos, ${extracted.lineCount} linhas e ${extracted.pointCount} pontos. Coordenadas lidas como ${extracted.source === 'latlon' ? 'longitude/latitude' : `UTM ${zone}${hemisphere}`}. ${imported.exact ? 'Usei quatro vertices como controle.' : 'Usei o envelope geral como pontos de controle.'}`)
      scheduleFitToData(imported.corners, extracted.importedGeometries, true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui importar o DXF.')
    }
  }


  async function renderImage4k() {
    const sourceMap = mapRef.current
    const visibleBounds = sourceMap?.getBounds()
    const currentBounds = visibleBounds
      ? [
          [visibleBounds.getWest(), visibleBounds.getSouth()],
          [visibleBounds.getEast(), visibleBounds.getNorth()],
        ] as [Coordinate, Coordinate]
      : null

    const container = document.createElement('div')
    Object.assign(container.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${EXPORT_WIDTH}px`,
      height: `${EXPORT_MAP_HEIGHT}px`,
      pointerEvents: 'none',
      opacity: '0',
    })
    document.body.appendChild(container)

    let exportMap: maplibregl.Map | null = null

    try {
      exportMap = new maplibregl.Map({
        container,
        style: makeStyle(satellite, satelliteVariant, streetNames),
        center: corners[0] as LngLatLike,
        zoom: 16,
        attributionControl: false,
        interactive: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        pixelRatio: 1,
      })

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Tempo esgotado ao carregar a base cartografica 4K.')), 45000)
        exportMap?.once('load', () => {
          window.clearTimeout(timer)
          resolve()
        })
      })

      exportMap.addSource('floor-plan', {
        type: 'image',
        url: imageUrl,
        coordinates: corners,
      })
      exportMap.addLayer({
        id: 'floor-plan-layer',
        type: 'raster',
        source: 'floor-plan',
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
      })
      exportMap.addSource('footprint', { type: 'geojson', data: footprintGeoJson(corners, surveyPoints, importedGeometries, hasControlGeometry) })
      exportMap.addLayer({
        id: 'imported-fill',
        type: 'fill',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'imported']],
        layout: { visibility: layerVisibility(overlayOptions.showImported) },
        paint: { 'fill-color': overlayOptions.importedColor, 'fill-opacity': 0.2 },
      })
      exportMap.addLayer({
        id: 'footprint-fill',
        type: 'fill',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'footprint']],
        layout: { visibility: layerVisibility(overlayOptions.showControl) },
        paint: { 'fill-color': overlayOptions.controlColor, 'fill-opacity': 0.16 },
      })
      exportMap.addLayer({
        id: 'imported-line',
        type: 'line',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'imported'],
        layout: { visibility: layerVisibility(overlayOptions.showImported) },
        paint: { 'line-color': overlayOptions.importedColor, 'line-width': 4 },
      })
      exportMap.addLayer({
        id: 'footprint-line',
        type: 'line',
        source: 'footprint',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'role'], 'footprint']],
        layout: { visibility: layerVisibility(overlayOptions.showControl) },
        paint: { 'line-color': overlayOptions.controlColor, 'line-width': 5 },
      })
      exportMap.addLayer({
        id: 'survey-points',
        type: 'circle',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'survey'],
        layout: { visibility: layerVisibility(overlayOptions.showSurvey) },
        paint: {
          'circle-color': overlayOptions.surveyColor,
          'circle-radius': 7,
          'circle-stroke-color': '#052e16',
          'circle-stroke-width': 2,
        },
      })
      exportMap.addLayer({
        id: 'survey-labels',
        type: 'symbol',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'survey'],
        layout: {
          visibility: layerVisibility(overlayOptions.showSurvey && overlayOptions.showLabels),
          'text-field': ['get', 'label'],
          'text-size': 14,
          'text-offset': [0, 1.3],
        },
        paint: { 'text-color': overlayOptions.surveyColor, 'text-halo-color': '#052e16', 'text-halo-width': 2 },
      })
      exportMap.addLayer({
        id: 'corner-points',
        type: 'circle',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'corner'],
        layout: { visibility: layerVisibility(overlayOptions.showControl) },
        paint: {
          'circle-color': overlayOptions.controlColor,
          'circle-radius': 9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      })
      exportMap.addLayer({
        id: 'corner-labels',
        type: 'symbol',
        source: 'footprint',
        filter: ['==', ['get', 'role'], 'corner'],
        layout: {
          visibility: layerVisibility(overlayOptions.showControl && overlayOptions.showLabels),
          'text-field': ['get', 'label'],
          'text-size': 18,
          'text-offset': [0, 1.4],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#111827', 'text-halo-width': 2 },
      })

      const exportCoordinates = [
        ...(hasControlGeometry ? corners : []),
        ...collectImportedCoordinates(importedGeometries),
      ]
      const [sw, ne] = currentBounds ?? getBounds(exportCoordinates.length ? exportCoordinates : corners)
      exportMap.fitBounds([sw, ne], { padding: 0, maxZoom: satelliteMaxZoom(satellite, satelliteVariant), duration: 0 })
      await waitForMapIdle(exportMap)

      const mapCanvas = exportMap.getCanvas()
      const baseAttribution = satellite
        ? 'Base: Esri, Maxar, Earthstar Geographics e GIS User Community'
        : 'Base: © OpenStreetMap contributors'
      const labelAttribution = satellite && streetNames
        ? ' | Rotulos: © OpenStreetMap contributors, © CARTO'
        : ''
      const exportCanvas = await composeExportCanvasWithFooter(
        mapCanvas,
        metadata,
        `${baseAttribution}${labelAttribution}`,
      )
      const png = await canvasToPngBlob(exportCanvas)
      const fileName = exportPngName(metadata)
      return {
        png,
        fileName,
        viewport: { bounds: [sw, ne] as [Coordinate, Coordinate] },
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('Nao consegui exportar a imagem 4K.')
    } finally {
      exportMap?.remove()
      container.remove()
    }
  }

  async function exportImage4k() {
    if (export4kLockRef.current) return
    export4kLockRef.current = true
    setIsExporting4k(true)
    setStatus('Renderizando mapa 4K com as coordenadas atuais. Isso pode levar alguns segundos.')

    try {
      const { png, fileName } = await renderImage4k()
      downloadBlob(fileName, png)
      setStatus(`PNG 4K exportado com a area visivel atual do mapa: ${fileName}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui exportar a imagem 4K.')
    } finally {
      export4kLockRef.current = false
      setIsExporting4k(false)
    }
  }

  async function saveWorkspaceProject() {
    if (!onSaveProject || export4kLockRef.current) return
    export4kLockRef.current = true
    setIsSavingWorkspace(true)
    setStatus('Salvando o mapa no painel…')
    const savingVersion = changeVersionRef.current

    try {
      const visibleBounds = mapRef.current?.getBounds()
      const viewport = visibleBounds
        ? {
            bounds: [
              [visibleBounds.getWest(), visibleBounds.getSouth()],
              [visibleBounds.getEast(), visibleBounds.getNorth()],
            ] as [Coordinate, Coordinate],
          }
        : project.viewport
      const revision = await onSaveProject({
        ...project,
        schemaVersion: 2,
        createdAt: projectCreatedAtRef.current,
        updatedAt: new Date().toISOString(),
        viewport,
      })
      if (changeVersionRef.current !== savingVersion) {
        setStatus('Mapa salvo. Existem alteracoes mais recentes; salve novamente para atualizar a imagem rapida.')
        return
      }
      setHasUnsavedChanges(false)
      setStatus('Mapa salvo. Preparando a imagem rápida para o painel…')

      if (onSaveExport) {
        try {
          const { png } = await renderImage4k()
          await onSaveExport(png, revision)
          setStatus('Mapa salvo. A imagem rápida também está pronta no painel.')
        } catch (exportError) {
          const reason = exportError instanceof Error ? exportError.message : 'nao foi possivel gerar a imagem'
          setStatus(`Mapa salvo com seguranca. A imagem rapida nao foi atualizada: ${reason}`)
        }
      } else {
        setStatus('Mapa salvo no painel.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Nao consegui salvar o mapa no painel.')
    } finally {
      export4kLockRef.current = false
      setIsSavingWorkspace(false)
    }
  }

  function returnToWorkspace() {
    if (hasUnsavedChanges && !window.confirm('Voltar aos projetos sem salvar as alteracoes deste mapa?')) return
    onBack?.()
  }

  function importProject(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as SavedProject
        if (!Array.isArray(data.corners) || data.corners.length !== 4) throw new Error('Estudo sem quatro pontos.')
        const importedCorners = data.corners as FourCoordinates
        rememberState()
        setImageUrl(data.imageUrl)
        setImageName(data.name || file.name)
        setOpacity(data.opacity ?? 0.62)
        setZone(data.zone ?? 23)
        setHemisphere(data.hemisphere ?? 'S')
        setMetadata({ ...defaultMetadata, ...(data.metadata ?? {}) })
        setSatellite(data.satellite ?? true)
        setSatelliteVariant(data.satelliteVariant ?? 'esri')
        setStreetNames(data.streetNames ?? true)
        setHasControlGeometry(data.hasControlGeometry ?? true)
        setSurveyPoints(data.surveyPoints ?? [])
        setImportedGeometries(data.importedGeometries ?? [])
        setOverlayOptions({ ...defaultOverlayOptions, ...(data.overlayOptions ?? {}) })
        setCorners(importedCorners)
        setMode(data.coordinateMode ?? 'latlon')
        setInputs(data.coordinateInputs ?? importedCorners.map(coordinateToInput))
        setStatus('Estudo importado. Ajuste o encaixe ou exporte novamente quando estiver pronto.')
        scheduleFitToData(importedCorners, data.importedGeometries ?? [], data.hasControlGeometry ?? true)
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Arquivo invalido. Use um JSON exportado pelo NXGEO.')
      }
    }
    reader.readAsText(file)
  }

  function resetStudy() {
    rememberState()
    setImageUrl(emptyPlanImage)
    setImageName('Nenhum arquivo carregado')
    setHasControlGeometry(false)
    setMode('utm')
    setZone(23)
    setHemisphere('S')
    setCorners(defaultCorners)
    setInputs(emptyInputs)
    setOpacity(0.62)
    setSatellite(true)
    setSatelliteVariant('esri')
    setStreetNames(true)
    setMetadata(defaultMetadata)
    setSurveyPoints([])
    setImportedGeometries([])
    setOverlayOptions(defaultOverlayOptions)
    setStatus('Estudo limpo. Importe PDNEZ/TXT, KML/KMZ, DXF ou carregue uma imagem.')
    mapRef.current?.flyTo({ center: [-47.88, -15.79], zoom: 4, duration: 500 })
  }

  function resetDemo() {
    rememberState()
    setImageUrl(demoPlanSvg)
    setImageName('planta-demo.svg')
    setHasControlGeometry(true)
    setMode('utm')
    setZone(23)
    setHemisphere('S')
    setCorners(defaultCorners)
    setInputs(demoUtm)
    setOpacity(0.62)
    setSatellite(true)
    setSatelliteVariant('esri')
    setStreetNames(true)
    setMetadata(defaultMetadata)
    setSurveyPoints([])
    setImportedGeometries([])
    setOverlayOptions({ ...defaultOverlayOptions, showControl: true })
    setStatus('Base demonstrativa restaurada.')
    scheduleFitToData(defaultCorners, [], true)
  }

  return (
    <main className="workspace">
      <aside className="tool-panel" aria-label="Controles de georreferenciamento">
        <header className="brand">
          {onBack && (
            <button className="editor-back" type="button" onClick={returnToWorkspace} disabled={isSavingWorkspace} title="Voltar aos projetos" aria-label="Voltar aos projetos">
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
          )}
          <a className="brand-mark" href="/" aria-label="Voltar para o site da NX"><img src={`${import.meta.env.BASE_URL}nx-white.svg`} alt="NX" /></a>
          <div>
            <p>GEO</p>
            <span>{workspaceTitle || 'projetos, regularizacoes e territorio'}</span>
          </div>
          <div className="editor-brand-actions">
            {onSaveProject && (
              <button className="editor-save" type="button" onClick={() => void saveWorkspaceProject()} disabled={isSavingWorkspace || isExporting4k}>
                {isSavingWorkspace ? <span className="editor-save-spinner" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                <span>{isSavingWorkspace ? 'Salvando' : 'Salvar'}</span>
              </button>
            )}
            <button className="brand-signout" type="button" onClick={() => void supabase.auth.signOut()} title="Sair do NXGEO">
              <LogOut size={16} aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        <section className="control-group">
          <div className="group-title">
            <FileImage size={17} />
            <span>Planta do projeto</span>
          </div>
          <label className="file-button">
            <Upload size={17} />
            <span>Planta PNG/JPG</span>
            <input type="file" accept="image/*" onChange={(event) => handlePlanUpload(event.target.files?.[0])} />
          </label>
          <label className="file-button ghost">
            <FolderOpen size={17} />
            <span>Abrir NXGEO</span>
            <input type="file" accept="application/json,.json" onChange={(event) => importProject(event.target.files?.[0])} />
          </label>
          <label className="file-button ghost">
            <FolderOpen size={17} />
            <span>Importar KML/KMZ</span>
            <input type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" onChange={(event) => importKmlKmz(event.target.files?.[0])} />
          </label>
          <label className="file-button ghost">
            <FolderOpen size={17} />
            <span>Importar PDNEZ</span>
            <input type="file" accept=".txt,.csv,.pdnez,text/plain,text/csv" onChange={(event) => importPdnez(event.target.files?.[0])} />
          </label>
          <label className="file-button ghost">
            <FolderOpen size={17} />
            <span>Importar DXF</span>
            <input type="file" accept=".dxf,application/dxf,application/x-dxf,drawing/x-dxf" onChange={(event) => importDxf(event.target.files?.[0])} />
          </label>
          <div className="filename" title={imageName}>{imageName}</div>
        </section>

        <section className="control-group">
          <div className="group-title">
            <Crosshair size={17} />
            <span>Pontos de controle</span>
          </div>
          <div className="segmented" role="group" aria-label="Tipo de coordenada">
            <button className={mode === 'utm' ? 'active' : ''} onClick={() => setMode('utm')}>UTM</button>
            <button className={mode === 'latlon' ? 'active' : ''} onClick={() => setMode('latlon')}>Lat/Lon</button>
          </div>
          {mode === 'utm' && (
            <div className="utm-row">
              <label>
                Zona
                <input value={zone} type="number" min="1" max="60" onChange={(event) => setZone(Number(event.target.value))} />
              </label>
              <label>
                Hemisferio
                <select value={hemisphere} onChange={(event) => setHemisphere(event.target.value as 'N' | 'S')}>
                  <option value="S">Sul</option>
                  <option value="N">Norte</option>
                </select>
              </label>
            </div>
          )}
          <div className="corner-inputs">
            {cornersMeta.map((corner, index) => (
              <label key={corner.key}>
                {corner.label}
                <input
                  value={inputs[index]}
                  onChange={(event) => setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={mode === 'utm' ? 'E 521941.330 N 9535373.850' : '-4.201319, -44.789215'}
                />
              </label>
            ))}
          </div>
          <button className="primary-action" onClick={applyCoordinates}><BringToFront size={17} /> Georreferenciar</button>
        </section>

        <section className="control-group">
          <div className="group-title">
            <FileText size={17} />
            <span>Dados da prancha</span>
          </div>
          <div className="sheet-fields">
            <label>
              Projeto
              <input value={metadata.projectName} onChange={(event) => setMetadata((current) => ({ ...current, projectName: event.target.value }))} />
            </label>
            <label>
              Endereco
              <input value={metadata.address} onChange={(event) => setMetadata((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label>
              Cliente / marca
              <input value={metadata.client} onChange={(event) => setMetadata((current) => ({ ...current, client: event.target.value }))} />
            </label>
            <label>
              Observacao
              <textarea value={metadata.note} onChange={(event) => setMetadata((current) => ({ ...current, note: event.target.value }))} />
            </label>
          </div>
        </section>

        <section className="control-group compact">
          <div className="group-title">
            <Satellite size={17} />
            <span>Base cartografica</span>
          </div>
          <div className="segmented base-selector" role="group" aria-label="Base do mapa">
            <button className={!satellite ? 'active' : ''} onClick={() => setSatellite(false)}>Mapa</button>
            <button
              className={satellite && satelliteVariant === 'esri' ? 'active' : ''}
              onClick={() => {
                setSatellite(true)
                setSatelliteVariant('esri')
              }}
            >
              Satelite
            </button>
            <button
              className={satellite && satelliteVariant === 'clarity' ? 'active' : ''}
              onClick={() => {
                setSatellite(true)
                setSatelliteVariant('clarity')
              }}
            >
              Clarity
            </button>
          </div>
          <label className="switch-row">
            <span>Nomes de ruas</span>
            <input type="checkbox" checked={streetNames} onChange={(event) => setStreetNames(event.target.checked)} />
          </label>
          <label className="range-row">
            <span>Opacidade</span>
            <strong>{Math.round(opacity * 100)}%</strong>
            <input type="range" min="0.1" max="1" step="0.02" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>
          <div className="action-grid">
            <button onClick={() => fitToData()}><Crosshair size={16} /> Centralizar</button>
            <button onClick={undoLastChange} disabled={!canUndo}><Undo2 size={16} /> Desfazer</button>
            <button onClick={resetStudy}><RotateCcw size={16} /> Limpar</button>
            <button onClick={resetDemo}><RotateCcw size={16} /> Demo</button>
          </div>
          <div className="action-grid export-grid">
            <button onClick={exportProject}><Download size={16} /> Salvar NXGEO</button>
            <button onClick={exportGeoJson}><Download size={16} /> GeoJSON</button>
            <button onClick={exportKml}><Download size={16} /> KML</button>
            <button onClick={exportKmz}><Download size={16} /> KMZ</button>
            <button onClick={exportImage4k} disabled={isExporting4k}><Download size={16} /> {isExporting4k ? 'Gerando 4K' : 'PNG 4K'}</button>
          </div>
        </section>

        <section className="control-group compact">
          <div className="group-title">
            <Palette size={17} />
            <span>Filtros do mapa</span>
          </div>
          <div className="filter-list">
            <label className="switch-row layer-switch">
              <span><Eye size={15} /> Projeto importado</span>
              <input type="checkbox" checked={overlayOptions.showImported} onChange={(event) => updateOverlayOptions({ showImported: event.target.checked })} />
            </label>
            <label className="switch-row layer-switch">
              <span><Eye size={15} /> Pontos PDNEZ</span>
              <input type="checkbox" checked={overlayOptions.showSurvey} onChange={(event) => updateOverlayOptions({ showSurvey: event.target.checked })} />
            </label>
            <label className="switch-row layer-switch">
              <span><Eye size={15} /> Rotulos</span>
              <input type="checkbox" checked={overlayOptions.showLabels} onChange={(event) => updateOverlayOptions({ showLabels: event.target.checked })} />
            </label>
            <label className="switch-row layer-switch">
              <span><EyeOff size={15} /> Controle de ajuste</span>
              <input type="checkbox" checked={overlayOptions.showControl} onChange={(event) => updateOverlayOptions({ showControl: event.target.checked })} />
            </label>
          </div>
          <div className="color-tools">
            <label>
              Cor do projeto
              <div className="color-row">
                <input type="color" value={overlayOptions.importedColor} onChange={(event) => updateOverlayOptions({ importedColor: event.target.value })} />
                <div className="swatches">
                  {overlayPalette.map((color) => (
                    <button
                      key={`imported-${color.value}`}
                      type="button"
                      className={overlayOptions.importedColor === color.value ? 'active' : ''}
                      title={color.label}
                      aria-label={`Cor do projeto: ${color.label}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => updateOverlayOptions({ importedColor: color.value })}
                    />
                  ))}
                </div>
              </div>
            </label>
            <label>
              Cor do controle
              <div className="color-row">
                <input type="color" value={overlayOptions.controlColor} onChange={(event) => updateOverlayOptions({ controlColor: event.target.value })} />
                <div className="swatches">
                  {overlayPalette.map((color) => (
                    <button
                      key={`control-${color.value}`}
                      type="button"
                      className={overlayOptions.controlColor === color.value ? 'active' : ''}
                      title={color.label}
                      aria-label={`Cor do controle: ${color.label}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => updateOverlayOptions({ controlColor: color.value })}
                    />
                  ))}
                </div>
              </div>
            </label>
          </div>
        </section>

        <div className="status-line" role="status">{status}</div>
      </aside>

      <section className="map-stage" aria-label="Mapa">
        <div className="map-toolbar">
          <span>Ajuste os pontos de controle para alinhar planta, area e base cartografica</span>
        </div>
        <div ref={mapNodeRef} className="map" />
      </section>
    </main>
  )
}

export default App
