import type { ReactNode } from 'react';
import './style.css';
export const metadata = {
  title: 'Proof of Alpha — Foundation',
  description: 'Prospective evaluation for self-hosted treasury agents.',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
