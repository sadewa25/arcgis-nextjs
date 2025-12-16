"use client";

import config from "@arcgis/core/config";
import { ArcgisMap, ArcgisSketch } from "@arcgis/map-components-react";
import { defineCustomElements as defineMapElements } from "@arcgis/map-components/dist/loader";
import { useEffect, useState } from "react";

// Initialize ArcGIS config
config.apiKey = process.env.NEXT_PUBLIC_API_KEY || "";

// Global flag to track if custom elements have been defined
let elementsHaveBeenDefined = false;

export default function ArcGISMapWrapper() {
  const [isReady, setIsReady] = useState(false);

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

  if (!isReady) {
    return (
      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
        Initializing map...
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ArcgisMap
        basemap="topo-vector"
        center={[139.5716, 35.696] as any}
        zoom={18}
        style={{ width: '100%', height: '100%' }}
      >
        <ArcgisSketch slot="top-right" creation-mode="update" />
      </ArcgisMap>
    </div>
  );
}