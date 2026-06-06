import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'PenPals - Real-time Collaborative Editor',
  description: 'Collaborative editing with live cursors and CRDTs',
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