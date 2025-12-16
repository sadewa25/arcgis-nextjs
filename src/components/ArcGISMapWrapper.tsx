"use client";

import config from "@arcgis/core/config";
import {
  ArcgisMap,
  ArcgisZoom
} from "@arcgis/map-components-react";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/dist/loader";
import { useEffect, useState, useRef } from "react";
import { suggest, geocode } from "@esri/arcgis-rest-geocoding";
import { ApiKeyManager } from "@esri/arcgis-rest-request";

// Initialize ArcGIS config
config.apiKey = process.env.NEXT_PUBLIC_API_KEY || "";

// Global flag to track if custom elements have been defined
let elementsHaveBeenDefined = false;

export default function ArcGISMapWrapper() {
  const [isReady, setIsReady] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapView, setMapView] = useState<any>(null);
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

        // Navigate map to the location
        if (mapView) {
          mapView.goTo({
            center: [location.x, location.y],
            zoom: 15,
          });
        } else if (mapRef.current) {
          // Try to access view from map element
          const view = (mapRef.current as any).view;
          if (view) {
            view.goTo({
              center: [location.x, location.y],
              zoom: 15,
            });
          }
        }

        setSearchText(candidate.address || "");
        setShowSuggestions(false);
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

  // Get map view when map is ready
  useEffect(() => {
    if (mapRef.current && isReady) {
      const checkView = () => {
        const mapElement = mapRef.current;
        if (mapElement) {
          const view = (mapElement as any).view;
          if (view) {
            setMapView(view);
          } else {
            // Retry after a short delay
            setTimeout(checkView, 100);
          }
        }
      };
      checkView();
    }
  }, [isReady]);

  if (!isReady) {
    return (
      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
        Initializing map...
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
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
        center={[106.8451, -6.2088] as any}
        zoom={10}
        style={{ width: "100%", height: "100%" }}
      >
        <ArcgisZoom slot="top-left" />
      </ArcgisMap>
    </div>
  );
}
