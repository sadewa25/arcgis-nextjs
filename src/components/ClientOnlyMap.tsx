"use client";

import dynamic from "next/dynamic";

const ClientOnlyMap = dynamic(() => import("./ArcGISMapWrapper"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-800 flex items-center justify-center">Loading map...</div>
});

export default ClientOnlyMap;