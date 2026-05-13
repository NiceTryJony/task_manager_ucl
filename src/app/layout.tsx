import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono, Roboto } from 'next/font/google'
import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ThemeProvider } from '@/lib/theme-context'
import { I18nProvider }  from '@/lib/i18n-context'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-roboto',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Smart task manager for Telegram',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#0F1117' },
    { media: '(prefers-color-scheme: light)', color: '#EDE0D0' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${bricolage.variable} ${jetbrains.variable}`}>
      <head>
        {/*
          Применяем тему ДО первого рендера — убирает мигание.
          Заодно форсируем цвет адресной строки на мобильных.
        */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t = localStorage.getItem('taskflow_theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
            // Обновляем meta theme-color динамически
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
              meta.setAttribute('content', t === 'dark' ? '#0F1117' : '#EDE0D0');
            }
          })();
        `}} />
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="bg-bg-base text-text-primary antialiased">
        <ThemeProvider>
          <I18nProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}