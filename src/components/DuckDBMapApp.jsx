import React, { useEffect, useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { GeoArrowScatterplotLayer, GeoArrowPolygonLayer } from "@geoarrow/deck.gl-layers";
import { tableFromArrays } from 'apache-arrow';
import { WKBLoader } from '@loaders.gl/wkt';
import { parseSync } from '@loaders.gl/core';
import * as arrow from "apache-arrow";


const INITIAL_VIEW_STATE = {
  latitude: 0,
  longitude: 0,
  zoom: 0,
  bearing: 0,
  pitch: 0
};

const QUERY_OPTIONS = {
  'portugal-south': {
    label: '1. Portugal Places - South of Lisbon',
    query: `SELECT id, confidence, st_aswkb(geometry) as geometry
FROM read_parquet('https://files.sunu.in/PT.parquet')
WHERE bbox.maxy < 38.7;`,
    description: 'Shows places in southern Portugal. Downloads ~20MB of data.',
    viewState: {
      latitude: 38.0,
      longitude: -9.0,
      zoom: 4,
      bearing: 0,
      pitch: 0
    }
  },

  'portugal-filtered': {
    label: '2. Portugal Places Filtered by Confidence',
    query: `SELECT id, confidence, st_aswkb(geometry) as geometry
FROM read_parquet('https://files.sunu.in/PT.parquet')
WHERE bbox.maxy < 38.7
AND confidence > 0.95;`,
    description: 'Filtered view of high-confidence places in southern Portugal. Downloads ~10MB of data.',
    viewState: {
      latitude: 38.0,
      longitude: -9.0,
      zoom: 4,
      bearing: 0,
      pitch: 0
    }
  },

  'portugal-all': {
    label: '3. Portugal Places - All',
    query: `SELECT id, confidence, st_aswkb(geometry) as geometry
FROM read_parquet('https://data.source.coop/cholmes/overture/places-geoparquet-country/PT.parquet');`,
    description: 'Complete dataset of places in Portugal. Downloads ~29MB of data.',
    viewState: {
      latitude: 39.5,
      longitude: -8.0,
      zoom: 4,
      bearing: 0,
      pitch: 0
    }
  },

  'stac-sentinel-footprints': {
    label: '4. Sentinel-2 Footprints',
    query: `SELECT id, st_aswkb(geometry) as geometry
FROM read_parquet('https://files.sunu.in/pc-sentinel-2-l2a-1000.parquet');`,
    description: 'Shows Sentinel-2 satellite image footprints from a small STAC collection. Downloads ~6MB of data.',
    viewState: {
      latitude: 0,
      longitude: 0,
      zoom: 0,
      bearing: 0,
      pitch: 0
    }
  },

  'stac-sentinel-filtered': {
    label: '5. Sentinel-2 Footprints - North of Equator',
    query: `SELECT id, st_aswkb(geometry) as geometry
FROM read_parquet('https://files.sunu.in/pc-sentinel-2-l2a-1000.parquet')
WHERE bbox.ymax > 0;`,
    description: 'Filtered view of Sentinel-2 footprints in Northern Hemisphere from a small remote stac-geoparquet file. Downloads ~2MB of data.',
    viewState: {
      latitude: 30,
      longitude: 0,
      zoom: 1,
      bearing: 0,
      pitch: 0
    }
  },

  'andorra-places': {
    label: '6. Andorra Places',
    query: `SELECT id, st_aswkb(geometry) as geometry
FROM read_parquet('https://data.source.coop/cholmes/overture/places-geoparquet-country/AD.parquet')
LIMIT 200;`,
    description: 'Sample of places in Andorra (limited to 200 records).',
    viewState: {
      latitude: 42.5,
      longitude: 1.6,
      zoom: 10,
      bearing: 0,
      pitch: 0
    }
  },

//   'india-places': {
//     label: '7. India Places - 2 Million',
//     query: `SELECT id, confidence, st_aswkb(geometry) as geometry
// FROM read_parquet('http://localhost:8080/IN.parquet')
// LIMIT 2000000;`,
//     description: 'Sample of places in India (limited to 2 million records).',
//     viewState: {
//       latitude: 25,
//       longitude: 80,
//       zoom: 4,
//       bearing: 0,
//       pitch: 0
//     }
//   },

//   'india-places-filtered': {
//     label: '8. India Places - Filtered by Confidence and Latitude',
//     query: `SELECT id, confidence, st_aswkb(geometry) as geometry
// FROM read_parquet('http://localhost:8080/IN.parquet')
// WHERE bbox.maxy > 28.70
// AND confidence > 0.95
// LIMIT 500000;`,
//     description: 'Sample of high-confidence places in northern India (limited to 500,000 records).',
//     viewState: {
//       latitude: 25,
//       longitude: 80,
//       zoom: 4,
//       bearing: 0,
//       pitch: 0
//     }
//   }
};

export default function DuckDBMapApp() {
  const [query, setQuery] = useState(Object.values(QUERY_OPTIONS)[0].query);
  const [currentQueryDescription, setCurrentQueryDescription] = useState(Object.values(QUERY_OPTIONS)[0].description);
  const [db, setDb] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [showBaseLayers, setShowBaseLayers] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedQuery, setSelectedQuery] = useState(Object.keys(QUERY_OPTIONS)[0]);
  const [downloadTime, setDownloadTime] = useState(null);
  const [renderTime, setRenderTime] = useState(null);
  const [renderStartTime, setRenderStartTime] = useState(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove the # symbol
      if (hash && QUERY_OPTIONS[hash]) {
        setSelectedQuery(hash);
        setQuery(QUERY_OPTIONS[hash].query);
        setCurrentQueryDescription(QUERY_OPTIONS[hash].description);
      }
    };

    // Handle hash on initial load
    handleHashChange();

    // Add event listener for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Cleanup
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleQuerySelect = (e) => {
    const queryName = e.target.value;
    window.location.hash = queryName; // This will trigger the hashchange event
  };

  useEffect(() => {
    async function initDuckDB() {
      try {
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript",
          })
        );

        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger();
        const newDb = new duckdb.AsyncDuckDB(logger, worker);
        
        await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);
        await newDb.open();
        
        setDb(newDb);
      } catch (err) {
        setError(`Failed to initialize DuckDB: ${err.message}`);
      }
    }

    initDuckDB();
  }, []);

  const executeQuery = async () => {
    if (!db) {
      setError('DuckDB is still initializing. Please wait...');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDownloadTime(null);
    setRenderTime(null);
    const startTime = performance.now();

    try {
      const conn = await db.connect();
      await conn.query(`
        INSTALL spatial;
        LOAD spatial;
      `);

      const result = await conn.query(query);
      const data = await result.toArray();

      // console.log("Result: ", data);

      setShowBaseLayers(true);

      let parsed;
      
      const ids = Array.from(data.map(d => d.id));
      const confidence = Array.from(data.map(
        d => {
          if (d.confidence) {
            // console.log("Confidence: ", d.confidence);
            return d.confidence;
          }
          return null;
        }
      ));
      const geometries = Array.from(data.map((d) => {
        const buffer = d.geometry;
        parsed = parseSync(buffer, WKBLoader);
        // console.log("Parsed: ", parsed);
        return parsed.positions.value;
      }));
      let dataType = parsed.type;
      // console.log("Data type: ", dataType);
      // console.log("Geometries: ", geometries);
      // console.log("Ids: ", ids);
      // console.log("Confidence: ", confidence);

      let newParsedData = null;
      let table = null;
      const coordType = new arrow.Float(arrow.Precision.DOUBLE);
      const pointType = new arrow.FixedSizeList(
        2,
        new arrow.Field("xy", coordType, false),
      );
      const ringType = new arrow.List(
        new arrow.Field("vertices", pointType, false)
      );
      const polygonType = new arrow.List(
        new arrow.Field("rings", ringType, false)
      );

      if (dataType === "Point") {

        const flattenedPoints = new Float64Array(geometries.flatMap(arr => [...arr]));

        const coordData = arrow.makeData({
          type: coordType,
          data: flattenedPoints,
        });
        const pointData = arrow.makeData({
          type: pointType,
          child: coordData,
        });
        // console.log("Point data: ", pointData);
        table = tableFromArrays({
          id: ids,
          geometry: pointData,
          confidence: confidence
        });
        newParsedData = {
          "table": table,
          "type": "Point",
        };
      }

      if (dataType === "Polygon") {
        const flattenedPolygons = geometries.flatMap(arr => [...arr]);
        // console.log("Flattened polygons length:", flattenedPolygons.length);
        // console.log("First polygon data:", flattenedPolygons);
        
        const coordData = arrow.makeData({
          type: coordType,
          data: flattenedPolygons,
        });
        const pointData = arrow.makeData({
          type: pointType,
          child: coordData,
        });

        const ringOffsets = [0];
        for (let i = 0; i < geometries.length; i += 1) {
          let current = ringOffsets[ringOffsets.length - 1];
          ringOffsets.push(current + geometries[i].length/2);
        }
        // console.log("Ring offsets: ", ringOffsets);

        const ringData = arrow.makeData({
          type: ringType,
          child: pointData,
          valueOffsets: ringOffsets,
        });

        const numGeometries = geometries.length;
        const valueOffsets = Array.from({ length: numGeometries + 1 }, (_, i) => i);
        // console.log("Value offsets: ", valueOffsets);

        const polygonData = arrow.makeVector({
          type: polygonType,
          child: ringData,
          valueOffsets: valueOffsets,
        });
        // console.log("Polygon data: ", polygonData);
        // console.log("Og polygon data: ", ogPolygonData);
        // let polygonExterior = await getPolygonExterior(polygonData);
        // console.log("Polygon exterior: ", polygonExterior);
        table = tableFromArrays({
          id: ids,
          geometry: polygonData,
        });
        // set the metadata for the geometry field
        table.schema.fields[1].metadata.set("ARROW:extension:name", "geoarrow.polygon");
        newParsedData = {
          "table": table,
          "type": "Polygon",
        };
      }

      const endTime = performance.now();
      const timeInSeconds = ((endTime - startTime) / 1000).toFixed(2);
      setDownloadTime(timeInSeconds);
      
      setRenderStartTime(performance.now());
      setParsedData(newParsedData);
      setError(null);
      
      // Update viewState with animation using the viewState from QUERY_OPTIONS
      setViewState({
        ...QUERY_OPTIONS[selectedQuery].viewState,
        transitionDuration: 2000
      });
      
      await conn.close();
    } catch (err) {
      setError(`Query error: ${err.message}`);
      console.log("Error: ", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearMap = () => {
    setShowBaseLayers(false);
    setParsedData(null);
    setHoverInfo(null);
    setRenderTime(null);
    setRenderStartTime(null);
    setViewState({
      ...INITIAL_VIEW_STATE,
      transitionDuration: 2000
    });
  };

  const layers = [
    // Base TileLayer - always shown
    new TileLayer({
      data: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: props => {
        const {
          bbox: { west, south, east, north }
        } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north]
        });
      }
    }),
    // Other layers - conditional on showBaseLayers
    ...(parsedData && showBaseLayers ? [
      parsedData.type === "Point" ? 
        new GeoArrowScatterplotLayer({
          id: "scatterplot",
          data: parsedData.table,
          getPosition: parsedData.table.getChild("geometry"),
          getFillColor: [255, 0, 0],
          getRadius: 5,
          radiusMinPixels: 2,
          pickable: true,
          onHover: info => {
            setHoverInfo(info.object ? info : null);
          },
          onClick: info => {
            if (info.object) {
              console.log("Info: ", info);
              console.log("Confidence: ", info.object.confidence);
            }
          },
        })
      : new GeoArrowPolygonLayer({
          id: "polygon",
          data: parsedData.table,
          geometry: parsedData.table.getChild("geometry"),
          getFillColor: [255, 0, 0, 100],
          getLineColor: [255, 0, 0],
          lineWidthMinPixels: 1,
          pickable: true,
          onHover: info => {
            setHoverInfo(info.object ? info : null);
          },
          // onClick: info => {
          //   if (info.object) {
          //     console.log("Info: ", info);
          //     console.log("STAC Item ID: ", info.object.id);
          //   }
          // },
        })
    ] : [])
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="bg-gray-800 p-4 text-white">
        <h1 className="text-2xl text-center">GeoParquet + DuckDB WASM + Deck.gl Demo</h1>
      </header>
      
      <div className="flex flex-1">
        <div className="w-2/5 bg-gray-100 p-4 flex flex-col gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-2">DuckDB Query</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Query Template
              </label>
              <select
                onChange={handleQuerySelect}
                value={selectedQuery}
                className="w-full p-2 border rounded bg-white"
              >
                {Object.entries(QUERY_OPTIONS).map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 p-2 bg-blue-50 text-sm text-blue-800 rounded">
                {currentQueryDescription}
              </div>
              
              <div className="mt-2 p-2 bg-yellow-50 text-sm text-yellow-800 rounded">
                <strong>Note:</strong> DuckDB WASM currently uses sequential HTTP range requests to download data. While this means less total data is downloaded, 
                the sequential nature of the requests may result in slower loading times.{' '}
                <a 
                  href="https://github.com/duckdb/duckdb-wasm/issues/1723" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-yellow-600 hover:underline"
                >
                  Learn more
                </a>
              </div>
            </div>

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-48 p-2 font-mono border rounded"
            />
            <div className="flex gap-2">
              <button
                onClick={executeQuery}
                disabled={isLoading}
                className={`mt-2 px-4 py-2 text-white rounded flex items-center gap-2
                  ${isLoading ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  'Execute Query'
                )}
              </button>
              <button
                onClick={handleClearMap}
                disabled={isLoading}
                className={`mt-2 px-4 py-2 text-white rounded
                  ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-600 hover:bg-slate-700'}`}
              >
                Clear Map
              </button>
            </div>

            {/* Update loading indicator to remove duplicate note */}
            {isLoading && (
              <div className="mt-2 p-2 bg-blue-50 text-blue-800 rounded flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading data... This might take a few seconds to a few minutes depending on the query.
              </div>
            )}

            {error && (
              <div className="mt-2 p-2 text-red-500 bg-red-100 rounded">
                {error}
              </div>
            )}
            <div className="mt-4 p-2 bg-gray-50 rounded overflow-auto max-h-48">
              {/* <pre>{results}</pre> */}
            </div>

            {downloadTime && !isLoading && (
              <div className="mt-2 p-2 bg-green-50 text-green-800 rounded">
                Data downloaded in {downloadTime} seconds
              </div>
            )}
            {renderTime && !isLoading && (
              <div className="mt-2 p-2 bg-blue-50 text-blue-800 rounded">
                Data rendered in {renderTime} seconds
              </div>
            )}
          </div>
        </div>
        
        <div className="w-3/5" style={{ height: '100vh', width: '50vw', position: 'relative' }}>
          <DeckGL
            viewState={viewState}
            onViewStateChange={({viewState}) => setViewState(viewState)}
            controller={true}
            layers={layers}
          />
          {hoverInfo?.object && (
            <div 
              style={{
                position: 'absolute',
                zIndex: 1,
                pointerEvents: 'none',
                left: hoverInfo.x,
                top: hoverInfo.y,
                backgroundColor: 'white',
                padding: '4px',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }}
            >
              {(() => {
                if (hoverInfo.object.confidence) {
                  return <div>Confidence: {hoverInfo.object.confidence}</div>;
                } else if (hoverInfo.object.id) {
                  return <div>Item ID: {hoverInfo.object.id}</div>;
                }
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}