import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: "PortFo - Investment Tracker",
  description: "Real-time stock portfolio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-gray-100 min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider> 
  );
}