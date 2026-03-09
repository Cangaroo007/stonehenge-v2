import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'react-hot-toast';
// import { VersionCheck } from '@/components/VersionCheck';
import './globals.css';

const inter = localFont({
  src: '../../public/fonts/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stone Henge - Quote Management',
  description: 'Stone countertop quote generation system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* <VersionCheck /> */}
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
