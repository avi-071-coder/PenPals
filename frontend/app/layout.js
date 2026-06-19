import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'PenPals - Real-time Collaborative Editor',
  description: 'Write, edit, and collaborate in real-time with PenPals. A powerful, secure, and beautiful document editor.',
  keywords: ['collaborative editor', 'real-time editing', 'online word processor', 'PenPals', 'document editor', 'team collaboration'],
  authors: [{ name: 'PenPals Team' }],
  creator: 'PenPals',
  publisher: 'PenPals',
  openGraph: {
    title: 'PenPals - Real-time Collaborative Editor',
    description: 'Write, edit, and collaborate in real-time with PenPals. A powerful, secure, and beautiful document editor.',
    url: 'https://your-render-domain.com',
    siteName: 'PenPals',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PenPals - Real-time Collaborative Editor',
    description: 'Write, edit, and collaborate in real-time with PenPals.',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgba(0, 0, 0, 0.9)',
              color: '#fff',
              backdropFilter: 'blur(10px)',
            },
          }}
        />
      </body>
    </html>
  );
}