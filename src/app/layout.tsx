import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
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
        <Script id="clarity-script" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "wfrhutqq9l");
          `}
        </Script>
        {/* <VersionCheck /> */}
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
