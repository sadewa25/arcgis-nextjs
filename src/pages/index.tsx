"use client";

import localFont from "next/font/local";
import ClientOnlyMap from "@/components/ClientOnlyMap";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function Home() {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} h-screen w-full font-[family-name:var(--font-geist-sans)]`}
    >
      <div className="w-full h-full">
        <ClientOnlyMap />
      </div>
    </div>
  );
}
