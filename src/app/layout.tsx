import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'freeFlow — Habit & Workflow Automation Platform',
  description: 'Automate Todoist tasks and habits with custom workflows, immediate recreations, and real-time webhook analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
