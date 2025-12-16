"use client";

import config from "@arcgis/core/config";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Expand from "@arcgis/core/widgets/Expand";
import Legend from "@arcgis/core/widgets/Legend";
import { useRef, useEffect } from "react";

// Initialize ArcGIS config
config.apiKey =
  process.env.NEXT_PUBLIC_API_KEY || "";

export default function ArcGISMapCore() {
  const mapDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapDiv.current) return;

    // Create map
    const map = new Map({
      basemap: "arcgis-dark-gray",
    });

    // Create map view
    const view = new MapView({
      map: map,
      container: mapDiv.current,
      zoom: 4,
      center: [-98, 35] // Center on US
    });

    // Create feature layer
    const layer = new FeatureLayer({
      portalItem: {
        id: "848d61af726f40d890219042253bedd7",
      },
      definitionExpression: `fuel1 = 'Electric'`,
      visible: true,
    });

    // Add layer to map
    map.add(layer);

    // When layer loads, zoom to its extent
    layer.when(async () => {
      const query = layer.createQuery();
      const extent = await layer.queryExtent(query);
      if (extent.extent) {
        view.goTo(extent.extent);
      }
    });

    // Add legend
    const legend = new Legend({
      view: view,
    });

    const expand = new Expand({
      content: legend,
      view: view,
      expanded: false,
      // expandIcon: "layer-list", // Commented out to avoid icon loading issues
    });

    view.ui.add(expand, "bottom-left");

    // Configure popup
    if (view.popup) {
      view.popup.dockEnabled = true;
      view.popup.dockOptions = {
        buttonEnabled: false,
        breakpoint: false,
        position: "top-right"
      };
    }

    // Cleanup
    return () => {
      if (view) {
        view.destroy();
      }
    };
  }, []);

  return <div ref={mapDiv} className="w-full h-full" />;
}