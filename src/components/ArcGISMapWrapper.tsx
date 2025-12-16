"use client";

import config from "@arcgis/core/config";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import Point from "@arcgis/core/geometry/Point";
import * as projection from "@arcgis/core/geometry/projection";
import {
  ArcgisMap,
  ArcgisSketch,
  ArcgisZoom
} from "@arcgis/map-components-react";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/dist/loader";
import { geocode, suggest } from "@esri/arcgis-rest-geocoding";
import { ApiKeyManager, request } from "@esri/arcgis-rest-request";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Initialize ArcGIS config
config.apiKey = process.env.NEXT_PUBLIC_API_KEY || "";

// Global flag to track if custom elements have been defined
let elementsHaveBeenDefined = false;

interface ElevationDataPoint {
  longitude: number;
  latitude: number;
  elevation: number;
  location: string;
}

export default function ArcGISMapWrapper() {
  const [isReady, setIsReady] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapView, setMapView] = useState<any>(null);
  const [elevationData, setElevationData] = useState<ElevationDataPoint[]>([]);
  const [isLoadingElevation, setIsLoadingElevation] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([106.8451, -6.2088]);
  const [mapZoom, setMapZoom] = useState(10);
  const [hasPolyline, setHasPolyline] = useState(false);
  const mapRef = useRef<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize ArcGIS Map Elements
  useEffect(() => {
    const initializeElements = async () => {
      if (!elementsHaveBeenDefined && typeof window !== "undefined") {
        try {
          await defineMapElements();
          elementsHaveBeenDefined = true;
          setIsReady(true);
        } catch (error) {
          console.error("Error defining custom elements:", error);
        }
      } else {
        setIsReady(true);
      }
    };

    initializeElements();
  }, []);

  // Handle clicks outside search box
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const authentication = ApiKeyManager.fromKey(process.env.NEXT_PUBLIC_API_KEY || "");

  // Get elevation data for a location using the official elevation service
  // Only adds to elevation data if fromPolyline is true (for charts)
  const getElevation = async (longitude: number, latitude: number, locationName: string = "", fromPolyline: boolean = false) => {
    setIsLoadingElevation(true);
    try {
      const elevationServiceUrl =
        "https://elevation-api.arcgis.com/arcgis/rest/services/elevation-service/v1/elevation/at-many-points";
      
      const coordinates = [[longitude, latitude]];
      
      const response = await request(elevationServiceUrl, {
        httpMethod: "POST",
        authentication,
        params: {
          coordinates: JSON.stringify(coordinates),
          f: "json",
        },
      } as any);

      if (response.result?.points && response.result.points.length > 0) {
        const point = response.result.points[0];
        const elevation = point.z;
        
        // Only add to elevation data if it's from a polyline (for charts)
        if (fromPolyline) {
          const newDataPoint: ElevationDataPoint = {
            longitude,
            latitude,
            elevation: Math.round(elevation * 100) / 100, // Round to 2 decimal places
            location: locationName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          };

          setElevationData((prev) => {
            const updated = [...prev, newDataPoint];
            return updated.slice(-10); // Keep only last 10 points
          });
        }
        
        // Log elevation for non-polyline cases (map clicks, search)
        console.log(`Elevation at ${locationName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}: ${Math.round(elevation * 100) / 100}m`);
      }
    } catch (error) {
      console.error("Elevation error:", error);
    } finally {
      setIsLoadingElevation(false);
    }
  };

  // Get elevation for multiple points (for polyline profile) using the official elevation service
  const getElevationForPoints = async (points: Array<{ longitude: number; latitude: number }>) => {
    setIsLoadingElevation(true);
    try {
      const elevationServiceUrl =
        "https://elevation-api.arcgis.com/arcgis/rest/services/elevation-service/v1/elevation/at-many-points";
      
      // Convert points to coordinates array format [longitude, latitude]
      const coordinates = points.map((point) => [point.longitude, point.latitude]);
      
      // The service supports up to 100 points per request
      // If we have more, we need to batch them
      const maxPointsPerRequest = 100;
      const allResults: ElevationDataPoint[] = [];

      for (let i = 0; i < coordinates.length; i += maxPointsPerRequest) {
        const batch = coordinates.slice(i, i + maxPointsPerRequest);
        
        try {
          const response = await request(elevationServiceUrl, {
            httpMethod: "POST",
            authentication,
            params: {
              coordinates: JSON.stringify(batch),
              f: "json",
            },
          } as any);

          if (response.result?.points && response.result.points.length > 0) {
            response.result.points.forEach((point: any, index: number) => {
              const originalIndex = i + index;
              allResults.push({
                longitude: point.x,
                latitude: point.y,
                elevation: Math.round(point.z * 100) / 100,
                location: `Point ${originalIndex + 1}`,
              });
            });
          }
        } catch (error) {
          console.error(`Error getting elevation for batch starting at index ${i}:`, error);
        }

        // Add a small delay between batches to avoid rate limiting
        if (i + maxPointsPerRequest < coordinates.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (allResults.length > 0) {
        setElevationData(allResults);
      } else {
        console.error("No elevation data retrieved. Please try again.");
      }
    } catch (error) {
      console.error("Elevation batch error:", error);
    } finally {
      setIsLoadingElevation(false);
    }
  };

  // Sample points along a polyline path
  const samplePointsAlongPolyline = (paths: number[][][], numSamples: number = 20) => {
    const allPoints: Array<{ longitude: number; latitude: number }> = [];

    paths.forEach((path) => {
      if (path.length < 2) {
        // If only one point, add it
        if (path.length === 1) {
          allPoints.push({ longitude: path[0][0], latitude: path[0][1] });
        }
        return;
      }

      // Collect all points from the path
      const pathPoints: Array<{ longitude: number; latitude: number }> = [];
      path.forEach((point) => {
        pathPoints.push({ longitude: point[0], latitude: point[1] });
      });

      // If we have fewer points than requested samples, use all points
      if (pathPoints.length <= numSamples) {
        allPoints.push(...pathPoints);
        return;
      }

      // Sample evenly along the path
      const step = (pathPoints.length - 1) / (numSamples - 1);
      for (let i = 0; i < numSamples; i++) {
        const index = Math.min(Math.round(i * step), pathPoints.length - 1);
        allPoints.push(pathPoints[index]);
      }
    });

    return allPoints;
  };

  // Convert coordinates to WGS84 (EPSG:4326) if needed
  const convertToWGS84 = async (
    x: number,
    y: number,
    spatialRef: any
  ): Promise<{ longitude: number; latitude: number }> => {
    // If already in WGS84, return as is
    if (spatialRef?.wkid === 4326 || spatialRef?.latestWkid === 4326) {
      return { longitude: x, latitude: y };
    }

    try {
      // Load projection if needed
      if (!projection.isLoaded()) {
        await projection.load();
      }

      // Create a point in the source spatial reference
      const sourcePoint = new Point({
        x,
        y,
        spatialReference: spatialRef || new SpatialReference({ wkid: 3857 }), // Default to Web Mercator
      });

      // Transform to WGS84
      const wgs84SR = new SpatialReference({ wkid: 4326 });
      const transformedPoint = projection.project(sourcePoint, wgs84SR) as Point;

      return {
        longitude: transformedPoint.longitude ?? x,
        latitude: transformedPoint.latitude ?? y,
      };
    } catch (error) {
      console.error("Error projecting coordinates:", error);
      // Fallback: return original coordinates (might be wrong but won't crash)
      return { longitude: x, latitude: y };
    }
  };

  // Handle sketch completion (when polyline is finished)
  const handleSketchCreate = async (event: any) => {
    try {
      const graphic = event.detail?.graphic;
      if (!graphic || !graphic.geometry) return;

      const geometry = graphic.geometry;
      const spatialRef = geometry.spatialReference;
      
      // Only process polylines for elevation charts
      if (geometry.type === "polyline" && geometry.paths) {
        setHasPolyline(true);
        
        // Sample points along the polyline
        const sampledPoints = samplePointsAlongPolyline(geometry.paths, 20);
        
        if (sampledPoints.length > 0) {
          // Convert all points to WGS84
          const wgs84Points = await Promise.all(
            sampledPoints.map((point) =>
              convertToWGS84(point.longitude, point.latitude, spatialRef)
            )
          );
          
          // Get elevation for all converted points
          await getElevationForPoints(wgs84Points);
        }
      }
      // Don't process points or other geometries for elevation charts
    } catch (error) {
      console.error("Sketch create error:", error);
    }
  };

  // Handle sketch delete (when polyline is deleted)
  const handleSketchDelete = () => {
    setHasPolyline(false);
    setElevationData([]);
  };

  const performGeocode = async (magicKey: string) => {
    try {
      const response = await geocode({
        magicKey,
        authentication,
      });

      console.log("Geocode results:", response);

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        const location = candidate.location;

        // Update map center state - this will trigger a re-render with new center
        setMapCenter([location.x, location.y]);
        setMapZoom(15);

        // Also try to navigate using the view if available (for immediate update)
        const navigateToLocation = async () => {
          // Method 1: Use mapView if available
          if (mapView) {
            try {
              await mapView.goTo({
                center: [location.x, location.y],
                zoom: 15,
              });
              return;
            } catch (error) {
              console.warn("Failed to navigate using mapView:", error);
            }
          }

          // Method 2: Try to access view from map element
          if (mapRef.current) {
            const view = (mapRef.current as any).view;
            if (view) {
              try {
                await view.goTo({
                  center: [location.x, location.y],
                  zoom: 15,
                });
                return;
              } catch (error) {
                console.warn("Failed to navigate using mapRef view:", error);
              }
            }
          }
        };

        // Try navigation, but don't wait for it since state update will handle it
        navigateToLocation().catch(() => {
          // Ignore errors, state update will handle the navigation
        });

        setSearchText(candidate.address || "");
        setShowSuggestions(false);

        // Get elevation for the searched location
        await getElevation(
          location.x,
          location.y,
          candidate.address || ""
        );
      }
    } catch (error) {
      console.error("Geocode error:", error);
    }
  };

  const handleInputChange = async (text: string) => {
    setSearchText(text);
    setSelectedIndex(-1);

    if (!text) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await suggest(text, {
        authentication,
        params: {
          location: {
            x: 106.8451, // Jakarta longitude
            y: -6.2088,  // Jakarta latitude
            spatialReference: { wkid: 4326 },
          },
          maxSuggestions: 5,
        },
      });

      if (response.suggestions && response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Suggest error:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: any) => {
    setSearchText(suggestion.text);
    setShowSuggestions(false);
    performGeocode(suggestion.magicKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[selectedIndex]);
    }
  };

  const handleClear = () => {
    setSearchText("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Get map view when map is ready and add click handler
  useEffect(() => {
    if (mapRef.current && isReady) {
      const checkView = () => {
        const mapElement = mapRef.current;
        if (mapElement) {
          const view = (mapElement as any).view;
          if (view) {
            setMapView(view);

            // Add click handler to get elevation
            const clickHandler = view.on("click", async (event: any) => {
              const point = event.mapPoint;
              const longitude = point.longitude;
              const latitude = point.latitude;

              // Get elevation for clicked location
              await getElevation(longitude, latitude);
            });

            // Cleanup
            return () => {
              clickHandler.remove();
            };
          } else {
            // Retry after a short delay
            setTimeout(checkView, 100);
          }
        }
      };
      checkView();
    }
  }, [isReady]);

  // Update map view when center or zoom changes
  useEffect(() => {
    if (mapView && mapCenter) {
      mapView.goTo({
        center: mapCenter,
        zoom: mapZoom,
      }).catch((error: any) => {
        console.warn("Error navigating map:", error);
      });
    }
  }, [mapCenter, mapZoom, mapView]);

  if (!isReady) {
    return (
      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
        Initializing map...
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Map Container */}
      <div className="relative flex-1 min-h-0">
        {/* Custom Search Component */}
        <div
          ref={searchRef}
          className="absolute top-4 right-4 z-10 w-80 bg-white rounded shadow-lg"
          style={{ maxWidth: "calc(100% - 2rem)" }}
        >
          <div className="relative p-2">
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Type an address, e.g. Jakarta, Indonesia"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              autoComplete="off"
            />
            {searchText && (
              <button
                onClick={handleClear}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xl leading-none"
                style={{ marginTop: "2px" }}
              >
                ×
              </button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto z-20">
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`px-3 py-2 cursor-pointer text-sm text-black ${
                    index === selectedIndex
                      ? "bg-blue-100 border-l-2 border-blue-500"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {suggestion.text}
                </li>
              ))}
            </ul>
          )}
        </div>

      <ArcgisMap
          ref={mapRef}
          basemap="arcgis/navigation"
          center={mapCenter as any}
          zoom={mapZoom}
        style={{ width: "100%", height: "100%" }}
      >
          <ArcgisZoom slot="top-left" />
          <ArcgisSketch 
            slot="bottom-right" 
            creation-mode="polyline"
            onArcgisCreate={handleSketchCreate}
            onArcgisDelete={handleSketchDelete}
          />
      </ArcgisMap>
      </div>

      {/* Elevation Charts Section - Only show when polyline is drawn */}
      {hasPolyline && (
        <div className="bg-white border-t border-gray-300 p-4" style={{ height: "300px" }}>
          <div className="h-full">
            {elevationData.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-5/6">
              {/* Line Chart */}
              <div className="h-full">
                <h4 className="text-sm font-medium mb-2 text-gray-700">Elevation Profile (Line)</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={elevationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="location"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      label={{ value: "Elevation (m)", angle: -90, position: "insideLeft" }}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(value: number | undefined) => value !== undefined ? [`${value} m`, "Elevation"] : ["", ""]}
                      labelFormatter={(label) => `Location: ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="elevation"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="Elevation (m)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart */}
              <div className="h-full">
                <h4 className="text-sm font-medium mb-2 text-gray-700">Elevation Comparison (Bar)</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={elevationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="location"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      label={{ value: "Elevation (m)", angle: -90, position: "insideLeft" }}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(value: number | undefined) => value !== undefined ? [`${value} m`, "Elevation"] : ["", ""]}
                      labelFormatter={(label) => `Location: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="elevation" fill="#82ca9d" name="Elevation (m)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
              <div className="flex items-center justify-center h-5/6 text-gray-500">
                <p>Loading elevation data...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
