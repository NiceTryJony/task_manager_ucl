// import type { Metadata, Viewport } from 'next'
// import { Bricolage_Grotesque, JetBrains_Mono, Roboto } from 'next/font/google'
// import './globals.css'
// import { ErrorBoundary } from '@/components/ErrorBoundary'
// import { ThemeProvider } from '@/lib/theme-context'
// import { I18nProvider }  from '@/lib/i18n-context'

// const roboto = Roboto({
//   subsets: ['latin'],
//   weight: ['300', '400', '500'],
//   variable: '--font-roboto',
// })

// const bricolage = Bricolage_Grotesque({
//   subsets: ['latin'],
//   variable: '--font-bricolage',
//   display: 'swap',
// })

// const jetbrains = JetBrains_Mono({
//   subsets: ['latin'],
//   variable: '--font-mono',
//   display: 'swap',
// })

// export const metadata: Metadata = {
//   title: 'TaskFlow',
//   description: 'Smart task manager for Telegram',
//   manifest: '/manifest.json',
// }

// export const viewport: Viewport = {
//   width: 'device-width',
//   initialScale: 1,
//   maximumScale: 1,
//   userScalable: false,
//   themeColor: [
//     { media: '(prefers-color-scheme: dark)',  color: '#0F1117' },
//     { media: '(prefers-color-scheme: light)', color: '#EDE0D0' },
//   ],
// }

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en" className={`${roboto.variable} ${bricolage.variable} ${jetbrains.variable}`}>
//       <head>
//         {/*
//           Применяем тему ДО первого рендера — убирает мигание.
//           Заодно форсируем цвет адресной строки на мобильных.
//         */}
//         <script dangerouslySetInnerHTML={{ __html: `
//           (function(){
//             var t = localStorage.getItem('taskflow_theme') || 'dark';
//             document.documentElement.setAttribute('data-theme', t);
//             var meta = document.querySelector('meta[name="theme-color"]');
//             if (meta) meta.setAttribute('content', t === 'dark' ? '#0F1117' : '#EDE0D0');

//             // Performance class detection
//             var saved = localStorage.getItem('taskflow_perf');
//             if (saved === 'low') {
//               document.documentElement.setAttribute('data-perf', 'low');
//             } else if (!saved) {
//               // Запускаем детект после загрузки Telegram SDK
//               window.addEventListener('load', function() {
//                 var perf = window?.Telegram?.WebApp?.deviceInfo?.performance_class;
//                 if (perf === 'low') {
//                   document.documentElement.setAttribute('data-perf', 'low');
//                   localStorage.setItem('taskflow_perf', 'low');
//                 } else if (perf) {
//                   localStorage.setItem('taskflow_perf', perf); // 'average' | 'high'
//                 }
//               });
//             }
//           })();
//         `}} />
//         <script src="https://telegram.org/js/telegram-web-app.js" />
//       </head>
//       <body className="bg-bg-base text-text-primary antialiased">
//         <ThemeProvider>
//           <I18nProvider>
//             <ErrorBoundary>{children}</ErrorBoundary>
//           </I18nProvider>
//         </ThemeProvider>
//       </body>
//     </html>
//   )
// }












import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono, Roboto } from 'next/font/google'
import './globals.css'
// graphics-enhanced.css живёт в /public/ и подключается динамически скриптом ниже.
// Next.js не трогает файлы из /public/ — это нас устраивает,
// там чистый CSS без Tailwind, только нативные селекторы.
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
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            // ── Тема — применяем ДО первого рендера, без мигания ─────────
            var t = localStorage.getItem('taskflow_theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', t === 'dark' ? '#0F1117' : '#EDE0D0');

            // ── Enhanced graphics — подключаем ДО рендера если не low-perf ─
            // Скрипт синхронный (нет defer/async), поэтому выполняется
            // до построения DOM. <link> создаётся динамически — браузер
            // начнёт загружать CSS параллельно с HTML, без блокировки рендера.
            // При повторных визитах файл уже в кеше — задержки нет.
            var savedPerf = localStorage.getItem('taskflow_perf');
            if (savedPerf !== 'low') {
              var link = document.createElement('link');
              link.rel  = 'stylesheet';
              link.href = '/graphics-enhanced.css';
              link.setAttribute('data-enhanced', '1');
              document.head.appendChild(link);
            }

            // ── Автодетект производительности Telegram (первый визит) ─────
            // Если perf ещё не сохранён — ждём загрузки SDK и проверяем.
            // При low-perf: удаляем уже вставленный enhanced CSS и перезагружаем
            // страницу (один раз, потом perf='low' в localStorage на навсегда).
            if (!savedPerf) {
              window.addEventListener('load', function() {
                var perf = window && window.Telegram && window.Telegram.WebApp
                  && window.Telegram.WebApp.deviceInfo
                  && window.Telegram.WebApp.deviceInfo.performance_class;

                if (!perf) return; // TG SDK не вернул данные — оставляем enhanced

                localStorage.setItem('taskflow_perf', perf);

                if (perf === 'low') {
                  // Удаляем enhanced и перезагружаемся один раз
                  document.querySelectorAll('link[data-enhanced]').forEach(function(l) {
                    l.parentNode && l.parentNode.removeChild(l);
                  });
                  window.location.reload();
                }
                // 'average' | 'high' → enhanced остаётся, ничего не делаем
              });
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