import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazir = localFont({
  src: "./fonts/Vazirmatn.woff2",
  weight: "100 900",
  display: "swap",
});
export const metadata: Metadata = {
  title: "سفارش‌ یار",
  description: "سفارش زنده برای کافه‌رستوران‌ها",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className={vazir.className}>{children}</body>
    </html>
  );
}