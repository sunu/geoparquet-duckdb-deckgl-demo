# Geospatial data in the browser with Geoparquet, DuckDB WASM and DeckGL

A proof-of-concept demonstrating efficient browser-based geospatial data querying and visualization using GeoParquet, DuckDB-WASM, and deck.gl.

Demo Video - Places from Overture dataset in northern India filtered by confidence and latitude:


https://github.com/user-attachments/assets/66f5a226-ff29-4906-b102-96de63883507



## 🚀 Key Features

- **Fully Serverless**: Everything runs directly in the browser through DuckDB-WASM
- **Binary-First Pipeline**: Data flows from GeoParquet → DuckDB → Arrow → deck.gl buffers without text conversion
- **Efficient Data Loading**: range requests fetch only the needed data segments
- **Interactive Filtering**: DuckDB SQL queries for both spatial and attribute filtering
- **Large Dataset Support**: visualize millions of features directly in the browser through DeckGL
- **STAC Catalog Integration**: Query and visualize STAC catalogs without a dedicated server

## 🎯 Why This Matters

Traditional web-based geospatial visualization typically involves converting data to GeoJSON in the browser. This approach has a significant limitation: conversion time increases linearly with data size, creating a bottleneck for larger datasets.

We take a different approach by maintaining binary data throughout the entire pipeline, directly copying data into deck.gl buffers, and achieving nearly constant time complexity for data processing. The result? Significantly better performance that scales well with larger datasets.

## 💡 Use Cases

### Large Dataset Visualization

Here's a demo video of visualizing 2 million places in India:

Demo Video - Visualizing 2 Million Places in India:


https://github.com/user-attachments/assets/f0fa3416-1354-4b96-aed0-3f51f8424b8f



The system can handle millions of geographic features with reasonable performance, all running directly in the browser. In this demo, we visualize over 2 million distinct locations across India, demonstrating the power of the binary pipeline approach.

However, due to [limitation in how DuckDB-WASM downloads data](https://github.com/duckdb/duckdb-wasm/issues/1723), downloading large set of query results is currently very slow. The demo video downloads the data from a local server.

A more realistic live demo of downloading all the places south of Lisbon in Portugal is available at [https://labs.sunu.in/geoquack/#portugal-south](https://labs.sunu.in/geoquack/#portugal-south).

### STAC Catalog Querying

Here's a demo video of querying and visualizing STAC items stored in a remote geoparquet file through DuckDB-WASM and deck.gl:

Demo Video - Querying, filtering, and visualizing STAC items:



https://github.com/user-attachments/assets/b00f0c08-4932-4b8c-9fb3-67903cb7fada



A live demo of querying and visualizing STAC catalog items stored in a remote geoparquet file through DuckDB-WASM and deck.gl is available at [https://labs.sunu.in/geoquack/#stac-sentinel-filtered](https://labs.sunu.in/geoquack/#stac-sentinel-filtered).

Using [stac-geoparquet](https://github.com/stac-utils/stac-geoparquet) to convert STAC catalogs to GeoParquet files, users can:
- Visualize catalog item footprints directly on the map
- Filter by spatial extent, temporal range, and metadata fields
- Download matching items without setting up server infrastructure

## 🚧 Current Limitations

- Currently, DuckDB-WASM downloads remote data through sequential HTTP range requests. This means downloading data in a single thread, which is slow. See https://github.com/duckdb/duckdb-wasm/issues/1723 for more details.
- In the current implementation, we wait for the entire result of the query to be downloaded before displaying it on the map.


## 📚 References

- [Great talk from Kyle Barron on the topic](https://www.youtube.com/watch?v=PFWjMHXdRdY)
- [stac-geoparquet](https://github.com/stac-utils/stac-geoparquet)
