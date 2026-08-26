import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mock Interview Coach',
  description:
    'Practise concise STAR answers with a live AI interviewer over voice and video.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
